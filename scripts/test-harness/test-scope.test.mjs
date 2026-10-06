import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { testDiscovery } from "./test-scope.mjs"
import { precheckStages } from "./check-stages.mjs"

test("ordinary test and release plans leave development modules optional", () => {
  assert.deepEqual(testDiscovery(undefined), {
    include: ["src/**/*.test.ts", "scripts/**/*.test.mts"],
    exclude: ["vendor/**", "node_modules/**", "scripts/game-*.test.mts", "packages/monkey-business/**"]
  })
  assert.equal(
    precheckStages.some((stage) => stage.includes("packages/monkey-business-bend/build.mjs")),
    false
  )
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"))
  assert.doesNotMatch(manifest.scripts.build, /monkey-business|game-lab|canonical-defense/u)
  assert.ok(precheckStages.some(([name]) => name === "bend-artifacts"))
  assert.ok(precheckStages.some(([name]) => name === "production-authority"))
  assert.ok(precheckStages.some(([name]) => name === "content-isolation"))
  assert.ok(precheckStages.some(([name]) => name === "content-wire-mutants"))
})

test("explicit optional selection remains runnable without enabling the whole suite", () => {
  const files = ["scripts/game-balance-lab.test.mts", "packages/monkey-business/src/outcomes.test.ts"]
  assert.deepEqual(testDiscovery(files), { include: files, exclude: ["vendor/**", "node_modules/**"] })
})

test("optional callers plan generated checks and explicit finite suites separately", () => {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-optional-caller-"))
  const receipt = join(directory, "caller.json")
  const hook = join(directory, "observe-caller.mjs")
  writeFileSync(
    hook,
    `
import { registerHooks } from "node:module";
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith("/scripts/test-harness/run-checks.mjs")) {
    return { format: "module", shortCircuit: true, source: \`
      import { writeFileSync } from "node:fs";
      export async function createRun(options) {
        const stages = []; let failed = false;
        return { async runStage(stage) { stages.push(stage); const state = process.env.HAPSLAND_OPTIONAL_FAIL_STAGE === stage.name ? "failed" : "passed"; failed ||= state === "failed"; return { state }; },
          async finish() { writeFileSync(process.env.HAPSLAND_OPTIONAL_RECEIPT,
            JSON.stringify({ options, stages })); return failed ? 1 : 0; } };
      }
    \` };
  }
  return nextLoad(url, context);
} });
`
  )
  try {
    for (const scope of ["game", "simulation"]) {
      const result = spawnSync(process.execPath, ["--import", hook, "scripts/run-optional-development.mjs", scope], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, HAPSLAND_CHECK_CONTEXT: "owned-parent-fixture", HAPSLAND_OPTIONAL_RECEIPT: receipt }
      })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 0, result.stderr)
      const captured = JSON.parse(readFileSync(receipt, "utf8"))
      assert.equal(captured.options.inherited, "owned-parent-fixture")
      assert.equal(captured.options.timeoutMs, 1500000)
      assert.equal(captured.options.scope, `optional-${scope}`)
      const files = captured.options.selectedTestFiles
      assert.ok(files.length > 0)
      assert.ok(
        files.every((file) =>
          scope === "game"
            ? file === "scripts/game-balance-lab.test.mts"
            : file.startsWith("packages/monkey-business/src/") && file.endsWith(".test.ts")
        )
      )
      assert.deepEqual(captured.stages.at(-1).args, [
        "scripts/test-harness/run-checks.mjs",
        "focused",
        "--timeout-ms=1500000",
        ...files
      ])
      assert.deepEqual(
        captured.stages[0].args,
        scope === "game"
          ? ["scripts/build-game-lab.mjs", "--check"]
          : ["packages/monkey-business-bend/build.mjs", "--check"]
      )
      assert.equal(captured.stages.length, scope === "game" ? 3 : 2)
    }
    for (const [scope, failedStage, expectedStages] of [
      ["game", "game-generated", 1],
      ["simulation", "simulation-generated", 1],
      ["game", "game-lab-types", 2]
    ]) {
      const result = spawnSync(process.execPath, ["--import", hook, "scripts/run-optional-development.mjs", scope], {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        encoding: "utf8",
        timeout: 15000,
        env: { ...process.env, HAPSLAND_OPTIONAL_RECEIPT: receipt, HAPSLAND_OPTIONAL_FAIL_STAGE: failedStage }
      })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 1, result.stderr)
      const captured = JSON.parse(readFileSync(receipt, "utf8"))
      assert.equal(captured.stages.length, expectedStages)
      assert.equal(captured.stages.at(-1).name, failedStage)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
