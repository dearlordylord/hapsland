import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const root = resolve(import.meta.dirname, "../../..")
const directory = join(root, "packages/agent-flow-bend/selection-ui-policy")
const coreSource = readFileSync(join(directory, "core.bend"), "utf8")
const lawSource = readFileSync(join(directory, "LAWS.bend"), "utf8")
const sha = (s) => createHash("sha256").update(s).digest("hex")
const temporary = mkdtempSync(join(directory, ".falsification-"))
const keys = ["Escape", "Up", "Down", "Tab", "Home", "End", "Return", "Enter", "Space", "Other"]
const normalizeSpecPlan = (plan) => {
  assert.deepEqual(Object.keys(plan), ["$"])
  assert.ok(plan.$.startsWith("core."))
  return { $: plan.$.slice(5) }
}
const bits = (n, length) => Array.from({ length }, (_, i) => Boolean(n & (1 << i)))
try {
  writeFileSync(join(temporary, "core.bend"), coreSource)
  // Preserve exactly the specification definitions from the law owner, without unfilled declarations.
  writeFileSync(join(temporary, "spec.bend"), lawSource.split("\nlaw ")[0] + "\n")
  execFileSync("bend", [join(temporary, "core.bend"), "-o", join(temporary, "core.mjs")], { timeout: 5000 })
  execFileSync("bend", [join(temporary, "spec.bend"), "-o", join(temporary, "spec.mjs")], { timeout: 5000 })
  const core = (await import(pathToFileURL(join(temporary, "core.mjs")))).default
  const spec = (await import(pathToFileURL(join(temporary, "spec.mjs")))).default
  let submitCases = 0,
    toggleCases = 0,
    stepCases = 0
  for (let n = 0; n < 8; n++) {
    assert.deepEqual(core.submit(...bits(n, 3)), normalizeSpecPlan(spec.submit_spec(...bits(n, 3))))
    submitCases++
  }
  for (let n = 0; n < 16; n++) {
    assert.deepEqual(core.toggle(...bits(n, 4)), normalizeSpecPlan(spec.toggle_spec(...bits(n, 4))))
    toggleCases++
  }
  for (const key of keys)
    for (let n = 0; n < 256; n++) {
      assert.deepEqual(
        core.step({ $: key }, ...bits(n, 8)),
        normalizeSpecPlan(spec.step_spec({ $: "core." + key }, ...bits(n, 8)))
      )
      stepCases++
    }
  const controls = []
  for (const [name, before, after] of [
    ["tab moves backwards", "case Tab{}: Next{}", "case Tab{}: Previous{}"],
    ["absent choice adds a choice", "      Hold{}\n", "      AddChoice{}\n"]
  ]) {
    assert.ok(coreSource.includes(before))
    const mutated = coreSource.replace(before, after)
    assert.notEqual(mutated, coreSource)
    const source = join(temporary, name.startsWith("tab") ? "tab.bend" : "absent.bend"),
      output = source.replace(/\.bend$/, ".mjs")
    writeFileSync(source, mutated)
    execFileSync("bend", [source, "-o", output], { timeout: 5000 })
    const mutant = (await import(pathToFileURL(output))).default
    let counterexample
    outer: for (const key of keys)
      for (let n = 0; n < 256; n++) {
        const facts = bits(n, 8),
          expected = normalizeSpecPlan(spec.step_spec({ $: "core." + key }, ...facts)),
          actual = mutant.step({ $: key }, ...facts)
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          counterexample = { key, facts, expected, actual }
          break outer
        }
      }
    assert.ok(counterexample)
    controls.push({ name, compiled: true, detected: true, counterexample })
  }
  assert.equal(readFileSync(join(directory, "core.bend"), "utf8"), coreSource)
  assert.equal(readFileSync(join(directory, "LAWS.bend"), "utf8"), lawSource)
  const record = {
    at: new Date().toISOString(),
    toolchain: execFileSync("bend", ["version"], { encoding: "utf8", timeout: 5000 }).trim(),
    coreSha256: sha(coreSource),
    lawsSha256: sha(lawSource),
    sourceFrozen: true,
    submitCases,
    toggleCases,
    stepCases,
    controls,
    passed: true,
    scope:
      "exhaustive emitted evaluation of finite law binders before universal proof; two well-formed planted faults; no native bridge, IO or performance acceptance"
  }
  writeFileSync(new URL("./selection-ui-falsification.json", import.meta.url), JSON.stringify(record, null, 2) + "\n")
  console.log(JSON.stringify(record))
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
