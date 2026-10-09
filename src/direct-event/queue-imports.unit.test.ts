import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { analyzeTypeFile } from "@hapsland/source-analysis/direct-event/analyzer"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"

const source = readFileSync(new URL("./fixtures/queue.ts.txt", import.meta.url), "utf8")

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

it("extracts the checkers domain through unshadowed readonly and array intrinsic types", () => {
  const source = readFileSync(new URL("./fixtures/checkers-core.ts.txt", import.meta.url), "utf8")
  const analysis = analyzeTypeFile("src/core.ts", source)
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(
    analysis.units.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.unit.root.artifact.name)
  ).toEqual(["Player", "Piece", "Board", "Move", "Game"])
})

it.each(["Readonly", "ReadonlyArray", "Array"])(
  "does not treat an imported %s as intrinsic supporting evidence",
  (name) => {
    const analysis = analyzeTypeFile("a.ts", `import { ${name} } from './custom'; type Value = ${name}<string>`)
    expect(analysis.status).toBe("analyzed")
    if (analysis.status !== "analyzed") return
    expect(analysis.units[0]?.status).toBe("unsupported")
  }
)

it.each(["Readonly", "ReadonlyArray", "Array"])("preserves local %s supporting evidence", (name) => {
  const analysis = analyzeTypeFile("a.ts", `type ${name}<T> = { value: T }; type Value = ${name}<string>`)
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  const value = analysis.units.find((outcome) => outcome.unit.root.artifact.name === "Value")
  expect(value?.status).toBe("ready")
  expect(JSON.stringify(value)).toContain("value: T")
})

it.each(["Readonly", "ReadonlyArray", "Array"])("rejects invalid %s intrinsic arity", (name) => {
  const analysis = analyzeTypeFile("a.ts", `type Value = ${name}<string, number>`)
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(analysis.units[0]?.status).toBe("unsupported")
})

it("reports no type declarations rather than rejecting a type import in graph mode", () => {
  expect(
    analyzeTypeFile(
      "title.ts",
      "import type { Task } from './task'; export function title(task: Task): string { return task.title; }",
      true
    )
  ).toEqual({ status: "unsupported", reason: "no-declarations", units: [] })
})

it("extracts queue types despite unrelated value imports", () => {
  const analysis = analyzeTypeFile("src/queue.ts", source)
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(
    analysis.units.filter((outcome) => outcome.status === "ready").map((outcome) => outcome.unit.root.artifact.name)
  ).toEqual(["Base", "Job", "Command"])
})

it("keeps a referenced value import incomplete without excluding independent types", () => {
  const analysis = analyzeTypeFile(
    "a.ts",
    "import { External } from './external'; type Unsafe = External; type Safe = number"
  )
  expect(analysis.status).toBe("analyzed")
  if (analysis.status !== "analyzed") return
  expect(analysis.units.map((outcome) => ({ name: outcome.unit.root.artifact.name, status: outcome.status }))).toEqual([
    { name: "Unsafe", status: "unsupported" },
    { name: "Safe", status: "ready" }
  ])
})
