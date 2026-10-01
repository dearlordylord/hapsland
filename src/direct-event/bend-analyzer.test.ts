import { describe, expect, it } from "vitest";
import { analyzeTypeFile, inspectGraphFile, combinedAnalyzerMaterializationPreflight } from "./analyzer.ts";

const analyze = (source: string) => {
  const result = analyzeTypeFile("model.bend", source);
  if (result.status !== "analyzed") throw new Error(result.reason);
  return result.units;
};

describe("bounded Bend datatype extraction", () => {
  it("closes same-file payloads and retains exact source and coordinates", () => {
    const source = "# intro\nimport Base\n\ntype Receipt is Data:\n  Receipt{id: String}\n\ntype Delivery is Data: # root\n  Waiting{}\n  Delivered{receipt: Receipt}\n";
    const outcomes = analyze(source);
    expect(outcomes.every((unit) => unit.status === "ready")).toBe(true);
    expect(outcomes[1]?.unit.root.references[0]?.kind).toBe("expanded");
    const graph = inspectGraphFile("model.bend", source);
    expect(graph?.imports.size).toBe(0);
    expect(graph?.declarations.get("Delivery")).toMatchObject({
      artifact: { kind: "datatype", source: "type Delivery is Data: # root\n  Waiting{}\n  Delivered{receipt: Receipt}" },
      location: { start: { line: 7, column: 1 }, end: { line: 9, column: 30 } },
    });
    expect(combinedAnalyzerMaterializationPreflight("model.bend", source)?.declarations).toBe(2);
  });

  it("supports erased type parameters and nested local datatype arguments", () => {
    expect(analyze("import Base\ntype Box<-A: Data> is Data:\n  Box{value: A}\ntype Root is Data:\n  Root{value: Box<Box<String>>}").every((unit) => unit.status === "ready")).toBe(true);
  });

  it.each([
    "type Root is Data:\n  Root{value: Missing}",
    "type Root is Data:\n  Root{value: U32}",
    "import Base\ntype Root is Data:\n  Root{value: Maybe<String>}",
    "import ./other.bend as M\ntype Root is Data:\n  Root{}",
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
    "type Root<-A: Data> is Data:\n  Root{A: Data, value: A}",
  ])("preserves omissions for %s", (source) => {
    expect(analyze(source).at(-1)?.status).toBe("unsupported");
  });

  it("contains recursive references and enforces shared budgets", () => {
    expect(analyze("type A is Type:\n  A{value: B}\ntype B is Type:\n  B{value: A}")[0]?.status).toBe("ready");
    const many = Array.from({ length: 65 }, (_, index) => `type T${index} is Data:\n  C${index}{}`).join("\n");
    expect(analyzeTypeFile("model.bend", many)).toMatchObject({ status: "unsupported", reason: "declaration-limit" });
    const types = Array.from({ length: 17 }, (_, index) => `type T${index} is Data:\n  C${index}{}`).join("\n");
    const root = `type Root is Data:\n  Root{${Array.from({ length: 17 }, (_, index) => `f${index}: T${index}`).join(", ")}}`;
    expect(analyze(`${root}\n${types}`)[0]).toMatchObject({ status: "unsupported", reason: "reference-limit" });
  });

  it.each([
    "type Root is Data:\n  Root{}\ntype Root is Data:\n  Other{}",
    "type A is Data:\n  Same{}\ntype B is Data:\n  Same{}",
  ])("rejects ambiguous declarations %s", (source) => {
    expect(analyzeTypeFile("model.bend", source)).toMatchObject({ status: "unsupported", reason: "declaration-merge" });
  });

  it("rejects competing type and def/law bindings but preserves qualified names", () => {
    for (const declaration of ["def T() -> Data:\n  Data", "law T:\n  Data"]) {
      expect(analyzeTypeFile("model.bend", `type T is Data:\n  C{}\n${declaration}`)).toMatchObject({ status: "unsupported", reason: "declaration-merge" });
      expect(analyzeTypeFile("model.bend", `${declaration}\ntype T is Data:\n  C{}`)).toMatchObject({ status: "unsupported", reason: "declaration-merge" });
    }
    expect(analyze("type T is Data:\n  C{}\ndef T.foo() -> Data:\n  T")[0]?.status).toBe("ready");
  });

  it("does not find roots in comments, definitions, laws or strings", () => {
    expect(analyzeTypeFile("model.bend", "# type Fake is Data:\ndef main() -> Data:\n  type Hidden is Data:")).toMatchObject({ status: "unsupported", reason: "no-declarations" });
    expect(analyzeTypeFile("model.bend", 'def main() -> String:\n  "type Fake is Data:"')).toMatchObject({ status: "unsupported", reason: "parse" });
    expect(analyzeTypeFile("model.bend", "type Bad is Data")).toMatchObject({ status: "unsupported", reason: "parse" });
  });
});
