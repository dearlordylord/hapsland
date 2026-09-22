import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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
if (mode === "epipe") process.exit(0);
if (mode === "close-stdin-hang") { (await import("node:fs")).closeSync(0); await new Promise(() => setInterval(() => {}, 1000)); }
if (mode === "unavailable") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
if (mode === "locked") { console.log('{"version":1,"status":"locked"}'); process.exit(2); }
if (mode === "interaction-required") { console.log('{"version":1,"status":"interaction-required"}'); process.exit(2); }
if (operation === "probe") console.log('{"version":1,"status":"available"}');
else if (operation === "get") {
  if (mode === "slow-get") await new Promise((resolve) => setTimeout(resolve, 150));
  if (!existsSync(vault)) console.log('{"version":1,"status":"missing"}');
  else { const value = readFileSync(vault); console.log(JSON.stringify({version:1,status:"present",length:value.length})); process.stdout.write(value); }
} else if (operation === "set") {
  const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
  if (mode === "fail-set") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
  writeFileSync(vault, Buffer.concat(chunks), { mode: 0o600 });
  if (mode === "fail-after-create") { console.log('{"version":1,"status":"indeterminate"}'); process.exit(2); }
  if (mode === "commit-hang-set") await new Promise(() => setInterval(() => {}, 1000));
  console.log('{"version":1,"status":"stored"}');
} else if (operation === "delete") {
  if (mode === "fail-delete") { console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
  if (mode === "slow-fail-delete") { await new Promise((resolve) => setTimeout(resolve, 150)); console.log('{"version":1,"status":"unavailable"}'); process.exit(2); }
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

describe("native credential lifecycle", () => {
  it("uses a non-optimizable wipe on every native set input release", () => {
    const header = readFileSync(join(process.cwd(), "native", "credential-input.h"), "utf8");
    const linux = readFileSync(join(process.cwd(), "native", "credential-secret-service.c"), "utf8");
    const mac = readFileSync(join(process.cwd(), "native", "credential-keychain.c"), "utf8");
    expect(header).toContain("volatile unsigned char *cursor");
    expect(linux).not.toContain("free(input)");
    expect(mac).not.toContain("free(input)");
    expect(linux.match(/credential_secure_free\(input, length\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(mac.match(/credential_secure_free\(input, length\)/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("accepts exactly 32,768 native input bytes and rejects byte 32,769", () => {
    const harnessSource = join(root, "credential-input-harness.c");
    const harness = join(root, "credential-input-harness");
    writeFileSync(harnessSource, `#include <stdio.h>
#include "credential-input.h"
int main(void) {
  size_t length = 0;
  char *value = credential_read_stdin(&length);
  if (value == NULL) return 2;
  printf("%zu\\n", length);
  credential_secure_free(value, length);
  return 0;
}
`);
    execFileSync("cc", [
      "-O2", "-std=c11", "-Wall", "-Wextra",
      "-I", join(process.cwd(), "native"), harnessSource, "-o", harness,
    ]);
    const exact = spawnSync(harness, [], { input: Buffer.alloc(32_768, 0x78), encoding: "utf8" });
    expect(exact.status).toBe(0);
    expect(exact.stdout).toBe("32768\n");
    const oversized = spawnSync(harness, [], { input: Buffer.alloc(32_769, 0x78), encoding: "utf8" });
    expect(oversized.status).toBe(2);
    expect(oversized.stdout).toBe("");
  });

  it("bounds a nonprompting lookup by killing its helper", async () => {
    process.env.TEST_SECRET_MODE = "hang";
    const started = Date.now();
    await expect(runSecretService("get", { deadlineMs: 40 })).resolves.toEqual({ status: "timed-out" });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("cancels a live native lookup and waits for helper termination", async () => {
    process.env.TEST_SECRET_MODE = "hang";
    const controller = new AbortController();
    const lookup = runSecretService("get", { deadlineMs: 5_000, signal: controller.signal });
    controller.abort();
    await expect(lookup).resolves.toEqual({ status: "cancelled" });
  });

  it("preserves an interaction-required native outcome without attempting UI", async () => {
    process.env.TEST_SECRET_MODE = "interaction-required";
    await expect(resolveCredential({
      envVar: "TYPESAFE_API_KEY",
      environmentOnly: false,
      statePath: lifecycle,
    })).resolves.toMatchObject({ status: "interaction-required", source: "saved" });
  });

  it("keeps the macOS helper lookup noninteractive and scoped by service and account", () => {
    const source = readFileSync(join(process.cwd(), "native", "credential-keychain.c"), "utf8");
    expect(source).toContain('CFSTR("dev.typesafe.realtime-review-tool")');
    expect(source).toContain('CFSTR("default")');
    expect(source).toContain("SecKeychainCopyDefault");
    expect(source).toContain("kSecMatchSearchList");
    expect(source).toContain("kSecUseKeychain");
    expect(source.match(/kSecUseKeychain/g)).toHaveLength(1);
    expect(source).toContain("errSecInteractionRequired");
    expect(source).toContain("kSecUseAuthenticationUIFail");
    expect(source).toContain("allow_interaction ? kSecUseAuthenticationUIAllow");
    expect(source).toContain("kSecAttrAccessibleAfterFirstUnlock");
  });

  it("maps helper stdin EPIPE to a sanitized indeterminate result", async () => {
    process.env.TEST_SECRET_MODE = "epipe";
    await expect(runSecretService("set", { input: "x".repeat(32_768) })).resolves.toEqual({ status: "indeterminate" });
  });

  it("retains the deadline for a live helper that closes credential stdin", async () => {
    process.env.TEST_SECRET_MODE = "close-stdin-hang";
    const started = Date.now();
    await expect(runSecretService("set", { input: "x".repeat(32_768), deadlineMs: 200 }))
      .resolves.toEqual({ status: "timed-out" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("treats malformed valid JSON state as suspended", () => {
    writeFileSync(lifecycle, JSON.stringify({ version: 1, generation: "bad", savedUseSuspended: false }));
    expect(readCredentialState(lifecycle)).toEqual({
      version: 1, generation: 0, savedUseSuspended: true,
    });
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

  it("rejects a lookup whose generation changes in another process", async () => {
    await saveCredential("saved-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "slow-get";
    const mutation = spawn(process.execPath, ["-e", `
      const fs = require("node:fs");
      setTimeout(() => fs.writeFileSync(process.argv[1], JSON.stringify({version:1,generation:99,savedUseSuspended:false})), 30);
    `, lifecycle], { stdio: "ignore" });
    const mutationExited = new Promise<void>((resolveExit) => mutation.once("exit", () => resolveExit()));
    await expect(resolveCredential({ envVar: "TYPESAFE_API_KEY", environmentOnly: false, statePath: lifecycle }))
      .resolves.toMatchObject({ status: "suspended", generation: 99 });
    await mutationExited;
  });

  it("reports commit-then-timeout replacement as indeterminate and suspends use", async () => {
    await saveCredential("old-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "commit-hang-set";
    const result = await saveCredential("new-marker", lifecycle);
    expect(result.status).toBe("indeterminate");
    expect(result.state.savedUseSuspended).toBe(true);
    expect(readFileSync(vault, "utf8")).toBe("new-marker");
    delete process.env.TEST_SECRET_MODE;
    await expect(resolveCredential({ envVar: "TYPESAFE_API_KEY", environmentOnly: false, statePath: lifecycle }))
      .resolves.toMatchObject({ status: "suspended" });
  }, 20_000);

  it("maps a native create failure after possible commit to indeterminate and suspends use", async () => {
    await saveCredential("old-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "fail-after-create";
    const result = await saveCredential("new-marker", lifecycle);
    expect(result.status).toBe("indeterminate");
    expect(result.state.savedUseSuspended).toBe(true);
    expect(readFileSync(vault, "utf8")).toBe("new-marker");
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

  it("publishes a suspended generation before native deletion completes", async () => {
    const stored = await saveCredential("saved-marker", lifecycle);
    process.env.TEST_SECRET_MODE = "slow-fail-delete";
    const deleting = logoutCredential(lifecycle);
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
    expect(readCredentialState(lifecycle)).toEqual({
      version: 1,
      generation: stored.state.generation + 1,
      savedUseSuspended: true,
    });
    const result = await deleting;
    expect(result.state.savedUseSuspended).toBe(true);
  });
});
