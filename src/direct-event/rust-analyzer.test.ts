import {
  inspectRust as inspectGraphFile,
  inspectRustModules
} from "@hapsland/source-analysis/direct-event/languages/rust"
import { describe, expect, it } from "vitest"
import fc from "fast-check"
import {
  analyzeTypeFile,
  combinedAnalyzerMaterializationPreflight,
  MAX_TYPE_DECLARATIONS
} from "@hapsland/source-analysis/direct-event/analyzer"

const units = (source: string) => {
  const result = analyzeTypeFile("src/model.rs", source)
  if (result.status !== "analyzed") throw new Error(result.reason)
  return result.units
}

describe("bounded Rust type extraction", () => {
  it("extracts declared-module imports, aliases, lists and qualified references", () => {
    const source =
      "mod receipt; use self::receipt::{Receipt, Failure as Error}; pub(crate) struct Root { a: Receipt, b: Error, c: receipt::Receipt, d: self::receipt::Failure }"
    const facts = inspectGraphFile("src/lib.rs", source, { rustCrateRoot: true })
    expect([...(facts?.imports ?? [])]).toEqual([
      ["Receipt", { path: "./receipt", name: "Receipt" }],
      ["Error", { path: "./receipt", name: "Failure" }],
      ["receipt::Receipt", { path: "./receipt", name: "Receipt" }],
      ["self::receipt::Failure", { path: "./receipt", name: "Failure" }]
    ])
    expect(facts?.declarations.get("Root")?.references).toEqual([
      { kind: "named", name: "Receipt" },
      { kind: "named", name: "Error" },
      { kind: "named", name: "receipt::Receipt" },
      { kind: "named", name: "self::receipt::Failure" }
    ])
    expect(facts?.declarations.get("Root")?.exported).toBe(true)
    expect(units(source)[0]?.status).toBe("unsupported")
    expect(combinedAnalyzerMaterializationPreflight("src/lib.rs", source)?.hasImports).toBe(true)
  })

  it("resolves crate-qualified declared modules only with explicit crate-root authority", () => {
    const source = "mod child; use crate::child::Item as Alias; pub struct Root { a: Alias, b: crate::child::Item }"
    for (const path of ["src/lib.rs", "src/main.rs"]) {
      const facts = inspectGraphFile(path, source, { rustCrateRoot: true })
      expect(facts?.imports.get("Alias")).toEqual({ path: "./child", name: "Item" })
      expect(facts?.imports.get("crate::child::Item")).toEqual({ path: "./child", name: "Item" })
    }
    expect(inspectGraphFile("src/foo.rs", source)?.imports.size).toBe(0)
    expect(inspectGraphFile("src/foo/mod.rs", source)?.imports.size).toBe(0)
  })

  it("keeps renamed module aliases bound to their target rather than a same-spelled unrelated declaration", () => {
    fc.assert(
      fc.property(fc.tuple(fc.nat(10000), fc.nat(10000), fc.nat(10000)), ([moduleId, typeId, aliasId]) => {
        const module = `module_${moduleId}`
        const target = `Type_${typeId}`
        const alias = `Alias_${aliasId}`
        const source = `mod ${module}; use ${module}::${target} as ${alias}; struct Root { value: Vec<${alias}> }`
        const facts = inspectGraphFile("src/custom.rs", source, { rustCrateRoot: true })
        expect(facts?.imports.get(alias)).toEqual({ path: `./${module}`, name: target })
        expect(facts?.declarations.get("Root")?.references).toEqual([{ kind: "named", name: alias }])
        // Adding a conflicting local binding must remove authority, independent
        // of the particular spelling of the generated alias.
        const conflicted = inspectGraphFile("src/custom.rs", `${source} struct ${alias};`, { rustCrateRoot: true })
        expect(conflicted?.imports.size).toBe(0)
        expect(
          conflicted?.declarations.get("Root")?.references.some((reference) => reference.kind === "unsupported")
        ).toBe(true)
      }),
      { numRuns: 1000, examples: [[[9996, 8555, 5665]]] }
    )
  })

  it("requires an established Cargo role even for conventional filenames", () => {
    for (const path of ["src/lib.rs", "src/main.rs", "src/foo/mod.rs"]) {
      expect(inspectGraphFile(path, "mod child; struct Root { value: child::Item }")?.imports.size).toBe(0)
    }
  })

  it("resolves crate imports through supplied captured root-module paths", () => {
    const facts = inspectGraphFile(
      "src/outer/model.rs",
      "use crate::receipt::Receipt; struct Root { value: Receipt }",
      { rustExternalModule: true, rustCrateModules: new Map([["receipt", "../receipt"]]) }
    )
    expect(facts?.imports.get("Receipt")).toEqual({ path: "../receipt", name: "Receipt" })
  })

  it("extracts safe source-only external module links including module-only files", () => {
    expect(inspectRustModules("pub mod receipt; mod model;")).toEqual({ names: ["receipt", "model"] })
    expect(inspectRustModules("use crate::receipt::Receipt; mod child; pub struct Root { value: Receipt }")).toEqual({
      names: ["child"]
    })
    for (const source of [
      "mod x {}",
      '#[path="other.rs"] mod x;',
      "mod x; mod x;",
      "mod x; struct x;",
      "make_modules!(); mod x;",
      "mod x; use x::*;"
    ]) {
      expect(inspectRustModules(source)).toBeUndefined()
    }
  })

  it("requires known external-module origin for ordinary Rust child directories", () => {
    const source = "mod child; use child::Item; struct Root { value: Item }"
    expect(inspectGraphFile("src/foo.rs", source)?.imports.size).toBe(0)
    expect(inspectGraphFile("src/foo.rs", source, { rustExternalModule: true })?.imports.get("Item")).toEqual({
      path: "./foo/child",
      name: "Item"
    })
    expect(inspectGraphFile("src/lib.rs", source, { rustExternalModule: true })?.imports.get("Item")).toEqual({
      path: "./lib/child",
      name: "Item"
    })
    expect(
      inspectGraphFile("src/main.rs", "mod child; use crate::child::Item; struct Root { value: Item }", {
        rustExternalModule: true
      })?.imports.size
    ).toBe(0)
  })

  it.each([
    "mod child; struct child; struct Root { value: child::Item }",
    "mod child; trait child {} struct Root { value: child::Item }",
    "mod child; union child { n: u8 } struct Root { value: child::Item }",
    "mod child; use child::Item as Root; struct Root;",
    "mod child; use child::Item as child; struct Root { value: child::Item }"
  ])("invalidates conflicting module/type/alias bindings %s", (source) => {
    const facts = inspectGraphFile("src/lib.rs", source, { rustCrateRoot: true })
    expect(facts?.imports.size).toBe(0)
    expect(facts?.declarations.get("Root")?.references.some((reference) => reference.kind === "unsupported")).toBe(true)
  })

  it("keeps a generic parameter from resolving through a shadowed module", () => {
    const facts = inspectGraphFile("src/lib.rs", "mod T; struct Root<T> { bad: T::Item, explicit: self::T::Item }", {
      rustCrateRoot: true
    })
    expect(facts?.declarations.get("Root")?.references).toEqual([
      { kind: "unsupported", name: "T::Item" },
      { kind: "named", name: "self::T::Item" }
    ])
  })

  it("derives child module directories from the containing Rust file", () => {
    const source = "mod child; use child::Item as Alias; struct Root { value: Alias }"
    for (const [path, expected] of [
      ["src/main.rs", "./child"],
      ["src/lib.rs", "./child"],
      ["src/foo/mod.rs", "./child"],
      ["src/foo.rs", "./foo/child"]
    ]) {
      expect(
        inspectGraphFile(path!, source, {
          rustCrateRoot: path === "src/main.rs" || path === "src/lib.rs",
          rustExternalModule: path === "src/foo.rs" || path === "src/foo/mod.rs"
        })?.imports.get("Alias")?.path
      ).toBe(expected)
    }
    expect(inspectGraphFile("src/foo.rs", source)?.declarations.get("Root")?.exported).toBe(false)
  })

  it.each([
    "use external::Item; struct Root { value: Item }",
    "mod child { pub struct Item; } use child::Item; struct Root { value: Item }",
    "mod child; use child::*; struct Root { value: String }",
    "mod child; pub use child::Item; struct Root { value: Item }",

    '#[path = "other.rs"] mod child; use child::Item; struct Root { value: Item }',
    "mod child; use child::nested::Item; struct Root { value: Item }"
  ])("does not invent graph bindings for unsupported namespace syntax %s", (source) => {
    const facts = inspectGraphFile("src/lib.rs", source, { rustCrateRoot: true })
    expect(facts?.imports.size).toBe(0)
    expect(facts?.declarations.get("Root")?.references.some((reference) => reference.kind === "unsupported")).toBe(true)
  })

  it("closes tuple and named enum payloads through nested prelude wrappers", () => {
    const source = `struct Receipt { id: String }
struct Failure { reason: String }
enum Delivery { Waiting, Delivered(Receipt), Failed { error: Failure } }
struct Session { receipt: Option<Receipt>, result: Result<Receipt, Failure>, history: Vec<Option<Receipt>> }`
    const results = units(source)
    expect(results.every((result) => result.status === "ready")).toBe(true)
    expect(results.at(-1)?.unit.root.references.map((reference) => reference.site.symbol)).toEqual([
      "Receipt",
      "Failure"
    ])
    expect(results[2]?.unit.root.artifact.kind).toBe("enum")
    expect(combinedAnalyzerMaterializationPreflight("src/model.rs", source)?.declarations).toBe(4)
  })

  it("binds local names before prelude wrapper names", () => {
    const results = units("struct Option { id: u8 } struct Vec { id: u8 } struct Root { a: Option, b: Vec }")
    expect(results.at(-1)?.unit.root.references.map((reference) => reference.kind)).toEqual(["expanded", "expanded"])
  })

  it("supports type parameters while retaining default type evidence", () => {
    expect(units("type Alias<T> = Option<T>;")[0]?.status).toBe("ready")
    expect(units("type Alias<T = Missing> = Option<T>;")[0]?.status).toBe("unsupported")
  })

  it.each([
    '#[cfg(feature = "x")] struct Root { x: u8 }',
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
    'extern "C" { type String; } struct Root { value: String }'
  ])("retains incomplete evidence for %s", (source) => {
    expect(units(source).every((result) => result.status === "unsupported")).toBe(true)
  })

  it("retains exact attributes and declaration ranges for attribution", () => {
    const source = "// leading\n#[derive(Clone)]\n\n// between\npub struct Root { x: u8 }\nstruct Other;"
    const root = inspectGraphFile("src/model.rs", source)?.declarations.get("Root")
    expect(root?.artifact.source).toBe("#[derive(Clone)]\n\n// between\npub struct Root { x: u8 }")
    expect(root?.location).toEqual({ start: { line: 2, column: 1 }, end: { line: 5, column: 26 } })
    expect(root?.references).toEqual([{ kind: "unsupported", name: "Root" }])
  })

  it("contains cycles and enforces declaration and reference bounds", () => {
    expect(units("struct A { x: Option<B> } struct B { x: Box<A> }")[0]?.unit.root.references[0]?.kind).toBe("expanded")
    expect(
      analyzeTypeFile(
        "a.rs",
        Array.from({ length: MAX_TYPE_DECLARATIONS + 1 }, (_, index) => `struct T${index};`).join("\n")
      )
    ).toMatchObject({ status: "unsupported", reason: "declaration-limit" })
    expect(
      units(
        `struct Root { ${Array.from({ length: 17 }, (_, index) => `v${index}: T${index}`).join(",")} } ${Array.from({ length: 17 }, (_, index) => `struct T${index};`).join(" ")}`
      )[0]
    ).toMatchObject({ status: "unsupported", reason: "reference-limit" })
  })

  it("does not infer declarations from function or nested module bodies", () => {
    expect(analyzeTypeFile("a.rs", "fn main() { struct Hidden; }")).toMatchObject({
      status: "unsupported",
      reason: "no-declarations"
    })
    expect(analyzeTypeFile("a.rs", "struct Bad { x: }")).toMatchObject({ status: "unsupported", reason: "parse" })
  })
})
