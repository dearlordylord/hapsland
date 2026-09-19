import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const expectedRules = [
  "r1_inferred_case",
  "r2_meaningless_combinations",
  "r3_split_correlations",
  "r4_duplicate_encoding",
  "r5_absence_confusion",
  "r6_bare_domain_value",
  "r7_name_wider_than_type",
  "r8_name_claims_resource",
  "r9_body_reaches_undeclared",
].sort();

const valueFor = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
};

const runs = Number(valueFor("runs") ?? "100");
if (process.env.RUN_LIVE_JEV_BENCHMARK !== "1") {
  throw new Error("set RUN_LIVE_JEV_BENCHMARK=1 to authorize paid live calls");
}
if (!Number.isSafeInteger(runs) || runs < 1 || runs > 1000) {
  throw new Error("--runs must be an integer from 1 through 1000");
}
if (typeof process.env.TYPESAFE_API_KEY !== "string" || process.env.TYPESAFE_API_KEY === "") {
  throw new Error("TYPESAFE_API_KEY is required");
}

const source = `export type DeliveryAttempt = {
  kind?: "email" | "phone";
  email?: string;
  phone?: string;
  amount?: number;
  currency?: string;
  startedAt?: string;
  endedAt?: string;
  itemCount?: number;
  items?: string[];
  userId?: string;
};

export async function loadAccount(accountId: string) {
  return database.accounts.find(accountId);
}
`;

const nearestRank = (values, percentile) => {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
};

const summarize = (values) => ({
  count: values.length,
  min: values.length === 0 ? undefined : Math.min(...values),
  p50: nearestRank(values, 50),
  p95: nearestRank(values, 95),
  p99: nearestRank(values, 99),
  max: values.length === 0 ? undefined : Math.max(...values),
});

const runCli = (input) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/cli.ts"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      action();
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error("CLI process exceeded 15 seconds")));
    }, 15_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1024 * 1024) {
        child.kill("SIGTERM");
        finish(() => reject(new Error("CLI output exceeded one MiB")));
      }
    });
    // Diagnostics are deliberately discarded: benchmark evidence is aggregate-only.
    child.stderr.resume();
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) =>
      finish(() =>
        code === 0
          ? resolve(stdout)
          : reject(new Error(`CLI exited with status ${String(code)}`)),
      ),
    );
    child.stdin.end(`${input}\n`);
  });

const root = await mkdtemp(join(tmpdir(), "review-live-benchmark-"));
const file = join(root, "representative.ts");
await writeFile(file, source, "utf8");

const totalDurations = [];
const backendDurations = [];
const requestBytes = [];
let reviewed = 0;
let unavailable = 0;
let protocolFailures = 0;
let retries = 0;
let maxRetries = 0;
let inputTokens = 0;
let outputTokens = 0;
let responsesWithUsage = 0;

try {
  for (let index = 1; index <= runs; index += 1) {
    const request = JSON.stringify({
      version: 1,
      event: {
        id: `live-milestone-${index}`,
        kind: "successful-edit",
        host: "milestone-benchmark",
        cwd: root,
        paths: ["representative.ts"],
      },
    });
    requestBytes.push(Buffer.byteLength(request));
    const started = process.hrtime.bigint();
    let stdout;
    try {
      stdout = await runCli(request);
    } catch {
      protocolFailures += 1;
      continue;
    } finally {
      totalDurations.push(Number(process.hrtime.bigint() - started) / 1_000_000);
    }

    let response;
    try {
      response = JSON.parse(stdout);
    } catch {
      protocolFailures += 1;
      continue;
    }
    const result = response?.results?.[0];
    if (result?.status === "reviewed") {
      const keys = Object.keys(result.assessment ?? {}).sort();
      if (JSON.stringify(keys) !== JSON.stringify(expectedRules)) {
        protocolFailures += 1;
        continue;
      }
      reviewed += 1;
      backendDurations.push(result.backend.durationMs);
      retries += result.backend.retries;
      maxRetries = Math.max(maxRetries, result.backend.retries);
      const usage = result.backend.usage ?? {};
      if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
        responsesWithUsage += 1;
        inputTokens += usage.inputTokens ?? 0;
        outputTokens += usage.outputTokens ?? 0;
      }
    } else if (result?.status === "unavailable") {
      unavailable += 1;
    } else {
      protocolFailures += 1;
    }

    if (index % 10 === 0 || index === runs) {
      process.stderr.write(`completed ${index}/${runs}\n`);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

process.stdout.write(`${JSON.stringify({
  evidenceVersion: 1,
  date: new Date().toISOString().slice(0, 10),
  callsAttempted: runs,
  sourceBytes: Buffer.byteLength(source),
  protocolRequestBytes: {
    min: Math.min(...requestBytes),
    max: Math.max(...requestBytes),
    note: "Product process-contract bytes; provider wire size is not exposed by the Effect provider.",
  },
  outcomes: { reviewed, unavailable, protocolFailures },
  totalProcessMs: summarize(totalDurations),
  backendMs: summarize(backendDurations),
  retryMetadata: { totalRetries: retries, maxRetriesOnOneCall: maxRetries },
  usageMetadata: { responsesWithUsage, inputTokens, outputTokens },
  quantileMethod: "nearest-rank",
  retention: "Individual assessments, probabilities, source-bearing responses, and credentials were not printed or written.",
})}\n`);
