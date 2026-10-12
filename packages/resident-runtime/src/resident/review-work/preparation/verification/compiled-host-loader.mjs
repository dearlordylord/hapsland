import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

// Only verification imports are redirected. Product artifacts remain exactly
// those emitted by the normal workspace compiler; missing outputs fail closed.
const packageRoot = new URL("../../../../../", import.meta.url)
const workspacePackages = new URL("../", packageRoot).href
const manifest = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"))
const checked = new Map(
  manifest.hapsland.checkedJavaScript.map((file) => [
    new URL(file, packageRoot).href,
    new URL(file.replace(/^src\//u, "dist/"), packageRoot).href
  ])
)
const canonicalRoot = new URL("../canonical-policy/", packageRoot)
const canonicalManifest = JSON.parse(readFileSync(new URL("package.json", canonicalRoot), "utf8"))
for (const file of canonicalManifest.hapsland.checkedJavaScript)
  checked.set(new URL(file, canonicalRoot).href, new URL(file.replace(/^src\//u, "dist/"), canonicalRoot).href)
const graphRoot = new URL("../source-analysis/", packageRoot)
const graphManifest = JSON.parse(readFileSync(new URL("package.json", graphRoot), "utf8"))
for (const file of graphManifest.hapsland.checkedJavaScript)
  checked.set(new URL(file, graphRoot).href, new URL(file.replace(/^src\//u, "dist/"), graphRoot).href)
const graphDispatcher = new URL("dist/direct-event/graph-resolution/composition/artifact-dispatcher.mjs", graphRoot)
  .href
const preparationRoot = new URL("../review-execution/", packageRoot)
const preparationManifest = JSON.parse(readFileSync(new URL("package.json", preparationRoot), "utf8"))
for (const file of preparationManifest.hapsland.checkedJavaScript)
  checked.set(new URL(file, preparationRoot).href, new URL(file.replace(/^src\//u, "dist/"), preparationRoot).href)
const preparationEffects = new URL("dist/direct-event/preparation/physical-effects.mjs", preparationRoot).href
const canonicalDriver = new URL("dist/canonical/child-execution/driver.mjs", canonicalRoot).href
const loaded = new Set()
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context)
    let output = checked.get(resolved.url)
    if (!output && resolved.url.startsWith(workspacePackages)) {
      const relative = resolved.url.slice(workspacePackages.length)
      if (/^[^/]+\/src\/.*\.ts$/u.test(relative) && !relative.endsWith(".d.ts"))
        output = workspacePackages + relative.replace("/src/", "/dist/").replace(/\.ts$/u, ".js")
    }
    if (!output) return resolved
    assert.ok(existsSync(fileURLToPath(output)), `Missing compiled consumer dependency: ${output}`)
    return { ...resolved, url: output }
  },
  load(url, context, nextLoad) {
    if ([...checked.values()].includes(url)) loaded.add(url)
    return nextLoad(url, context)
  }
})
process.once("beforeExit", () => {
  for (const file of [
    "src/resident/review-work/composition/owned-artifact-driver.mjs",
    "src/resident/review-work/composition/owned-machine.mjs",
    "src/resident/review-work/composition/preparation-foreign.mjs",
    "src/resident/state/resolver-custody/resident-owner-transaction.mjs"
  ])
    assert.ok(loaded.has(checked.get(new URL(file, packageRoot).href)), `Compiled host was not loaded: ${file}`)
  assert.ok(loaded.has(preparationEffects), "Compiled physical Preparation effects were not loaded")
  assert.ok(loaded.has(graphDispatcher), "Compiled Graph composition dispatcher was not loaded")
  assert.ok(loaded.has(canonicalDriver), "Compiled Canonical child-execution driver was not loaded")
  console.log(JSON.stringify({ compiledHost: true, modules: [...loaded].sort() }))
})
