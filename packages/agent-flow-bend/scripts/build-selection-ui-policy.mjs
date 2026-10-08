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
execFileSync("bend", [join(root, "selection-ui-policy/PROOF.bend"), "--verdict"], { timeout: 5000 })
const temporary = mkdtempSync(join(tmpdir(), "hapsland-selection-ui-"))
try {
  const output = join(temporary, "core.mjs")
  execFileSync("bend", [join(root, "selection-ui-policy/core.bend"), "-o", output], { timeout: 5000 })
  const core = (await import(pathToFileURL(output))).default
  const keys = {
    escape: "Escape",
    up: "Up",
    down: "Down",
    tab: "Tab",
    home: "Home",
    end: "End",
    return: "Return",
    enter: "Enter",
    space: "Space",
    __other__: "Other"
  }
  const plans = {
    Hold: "hold",
    Back: "back",
    Cancel: "cancel",
    Previous: "move",
    Next: "move",
    First: "first",
    Last: "last",
    Select: "select",
    Warn: "warn",
    ClearAll: "clearAll",
    ChooseAll: "chooseAll",
    RemoveChoice: "removeChoice",
    AddChoice: "addChoice"
  }
  const payloadPlans = new Set(["ClearAll", "ChooseAll", "RemoveChoice", "AddChoice"])
  const factNames = [
    "back",
    "backRow",
    "exitRow",
    "nonempty",
    "selectAll",
    "allSelected",
    "choicePresent",
    "choiceSelected"
  ]
  const leaf = (plan) => {
    assert.ok(plans[plan.$])
    if (plan.$ === "Previous" || plan.$ === "Next") return `apply.move(model,options,${plan.$ === "Previous" ? -1 : 1})`
    return `apply.${plans[plan.$]}(model,options${payloadPlans.has(plan.$) ? ",choices" : ""}${plan.$ === "RemoveChoice" || plan.$ === "AddChoice" ? ",choiceId" : ""})`
  }
  const choose = (test, yes, no) => (yes === no ? yes : `(${test}?${yes}:${no})`)
  const expression = (key, index, values) =>
    index === 8
      ? leaf(core.step({ $: key }, ...values))
      : choose(
          `facts.${factNames[index]}(model,options${index >= 5 ? ",choices" : ""}${index === 6 ? ",choiceId=facts.choiceId(model,options,choices)" : index === 7 ? ",choiceId" : ""})`,
          expression(key, index + 1, [...values, true]),
          expression(key, index + 1, [...values, false])
        )
  const factBindings = [...factNames, "choiceIds", "choiceId"].map((name) => `${name}:fact_${name}`).join(",")
  const actionBindings = [...new Set(Object.values(plans))].map((name) => `${name}:apply_${name}`).join(",")
  let generated = `export const selectionUiBindUpdate=(facts,apply)=>{const {${factBindings}}=facts;const {${actionBindings}}=apply;return (model,key,options)=>{switch(key){\n`
  for (const [key, tag] of Object.entries(keys))
    if (tag !== "Other")
      generated += `case ${JSON.stringify(key)}:${key === "space" ? "{const choices=facts.choiceIds(model,options);let choiceId;return " : "return "}${expression(tag, 0, [])};${key === "space" ? "}" : ""}\n`
  generated += `default:return ${expression("Other", 0, [])};}}};\n`
  generated = generated.replace(/facts\.(\w+)/g, "fact_$1").replace(/apply\.(\w+)/g, "apply_$1")
  const emitted = join(temporary, "specialized.mjs")
  writeFileSync(emitted, generated)
  const specialized = await import(pathToFileURL(emitted))
  const choices = Object.freeze(["opaque", "opaque"])
  let values,
    choiceReads = 0,
    focusedChoiceReads = 0
  const facts = Object.fromEntries(factNames.map((name, index) => [name, () => values[index]]))
  facts.choiceIds = () => {
    choiceReads++
    return choices
  }
  facts.choiceId = (_model, _options, ids) => {
    assert.equal(ids, choices)
    focusedChoiceReads++
    return "opaque"
  }
  for (const index of [6, 7])
    facts[factNames[index]] = (_model, _options, ids, choiceId) => {
      assert.equal(ids, choices)
      assert.equal(choiceId, "opaque")
      return values[index]
    }
  const apply = Object.fromEntries(
    Object.entries(plans).map(([plan, name]) => [
      name,
      (_model, _options, ids, choiceId) => {
        if (payloadPlans.has(plan)) assert.equal(ids, choices)
        if (plan === "RemoveChoice" || plan === "AddChoice") assert.equal(choiceId, "opaque")
        return { $: plan }
      }
    ])
  )
  apply.move = (_model, _options, movement) => {
    assert.ok(movement === -1 || movement === 1)
    return { $: movement === -1 ? "Previous" : "Next" }
  }
  const bound = specialized.selectionUiBindUpdate(facts, apply)
  let cases = 0
  for (const [key, tag] of Object.entries(keys))
    for (let n = 0; n < 256; n++) {
      values = Array.from({ length: 8 }, (_, i) => Boolean(n & (1 << i)))
      choiceReads = 0
      focusedChoiceReads = 0
      assert.deepEqual(bound({}, key, {}), core.step({ $: tag }, ...values))
      assert.equal(choiceReads, key === "space" ? 1 : 0)
      assert.equal(focusedChoiceReads, key === "space" && !values[4] ? 1 : 0)
      cases++
    }
  const target = join(outputDirectory, "selection-ui-policy.generated.js"),
    declaration = join(outputDirectory, "selection-ui-policy.generated.d.ts"),
    abi = join(root, "abi/selection-ui-policy.generated.d.ts")
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
      transitionSpecializationCases: cases,
      artifactBytes: Buffer.byteLength(generated),
      choicePreparation: "exactly once for Space, never for other keys"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
