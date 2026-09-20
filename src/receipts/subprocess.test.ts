import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: Array<string> = [];
const timeout = 30_000;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const initializeRepository = (root: string) => {
  execFileSync("git", ["init", "--quiet", root]);
  const consent = join(root, "consent-state");
  const receipts = join(root, "receipts");
  const environment = { ...process.env, REVIEW_STATE_PATH: consent, REVIEW_RECEIPT_PATH: receipts };
  const preview = spawnSync(process.execPath, ["src/cli.ts", "--enable"], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, operation: "enable", cwd: root }),
    encoding: "utf8",
    env: environment,
  });
  const digest = (JSON.parse(preview.stdout) as { proposal: { digest: string } }).proposal.digest;
  const enabled = spawnSync(process.execPath, ["src/cli.ts", "--enable-confirm"], {
    cwd: process.cwd(),
    input: JSON.stringify({ version: 1, operation: "enable-confirm", cwd: root, proposalDigest: digest }),
    encoding: "utf8",
    env: environment,
  });
  expect(enabled.status).toBe(0);
  return { consent, receipts, environment };
};

const review = (
  root: string,
  environment: NodeJS.ProcessEnv,
  eventId: string,
  sessionId: string,
  paths: ReadonlyArray<string>,
  control = "{}",
) =>
  spawnSync(process.execPath, ["src/cli.ts", "--controlled"], {
    cwd: process.cwd(),
    input: JSON.stringify({
      version: 1,
      event: { id: eventId, kind: "successful-edit", host: "subprocess-test", cwd: root, sessionId, paths },
    }),
    encoding: "utf8",
    env: { ...environment, REVIEW_CONTROL_JSON: control },
  });

const readStatus = (root: string, environment: NodeJS.ProcessEnv, sessionId: string, format?: "human") => {
  const output = spawnSync(process.execPath, ["src/cli.ts", "--status"], {
    cwd: process.cwd(),
    input: JSON.stringify({
      version: 1,
      operation: "status",
      cwd: root,
      sessionId,
      ...(format === undefined ? {} : { format }),
    }),
    encoding: "utf8",
    env: environment,
  });
  return { output, parsed: format === undefined ? (JSON.parse(output.stdout) as Record<string, unknown>) : undefined };
};

describe("session receipt subprocess contract", { timeout }, () => {
  it("keeps readiness distinct from missing activity", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-subprocess-missing-"));
    roots.push(root);
    const { environment } = initializeRepository(root);

    const result = readStatus(root, environment, "never-observed");
    expect(result.output.status).toBe(0);
    expect(result.parsed).toMatchObject({
      operation: "status",
      activity: { kind: "no-observation", observed: false },
      readiness: { configuration: "ready", consent: "approved" },
    });
  });

  it("reports all-skipped activity and retains no source-bearing data", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-subprocess-skipped-"));
    roots.push(root);
    const { environment, receipts } = initializeRepository(root);
    writeFileSync(join(root, ".env"), "source marker should never be persisted\n");
    const result = review(root, environment, "event-skipped", "session-resumed", [".env"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).results[0]).toMatchObject({ status: "skipped" });

    const status = readStatus(root, environment, "session-resumed");
    expect(status.parsed).toMatchObject({
      activity: {
        kind: "all-skipped",
        counts: { started: 1, completed: 1, reviewed: 0, skipped: 1, unavailable: 0 },
        categories: { "skipped:excluded": 1 },
      },
    });
    const receiptText = existsSync(receipts)
      ? JSON.stringify(readdirSync(receipts))
      : "";
    expect(receiptText).not.toContain("source marker");
    expect(JSON.stringify(status.parsed)).not.toContain("source marker");
  });

  it("reports clean reviewed activity, duplicate events once, and human status", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-subprocess-reviewed-"));
    roots.push(root);
    const { environment } = initializeRepository(root);
    mkdirSource(root);
    const path = join(root, "src", "example.ts");
    writeFileSync(path, "export type Counter = { count: number };\n");
    const first = review(root, environment, "event-reviewed", "session-resumed", ["src/example.ts"]);
    expect(first.status).toBe(0);
    expect(JSON.parse(first.stdout).results[0]).toMatchObject({ status: "reviewed" });
    const duplicate = review(root, environment, "event-reviewed", "session-resumed", ["src/example.ts"]);
    expect(duplicate.status).toBe(0);
    const status = readStatus(root, environment, "session-resumed");
    expect(status.parsed).toMatchObject({
      activity: {
        kind: "clean-reviewed",
        counts: { started: 1, completed: 1, incomplete: 0, reviewed: 1 },
      },
    });

    const human = readStatus(root, environment, "session-resumed", "human");
    expect(human.output.status).toBe(0);
    expect(human.output.stdout).toContain("activity: clean-reviewed");
    expect(human.output.stdout).toContain("session: session-resumed");
  });

  it("does not leak a synthetic provider failure into receipt/status output", () => {
    const root = mkdtempSync(join(tmpdir(), "receipt-subprocess-secret-"));
    roots.push(root);
    const { environment, receipts } = initializeRepository(root);
    mkdirSource(root);
    writeFileSync(join(root, "src", "secret.ts"), "export type Secret = string;\n");
    const secret = "provider-error-secret-marker";
    const result = review(
      root,
      environment,
      "event-unavailable",
      "session-secret-test",
      ["src/secret.ts"],
      JSON.stringify({ failure: secret }),
    );
    expect(result.status).toBe(0);
    expect(JSON.stringify(JSON.parse(result.stdout))).not.toContain(secret);
    const status = readStatus(root, environment, "session-secret-test");
    expect(JSON.stringify(status.parsed)).not.toContain(secret);
    const persisted = existsSync(receipts) ? readAllFiles(receipts).join("\n") : "";
    expect(persisted).not.toContain(secret);
    expect(persisted).not.toContain("export type Secret");
    expect(persisted).not.toContain("probability");
  });
});

const mkdirSource = (root: string) => {
  // Keep this helper local so each subprocess test controls exactly which source
  // file exists; the receipt itself never stores this path or content.
  mkdirSync(join(root, "src"), { recursive: true });
};

const readAllFiles = (root: string): Array<string> => {
  const files: Array<string> = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) files.push(...readAllFiles(child));
    else files.push(readFileSync(child, "utf8"));
  }
  return files;
};
