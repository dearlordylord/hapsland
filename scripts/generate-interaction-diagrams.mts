import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { uiFlows } from "../packages/administration/src/interaction/flow-registry.ts"
import { diagramGenerators } from "./interaction-diagram-generators.ts"
import { checkUiFlows } from "./check-ui-flows.mjs"
import { flowInventoryDocument } from "./ui-flow-inventory.mts"

export const generateInteractionDiagrams = (mode: "--check" | "--write") =>
  Effect.gen(function* () {
    // Writes can create missing documents; source/entry completeness is checked
    // after generation as well as before compilation and non-writing checks.
    if (mode === "--check") checkUiFlows()
    const generatedDestinations = new Set<string>()
    for (const id of Object.keys(uiFlows) as (keyof typeof uiFlows)[]) {
      if (generatedDestinations.has(uiFlows[id].diagram)) continue
      generatedDestinations.add(uiFlows[id].diagram)
      const markdown = yield* diagramGenerators[id]
      assert(markdown.includes("```mermaid"), `No Mermaid diagram for ${id}`)
      const destination = resolve(import.meta.dirname, "..", uiFlows[id].diagram)
      yield* Effect.promise(async () => {
        if (mode === "--write") await writeFile(destination, markdown)
        else assert.equal(await readFile(destination, "utf8"), markdown, `${id} diagram is stale; regenerate it`)
      })
    }
    const inventory = flowInventoryDocument()
    const destination = resolve(import.meta.dirname, "../docs/cli-interactions/README.md")
    yield* Effect.promise(async () => {
      const current = await readFile(destination, "utf8")
      const start = "<!-- ui-flow-inventory:start -->"
      const end = "<!-- ui-flow-inventory:end -->"
      const beginning = current.indexOf(start)
      const ending = current.indexOf(end)
      assert(beginning >= 0 && ending > beginning, "UI inventory markers are missing")
      const updated = current.slice(0, beginning + start.length) + "\n\n" + inventory + "\n\n" + current.slice(ending)
      if (mode === "--write") await writeFile(destination, updated)
      else assert.equal(current, updated, "UI flow inventory is stale; regenerate it")
    })
    checkUiFlows()
    console.log(
      `UI flow diagrams: ${generatedDestinations.size} documents for ${Object.keys(uiFlows).length} registered input flows; journey index current`
    )
  })
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  assert(mode === "--check" || mode === "--write", "Choose --check or --write")
  await Effect.runPromise(generateInteractionDiagrams(mode))
}
