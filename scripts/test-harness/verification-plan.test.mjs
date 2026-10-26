import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { precheckStages } from "./check-stages.mjs"
import { resolveVerificationPlan } from "./verification-plan.mjs"

test("only explicit CI delegation moves kernel checks out of runtime prechecks", () => {
  const module = new URL("./check-stages.mjs", import.meta.url).href
  const environment = { ...process.env }
  delete environment.HAPSLAND_BEND_PROOFS
  delete environment.GITHUB_ACTIONS
  const inspect = (extra) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {precheckStages} from ${JSON.stringify(module)}; console.log(JSON.stringify(precheckStages))`
      ],
      { env: { ...environment, ...extra }, encoding: "utf8", timeout: 5000 }
    )
  const local = inspect({})
  assert.equal(local.status, 0, local.stderr)
  const ordinary = JSON.parse(local.stdout)
  const ci = inspect({ GITHUB_ACTIONS: "true", HAPSLAND_BEND_PROOFS: "separate-job" })
  assert.equal(ci.status, 0, ci.stderr)
  const delegated = JSON.parse(ci.stdout)
  const proofStages = new Set(["bend-progress", "content-isolation"])
  assert.deepEqual(
    delegated,
    ordinary.map((stage) => (proofStages.has(stage[0]) ? [...stage, "--falsify-only"] : stage))
  )
  const outsideCi = inspect({ HAPSLAND_BEND_PROOFS: "separate-job" })
  assert.notEqual(outsideCi.status, 0)
  assert.match(outsideCi.stderr, /restricted to CI/)
  const unknown = inspect({ GITHUB_ACTIONS: "true", HAPSLAND_BEND_PROOFS: "skip" })
  assert.notEqual(unknown.status, 0)
  assert.match(unknown.stderr, /accepts only separate-job/)
})

test("fast deduplicates explicit selections and does not prepare installed artifacts", () => {
  const plan = resolveVerificationPlan({
    profile: "fast",
    selectedTests: ["src/a.test.ts", "src/a.test.ts", "scripts/b.test.mjs"]
  })
  assert.deepEqual(plan.selectedTestFiles, ["scripts/b.test.mjs", "src/a.test.ts"])
  assert.deepEqual(plan.requiredArtifacts, [])
  assert.deepEqual(
    plan.stages.map((stage) => stage.name),
    ["check-fast", "node-focused", "vitest-focused"]
  )
  assert.equal(plan.coverageMode, "none")
})
test("boundary requires explicit consumers and a checked archive", () => {
  assert.throws(() => resolveVerificationPlan({ profile: "boundary" }), /explicit test/)
  const source = resolveVerificationPlan({ profile: "boundary", selectedTests: ["src/a.test.ts"] })
  assert.deepEqual(source.requiredArtifacts, [])
  const plan = resolveVerificationPlan({
    profile: "boundary",
    selectedTests: ["src/a.test.ts"],
    consumerArtifacts: ["package"]
  })
  assert.deepEqual(plan.requiredArtifacts, ["package"])
  assert.equal(plan.stages[0].kind, "package")
})
test("native agents require explicit host/model/scenario and Pi selects its authenticated profile", () => {
  assert.throws(() => resolveVerificationPlan({ profile: "native", host: "pi" }), /explicit host/)
  assert.throws(
    () =>
      resolveVerificationPlan({
        profile: "native",
        host: "pi",
        provider: "openai",
        model: "wrong",
        scenario: "adoption"
      }),
    /existing openai/
  )
  const plan = resolveVerificationPlan({
    profile: "native",
    host: "pi",
    provider: "openai",
    model: "gpt-6-luna",
    scenario: "adoption"
  })
  assert.deepEqual(plan.requiredArtifacts, ["package"])
  assert.equal(plan.stages.at(-1).model, "gpt-6-luna")
  assert.throws(
    () => resolveVerificationPlan({ profile: "native", host: "pi", nativeTarget: "rust" }),
    /agent scenario or compiler/
  )
})
test("native compiler checks require a target and actual selected tests", () => {
  assert.throws(() => resolveVerificationPlan({ profile: "native", nativeTarget: "rust" }), /explicit compiler test/)
  const plan = resolveVerificationPlan({ profile: "native", nativeTarget: "rust", selectedTests: ["src/rust.test.ts"] })
  assert.deepEqual(plan.stages[0], { name: "native-toolchain", kind: "toolchain", target: "rust" })
})
test("stress remains an explicit selection and quality preserves the complete deterministic prerequisites", () => {
  assert.throws(() => resolveVerificationPlan({ profile: "stress" }), /explicit test/)
  assert.throws(
    () => resolveVerificationPlan({ profile: "quality", selectedTests: ["src/a.test.ts"] }),
    /complete deterministic/
  )
  const quality = resolveVerificationPlan({ profile: "quality" })
  assert.equal(quality.coverageMode, "fresh-full")
  assert.deepEqual(
    quality.stages.at(-1).deterministicPrerequisites,
    precheckStages.map((stage) => stage[0])
  )
})
test("every profile has a finite deadline and rejects native options on ordinary checks", () => {
  for (const profile of ["fast", "boundary", "native", "stress", "quality"]) {
    assert.throws(() => resolveVerificationPlan({ profile, timeoutMs: Infinity }), /finite positive/)
  }
  assert.throws(() => resolveVerificationPlan({ profile: "fast", model: "gpt-6-luna" }), /Native parameters/)
})

test("native plans reject unsupported scenarios and provider/model mismatches before preparing artifacts", () => {
  const base = { profile: "native", host: "pi", provider: "openai", model: "gpt-6-luna", scenario: "adoption" }
  for (const changes of [
    { scenario: "hook-crash" },
    { provider: "anthropic" },
    { host: "opencode" },
    { model: "bad model" }
  ])
    assert.throws(() => resolveVerificationPlan({ ...base, ...changes }))
  assert.throws(() => resolveVerificationPlan({ ...base, host: "claude", model: "default" }), /provider must match/)
})
