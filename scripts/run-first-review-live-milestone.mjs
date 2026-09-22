import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(new URL("../", import.meta.url).pathname);
const explicitLive = process.argv.includes("--live");
const writeEvidence = process.argv.includes("--write-evidence");
const cli = process.env.REVIEW_LIVE_INSTALLED_CLI;
const codexHome = process.env.REVIEW_LIVE_CODEX_HOME;
const artifactSha256 = process.env.REVIEW_LIVE_ARTIFACT_SHA256;

const run = (command, args, options) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const timer = setTimeout(() => child.kill("SIGTERM"), options.timeoutMs);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (value) => { stdout += value; });
  child.stderr.on("data", (value) => { stderr += value; });
  child.once("error", reject);
  child.once("close", (code, signal) => {
    clearTimeout(timer);
    resolveRun({ code, signal, stdout, stderr });
  });
  child.stdin.end(`${JSON.stringify(options.input)}\n`);
});

const invoke = async (input, timeoutMs = 10_000) => {
  const result = await run(cli, ["--demo"], {
    cwd: projectRoot,
    env: process.env,
    input,
    timeoutMs,
  });
  let output;
  try { output = JSON.parse(result.stdout); } catch { output = undefined; }
  return { ...result, output };
};

const environment = {
  codex: "codex-cli 0.155.1",
  node: process.version,
  operatingSystem: process.platform,
  architecture: process.arch,
};

if (!explicitLive) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    status: "not-run",
    reason: "pass --live to explicitly select the paid synthetic milestone",
    providerCalls: 0,
  }, null, 2)}\n`);
  process.exit(0);
}
if (cli === undefined || codexHome === undefined ||
    artifactSha256 === undefined || !/^[a-f0-9]{64}$/.test(artifactSha256)) {
  throw new Error("live milestone requires REVIEW_LIVE_INSTALLED_CLI, REVIEW_LIVE_CODEX_HOME, and REVIEW_LIVE_ARTIFACT_SHA256");
}

let preview;
let live;
try {
  preview = await invoke({
    version: 1,
    operation: "demo",
    selection: "preview",
    codexHome,
    codexExecutable: "codex",
  });
  if (preview.output?.status !== "preview") throw new Error("installed release did not produce an offline demo preview");
  if (preview.output.paidVerificationPerformed !== false ||
      preview.output.budget?.sourceBytes !== 4_096 ||
      preview.output.budget?.providerCalls !== 2 ||
      preview.output.budget?.timeMs !== 180_000) {
    throw new Error("demo preview did not preserve the declared offline budget contract");
  }
  live = await invoke({
    version: 1,
    operation: "demo",
    selection: "live",
    demoId: preview.output.demo.id,
    selectionDigest: preview.output.authorization.selectionDigest,
    consentProposalDigest: preview.output.authorization.consentProposalDigest,
    codexHome,
    codexExecutable: "codex",
  }, 195_000);
} finally {
  if (preview?.output?.demo?.id !== undefined && live?.output?.cleanup?.disposableRootRemoved !== true) {
    await invoke({
      version: 1,
      operation: "demo",
      selection: "cancel",
      demoId: preview.output.demo.id,
    }).catch(() => undefined);
  }
}

const result = live?.output;
const evidence = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  milestone: "installed-product-first-review",
  environment,
  package: {
    source: "packed-release-installation",
    artifactSha256,
  },
  selection: {
    explicitLive: true,
    syntheticOnly: preview.output.demo.syntheticOnly === true,
    deliberatelyFlawed: preview.output.demo.disclosure.deliberatelyFlawed === true,
    repairPrescribed: preview.output.demo.disclosure.repairPrescribed === true,
    separateDisposableConsent: typeof preview.output.authorization.consentProposalDigest === "string",
    budgets: preview.output.budget,
  },
  setup: preview.output.setup,
  reviewLatencyMs: result?.reviewLatencyMs ?? null,
  status: result?.status ?? "incomplete",
  stages: result?.evidence ?? {
    completion: "incomplete",
    submission: "unavailable",
    modelReaction: "unavailable",
    repair: "not-validated",
    followUpReview: "unavailable",
  },
  cleanup: result?.cleanup ?? { disposableRootRemoved: false, consentRevoked: false },
  retained: { source: false, providerResponse: false, credential: false, paths: false, digests: false },
};

if (writeEvidence) {
  const directory = resolve(projectRoot, "evidence/first-review");
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "live-installed-codex-0.155.1.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (evidence.status !== "passed") process.exitCode = 1;
