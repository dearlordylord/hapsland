import { execFileSync, spawnSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun, stageResults, runQualityStages, focusedSelection } from "./run-checks.mjs"
import { withBuildLock } from "../build-lock.mjs"

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-checks-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
test("a stage inside its authenticated checkout lease passes before the enclosing transaction releases ownership", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "focused", timeoutMs: 10000, output() {} })
  await withBuildLock(root, async (env) => {
    const stage = await run.runStage({ ...command("owned-child", "process.exit(0)"), env })
    assert.equal(stage.state, "passed")
    assert.equal(stage.groupUnresolved, undefined)
    assert.equal(JSON.parse(await readFile(join(root, ".test-runs/product-build/lease.json"))).state, "open")
  })
  assert.equal(await run.finish(), 0)
  await assert.rejects(readFile(join(root, ".test-runs/product-build/lease.json")), /ENOENT/)
})
// Temporary fixture runs are independent of the harness running this test.
// Tests of nesting explicitly supply their own authenticated context instead.
const fixtureEnvironment = () => {
  const env = { ...process.env }
  for (const key of ["HAPSLAND_CHECK_CONTEXT", "HAPSLAND_FOCUSED_TEST_SELECTION", "HAPSLAND_TEST_FAILURES_FILE"])
    delete env[key]
  return env
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

test("source identity failures retain a terminal run record", async (t) => {
  const root = await fixture(t)
  const outcome = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { main } from ${JSON.stringify(new URL("./run-checks.mjs", import.meta.url).href)}; process.exitCode = await main(["test", "--timeout-ms=30000"], ${JSON.stringify(root)});`
    ],
    { encoding: "utf8", timeout: 10000, env: fixtureEnvironment() }
  )
  assert.equal(outcome.status, 1, outcome.stderr)
  const latest = JSON.parse(await readFile(join(root, ".test-runs", "latest.json"), "utf8"))
  const runDirectory = join(root, ".test-runs", latest.id)
  const manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"))
  const results = JSON.parse(await readFile(join(runDirectory, "results.json"), "utf8"))
  const inputs = JSON.parse(await readFile(join(runDirectory, `inputs-${manifest.pid}.json`), "utf8"))
  assert.equal(results.state, "failed")
  assert.deepEqual(results.failedStages, ["source-identity"])
  assert.equal(results.stages.length, 1)
  assert.equal(results.stages[0].state, "failed")
  assert.match(results.stages[0].error, /git|repository/i)
  assert.match(inputs.sourceIdentityError, /git|repository/i)
  assert.deepEqual(manifest.skippedStages, [])
})

test("prerequisite failures retain independent checks and record skipped dependents", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} })
  const failed = await run.runStage(command("precheck-failed", "process.exit(9)"))
  const independent = await run.runStage(command("precheck-independent", "process.exit(0)"))
  assert.equal(failed.state, "failed")
  assert.equal(independent.state, "passed")
  for (const name of ["package-build", "package-pack", "vitest"]) {
    await run.recordSkippedStage({ name, reason: "prerequisite-failed", dependsOn: [failed.name] })
  }
  assert.equal(await run.finish(), 1)
  const results = JSON.parse(await readFile(join(run.runDirectory, "results.json"), "utf8"))
  assert.deepEqual(results.skippedStages, [
    { name: "package-build", reason: "prerequisite-failed", dependsOn: ["precheck-failed"] },
    { name: "package-pack", reason: "prerequisite-failed", dependsOn: ["precheck-failed"] },
    { name: "vitest", reason: "prerequisite-failed", dependsOn: ["precheck-failed"] }
  ])
  const manifest = JSON.parse(await readFile(join(run.runDirectory, "manifest.json"), "utf8"))
  assert.deepEqual(manifest.skippedStages, results.skippedStages)
  assert.equal(results.stages.filter((stage) => stage.state === "not-started").length, 3)
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
  const run = await createRun({
    root,
    mode: "quality",
    timeoutMs: 30_000,
    inherited: undefined,
    scope: "parent-scope",
    output() {}
  })
  await assert.rejects(
    createRun({ root, mode: "test", timeoutMs: 30_000, inherited: undefined, output() {} }),
    /already owns/
  )
  const nested = await createRun({
    root,
    mode: "test",
    timeoutMs: 30_000,
    inherited: JSON.stringify(run.context),
    scope: "child-scope",
    output() {}
  })
  await nested.runStage(command("nested", "process.exit(0)"))
  assert.equal(await nested.finish(), 0)
  assert.equal(JSON.parse(await readFile(join(run.runDirectory, "manifest.json"), "utf8")).scope, "parent-scope")
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
  const modulePath = fileURLToPath(new URL("./run-checks.mjs", import.meta.url))
  const run = await createRun({ root, mode: "quality", timeoutMs: 30_000, output() {} })
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

test("CLI records focused scope without forwarding it and reports different commits informationally", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "first"
  ])
  const first = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  await mkdir(join(root, "node_modules", ".bin"), { recursive: true })
  await writeFile(join(root, "one.test.ts"), "")
  const tool = join(root, "node_modules", ".bin", "vitest")
  await writeFile(
    tool,
    `#!${process.execPath}
require('node:assert/strict').deepEqual(process.argv.slice(2), ['run', '--config', 'scripts/vitest.config.ts', '--maxWorkers=1', 'one.test.ts']);
`
  )
  await chmod(tool, 0o755)
  const cli = (args) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { main } from ${JSON.stringify(new URL("./run-checks.mjs", import.meta.url).href)}; process.exitCode = await main(${JSON.stringify(args)}, ${JSON.stringify(root)});`
      ],
      { encoding: "utf8", timeout: 10000, env: fixtureEnvironment() }
    )
  cli(["focused", "--scope=original-output", "one.test.ts", "--timeout-ms=5000"])
  const { id } = JSON.parse(await readFile(join(root, ".test-runs", "latest.json"), "utf8"))
  const manifest = JSON.parse(await readFile(join(root, ".test-runs", id, "manifest.json"), "utf8"))
  assert.equal(manifest.scope, "original-output")
  assert.equal(manifest.sourcePin, first)
  assert.deepEqual(manifest.selectedTestFiles, ["one.test.ts"])
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "identical tree, different commit"
  ])
  const output = cli(["status", id])
  assert.match(output, /different commit \(informational; not a source failure or acceptance verdict\)/)
  assert.match(output, /original-output/)
  const status = JSON.parse(cli(["status", id, "--json"]))
  assert.equal(status.state, "passed")
  assert.equal(status.differentCommit, true)
  assert.equal(status.sourcePin, first)
  assert.equal(status.sourceDigest, null)
  await mkdir(join(root, "scripts"), { recursive: true })
  await writeFile(join(root, "scripts", "run-quality-lint.mjs"), "process.exit(0)\n")
  const qualityTool = join(root, "node_modules", ".bin", "crap4ts")
  await writeFile(qualityTool, `#!${process.execPath}\nprocess.exit(0);\n`)
  await chmod(qualityTool, 0o755)
  cli(["quality", "--scope=quality-slice", "--timeout-ms=5000"])
  const qualityId = JSON.parse(await readFile(join(root, ".test-runs", "latest.json"), "utf8")).id
  const qualityManifest = JSON.parse(await readFile(join(root, ".test-runs", qualityId, "manifest.json"), "utf8"))
  assert.match(qualityManifest.sourceDigest, /^[a-f0-9]{64}$/)
  assert.equal(qualityManifest.scope, "quality-slice")
  const historical = JSON.parse(cli(["status", "--scope=original-output", "--json"]))
  assert.equal(historical.id, id)
  assert.equal(historical.state, "passed")
  assert.equal(historical.sourcePin, first)
  assert.equal(JSON.parse(cli(["status", "--json"])).id, qualityId)
  assert.equal(JSON.parse(cli(["status", "--scope=quality-slice", "--json"])).id, qualityId)
  assert.throws(() => cli(["status", "--scope=missing-slice"]), /No recorded run for scope: missing-slice/)
  assert.throws(() => cli(["status", id, "--scope=original-output"]), /run id or --scope, not both/)
  const records = await import("node:fs/promises").then((fs) => fs.readdir(join(root, ".test-runs", qualityId)))
  const inputs = JSON.parse(
    await readFile(
      join(
        root,
        ".test-runs",
        qualityId,
        records.find((name) => name.startsWith("inputs-"))
      ),
      "utf8"
    )
  )
  assert.equal(inputs.sourceDigest, qualityManifest.sourceDigest)
  delete manifest.sourcePin
  delete manifest.scope
  delete manifest.selectedTestFiles
  await writeFile(join(root, ".test-runs", id, "manifest.json"), JSON.stringify(manifest))
  const oldStatus = JSON.parse(cli(["status", id, "--json"]))
  assert.equal(oldStatus.sourcePin, null)
  assert.equal(oldStatus.scope, null)
  assert.equal(oldStatus.state, "passed")
  assert.throws(() => cli(["status", "--scope=original-output"]), /No recorded run for scope/)
})

test("actual focused CLI rejects an all-skipped selector and permits selected execution", async (t) => {
  const root = await fixture(t)
  const repository = fileURLToPath(new URL("../../", import.meta.url))
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "dir")
  await writeFile(join(root, "one.test.ts"), 'import { it } from "vitest"; it("actual selected case", () => {});')
  const reporter = fileURLToPath(new URL("./immediate-errors.mjs", import.meta.url))
  await mkdir(join(root, "scripts"), { recursive: true })
  await writeFile(
    join(root, "scripts/vitest.config.ts"),
    `const selected = JSON.parse(process.env.HAPSLAND_FOCUSED_TEST_SELECTION); if (selected.files.length !== 1 || selected.files[0] !== "one.test.ts") throw new Error("focused selection did not reach config"); export default { test: { reporters: ["default", ${JSON.stringify(reporter)}] } };`
  )
  const cli = (pattern) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { main } from ${JSON.stringify(new URL("./run-checks.mjs", import.meta.url).href)}; process.exitCode = await main(["focused", "one.test.ts", ${JSON.stringify("--testNamePattern=" + pattern)}, "--timeout-ms=10000"], ${JSON.stringify(root)});`
      ],
      { encoding: "utf8", timeout: 15000, env: fixtureEnvironment() }
    )
  assert.throws(() => cli("absent selector"))
  const failedId = JSON.parse(await readFile(join(root, ".test-runs", "latest.json"), "utf8")).id
  const failed = JSON.parse(await readFile(join(root, ".test-runs", failedId, "status.json"), "utf8"))
  assert.equal(failed.state, "failed")
  assert.equal(failed.failures, 1)
  assert.match(await readFile(join(root, ".test-runs", failedId, "failures.jsonl"), "utf8"), /zero tests/)
  cli("actual selected case")
  const passedId = JSON.parse(await readFile(join(root, ".test-runs", "latest.json"), "utf8")).id
  assert.equal(JSON.parse(await readFile(join(root, ".test-runs", passedId, "status.json"), "utf8")).state, "passed")
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

test("artifact preparation shares a focused parent's records and cannot extend its deadline", async (t) => {
  const root = await fixture(t)
  const parent = await createRun({ root, mode: "focused", timeoutMs: 10000, output() {} })
  const child = await createRun({
    root,
    mode: "artifact",
    timeoutMs: 100000,
    inherited: JSON.stringify(parent.context),
    output() {}
  })
  assert.equal(child.context.deadline, parent.context.deadline)
  await child.runStage(command("artifact-stage", "process.exit(0)"))
  assert.equal(await child.finish(), 0)
  assert.equal(JSON.parse(await readFile(join(parent.runDirectory, "status.json"), "utf8")).state, "running")
  assert.equal(await parent.finish(), 0)
})

test("surviving product ownership fails the stage and retains the enclosing full lock", async (t) => {
  const root = await fixture(t)
  const run = await createRun({ root, mode: "test", timeoutMs: 30000, inherited: undefined, output() {} })
  const directory = join(root, ".test-runs/product-build")
  await run.runStage(
    command(
      "abandoned-build",
      `const fs=require('node:fs');
    fs.mkdirSync(${JSON.stringify(join(directory, "lock"))},{recursive:true});
    fs.writeFileSync(${JSON.stringify(join(directory, "lock/owner.json"))},JSON.stringify({pid:process.pid}));
    fs.writeFileSync(${JSON.stringify(join(directory, "lease.json"))},JSON.stringify({pid:process.pid}));`
    )
  )
  const stages = await stageResults(run.runDirectory)
  assert.equal(stages[0].exitCode, 0)
  assert.equal(stages[0].state, "failed")
  assert.equal(stages[0].groupUnresolved, true)
  assert.equal(await run.finish(), 1)
  assert.ok(await readFile(join(root, ".test-runs/full.lock"), "utf8"))
  assert.ok(await readFile(join(directory, "lease.json"), "utf8"))
})

const waitForFile = async (path) => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      return await readFile(path, "utf8")
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    await new Promise((done) => setTimeout(done, 10))
  }
  throw new Error(`Fixture readiness deadline: ${path}`)
}

test("verification mutation cancels a long child, keeps completed evidence and admits no later stage", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/input.ts"), "before")
  const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
  await run.observeInputs()
  await run.runStage(command("completed", "process.exit(0)"))
  const ready = join(root, ".test-runs", "ready")
  const child = run.runStage(
    command("long", `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setInterval(()=>{}, 1000)`)
  )
  await waitForFile(ready)
  await writeFile(join(root, "src/input.ts"), "after")
  const result = await child
  assert.equal(result.state, "failed")
  assert.equal(result.timedOut, false)
  assert.equal((await run.runStage(command("later", "process.exit(0)"))).state, "not-started")
  assert.equal(await run.finish(), 1)
  const records = JSON.parse(await readFile(join(run.runDirectory, "results.json"), "utf8"))
  assert.equal(records.stages.find((stage) => stage.name === "completed").state, "passed")
  assert.match(records.reason, /src\/input.ts/)
  assert.equal(records.stages.find((stage) => stage.name === "long").signal, "SIGTERM")
})

test("unrelated documents during a long stage do not invalidate verification", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/input.ts"), "unchanged")
  const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
  await run.observeInputs()
  const ready = join(root, ".test-runs", "ready"),
    release = join(root, ".test-runs", "release")
  const child = run.runStage(
    command(
      "long",
      `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(ready)}, 'ready'); const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer)}}, 10)`
    )
  )
  await waitForFile(ready)
  await mkdir(join(root, "quint-specs"))
  await writeFile(join(root, "quint-specs/quint.lock"), "parallel survey")
  await mkdir(join(root, "docs"))
  await writeFile(join(root, "docs/research.md"), "unrelated")
  await new Promise((done) => setTimeout(done, 1300)) // Exercise the observer while the unrelated edit and child coexist.
  await writeFile(release, "done")
  assert.equal((await child).state, "passed")
  assert.equal((await run.runStage(command("later", "process.exit(0)"))).state, "passed")
  assert.equal(await run.finish(), 0)
})

for (const mutation of ["addition", "deletion"]) {
  test(`relevant ${mutation} between stages blocks admission`, async (t) => {
    const root = await fixture(t)
    execFileSync("git", ["init", "-q", root])
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src/input.ts"), "before")
    execFileSync("git", ["-C", root, "add", "."])
    const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
    await run.observeInputs()
    await run.runStage(command("completed", "process.exit(0)"))
    if (mutation === "addition") await writeFile(join(root, "src/new.ts"), "new")
    else await rm(join(root, "src/input.ts"))
    assert.equal((await run.runStage(command("later", "process.exit(0)"))).state, "not-started")
    assert.equal(await run.finish(), 1)
    const records = await stageResults(run.runDirectory)
    assert.deepEqual(records.find((stage) => stage.name === "source-identity").evidence.changedPaths, [
      mutation === "addition" ? "src/new.ts" : "src/input.ts"
    ])
  })
}

test("invalidated run retains its exclusive lock until the child and descendant stop", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/input.ts"), "before")
  const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
  await run.observeInputs()
  const ready = join(root, ".test-runs", "ready"),
    stopping = join(root, ".test-runs", "stopping"),
    release = join(root, ".test-runs", "release")
  const descendantProgram = `const fs=require('node:fs'); fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid)); process.on('SIGTERM',()=>{fs.writeFileSync(${JSON.stringify(stopping)}, 'stopping'); const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}))process.exit(0)},10)});setInterval(()=>{},1000)`
  const program = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendantProgram)}],{stdio:'ignore'}); process.on('SIGTERM',()=>{}); child.on('exit',()=>process.exit(0)); setInterval(()=>{},1000)`
  const child = run.runStage(command("long", program))
  const descendantPid = Number(await waitForFile(ready))
  await writeFile(join(root, "src/input.ts"), "after")
  await waitForFile(stopping)
  const lock = JSON.parse(await readFile(join(root, ".test-runs/full.lock"), "utf8"))
  assert.equal(lock.token, run.context.token)
  process.kill(descendantPid, 0)
  await writeFile(release, "exit")
  assert.equal((await child).state, "failed")
  assert.throws(() => process.kill(descendantPid, 0), { code: "ESRCH" })
  assert.equal(await run.finish(), 1)
  await assert.rejects(readFile(join(root, ".test-runs/full.lock")), { code: "ENOENT" })
})

test(
  "cancellation escalates to kill for a child and descendant that ignore termination",
  { skip: process.platform !== "linux" },
  async (t) => {
    const root = await fixture(t)
    execFileSync("git", ["init", "-q", root])
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src/input.ts"), "before")
    const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
    await run.observeInputs()
    const ready = join(root, ".test-runs", "ready")
    const descendantProgram = `require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
    const program = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendantProgram)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
    const child = run.runStage(command("stubborn", program))
    const pid = Number(await waitForFile(ready))
    await writeFile(join(root, "src/input.ts"), "after")
    const result = await child
    assert.equal(result.signal, "SIGKILL")
    // An orphan zombie can await the container init's reaper; it executes no work.
    const descendant = await readFile(`/proc/${pid}/stat`, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (descendant !== null) assert.match(descendant, /\) Z /)
    assert.equal(await run.finish(), 1)
    if (result.groupUnresolved) {
      const lock = JSON.parse(await readFile(join(root, ".test-runs/full.lock"), "utf8"))
      assert.equal(lock.token, run.context.token)
    }
  }
)

test("final input identity catches a mutation after the last completed stage", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/input.ts"), "before")
  const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
  await run.observeInputs()
  assert.equal((await run.runStage(command("completed", "process.exit(0)"))).state, "passed")
  await writeFile(join(root, "src/input.ts"), "after")
  assert.equal(await run.finish(), 1)
  const results = JSON.parse(await readFile(join(run.runDirectory, "results.json"), "utf8"))
  assert.match(results.reason, /src\/input.ts/)
})

for (const input of ["linked target", "submodule content"]) {
  test(`observation preserves ${input} identity through cached scans`, async (t) => {
    const root = await fixture(t)
    execFileSync("git", ["init", "-q", root])
    let target, changedPath
    if (input === "linked target") {
      const external = await fixture(t)
      target = join(external, "input.ts")
      await writeFile(target, "before")
      await mkdir(join(root, "src"))
      await symlink(target, join(root, "src/linked.ts"))
      changedPath = "src/linked.ts"
    } else {
      const module = join(root, "vendor/module")
      await mkdir(module, { recursive: true })
      execFileSync("git", ["init", "-q", module])
      target = join(module, "input.ts")
      await writeFile(target, "before")
      execFileSync("git", ["-C", module, "add", "."])
      execFileSync("git", [
        "-C",
        module,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "initial"
      ])
      execFileSync("git", ["-C", root, "add", "vendor/module"], { stdio: "ignore" })
      changedPath = "vendor/module"
    }
    const run = await createRun({ root, mode: "test", timeoutMs: 10000, output() {} })
    await run.observeInputs()
    await run.runStage(command("completed", "process.exit(0)"))
    await writeFile(target, "after")
    assert.equal((await run.runStage(command("later", "process.exit(0)"))).state, "not-started")
    assert.equal(await run.finish(), 1)
    const records = await stageResults(run.runDirectory)
    assert.deepEqual(records.find((stage) => stage.name === "source-identity").evidence.changedPaths, [changedPath])
  })
}

test("input invalidation during stage admission does not launch the child", async (t) => {
  const root = await fixture(t)
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "src"))
  const input = join(root, "src/input.ts"),
    launched = join(root, ".test-runs/launched")
  await writeFile(input, "before")
  const run = await createRun({
    root,
    mode: "test",
    timeoutMs: 10000,
    output(message) {
      if (message.startsWith("START admission;")) writeFileSync(input, "after")
    }
  })
  await run.observeInputs()
  const stage = await run.runStage(
    command("admission", `require('node:fs').writeFileSync(${JSON.stringify(launched)}, 'launched')`)
  )
  assert.equal(stage.state, "not-started")
  await assert.rejects(readFile(launched), { code: "ENOENT" })
  assert.equal(await run.finish(), 1)
  assert.match(stage.reason, /src\/input.ts/)
})
