import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun, stageResults, runQualityStages, focusedSelection } from "./run-checks.mjs"

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-checks-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
const command = (name, code) => ({ name, command: process.execPath, args: ["-e", code] })

test("ordinary failure preserves its log and does not suppress independent checks", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} })
  await run.runStage(command("bad", "console.error('first failure'); process.exit(7)"))
  await run.runStage(command("good", "console.log('second check executed')"))
  assert.equal(await run.finish(), 1)
  const results = await stageResults(run.runDirectory)
  assert.deepEqual(
    results.map((stage) => stage.exitCode),
    [7, 0]
  )
  assert.match(await readFile(results[0].logPath, "utf8"), /first failure/)
  const status = JSON.parse(await readFile(join(run.runDirectory, "status.json"), "utf8"))
  assert.deepEqual(status.failedStages, ["bad"])
})

test("deadline terminates a child, persists failure, and admits no later work", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} })
  run.context.deadline = Date.now() + 100
  const result = await run.runStage(command("hang", "setInterval(() => {}, 1000)"))
  assert.equal(result.state, "failed")
  assert.equal(result.timedOut, true)
  assert.equal(result.exitCode, null)
  assert.equal((await run.runStage(command("later", "process.exit(0)"))).state, "not-started")
  assert.equal(await run.finish(), 1)
})

test("exclusive full gate fails immediately; valid nested test shares records", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, inherited: undefined, output() {} })
  await assert.rejects(
    createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} }),
    /already owns/
  )
  const nested = await createRun({
    root,
    mode: "test",
    timeoutMs: 30_000,
    inherited: JSON.stringify(run.context),
    output() {}
  })
  await nested.runStage(command("nested", "process.exit(0)"))
  assert.equal(await nested.finish(), 0)
  await assert.rejects(
    createRun({
      root,
      mode: "test",
      timeoutMs: 30_000,
      inherited: JSON.stringify({ ...run.context, token: "wrong" }),
      output() {}
    }),
    /not active/
  )
  assert.equal(await run.finish(), 0)
  const after = await createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} })
  assert.equal(await after.finish(), 1, "empty run cannot claim success")
})

test("focused mode refuses empty and broad selections", async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src", "one.test.ts"), "")
  await assert.rejects(focusedSelection(root, ["--coverage"]), /explicit/)
  await assert.rejects(focusedSelection(root, ["src/one.test.ts", "src"]), /explicit test files/)
  await assert.rejects(focusedSelection(root, ["missing.test.ts"]), /ENOENT/)
  const selection = await focusedSelection(root, ["src/one.test.ts", "--coverage"])
  assert.deepEqual(selection.vitestFiles, ["src/one.test.ts"])
})

test("persistent reporter failures prevent a nominal zero exit from passing", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} })
  await run.runStage(command("nominal", "process.exit(0)"))
  await writeFile(join(run.runDirectory, "failures.jsonl"), '{"file":"example.test.ts","message":"failure"}\n')
  assert.equal(await run.finish(), 1)
  const result = JSON.parse(await readFile(join(run.runDirectory, "results.json"), "utf8"))
  assert.equal(result.testFailures.length, 1)
})

test("nested test cannot extend its parent's absolute deadline", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, output() {} })
  await assert.rejects(
    createRun({
      root,
      mode: "test",
      timeoutMs: 30_000,
      inherited: JSON.stringify({ ...run.context, deadline: run.context.deadline + 1000 }),
      output() {}
    }),
    /not active/
  )
  assert.equal(await run.finish(), 1)
})

test("quality preserves threshold breach exit two but test failure stays exit one", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, output() {} })
  await run.runStage(command("quality", "process.exit(2)"))
  assert.equal(await run.finish(), 2)
  const ordinary = await createRun({ root, mode: "test", timeoutMs: 30_000, output() {} })
  await ordinary.runStage(command("quality", "process.exit(2)"))
  assert.equal(await ordinary.finish(), 1)
})

test("failure events are surfaced during the run and retained in the final result", async (t) => {
  const root = await fixture(t)
  const messages = []
  const run = await createRun({ root, mode: "test", timeoutMs: 30_000, output: (message) => messages.push(message) })
  await run.runStage(
    command(
      "reporter",
      "require('node:fs').appendFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, JSON.stringify({file:'owner.test.ts',name:'case',message:'bad'})+'\\n'); setTimeout(()=>{}, 250)"
    )
  )
  assert(messages.some((message) => message.includes("FAIL owner.test.ts > case: bad")))
  assert.equal(await run.finish(), 1)
})

test("real quality parent remains running while nested test can finish successfully", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, output() {} })
  const modulePath = fileURLToPath(new URL("./run-checks.mjs", import.meta.url))
  const childProgram = `
    const { createRun } = await import(${JSON.stringify(modulePath)});
    const context = JSON.parse(process.env.HAPSLAND_CHECK_CONTEXT);
    const nested = await createRun({ root: context.root, mode: 'test', timeoutMs: 30000,
      inherited: process.env.HAPSLAND_CHECK_CONTEXT, output() {} });
    await nested.runStage({name:'nested-check',command:process.execPath,args:['-e','process.exit(0)']});
    process.exitCode = await nested.finish();
  `
  const stage = await run.runStage({
    name: "quality",
    command: process.execPath,
    args: ["--input-type=module", "-e", childProgram]
  })
  assert.equal(stage.exitCode, 0, await readFile(stage.logPath, "utf8"))
  assert.equal(await run.finish(), 0)
  const results = await stageResults(run.runDirectory)
  assert.deepEqual(
    results.map((result) => result.state),
    ["passed", "passed"]
  )
})

for (const lintExit of [0, 1]) {
  test(`quality records lint exit ${lintExit} and starts coverage only after lint passes`, async (t) => {
    const root = await fixture(t)
    await mkdir(join(root, "scripts"), { recursive: true })
    await mkdir(join(root, "node_modules/.bin"), { recursive: true })
    await writeFile(
      join(root, "scripts/run-quality-lint.mjs"),
      `console.error("lint witness"); process.exit(${lintExit})`
    )
    await writeFile(join(root, "node_modules/.bin/crap4ts"), `#!${process.execPath}\nprocess.exit(2)\n`, {
      mode: 0o755
    })
    const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, output() {} })
    await runQualityStages(run, root)
    assert.equal(await run.finish(), lintExit === 0 ? 2 : 1)
    const stages = await stageResults(run.runDirectory)
    assert.deepEqual(
      stages.map((stage) => stage.name),
      lintExit === 0 ? ["lint-code", "quality"] : ["lint-code"]
    )
    assert.match(await readFile(stages[0].logPath, "utf8"), /lint witness/u)
  })
}
