import { describe, expect, it } from "vitest"
import { selectEditedRoots, type PostEditLocation, type SupportedRootDeclaration } from "./edit-attribution.ts"

const at = (line: number, column: number) => ({ line, column })
const loc = (startLine: number, startColumn: number, endLine: number, endColumn: number): PostEditLocation => ({
  start: at(startLine, startColumn),
  end: at(endLine, endColumn)
})
const path = "src/t.ts"
const source = "interface A { x: string }\ninterface B { x: string }\nfunction f() { return 1 }\n"
const declarations: SupportedRootDeclaration[] = [
  { path, kind: "interface", name: "A", location: loc(1, 1, 1, 26) },
  { path, kind: "interface", name: "B", location: loc(2, 1, 2, 26) },
  { path, kind: "function", name: "f", location: loc(3, 1, 3, 26) }
]
const snapshot = { path, operation: "update" as const, source }
const hunk = (location: PostEditLocation) => ({ path, verified: true as const, location })

describe("selectEditedRoots", () => {
  it("selects distinct roots by coordinates even when changed text repeats", () => {
    const result = selectEditedRoots(
      snapshot,
      [hunk(loc(2, 15, 2, 21)), hunk(loc(1, 15, 1, 21)), hunk(loc(2, 15, 2, 21))],
      declarations
    )
    expect(result.selected.map((root) => root.name)).toEqual(["B", "A"])
    expect(result.ambiguous).toEqual([])
    expect(JSON.stringify(result)).not.toContain("string")
  })
  it("selects all supported named roots on Add", () => {
    expect(
      selectEditedRoots({ ...snapshot, operation: "add" }, [], declarations).selected.map((root) => root.name)
    ).toEqual(["A", "B", "f"])
  })
  it("allows unique roots to proceed beside shared and deletion spans", () => {
    const result = selectEditedRoots(
      snapshot,
      [hunk(loc(1, 1, 1, 10)), hunk(loc(1, 26, 2, 1)), hunk(loc(3, 12, 3, 12))],
      declarations
    )
    expect(result.selected.map((root) => root.name)).toEqual(["A"])
    expect(result.ambiguous).toHaveLength(2)
    expect(result.ambiguous.every((span) => span.reason === "ambiguous-attribution")).toBe(true)
  })
  it("rejects coordinates that are unverified, mismatched, or outside the snapshot", () => {
    expect(() =>
      selectEditedRoots(snapshot, [{ ...hunk(loc(1, 1, 1, 2)), verified: false as true }], declarations)
    ).toThrow()
    expect(() =>
      selectEditedRoots(snapshot, [{ ...hunk(loc(1, 1, 1, 2)), path: "src/other.ts" }], declarations)
    ).toThrow()
    expect(() => selectEditedRoots(snapshot, [hunk(loc(9, 1, 9, 2))], declarations)).toThrow()
  })
  it("does not select a declaration with nonunique identity", () => {
    const duplicate = { ...declarations[0]!, location: loc(2, 1, 2, 26) }
    const result = selectEditedRoots(snapshot, [hunk(loc(1, 1, 1, 5))], [declarations[0]!, duplicate])
    expect(result.selected).toEqual([])
    expect(result.ambiguous).toHaveLength(1)
  })
})
