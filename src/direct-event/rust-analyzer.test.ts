import { describe, expect, it } from "vitest";
import { analyzeTypeFile, combinedAnalyzerMaterializationPreflight, inspectGraphFile, MAX_TYPE_DECLARATIONS } from "./analyzer.ts";

const units = (source: string) => {
  const result = analyzeTypeFile("src/model.rs", source);
  if (result.status !== "analyzed") throw new Error(result.reason);
  return result.units;
};

describe("bounded Rust type extraction", () => {
  it("closes tuple and named enum payloads through nested prelude wrappers", () => {
    const source = `struct Receipt { id: String }
struct Failure { reason: String }
enum Delivery { Waiting, Delivered(Receipt), Failed { error: Failure } }
struct Session { receipt: Option<Receipt>, result: Result<Receipt, Failure>, history: Vec<Option<Receipt>> }`;
    const results = units(source);
    expect(results.every((result) => result.status === "ready")).toBe(true);
    expect(results.at(-1)?.unit.root.references.map((reference) => reference.site.symbol)).toEqual(["Receipt", "Failure"]);
    expect(results[2]?.unit.root.artifact.kind).toBe("enum");
    expect(combinedAnalyzerMaterializationPreflight("src/model.rs", source)?.declarations).toBe(4);
  });

  it("binds local names before prelude wrapper names", () => {
    const results = units("struct Option { id: u8 } struct Vec { id: u8 } struct Root { a: Option, b: Vec }");
    expect(results.at(-1)?.unit.root.references.map((reference) => reference.kind)).toEqual(["expanded", "expanded"]);
  });

  it("supports type parameters while retaining default type evidence", () => {
    expect(units("type Alias<T> = Option<T>;")[0]?.status).toBe("ready");
    expect(units("type Alias<T = Missing> = Option<T>;")[0]?.status).toBe("unsupported");
  });

  it.each([
    "#[cfg(feature = \"x\")] struct Root { x: u8 }",
    "struct Root { #[cfg(foo)] x: u8 }",
    "enum Root { #[cfg(foo)] A, B }",
    "#[cfg_attr(foo, derive(Clone))] struct Root;",
    "struct Root { x: std::string::String }",
    "struct Root { x: Missing }",
    "struct Root<T: Clone> { x: T }",
    "struct Root<const N: usize>([u8; N]);",
    "use other::Option; struct Option; struct Root { x: Option }",
    "mod nested { struct Hidden; } struct Root { x: Hidden }",
    "make_types!(); struct Root;",
    "#![no_std] struct Root;",
    "union Option { n: u8 } struct Root { x: Option }",
    "trait String {} struct Root { value: Box<dyn String> }",
    "const N: usize = 3; struct Root { bytes: [u8; N] }",
    "type Root = [u8; { hidden() }];",
    "enum Root { A = hidden() }",
    "#[custom] fn unrelated() {} struct Root { value: String }",
    "extern crate alloc as String; struct Root { value: String }",
    "extern \"C\" { type String; } struct Root { value: String }",
  ])("retains incomplete evidence for %s", (source) => {
    expect(units(source).every((result) => result.status === "unsupported")).toBe(true);
  });

  it("retains exact attributes and declaration ranges for attribution", () => {
    const source = "// leading\n#[derive(Clone)]\n\n// between\npub struct Root { x: u8 }\nstruct Other;";
    const root = inspectGraphFile("src/model.rs", source)?.declarations.get("Root");
    expect(root?.artifact.source).toBe("#[derive(Clone)]\n\n// between\npub struct Root { x: u8 }");
    expect(root?.location).toEqual({ start: { line: 2, column: 1 }, end: { line: 5, column: 26 } });
    expect(root?.references).toEqual([{ kind: "unsupported", name: "Root" }]);
  });

  it("contains cycles and enforces declaration and reference bounds", () => {
    expect(units("struct A { x: Option<B> } struct B { x: Box<A> }")[0]?.unit.root.references[0]?.kind).toBe("expanded");
    expect(analyzeTypeFile("a.rs", Array.from({ length: MAX_TYPE_DECLARATIONS + 1 }, (_, index) => `struct T${index};`).join("\n"))).toMatchObject({ status: "unsupported", reason: "declaration-limit" });
    expect(units(`struct Root { ${Array.from({ length: 17 }, (_, index) => `v${index}: T${index}`).join(",")} } ${Array.from({ length: 17 }, (_, index) => `struct T${index};`).join(" ")}`)[0]).toMatchObject({ status: "unsupported", reason: "reference-limit" });
  });

  it("does not infer declarations from function or nested module bodies", () => {
    expect(analyzeTypeFile("a.rs", "fn main() { struct Hidden; }")).toMatchObject({ status: "unsupported", reason: "no-declarations" });
    expect(analyzeTypeFile("a.rs", "struct Bad { x: }")).toMatchObject({ status: "unsupported", reason: "parse" });
  });
});
