import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"
import { join, resolve } from "node:path"
const root = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv.slice(2).find((a) => a !== "--check") ?? join(root, "dist"))
const expectedVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).hapsland.toolchain.bend.version
assert.equal(execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(), `bend ${expectedVersion}`)
execFileSync("bend", [join(root, "rules-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-rules-policy-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "rules-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const phases = ["Scope", "Previewing", "Preview", "Approval", "Applying", "Done", "Cancelled"]
  const actions = {
    scope: "ScopeSelected",
    continue: "Continue",
    approve: "Approve",
    back: "Back",
    exit: "Exit",
    previewed: "Previewed",
    observed: "Observed"
  }
  const names = ["planMatches", "digestMatches", "yes", "stale"]
  const contexts = Array.from({ length: 2 ** names.length }, (_, bits) =>
    names.map((_, axis) => Boolean(bits & (1 << (names.length - axis - 1))))
  )
  const index = (values) => values.reduce((n, v) => n * 2 + Number(v), 0)
  const phaseTag = (phase) => ({ $: "Rules" + phase })
  const patchName = (tag) => {
    const s = tag.slice("Rules".length, -5)
    return s[0].toLowerCase() + s.slice(1)
  }
  const leaf = (plan) =>
    plan.$ === "RulesHold"
      ? "model"
      : `apply.${patchName(plan.patch.$)}(model,action,${JSON.stringify(plan.phase.$.slice("Rules".length))})`
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const costs = { planMatches: 2, digestMatches: 1, yes: 1, stale: 1 }
  const expressions = new Map(),
    rows = new Map()
  for (const phase of phases)
    for (const [kind, constructor] of Object.entries(actions)) {
      const plans = contexts.map((values) => core.step(phaseTag(phase), phaseTag(constructor), true, ...values))
      const strings = plans.map(leaf)
      const axes = names.flatMap((name, axis) =>
        contexts.some((values, i) => {
          const base = [...values]
          base[axis] = false
          return strings[i] !== strings[index(base)]
        })
          ? [{ axis, name }]
          : []
      )
      const compact = []
      contexts.forEach((values, i) => {
        const key = axes.reduce((n, { axis }) => n * 2 + Number(values[axis]), 0)
        if (compact[key] === undefined) compact[key] = strings[i]
        else assert.equal(compact[key], strings[i])
      })
      const memo = new Map()
      function tree(indices, remaining) {
        if (indices.every((i) => compact[i] === compact[indices[0]]))
          return { expression: compact[indices[0]], cost: 0 }
        const key = indices.join(",")
        if (memo.has(key)) return memo.get(key)
        let best
        for (const depth of remaining) {
          const bit = 2 ** (axes.length - depth - 1),
            next = remaining.filter((x) => x !== depth)
          const no = tree(
              indices.filter((i) => (i & bit) === 0),
              next
            ),
            yes = tree(
              indices.filter((i) => (i & bit) !== 0),
              next
            )
          const cost = (costs[axes[depth].name] ?? 1) + (no.cost + yes.cost) / 2
          if (!best || cost < best.cost)
            best = {
              cost,
              expression: choose(`facts.${axes[depth].name}(model,action)`, yes.expression, no.expression)
            }
        }
        assert.ok(best)
        memo.set(key, best)
        return best
      }
      expressions.set(
        phase + ":" + kind,
        tree(
          compact.map((_, i) => i),
          axes.map((_, i) => i)
        ).expression
      )
      rows.set(phase + ":" + kind, strings)
      assert.equal(core.step(phaseTag(phase), phaseTag(constructor), false, ...contexts[0]).$, "RulesHold")
    }
  const commandLeaves = {
    RulesPreviewCommand: '{kind:"preview",id:model.revision,action:model.action,scope:model.scope}',
    RulesApplyCommand: '{kind:"apply",id:model.revision,plan:model.plan}',
    RulesNoCommand: "undefined"
  }
  const commandContexts = Array.from({ length: 4 }, (_, bits) => [2, 1].map((bit) => Boolean(bits & bit)))
  const commandTests = ["model.scope", "model.plan"]
  const commandTree = (strings, axis = 0) =>
    strings.every((s) => s === strings[0])
      ? strings[0]
      : choose(
          commandTests[axis],
          commandTree(strings.slice(strings.length / 2), axis + 1),
          commandTree(strings.slice(0, strings.length / 2), axis + 1)
        )
  let command = "export const rulesNativeCommand=model=>{switch(model.phase){\n"
  for (const phase of phases) {
    const strings = commandContexts.map((values) => commandLeaves[core.command(phaseTag(phase), ...values).$])
    assert.ok(strings.every((x) => x !== undefined))
    command += `case ${JSON.stringify(phase)}:return ${commandTree(strings)};\n`
  }
  command += 'default:throw new TypeError("Unknown rules phase");}};\n'
  let reducer =
    "export const rulesBindReducer=(current,facts,apply)=>(model,event)=>{if(!current(model,event))return model;const action=event.action;switch(model.phase){\n"
  for (const phase of phases) {
    const branches = Object.keys(actions)
      .flatMap((kind) => {
        const expression = expressions.get(phase + ":" + kind)
        return expression === "model" ? [] : [`case ${JSON.stringify(kind)}:return ${expression};\n`]
      })
      .join("")
    reducer += `case ${JSON.stringify(phase)}:${branches ? `switch(action.kind){\n${branches}default:return model;}\n` : "return model;\n"}`
  }
  reducer += 'default:throw new TypeError("Unknown rules phase");}};\n'
  const generated = command + reducer
  const artifact = join(temporary, "specialized.mjs")
  writeFileSync(artifact, generated)
  const specialized = await import(pathToFileURL(artifact))
  let values = [],
    current = true
  const model = { phase: "", revision: 17, action: "enable", scope: undefined, plan: undefined }
  const patchNames = ["no", "scope", "clearPlanOutcome", "preview", "declined", "stale", "outcome", "clearPlan"]
  const apply = Object.fromEntries(
    patchNames.map((name) => [name, (_model, _action, phase) => `apply.${name}(model,action,${JSON.stringify(phase)})`])
  )
  const bound = specialized.rulesBindReducer(
    () => current,
    Object.fromEntries(names.map((name, i) => [name, () => values[i]])),
    apply
  )
  for (const phase of phases) {
    model.phase = phase
    for (const kind of Object.keys(actions))
      for (let i = 0; i < contexts.length; i++) {
        values = contexts[i]
        current = true
        const action = { kind }
        assert.equal(
          bound(model, { revision: 17, action }),
          rows.get(phase + ":" + kind)[i] === "model" ? model : rows.get(phase + ":" + kind)[i]
        )
        current = false
        assert.equal(bound(model, { revision: 17, action }), model)
      }
    for (const [scope, plan] of commandContexts) {
      model.scope = scope ? "project" : undefined
      model.plan = plan ? { digest: "opaque" } : undefined
      const choice = core.command(phaseTag(phase), scope, plan).$
      const expected =
        choice === "RulesNoCommand"
          ? undefined
          : choice === "RulesPreviewCommand"
            ? { kind: "preview", id: 17, action: model.action, scope: model.scope }
            : { kind: "apply", id: 17, plan: model.plan }
      const actual = specialized.rulesNativeCommand(model)
      assert.deepEqual(actual, expected)
      if (actual?.kind === "apply") assert.equal(actual.plan, model.plan)
    }
  }
  const target = join(outputDirectory, "rules-policy.generated.js"),
    declaration = join(outputDirectory, "rules-policy.generated.d.ts"),
    abi = join(root, "abi/rules-policy.generated.d.ts")
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(target, "utf8"), generated)
    assert.ok(readFileSync(declaration).equals(readFileSync(abi)))
  } else {
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(target, generated)
    copyFileSync(abi, declaration)
  }
  console.log(
    JSON.stringify({
      transitionSpecializationCases: phases.length * Object.keys(actions).length * contexts.length * 2,
      commandSpecializationCases: phases.length * commandContexts.length,
      artifactBytes: Buffer.byteLength(generated)
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
