import { describe, expect, it } from "vitest"
import { parseGoTypes, inspectGoFile, goGraphFacts } from "@hapsland/source-analysis/direct-event/languages/go"
describe("Go named type identity and source", () => {
  it("keeps grouped specs, defined types, aliases, interfaces and generics exact", () => {
    const source =
      'package p\ntype (\n ID string\n Alias = ID\n Model[T ~int | ~string] struct { Value T; ID; Label string `json:"label"` }\n Contract interface { Method(ID) string }\n)\nfunc unrelated() {}\nfunc (m Model[T]) method() {}\n'
    const parsed = parseGoTypes("model.go", source)
    if ("status" in parsed) throw new Error(parsed.reason)
    expect(parsed.map((declaration) => [declaration.artifact.name, declaration.artifact.kind])).toEqual([
      ["ID", "defined-type"],
      ["Alias", "type-alias"],
      ["Model", "struct"],
      ["Contract", "interface"]
    ])
    for (const declaration of parsed) {
      const lines = source.split("\n")
      const range = declaration.location
      expect(lines[range.start.line - 1]?.slice(range.start.column - 1, range.end.column - 1)).toBe(
        declaration.artifact.source
      )
      expect(declaration.artifact.id).toBe(`model.go:${declaration.artifact.kind}:${declaration.artifact.name}`)
    }
    expect(parsed.find((declaration) => declaration.artifact.name === "Model")?.references).toEqual([
      { kind: "named", name: "ID" }
    ])
    expect(parsed.find((declaration) => declaration.artifact.name === "Contract")?.references).toEqual([
      { kind: "named", name: "ID" }
    ])
  })
  it("resolves package shadowing before treating primitive spellings as leaves", () => {
    const root = inspectGoFile("root.go", "package p\ntype Root struct { Value string }\n")
    const sibling = inspectGoFile("string.go", "package p\ntype string int\n")
    if (root === undefined || sibling === undefined) throw new Error("parse")
    expect(goGraphFacts([root, sibling])?.declarations.get("Root")?.references).toEqual([
      { kind: "named", name: "string" }
    ])
  })
  it("uses file-local import and generic bindings rather than package names", () => {
    const root = inspectGoFile(
      "root.go",
      'package p\nimport Alias "example.org/external"\ntype Root[T any] struct { Value T; Other Alias.Item }\n'
    )
    expect(root?.types[0]?.references).toEqual([
      { kind: "named", name: "any" },
      { kind: "unsupported", name: "Alias.Item" }
    ])
  })
  it("retains distinct complete iota groups in sibling files with identical line numbers", () => {
    const files = [
      inspectGoFile("root.go", "package p\ntype Status int\n"),
      inspectGoFile("first.go", "package p\nconst (\n A Status = iota\n B\n)\n"),
      inspectGoFile("second.go", "package p\nconst (\n C Status = iota\n D\n)\n")
    ]
    if (files.some((file) => file === undefined)) throw new Error("parse")
    const facts = goGraphFacts(files.filter((file) => file !== undefined))
    const targets = facts?.declarations.get("Status")?.references ?? []
    expect(targets).toHaveLength(2)
    expect(new Set(targets.map((reference) => reference.name)).size).toBe(2)
    expect(targets.map((reference) => facts?.declarations.get(reference.name)?.artifact.source)).toEqual([
      "const (\n A Status = iota\n B\n)",
      "const (\n C Status = iota\n D\n)"
    ])
  })
  it("discovers typed aliases across constant groups without inventing values", () => {
    const root = inspectGoFile("root.go", "package p\ntype Status int\n")
    const constants = inspectGoFile("const.go", "package p\nconst (\n A Status = iota\n B = A\n)\nconst C = B\n")
    if (root === undefined || constants === undefined) throw new Error("parse")
    const facts = goGraphFacts([root, constants])
    const groups = facts?.declarations.get("Status")?.references ?? []
    expect(groups).toHaveLength(2)
    const second = facts?.declarations.get(groups[1]!.name)
    expect(second?.artifact.source).toBe("const C = B")
    expect(second?.references).toEqual([{ kind: "named", name: groups[0]!.name }])
    expect(facts?.declarations.get(groups[0]!.name)?.references).toEqual([{ kind: "named", name: "Status" }])
  })
  it("retains every type needed by the original mixed constant group", () => {
    const file = inspectGoFile(
      "root.go",
      'package p\nimport "external"\ntype Status int\ntype Other int\nconst (\n A Status = 1\n B Other = Other(2)\n C external.Kind = 3\n)\n'
    )
    if (file === undefined) throw new Error("parse")
    const facts = goGraphFacts([file])
    const target = facts?.declarations.get("Status")?.references[0]
    expect(facts?.declarations.get(target!.name)?.references).toEqual([
      { kind: "named", name: "Status" },
      { kind: "named", name: "Other" },
      { kind: "unsupported", name: "external.Kind" }
    ])
  })
  it("preserves package-level iota shadowing through its defining constant group", () => {
    const root = inspectGoFile("root.go", "package p\ntype Status int\nconst A Status = iota\n")
    const shadow = inspectGoFile("shadow.go", "package p\nconst iota = 7\n")
    if (root === undefined || shadow === undefined) throw new Error("parse")
    const facts = goGraphFacts([root, shadow])
    const group = facts?.declarations.get("Status")?.references[0]
    const dependency = facts?.declarations.get(group!.name)?.references.find((reference) => reference.name !== "Status")
    expect(facts?.declarations.get(dependency!.name)?.artifact.source).toBe("const iota = 7")
  })
  it("captures a named local array bound from its complete original group", () => {
    const file = inspectGoFile("array.go", "package p\ntype Buffer [Size]byte\nconst (\n Size = 8\n Other = 16\n)\n")
    if (file === undefined) throw new Error("parse")
    const facts = goGraphFacts([file])
    const dependency = facts?.declarations.get("Buffer")?.references[0]
    expect(facts?.declarations.get(dependency!.name)?.artifact.source).toBe("const (\n Size = 8\n Other = 16\n)")
  })
  it("does not erase external selectors whose imported qualifier shadows iota", () => {
    const root = inspectGoFile("root.go", "package p\ntype Status int\n")
    const constants = inspectGoFile(
      "constants.go",
      'package p\nimport iota "example.org/external"\nconst A Status = iota.External\n'
    )
    if (root === undefined || constants === undefined) throw new Error("parse")
    const facts = goGraphFacts([root, constants])
    const target = facts?.declarations.get("Status")?.references[0]
    expect(facts?.declarations.get(target!.name)?.references).toContainEqual({
      kind: "unsupported",
      name: "iota.External"
    })
  })
  it("infers individual typed aliases and arithmetic without treating comparisons as aliases", () => {
    const file = inspectGoFile(
      "root.go",
      'package p\nimport "external"\ntype Status int\ntype Alias = Status\nconst (\n A Alias = 1\n U = 2\n)\nconst B = A + 1\nconst Comparison = A == external.Limit\nconst Unrelated = U\n'
    )
    if (file === undefined) throw new Error("parse")
    const facts = goGraphFacts([file])
    const groups = facts?.declarations
      .get("Status")
      ?.references.map((reference) => facts?.declarations.get(reference.name)?.artifact.source)
    expect(groups).toEqual(["const (\n A Alias = 1\n U = 2\n)", "const B = A + 1"])
  })
  it("never mistakes initializer-local declarations for package bindings", () => {
    const file = inspectGoFile(
      "root.go",
      "package p\ntype Receipt int\nvar Result = func() int { var Receipt int; return Receipt }()\nvar (\n Other = func() int { var string int; return string }()\n)\n"
    )
    if (file === undefined) throw new Error("parse")
    expect(file.bindings).toEqual(["Receipt", "Result", "Other"])
    expect(goGraphFacts([file])).toBeDefined()
  })
  it("does not rewrite the pinned grammar's compact constant block gap", () => {
    const parsed = parseGoTypes("model.go", "package p\ntype Status int\nconst (A Status = iota; B)\n")
    expect(parsed).toEqual({ status: "unsupported", reason: "parse", units: [] })
  })
})
