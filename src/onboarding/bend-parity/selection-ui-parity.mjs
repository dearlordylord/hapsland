import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
assert.equal(globalThis.Bun?.version, "1.3.14", "use the pinned product Bun runtime")
const baselineRoot =
  process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT ?? "/workspace/typescript/hapsland-bend-baseline-master-current"
const baselinePath = baselineRoot + "/packages/administration/dist/interaction/selection.js"
const candidatePath = new URL("../../../packages/administration/dist/interaction/selection.js", import.meta.url)
const baseline = await import(pathToFileURL(baselinePath)),
  candidate = await import(candidatePath)
const choiceSets = [[], [""], ["A", "B"], ["A", "A", "B"], ["é", "😀", ""], ["A", "\u0000", "B"]]
const selections = [
  [],
  ["A"],
  ["B"],
  ["unknown"],
  ["A", "B"],
  ["B", "A"],
  ["A", "A"],
  ["", "é"],
  ["B", "unknown", "A"],
  ["A", "B", "A"]
]
const keys = [
  "escape",
  "up",
  "down",
  "tab",
  "home",
  "end",
  "return",
  "enter",
  "space",
  "",
  "x",
  "Return",
  "Space",
  "\u0000",
  "^C"
]
const opaque = Object.freeze({ marker: "native-extra-state" })
export const nativeCases = []
let cases = 0,
  holds = 0,
  submissions = 0
for (const ids of choiceSets)
  for (const selected of selections)
    for (const back of [false, true])
      for (const warning of [false, true]) {
        const choices = Object.freeze(ids.map((id) => Object.freeze({ id, title: id })))
        const options = Object.freeze({ message: "synthetic fixture", choices, back })
        const numeric = [
          -100,
          -3,
          -1,
          -0,
          0.5,
          1.5,
          2.5,
          NaN,
          Infinity,
          -Infinity,
          1e12,
          Number.MAX_SAFE_INTEGER,
          ...Array.from({ length: ids.length + 6 }, (_, i) => i)
        ]
        const focuses = numeric.filter(
          (value, index) => numeric.findIndex((other) => Object.is(value, other)) === index
        )
        for (const focus of focuses)
          for (const key of keys) {
            const model = Object.freeze({ focus, selected: Object.freeze([...selected]), warning, opaque })
            const expected = baseline.selectionUpdate(model, key, options),
              actual = candidate.selectionUpdate(model, key, options)
            assert.deepEqual(actual, expected)
            assert.deepEqual(model, { focus, selected: [...selected], warning, opaque })
            if (expected._tag === "NextFrame") {
              assert.equal(actual.state.opaque, opaque)
              assert.equal(actual.state === model, expected.state === model)
              assert.equal(actual.state.selected === model.selected, expected.state.selected === model.selected)
              if (expected.state === model) holds++
            } else {
              submissions++
              if (expected.value.kind === "select") {
                assert.notEqual(actual.value.ids, model.selected)
                assert.deepEqual(actual.value.ids, selected)
              }
            }
            nativeCases.push([model, key, options])
            cases++
          }
      }
const paths = [
  "packages/administration/src/interaction/selection.ts",
  "packages/canonical-policy/src/canonical/selection-ui-adapter.ts",
  "packages/agent-flow-bend/selection-ui-policy/core.bend",
  "packages/agent-flow-bend/selection-ui-policy/LAWS.bend",
  "packages/agent-flow-bend/selection-ui-policy/PROOF.bend",
  "packages/agent-flow-bend/abi/selection-ui-policy.generated.d.ts",
  "packages/agent-flow-bend/dist/selection-ui-policy.generated.js"
]
const sha256 = Object.fromEntries(
  paths.map((path) => [
    path,
    createHash("sha256")
      .update(readFileSync(new URL("../../.." + path, import.meta.url)))
      .digest("hex")
  ])
)
sha256.baselineCompiled = createHash("sha256").update(readFileSync(baselinePath)).digest("hex")
const result = {
  at: new Date().toISOString(),
  runtime: "Bun 1.3.14",
  baselineRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: baselineRoot, encoding: "utf8" }).trim(),
  cases,
  holds,
  submissions,
  productionCompared: true,
  passed: true,
  sha256,
  scope:
    "actual compiled selectionUpdate against frozen master; key aliases and unknown keys, empty/duplicate/Unicode IDs, unknown selected IDs, empty selections, unusual numeric focus, warning/state and selected-array identity; renderer and IO excluded"
}
writeFileSync(new URL("./selection-ui-parity.json", import.meta.url), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify({ cases, holds, submissions, passed: true }))
