import { Effect } from "effect"
import { expect, it } from "vitest"
import { childFlow, cliJourney, flowInteraction } from "../../packages/administration/src/interaction/flow-input.ts"
import { uiFlows } from "../../packages/administration/src/interaction/flow-registry.ts"
import { diagramGenerators } from "../../scripts/interaction-diagram-generators.mts"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

it("replays every registered production UI flow and matches its maintained Mermaid document", async () => {
  for (const id of Object.keys(uiFlows) as (keyof typeof uiFlows)[]) {
    const generated = await Effect.runPromise(diagramGenerators[id])
    expect(generated.match(/```mermaid/g)).toHaveLength(1)
    expect(generated).not.toMatch(
      /Before revision|Input revision|Output revision|Command identity|Replay correlation|\| Case \||\| Replay \|/
    )
    expect(generated).toMatch(/\w+\["[^"\n]+"\]/)
    expect(await readFile(resolve(uiFlows[id].diagram), "utf8"), id).toBe(generated)
  }
})

it("indexes user journeys without a decorative command-to-title graph", async () => {
  const index = await readFile(resolve("docs/cli-interactions/README.md"), "utf8")
  expect(index).toContain("| User journey | CLI command | Diagram |")
  expect(index).not.toContain("```mermaid")
})

// Compile-time witnesses: a new owner/kind cannot acquire input by accident.
const checkInputTypes = (input: Effect.Success<ReturnType<typeof flowInteraction<"setup">>>) => {
  // @ts-expect-error Setup declares confirmation, not hidden credential capture.
  input.hidden("key")
  // @ts-expect-error Unknown workflows cannot dispatch production input.
  flowInteraction("unregistered")
  // @ts-expect-error Unknown CLI journeys cannot dispatch handlers.
  cliJourney("unregistered", () => Effect.void)
  // @ts-expect-error Rules cannot compose login without updating the registry.
  childFlow("rules", "login", Effect.void)
}
void checkInputTypes
