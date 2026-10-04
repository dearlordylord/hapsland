import { describe, expect, it } from "vitest"
import { bendAdapter, bendImportCandidates, parseBendDeclarations } from "./adapter.ts"

describe("Bend normalized adapter facts", () => {
  it("retains declaration source and source coordinates without parser-node shims", () => {
    const parsed = parseBendDeclarations("model.bend", "# heading\ntype Root is Data:\n  Root{}", 64)
    if ("reason" in parsed) throw new Error(parsed.reason)
    expect(parsed.declarations[0]).toMatchObject({
      artifact: { id: "model.bend:datatype:Root", kind: "datatype", source: "type Root is Data:\n  Root{}" },
      exported: true,
      location: { start: { line: 2, column: 1 }, end: { line: 3, column: 9 } }
    })
    expect(parsed.declarations[0]).not.toHaveProperty("node")
    expect(parsed.declarations[0]).not.toHaveProperty("nameNode")
  })

  it("exposes the common declaration and graph contracts", () => {
    const source = "import ./receipt.bend as R\ntype Root is Data:\n  Root{value: R.Receipt}"
    const parsed = bendAdapter.parseTypes("/repo/model.bend", source, true)
    expect(parsed).toMatchObject([
      { artifact: { kind: "datatype", name: "Root" }, references: [{ kind: "named", name: "R.Receipt" }] }
    ])
    const graph = bendAdapter.inspect("/repo/model.bend", source)
    expect(graph?.declarations.get("Root")?.artifact.path).toBe("/repo/model.bend")
    expect(graph?.imports.get("R.Receipt")).toEqual({ path: "./receipt.bend", name: "Receipt" })
  })

  it("owns relative Bend candidate paths and refuses other language/dependency paths", () => {
    expect(bendImportCandidates("src/model.bend", "../receipt.bend")).toEqual(["receipt.bend"])
    expect(bendImportCandidates("src/model.bend", "./receipt.bend")).toEqual(["src/receipt.bend"])
    expect(bendImportCandidates("model.bend", "../receipt.bend")).toEqual(["../receipt.bend"])
    for (const path of ["./receipt.rs", "./receipt.ts", "./receipt", "hub/receipt.bend", "/repo/receipt.bend"]) {
      expect(bendImportCandidates("src/model.bend", path)).toEqual([])
    }
  })
})
