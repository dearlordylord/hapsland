import { DEFAULT_CHILD_TIMEOUT_MS } from "../scripts/test-harness/policy.mjs";
import { spawnSync } from "../scripts/test-harness/process.mjs";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { makeGitFixture } from "./direct-event/test-fixtures.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const status = (root: string, format?: "human") => spawnSync(process.execPath, ["src/cli.ts", "--status"], {
  cwd: process.cwd(), encoding: "utf8", timeout: DEFAULT_CHILD_TIMEOUT_MS,
  env: { ...process.env, TYPESAFE_API_KEY: "synthetic-status-marker", REVIEW_RESIDENT_DIR: join(root, "runtime"),
    REVIEW_ACTIVITY_PATH: join(root, "activity"), REVIEW_CREDENTIAL_HELPER: join(root, "missing-helper") },
  input: JSON.stringify({ version: 1, operation: "status", cwd: root, sessionId: "status-session", ...(format === undefined ? {} : { format }) }),
});

it("reads the session receipt when repository configuration is malformed", async () => {
  const root = await makeGitFixture(); roots.push(root);
  writeFileSync(join(root, ".hapsland.jsonc"), "{malformed");
  const result = status(root);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ sessionId: "status-session", activitySource: "resident-v1",
    readiness: { status: "not-ready", configuration: "invalid", fileSelection: "unavailable" },
    activity: { kind: "no-observation" } });
  expect(result.stdout).not.toContain("synthetic-status-marker");
});

it("reports empty file selection independently of credential presence", async () => {
  const root = await makeGitFixture(); roots.push(root);
  writeFileSync(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, includes: [] }));
  const result = status(root);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).readiness).toMatchObject({ status: "not-ready", configuration: "ready",
    fileSelection: "none", credentials: { present: true } });
});

it("renders readiness and the session receipt in human format without exposing the credential", async () => {
  const root = await makeGitFixture(); roots.push(root);
  const result = status(root, "human");
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("readiness: ready (configuration=ready, files=configured, credentials=present)");
  expect(result.stdout).toContain("status-session");
  expect(result.stdout).not.toContain("synthetic-status-marker");
});
