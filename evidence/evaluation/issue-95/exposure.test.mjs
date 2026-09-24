import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectEdit, summarizeAdvice } from "./exposure.mjs";

function withRepo(run) {
  const root = mkdtempSync(join(tmpdir(), "hapsland-95-exposure-test-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(join(root, "src"));
  return Promise.resolve(run(root)).finally(() => rmSync(root, { recursive: true, force: true }));
}

const nativeEvent = (cwd, path) => ({
  cwd,
  tool_name: "apply_patch",
  tool_input: { command: `*** Begin Patch\n*** Add File: ${path}\n+export interface Example { value: string }\n*** End Patch` },
});

test("records analyzer readiness and source hashes for named edit files", async () => {
  await withRepo(async (root) => {
    const path = join(root, "src/types.ts");
    writeFileSync(path, "export interface Example { value: string }\n");
    const first = await inspectEdit(nativeEvent(root, "src/types.ts"));
    assert.equal(first.kind, "parsed-patch");
    assert.equal(first.authority, "observational-only");
    assert.equal(first.candidates[0].status, "analyzed");
    assert.deepEqual(first.candidates[0].units, [{ name: "Example", status: "ready" }]);
    assert.match(first.candidates[0].sourceHash, /^[a-f0-9]{64}$/);
    assert.equal("source" in first.candidates[0], false);

    writeFileSync(path, "export interface Example { value: string; count: number }\n");
    const next = await inspectEdit(nativeEvent(root, "src/types.ts"));
    assert.notEqual(next.candidates[0].sourceHash, first.candidates[0].sourceHash);
  });
});

test("omits the raw path of an outside-root patch candidate", async () => {
  await withRepo(async (root) => {
    const observation = await inspectEdit(nativeEvent(root, "../private-source.ts"));
    assert.equal(observation.candidates[0].status, "outside-root");
    assert.equal("path" in observation.candidates[0], false);
  });
});

test("marks imported and oversized files outside the supported analyzer cells", async () => {
  await withRepo(async (root) => {
    writeFileSync(join(root, "src/types.ts"), 'import type { X } from "./x";\nexport interface Example { value: X }\n');
    const imported = await inspectEdit(nativeEvent(root, "src/types.ts"));
    assert.equal(imported.candidates[0].status, "unsupported");
    assert.equal(imported.candidates[0].reason, "import");

    writeFileSync(join(root, "src/types.ts"), "x".repeat(32 * 1024 + 1));
    const oversized = await inspectEdit(nativeEvent(root, "src/types.ts"));
    assert.equal(oversized.candidates[0].status, "capture-oversize");
    assert.equal(oversized.candidates[0].sourceHash, undefined);
  });
});

test("retains only rule, declaration, and path metadata from advice", () => {
  const context = "Advisory direct-event review (the edit already succeeded):\n" +
    "src/types.ts :: EndRecord [r2_meaningless_combinations, p=0.92]: source-bearing explanation";
  assert.deepEqual(summarizeAdvice(context), [{
    path: "src/types.ts", declaration: "EndRecord", ruleId: "r2_meaningless_combinations",
  }]);
});
