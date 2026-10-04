import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const loader = new URL("./dev-install-env.mjs", import.meta.url).href;

test("dev .env supplements explicit environment and reaches setup children without disclosure", () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-env-test-"));
  try {
    writeFileSync(join(root, ".env"), 'TYPESAFE_API_KEY="file fixture"\nEXPLICIT_FIXTURE=file\nEMPTY_FIXTURE=file\n');
    const env = { ...process.env, EXPLICIT_FIXTURE: "explicit", EMPTY_FIXTURE: "" };
    delete env.TYPESAFE_API_KEY;
    const program = `import {loadDevEnvFile} from ${JSON.stringify(loader)};
      import {spawnSync} from "node:child_process";
      loadDevEnvFile(${JSON.stringify(root)});
      const child = spawnSync(process.execPath,["-e",'process.exit(process.env.TYPESAFE_API_KEY === "file fixture" ? 0 : 1)'],{env:{...process.env}});
      console.log(JSON.stringify({filePresent:process.env.TYPESAFE_API_KEY === "file fixture",explicit:process.env.EXPLICIT_FIXTURE === "explicit",empty:process.env.EMPTY_FIXTURE === "",childPassed:child.status === 0}));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { filePresent: true, explicit: true, empty: true, childPassed: true });
    assert.ok(!result.stdout.includes("file fixture"));
    const override = spawnSync(process.execPath, ["--input-type=module", "-e", `import {loadDevEnvFile} from ${JSON.stringify(loader)}; loadDevEnvFile(${JSON.stringify(root)}); process.exit(process.env.TYPESAFE_API_KEY === "explicit-key" ? 0 : 1);`], { env: { ...env, TYPESAFE_API_KEY: "explicit-key" }, timeout: 5000 });
    assert.equal(override.status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("missing dev .env is allowed; unreadable paths fail without printing contents", async () => {
  const { loadDevEnvFile } = await import("./dev-install-env.mjs");
  const root = mkdtempSync(join(tmpdir(), "hapsland-env-test-"));
  try {
    assert.doesNotThrow(() => loadDevEnvFile(root));
    mkdirSync(join(root, ".env"));
    assert.throws(() => loadDevEnvFile(root), /Cannot read development .env file/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
