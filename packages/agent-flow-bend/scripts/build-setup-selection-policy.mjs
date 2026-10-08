import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((a) => a !== "--check") ?? join(root, "dist"))
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${version}`)
execFileSync("bend", [join(root, "setup-selection-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-setup-selection-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "setup-selection-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const phases = {
    SelectingAgents: "SelectingAgents",
    RunningAgents: "RunningAgents",
    Done: "SelectionDone",
    Cancelled: "SelectionCancelled"
  }
  const actions = { selected: "HostsSelected", ended: "SelectionEnded", observed: "HostObserved" }
  const outcomes = { completed: "HostCompleted", back: "HostBack", cancelled: "HostCancelled" }
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const leaf = (plan) => {
    if (plan.$ === "SelectionHold") return "model"
    if (plan.$ === "SelectionStart") return "apply.start(model,action)"
    if (plan.$ === "SelectionEnd") return "apply.end(model,action)"
    assert.equal(plan.$, "SelectionObserved")
    const phase = Object.keys(phases).find((p) => phases[p] === plan.phase.$)
    assert.ok(phase)
    return `apply.observed(model,action,${JSON.stringify(phase)})`
  }
  const expressions = new Map()
  for (const [phase, p] of Object.entries(phases))
    for (const [kind, a] of Object.entries(actions)) {
      const byOutcome = Object.entries(outcomes).map(([outcome, o]) => {
        const rows = [false, true].map((nonempty) =>
          [false, true].map((hasNext) => leaf(core.step({ $: p }, { $: a }, { $: o }, nonempty, hasNext)))
        )
        return [
          outcome,
          choose(
            "facts.nonempty(model,action)",
            choose("facts.hasNext(model,action)", rows[1][1], rows[1][0]),
            choose("facts.hasNext(model,action)", rows[0][1], rows[0][0])
          )
        ]
      })
      let expression = byOutcome[0][1]
      for (const [outcome, value] of byOutcome.slice(1))
        expression = choose(`action.outcome===${JSON.stringify(outcome)}`, value, expression)
      expressions.set(phase + ":" + kind, expression)
    }
  let generated = "export const setupSelectionBindReducer=(facts,apply)=>(model,action)=>{switch(model.phase){\n"
  for (const phase of Object.keys(phases)) {
    const branches = Object.keys(actions)
      .flatMap((kind) =>
        expressions.get(phase + ":" + kind) === "model"
          ? []
          : [`case ${JSON.stringify(kind)}:return ${expressions.get(phase + ":" + kind)};\n`]
      )
      .join("")
    generated += `case ${JSON.stringify(phase)}:${branches ? `switch(action.kind){${branches}default:return model;}` : "return model;"}\n`
  }
  generated += 'default:throw new TypeError("Unknown setup selection phase");}};\n'
  const emitted = join(temporary, "specialized.mjs")
  writeFileSync(emitted, generated)
  const specialized = await import(pathToFileURL(emitted))
  let n = false,
    h = false
  const bound = specialized.setupSelectionBindReducer(
    { nonempty: () => n, hasNext: () => h },
    {
      start: () => ({ $: "SelectionStart" }),
      end: () => ({ $: "SelectionEnd" }),
      observed: (_m, _a, p) => ({ $: "SelectionObserved", phase: { $: phases[p] } })
    }
  )
  let cases = 0
  for (const [phase, p] of Object.entries(phases))
    for (const [kind, a] of Object.entries(actions))
      for (const [outcome, o] of Object.entries(outcomes))
        for (n of [false, true])
          for (h of [false, true]) {
            const model = { phase },
              plan = core.step({ $: p }, { $: a }, { $: o }, n, h),
              actual = bound(model, { kind, outcome })
            assert.deepEqual(actual, plan.$ === "SelectionHold" ? model : plan)
            if (plan.$ === "SelectionHold") assert.equal(actual, model)
            cases++
          }
  const target = join(outputDirectory, "setup-selection-policy.generated.js"),
    declaration = join(outputDirectory, "setup-selection-policy.generated.d.ts"),
    abi = join(root, "abi/setup-selection-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
  console.log(JSON.stringify({ transitionSpecializationCases: cases, artifactBytes: Buffer.byteLength(generated) }))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
