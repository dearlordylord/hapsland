import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("reports package readiness from individual checks and returns the matching exit status", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./package-doctor.ts", import.meta.url))], {
    encoding: "utf8",
    env: process.env,
  });
  expect(result.error).toBeUndefined();
  const output = JSON.parse(result.stdout);
  expect(output.schemaVersion).toBe(1);
  const checks: Array<{ name: string; status: string; observed: string; required: string; action?: string }> =
    output.checks;
  expect(checks.map((check) => check.name)).toEqual(
    expect.arrayContaining([
      "runtime",
      "platform-profile",
      "git",
      "parser-runtime-binding",
      "parser-typescript-binding",
      "parser-rust-binding",
      "stable-capture-facility",
      "resident-entry",
      "parser",
    ]),
  );
  expect(new Set(checks.map((check) => check.name)).size).toBe(checks.length);
  for (const check of checks) {
    expect(["ready", "unsupported"]).toContain(check.status);
    expect(check.observed.length).toBeGreaterThan(0);
    expect(check.required.length).toBeGreaterThan(0);
    if (check.status === "ready") expect(check.action).toBeUndefined();
  }
  const allReady = checks.every((check) => check.status === "ready");
  expect(output.status).toBe(allReady ? "ready" : "unsupported");
  expect(result.status).toBe(allReady ? 0 : 1);
  const declaration = JSON.parse(readFileSync(new URL("../package-runtime.json", import.meta.url), "utf8"));
  expect(checks.find((check) => check.name === "runtime")).toMatchObject({
    observed: process.version,
    required: `Node ${declaration.runtime.version}`,
    status: process.version === `v${declaration.runtime.version}` ? "ready" : "unsupported",
  });
  const profileDeclared = declaration.profiles.some(
    (profile: { operatingSystem: string; architecture: string }) =>
      profile.operatingSystem === process.platform && profile.architecture === process.arch,
  );
  expect(checks.find((check) => check.name === "platform-profile")).toMatchObject({
    observed: `${process.platform}/${process.arch}`,
    status: profileDeclared ? "ready" : "unsupported",
  });
});
