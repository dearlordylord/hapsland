import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verify } from "./verify.mjs"

async function fixture(t, mutate = false) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-verify-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync("git", ["init", "-q", root])
  await mkdir(join(root, "scripts"))
  await mkdir(join(root, "src"))
  await writeFile(join(root, "src/main.ts"), "source")
  await writeFile(
    join(root, "scripts/selected.test.mjs"),
    'import test from "node:test"; test("selected witness", () => {})'
  )
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "check:fast": mutate ? `node -e "require('node:fs').writeFileSync('src/main.ts', 'mutated')"` : "node --version"
      }
    })
  )
  return root
}
async function records(root) {
  const { id } = JSON.parse(await readFile(join(root, ".test-runs/latest.json"), "utf8"))
  const directory = join(root, ".test-runs", id)
  return {
    manifest: JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    result: JSON.parse(await readFile(join(directory, "results.json"), "utf8"))
  }
}
test("quality profile rejects missing acknowledgment before creating run state", async (t) => {
  const root = await fixture(t)
  await assert.rejects(verify(["--profile=quality"], root), /read CHECKS.md.*--ack-checks-policy/)
  await assert.rejects(readFile(join(root, ".test-runs/latest.json")), /ENOENT/)
})
test("acknowledged quality profile retains failed prerequisites without starting coverage", async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, "scripts/test-harness"))
  for (const name of ["run-checks.test.mjs", "verification-plan.test.mjs", "verify.test.mjs"])
    await writeFile(join(root, "scripts/test-harness", name), "// Passing prerequisite fixture\n")
  await writeFile(join(root, "scripts/test-harness/immediate-errors.test.mjs"), "throw new Error('profile witness')")
  // This fixture owns a separate checkout, rather than joining the enclosing gate.
  const inheritedContext = process.env.HAPSLAND_CHECK_CONTEXT
  delete process.env.HAPSLAND_CHECK_CONTEXT
  try {
    assert.equal(await verify(["--profile=quality", "--ack-checks-policy", "--timeout-ms=10000"], root), 1)
  } finally {
    if (inheritedContext !== undefined) process.env.HAPSLAND_CHECK_CONTEXT = inheritedContext
  }
  const { manifest, result } = await records(root)
  assert.equal(manifest.checksPolicyAcknowledged, true)
  assert.equal(manifest.verificationPlan.profile, "quality")
  assert.deepEqual(
    result.stages.map(({ name, state }) => [name, state]),
    [
      ["quality-preflight", "failed"],
      ["lint-code", "not-started"],
      ["quality", "not-started"]
    ]
  )
})
test("fast CLI executes one deduplicated selection and persists the resolved plan", async (t) => {
  const root = await fixture(t)
  assert.equal(
    await verify(
      ["--profile=fast", "--timeout-ms=10000", "scripts/selected.test.mjs", "scripts/selected.test.mjs"],
      root
    ),
    0
  )
  const { manifest, result } = await records(root)
  assert.equal(manifest.verificationPlan.profile, "fast")
  assert.deepEqual(manifest.selectedTestFiles, ["scripts/selected.test.mjs"])
  assert.equal(result.state, "passed")
  assert.deepEqual(
    result.stages.map((stage) => stage.name),
    ["check-fast", "node-focused"]
  )
})
test("source changes during checks fail the profile instead of accepting mixed inputs", async (t) => {
  const root = await fixture(t, true)
  assert.equal(await verify(["--profile=fast", "--timeout-ms=10000", "scripts/selected.test.mjs"], root), 1)
  const { result } = await records(root)
  assert.equal(result.state, "aborted")
  assert.ok(result.stages.some((stage) => stage.name === "source-identity" && /src\/main.ts/.test(stage.error)))
})
test("a deadline during source identification still produces a terminal run record", async (t) => {
  const root = await fixture(t)
  assert.equal(await verify(["--profile=fast", "--timeout-ms=1"], root), 1)
  const { result } = await records(root)
  assert.equal(result.state, "failed")
  assert.ok(result.stages.some((stage) => stage.name === "verification"))
})

test("source boundary checks run without invoking package preparation", async (t) => {
  const root = await fixture(t)
  assert.equal(await verify(["--profile=boundary", "--timeout-ms=10000", "scripts/selected.test.mjs"], root), 0)
  const { manifest, result } = await records(root)
  assert.deepEqual(manifest.verificationPlan.requiredArtifacts, [])
  assert.deepEqual(
    result.stages.map((stage) => stage.name),
    ["node-focused"]
  )
})

test("package preparation requirements follow transitive consumer imports", async (t) => {
  const root = await fixture(t)
  await mkdir(join(root, "scripts/test-support"))
  await writeFile(join(root, "scripts/test-support/test-package.ts"), "export const packageFixture = true")
  await writeFile(
    join(root, "src/consumer.ts"),
    'export { packageFixture } from "../scripts/test-support/test-package.ts"'
  )
  await writeFile(join(root, "scripts/selected.test.mjs"), 'import "../src/consumer.ts"')
  const { requiredTestArtifacts } = await import("./inventory.mjs")
  assert.deepEqual(requiredTestArtifacts(root, ["scripts/selected.test.mjs"]), ["package"])
})

test("failed Pi auth preflight stops before package preparation", async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, "scripts/native-pi-preflight.mjs"), "process.exit(7)")
  assert.equal(
    await verify(
      [
        "--profile=native",
        "--host=pi",
        "--provider=openai",
        "--model=gpt-6-luna",
        "--scenario=adoption",
        "--timeout-ms=10000"
      ],
      root
    ),
    1
  )
  const { result } = await records(root)
  assert.equal(result.stages[0].name, "native-auth-model")
  assert.equal(result.stages[0].exitCode, 7)
  assert.equal(
    result.stages.some(({ name }) => name === "package-build" || name === "package-pack" || name === "native-agent"),
    false
  )
})
