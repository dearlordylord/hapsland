import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { extractBendDeclarations } from "./languages/bend/extractor.ts"
import { analyzeTypeFile, inspectGraphFile, combinedAnalyzerMaterializationPreflight } from "./analyzer.ts"

const analyze = (source: string) => {
  const result = analyzeTypeFile("model.bend", source)
  if (result.status !== "analyzed") throw new Error(result.reason)
  return result.units
}

describe("bounded Bend datatype extraction", () => {
  it.each([
    'def greeting() -> String:\n  "hello # not a comment"',
    'def greeting() -> String:\n  "say \\"hello\\" and type Fake is Data:"',
    "def hash() -> Char:\n  '#'",
    'law greeting_identity:\n  {"hello" == "hello" : String}\ndef greeting_identity():\n  {==}'
  ])("isolates a supported datatype from unrelated literal-bearing code: %s", (other) => {
    const datatype = "type Order is Data: # exact root\n  Order{amount: U32}"
    for (const source of [`import Base\n${datatype}\n${other}`, `import Base\n${other}\n${datatype}`]) {
      expect(analyze(source)).toMatchObject([
        { status: "ready", unit: { root: { artifact: { name: "Order", source: datatype } } } }
      ])
    }
  })

  it("does not bind column-zero declaration or import text inside multiline literals", () => {
    const source = [
      "import Base",
      "def greeting() -> String:",
      '  "hello',
      "type Fake is Data:",
      "  Fake{}",
      "import ./fake.bend as R",
      '"',
      "type Order is Data:",
      "  Order{amount: U32}"
    ].join("\n")
    const graph = inspectGraphFile("model.bend", source)
    expect(graph).toBeDefined()
    expect([...(graph?.declarations.keys() ?? [])]).toEqual(["Order"])
    expect(graph?.imports.size).toBe(0)
    expect(graph?.declarations.get("Order")?.location).toEqual({
      start: { line: 8, column: 1 },
      end: { line: 9, column: 21 }
    })
    expect(analyze(source)[0]?.status).toBe("ready")
  })

  it("preserves CRLF source and comments with quotes without importing sibling bodies", () => {
    const datatype = "type Order is Data: # \"root\"\r\n  Order{amount: U32} # 'field'"
    const source = `import Base\r\n${datatype}\r\ndef greeting() -> String:\r\n  "hello"\r\n`
    expect(inspectGraphFile("model.bend", source)?.declarations.get("Order")).toMatchObject({
      artifact: { source: `${datatype}\r` },
      location: { start: { line: 2, column: 1 }, end: { line: 3, column: 32 } }
    })
  })

  it("retains real definition bindings even when their bodies contain literals", () => {
    const source =
      'import Base\ndef String() -> Data:\n  # "not a binding"\n  U32\ndef label() -> String:\n  "text"\ntype Root is Data:\n  Root{value: String}'
    expect(analyze(source)[0]?.status).toBe("unsupported")
  })

  it("keeps literal-dependent datatype syntax unsupported and retains its entire source", () => {
    const datatype = 'type Root is Data:\n  Root{value: Box<"literal\ncontent\n">}'
    const extracted = extractBendDeclarations(
      `import Base\ntype Box<-label: String> is Data:\n  Box{}\n${datatype}\n`,
      64
    )
    if (!("declarations" in extracted)) throw new Error(extracted.reason)
    expect(extracted.declarations[1]?.source).toBe(datatype)
    expect(extracted.declarations[1]?.references).toContainEqual({ kind: "unsupported", name: "Root" })
    expect(analyze(`import Base\ntype Box<-label: String> is Data:\n  Box{}\n${datatype}`).at(-1)?.status).toBe(
      "unsupported"
    )
  })

  it("keeps datatype evidence independent of unrelated escaped string contents", () => {
    const contents = fc.array(
      fc.constantFrom("a", "#", '"', "'", "\\", "type Fake is Data:", "import ./fake.bend as R", "\n", " "),
      { maxLength: 40 }
    )
    const datatype = "type Order is Data:\n  Order{amount: U32}"
    fc.assert(
      fc.property(contents, (parts) => {
        const source = `import Base\n${datatype}\ndef greeting() -> String:\n  ${JSON.stringify(parts.join(""))}`
        expect(analyze(source)).toMatchObject([
          { status: "ready", unit: { root: { artifact: { name: "Order", source: datatype } } } }
        ])
        expect(inspectGraphFile("model.bend", source)?.imports.size).toBe(0)
      }),
      { numRuns: 100, seed: 217 }
    )
  })

  it("closes same-file payloads and retains exact source and coordinates", () => {
    const source =
      "# intro\nimport Base\n\ntype Receipt is Data:\n  Receipt{id: String}\n\ntype Delivery is Data: # root\n  Waiting{}\n  Delivered{receipt: Receipt}\n"
    const outcomes = analyze(source)
    expect(outcomes.every((unit) => unit.status === "ready")).toBe(true)
    expect(outcomes[1]?.unit.root.references[0]?.kind).toBe("expanded")
    const graph = inspectGraphFile("model.bend", source)
    expect(graph?.imports.size).toBe(0)
    expect(graph?.declarations.get("Delivery")).toMatchObject({
      artifact: {
        kind: "datatype",
        source: "type Delivery is Data: # root\n  Waiting{}\n  Delivered{receipt: Receipt}"
      },
      location: { start: { line: 7, column: 1 }, end: { line: 9, column: 30 } }
    })
    expect(combinedAnalyzerMaterializationPreflight("model.bend", source)?.declarations).toBe(2)
  })

  it("supports erased type parameters and nested local datatype arguments", () => {
    expect(
      analyze(
        "import Base\ntype Box<-A: Data> is Data:\n  Box{value: A}\ntype Root is Data:\n  Root{value: Box<Box<String>>}"
      ).every((unit) => unit.status === "ready")
    ).toBe(true)
  })

  it.each([
    "type Root is Data:\n  Root{value: Missing}",
    "type Root is Data:\n  Root{value: U32}",
    "import Base\ntype Root is Data:\n  Root{value: Maybe<String>}",
    "import hub/other.bend as M\ntype Root is Data:\n  Root{}",
    "import Base as B\ntype Root is Data:\n  Root{}",
    "type Root is Kind(a):\n  Root{}",
    "type Root<a, -A: Kind(a)> is Data:\n  Root{value: A}",
    "type Root<-n: Nat> is Data:\n  Root{}",
    "type Root is Data:\n  Root{value: Word(32n)}",
    "type Root is Data:\n  Root{value: M.Remote}",
    "type Root is Data:\n  Root{value: {a == b : Nat}}",
    "type Root is Data:\n  Root{value: U32 & U32}",
    "type Root is Data:\n  Root{value: @x: U32 -> U32}",
    "type Root is Data:\n  Root{n: Nat, value: Box<n>}",
    "type Root is Data:\n  Root{value: +List<U32>}",
    "type Root is Data:\n  Root{value: U32, value: U32}",
    "type Root is Data:\n  Root{\n    value: U32\n  }",
    "import Base\ndef String() -> Data:\n  U32\ntype Root is Data:\n  Root{value: String}",
    "type Root<-A: Data> is Data:\n  Root{A: Data, value: A}"
  ])("preserves omissions for %s", (source) => {
    expect(analyze(source).at(-1)?.status).toBe("unsupported")
  })

  it("maps leading relative aliases and nested payloads in reference order", () => {
    const result = extractBendDeclarations(
      "import ./receipt.bend as R\nimport ../box.bend as B\ntype Root is Data:\n  Root{value: B.Box<R.Receipt>, again: R.Receipt}",
      64
    )
    expect("declarations" in result).toBe(true)
    if (!("declarations" in result)) return
    expect([...result.imports]).toEqual([
      ["B.Box", { path: "../box.bend", name: "Box" }],
      ["R.Receipt", { path: "./receipt.bend", name: "Receipt" }]
    ])
    expect(result.declarations[0]?.references).toEqual([
      { kind: "named", name: "B.Box" },
      { kind: "named", name: "R.Receipt" }
    ])
  })

  it("keeps missing aliased declarations as named edges for graph resolution", () => {
    const result = extractBendDeclarations(
      "import ./receipt.bend as R\ntype Root is Data:\n  Root{value: R.Missing}",
      64
    )
    if (!("declarations" in result)) throw new Error(result.reason)
    expect(result.imports.get("R.Missing")).toEqual({ path: "./receipt.bend", name: "Missing" })
    expect(result.declarations[0]?.references).toEqual([{ kind: "named", name: "R.Missing" }])
  })

  it.each([
    "import ./one.bend as R\nimport ./two.bend as R\ntype Root is Data:\n  Root{}",
    "import ./one.bend as R\ntype R is Data:\n  C{}",
    "import ./one.bend as R\ntype Root is Data:\n  R{}",
    "import ./one.bend as R\ndef R.foo() -> Data:\n  Data\ntype Root is Data:\n  C{}",
    "type Root is Data:\n  C{}\nimport ./one.bend as R"
  ])("rejects conflicting or late import aliases %s", (source) => {
    expect(extractBendDeclarations(source, 64)).toHaveProperty("reason")
  })

  it.each([
    "import ./one.bend as R\ntype Root<-R: Data> is Data:\n  C{value: R.Receipt}",
    "import ./one.bend as R\ntype Root is Data:\n  C{R: Data, value: R.Receipt}",
    "import /absolute/one.bend as R\ntype Root is Data:\n  C{value: R.Receipt}",
    "import hub/one.bend as R\ntype Root is Data:\n  C{value: R.Receipt}"
  ])("marks shadowed or unsupported import evidence omitted %s", (source) => {
    const result = extractBendDeclarations(source, 64)
    if (!("declarations" in result)) throw new Error(result.reason)
    expect(result.declarations[0]?.references.some((reference) => reference.kind === "unsupported")).toBe(true)
  })

  it.each(["Word", "List", "Maybe", "IO", "WNil", "Nat"])(
    "does not assume aliased %s wins over Base names",
    (alias) => {
      for (const imports of [
        `import Base\nimport ./child.bend as ${alias}`,
        `import ./child.bend as ${alias}\nimport Base`
      ]) {
        const result = extractBendDeclarations(`${imports}\ntype Root is Data:\n  Root{value: ${alias}.Nil}`, 64)
        if (!("declarations" in result)) throw new Error(result.reason)
        expect(result.declarations[0]?.references.some((reference) => reference.kind === "unsupported")).toBe(true)
        expect(result.imports.size).toBe(0)
      }
    }
  )

  it("does not erase a bare builtin spelling that is also an alias", () => {
    const result = extractBendDeclarations(
      "import Base\nimport ./child.bend as Nat\ntype Root is Data:\n  Root{value: Nat}",
      64
    )
    if (!("declarations" in result)) throw new Error(result.reason)
    expect(result.declarations[0]?.references).toContainEqual({ kind: "named", name: "Nat" })
    expect(result.declarations[0]?.references).toContainEqual({ kind: "unsupported", name: "Root" })
  })

  it("allows an unambiguous Receipt alias alongside Base", () => {
    const result = extractBendDeclarations(
      "import Base\nimport ./child.bend as Receipt\ntype Root is Data:\n  Root{value: Receipt.Value}",
      64
    )
    if (!("declarations" in result)) throw new Error(result.reason)
    expect(result.imports.get("Receipt.Value")).toEqual({ path: "./child.bend", name: "Value" })
    expect(result.declarations[0]?.references).toEqual([{ kind: "named", name: "Receipt.Value" }])
  })

  it("contains recursive references and enforces shared budgets", () => {
    expect(analyze("type A is Type:\n  A{value: B}\ntype B is Type:\n  B{value: A}")[0]?.status).toBe("ready")
    const many = Array.from({ length: 65 }, (_, index) => `type T${index} is Data:\n  C${index}{}`).join("\n")
    expect(analyzeTypeFile("model.bend", many)).toMatchObject({ status: "unsupported", reason: "declaration-limit" })
    const types = Array.from({ length: 17 }, (_, index) => `type T${index} is Data:\n  C${index}{}`).join("\n")
    const root = `type Root is Data:\n  Root{${Array.from({ length: 17 }, (_, index) => `f${index}: T${index}`).join(", ")}}`
    expect(analyze(`${root}\n${types}`)[0]).toMatchObject({ status: "unsupported", reason: "reference-limit" })
  })

  it.each([
    "type Root is Data:\n  Root{}\ntype Root is Data:\n  Other{}",
    "type A is Data:\n  Same{}\ntype B is Data:\n  Same{}"
  ])("rejects ambiguous declarations %s", (source) => {
    expect(analyzeTypeFile("model.bend", source)).toMatchObject({ status: "unsupported", reason: "declaration-merge" })
  })

  it("rejects competing type and def/law bindings but preserves qualified names", () => {
    for (const declaration of ["def T() -> Data:\n  Data", "law T:\n  Data"]) {
      expect(analyzeTypeFile("model.bend", `type T is Data:\n  C{}\n${declaration}`)).toMatchObject({
        status: "unsupported",
        reason: "declaration-merge"
      })
      expect(analyzeTypeFile("model.bend", `${declaration}\ntype T is Data:\n  C{}`)).toMatchObject({
        status: "unsupported",
        reason: "declaration-merge"
      })
    }
    expect(analyze("type T is Data:\n  C{}\ndef T.foo() -> Data:\n  T")[0]?.status).toBe("ready")
  })

  it("does not find roots in comments, definitions, laws or strings", () => {
    expect(
      analyzeTypeFile("model.bend", "# type Fake is Data:\ndef main() -> Data:\n  type Hidden is Data:")
    ).toMatchObject({ status: "unsupported", reason: "no-declarations" })
    expect(analyzeTypeFile("model.bend", 'def main() -> String:\n  "type Fake is Data:"')).toMatchObject({
      status: "unsupported",
      reason: "no-declarations"
    })
    expect(analyzeTypeFile("model.bend", "type Bad is Data")).toMatchObject({ status: "unsupported", reason: "parse" })
  })
})
