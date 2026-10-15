import { expect, it } from "vitest"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"

it("does not invent unresolved Readonly dependencies in function supporting types", () => {
  const file = analyzeFunctionFile(
    "a.ts",
    "type Player = 'black' | 'red'; type Piece = Readonly<{ player: Player }>; function identity(piece: Piece): Piece { return piece }"
  )
  expect(file).toBeDefined()
  expect(file?.types.get("Piece")?.references).toEqual([{ kind: "named-type", name: "Player" }])
})

it.each([
  "import type { Readonly } from './custom'; type Piece = Readonly<string>;",
  "type Readonly<T> = { value: T }; type Piece = Readonly<string>;",
  "type Piece = Readonly;",
  "type Piece = Readonly<string, number>;"
])("preserves non-intrinsic Readonly dependencies: %s", (source) => {
  const file = analyzeFunctionFile("a.ts", `${source} function identity(piece: Piece): Piece { return piece }`)
  expect(file?.types.get("Piece")?.references).toContainEqual({ kind: "named-type", name: "Readonly" })
})
