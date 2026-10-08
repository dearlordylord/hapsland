import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"

// #137 gate: keep this standalone while direct policy imports are forbidden.
const root = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const required = [
  "packages/resident-runtime/src/resident/capacity.ts",
  "packages/resident-runtime/src/resident/collection.ts",
  "packages/review-definition/src/rules/decision.ts",
  "packages/runtime-inputs/src/configuration/decision.ts",
  "packages/agent-flow-viz/src/canonical-replay.ts"
]
for (const path of required) {
  assert.match(
    read(path),
    /from ["'][^"']*canonical\/adapter(?:\.ts)?["']/,
    `${path} must use the checked shared adapter`
  )
}
assert.doesNotMatch(
  read("packages/resident-runtime/src/resident/bend-work.ts"),
  /#state|bendWork[A-Z]/,
  "composed work must be a read-only canonical view"
)
assert.doesNotMatch(
  read("packages/resident-runtime/src/resident/composed-delivery.ts"),
  /BendRound|\.policy|policy:\s*Bend/,
  "composed rounds must not advance independent policy state"
)
assert.doesNotMatch(
  read("packages/resident-transport/src/resident/client.ts"),
  /EnsureResidentDependencies|liveEnsureDependencies|dependencies\s*===|const launches = new Map|return residentRequest\(/,
  "resident client startup must use layer-owned services and admission must await its IPC Effect"
)
assert.doesNotMatch(
  read("packages/resident-transport/src/resident/client.ts"),
  /Effect\.runPromise|Effect\.runSync|ManagedRuntime|processClientRuntime|process\.once\("beforeExit"/,
  "resident client workflows must compose Effects; their process callers own execution and disposal"
)
assert.doesNotMatch(
  read("packages/resident-transport/src/resident/paths.ts"),
  /process\.env/,
  "resident endpoint configuration must use Config at Effect execution time"
)
const obsoleteImports = []
const scan = (directory) => {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      scan(path)
      continue
    }
    if (!/\.(?:ts|mjs)$/.test(entry.name) || /(?:\.test\.ts|\.generated\.(?:js|d\.ts))$/.test(entry.name)) continue
    const source = read(path)
    assert.doesNotMatch(
      source,
      /\bclass\s+(?:CapacityLedger|EvaluationReuse|ComposedDelivery|ResidentServer)\b/,
      `${path} restores a superseded resident state class owner`
    )
    if (/from ["'][^"']*(?:flow\.generated|lifecycle\.generated|bend-policy\.generated)\.js["']/.test(source))
      obsoleteImports.push(path)
    if (
      path !== "packages/canonical-policy/src/canonical/canonical-boundary.ts" &&
      /from ["'](?:[^"']*canonical\.generated(?:\.js)?|@hapsland\/agent-flow-bend\/canonical)["']/.test(source)
    )
      obsoleteImports.push(path)
    if (
      path !== "packages/review-execution/src/review-providers/request-content.ts" &&
      /from ["'](?:[^"']*request-content\.generated(?:\.js)?|@hapsland\/agent-flow-bend\/request-content)["']/.test(
        source
      )
    )
      obsoleteImports.push(path)
    if (
      path !== "packages/canonical-policy/src/canonical/credential-adapter.ts" &&
      /from ["'](?:[^"']*credential-policy\.generated(?:\.js)?|@hapsland\/agent-flow-bend\/credential-policy)["']/.test(
        source
      )
    )
      obsoleteImports.push(path)
    if (
      path !== "packages/canonical-policy/src/canonical/graph-adapter.ts" &&
      /from ["']@hapsland\/agent-flow-bend\/import-graph["']/.test(source)
    )
      obsoleteImports.push(path)
  }
}
scan("src")
for (const owner of readPackageGraph(root).packages.values())
  if (owner.compiler === "typescript") scan(`${owner.directory}/src`)
scan("packages/agent-flow-viz/src")
assert.deepEqual(obsoleteImports, [], "production or visualization still consumes an obsolete direct policy path")
console.log(`checked ${required.length} shared-adapter imports and zero direct policy consumers`)
