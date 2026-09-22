import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  logoutCredential,
  readCredentialState,
  resolveCredential,
  runSecretService,
  saveCredential,
} from "./secret-service.ts";

const originalEnvironment = { ...process.env };
let root: string;
let helper: string;
let vault: string;
let lifecycle: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "credential-lifecycle-"));
  helper = join(root, "helper.mjs");
  vault = join(root, "vault");
  lifecycle = join(root, "state.json");
  writeFileSync(helper, `#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const operation = process.argv[2];
const mode = process.env.TEST_SECRET_MODE;
const vault = process.env.TEST_SECRET_VAULT;
if (mode === "hang") await new Promise(() => setInterval(() => {}, 1000));
if (mode === "unavailable") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
if (mode === "locked") { console.log('{"version":1,"status":"locked"}'); process.exit(2); }
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "get") {
  if (!existsSync(vault)) console.log('{"version":1,"status":"missing"}');
  else { const value = readFileSync(vault); console.log(JSON.stringify({version:1,status:"present",length:value.length})); process.stdout.write(value); }
} else if (operation === "set") {
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  if (mode === "fail-set") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
  writeFileSync(vault, Buffer.concat(chunks), { mode: 0o600 }); console.log('{"version":1,"status":"stored"}');
} else if (operation === "delete") {
  if (mode === "fail-delete") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
  const existed = existsSync(vault); rmSync(vault, { force: true }); console.log(JSON.stringify({version:1,status:existed?"deleted":"missing"}));
}
`);
  chmodSync(helper, 0o700);
  process.env.REVIEW_CREDENTIAL_HELPER = helper;
  process.env.REVIEW_CREDENTIAL_STATE_PATH = lifecycle;
  process.env.TEST_SECRET_VAULT = vault;
  delete process.env.TEST_SECRET_MODE;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.ALT_KEY;
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe("Secret Service credential lifecycle", () => {
  it("bounds a nonprompting lookup by killing its helper", async () => {
    process.env.TEST_SECRET_MODE = "hang";
    const started = Date.now();
    await expect(runSecretService("get", { deadlineMs: 40 })).resolves.toEqual({ status: "timed-out" });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("uses the default environment key before saved storage", async () => {
    await saveCredential("saved-marker", lifecycle);
    process.env.TYPESAFE_API_KEY = "environment-marker";
    await expect(resolveCredential({ envVar: "TYPESAFE_API_KEY", environmentOnly: false, statePath: lifecycle }))
      .resolves.toMatchObject({ status: "present", source: "environment", value: "environment-marker" });
  });

  it("honors an explicitly absent hook environment instead of the resident launch environment", async () => {
    await saveCredential("saved-marker", lifecycle);
    process.env.TYPESAFE_API_KEY = "stale-resident-environment-marker";
    await expect(resolveCredential({
      envVar: "TYPESAFE_API_KEY",
      environmentOnly: false,
      environmentValue: null,
      statePath: lifecycle,
    })).resolves.toMatchObject({ status: "present", source: "saved", value: "saved-marker" });
  });

  it("treats an explicit environment selection as environment-only", async () => {
    await saveCredential("saved-marker", lifecycle);
    await expect(resolveCredential({ envVar: "ALT_KEY", environmentOnly: true, statePath: lifecycle }))
      .resolves.toMatchObject({ status: "missing", source: "environment" });
  });

  it("preserves the old credential when replacement fails", async () => {
    const initial = await saveCredential("old-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "fail-set";
    const failed = await saveCredential("new-marker", lifecycle);
    delete process.env.TEST_SECRET_MODE;
    expect(failed.status).toBe("unavailable");
    expect(failed.state.generation).toBe(initial.state.generation + 1);
    expect(readFileSync(vault, "utf8")).toBe("old-marker");
  });

  it("invalidates old generations after replacement", async () => {
    const old = await saveCredential("old-marker", lifecycle);
    const replacement = await saveCredential("new-marker", lifecycle);
    expect(replacement.state.generation).toBe(old.state.generation + 1);
    await expect(resolveCredential({
      envVar: "TYPESAFE_API_KEY",
      environmentOnly: false,
      expectedGeneration: old.state.generation,
      statePath: lifecycle,
    })).resolves.toMatchObject({ status: "suspended", generation: replacement.state.generation });
  });

  it("suspends saved use and advances generation when deletion fails", async () => {
    const stored = await saveCredential("saved-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "fail-delete";
    const logout = await logoutCredential(lifecycle);
    expect(logout.status).toBe("unavailable");
    expect(logout.state).toEqual({
      version: 1,
      generation: stored.state.generation + 1,
      savedUseSuspended: true,
    });
    expect(readCredentialState(lifecycle).savedUseSuspended).toBe(true);
    expect(readFileSync(vault, "utf8")).toBe("saved-marker");
    delete process.env.TEST_SECRET_MODE;
    await expect(resolveCredential({ envVar: "TYPESAFE_API_KEY", environmentOnly: false, statePath: lifecycle }))
      .resolves.toMatchObject({ status: "suspended" });
  });
});
