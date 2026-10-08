import { describe, expect, it } from "vitest"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/languages/typescript-functions"
import { MAX_TYPE_DECLARATIONS } from "@hapsland/source-analysis/direct-event/languages/contracts"
import { resolveFunctionUnit } from "@hapsland/source-analysis/direct-event/function-resolver"

describe("named TypeScript callable roots", () => {
  it("retains expression-body values as dependency evidence", () => {
    for (const wrapper of ["", "Effect.fnUntraced"]) {
      const callable = (value: string) => (wrapper ? `${wrapper}(() => ${value})` : `() => ${value}`)
      const prefix = 'import { Effect } from "effect"; const helper = () => 1; '
      const unknown = analyzeFunctionFile("a.ts", `${prefix}const run = ${callable("secret")};`)
      expect(unknown && resolveFunctionUnit(unknown, "run")?.references.map((edge) => edge.target.kind)).toEqual([
        "unsupported"
      ])
      const named = analyzeFunctionFile("a.ts", `${prefix}const run = ${callable("helper")};`)
      expect(
        named && resolveFunctionUnit(named, "run")?.references.map((edge) => [edge.reference.name, edge.target.kind])
      ).toEqual([["helper", "local"]])
    }
  })
  it("selects exported const arrows with exact source, location and bounded named dependencies", () => {
    const source = [
      "interface Item { value: number }",
      "const helper = (item: Item): Item => item;",
      "export const run = (item: Item): Item => helper(item);"
    ].join("\n")
    const file = analyzeFunctionFile("a.ts", source)
    expect(file?.functions.get("run")).toMatchObject({
      artifact: { name: "run", source: "export const run = (item: Item): Item => helper(item);" },
      exported: true,
      location: { start: { line: 3, column: 1 }, end: { line: 3, column: 55 } }
    })
    expect(
      file && resolveFunctionUnit(file, "run")?.references.map((edge) => [edge.reference.name, edge.target.kind])
    ).toEqual([
      ["Item", "local"],
      ["Item", "local"],
      ["helper", "local"]
    ])
  })

  it("binds single arrow parameters and preserves async and block bodies", () => {
    for (const source of [
      "export const run = value => value;",
      "export const run = async (value: number) => { return value };"
    ]) {
      const file = analyzeFunctionFile("a.ts", source)
      expect(file?.functions.get("run")?.artifact.source).toBe(source)
      expect(file && resolveFunctionUnit(file, "run")?.references).toEqual([])
    }
  })

  it("extracts idiomatic Effect callables from verified named and namespace imports", () => {
    for (const [binding, wrapper] of [
      ['import { Effect } from "effect";', 'Effect.fn("run")'],
      ['import { Effect as E } from "effect";', "E.fn"],
      ['import * as E from "effect/Effect";', "E.fnUntraced"]
    ]) {
      const declaration = `export const run = ${wrapper}(function* (value: number) { return value });`
      const file = analyzeFunctionFile("a.ts", `${binding}\n${declaration}`)
      expect(file?.functions.get("run")?.artifact.source).toBe(declaration)
      expect(file && resolveFunctionUnit(file, "run")?.references).toEqual([])
    }
  })

  it("isolates unrelated overloads and refuses their supporting implementations", () => {
    const file = analyzeFunctionFile(
      "a.ts",
      [
        "function overloaded(value: string): string;",
        "function overloaded(value: number): number;",
        "function overloaded(value: unknown) { return value }",
        "export const run = (value: number) => value;",
        "export const caller = () => overloaded(1);"
      ].join("\n")
    )
    expect(file?.functions.has("run")).toBe(true)
    expect(file?.functions.has("overloaded")).toBe(false)
    expect(file && resolveFunctionUnit(file, "caller")?.references.map((edge) => edge.target.kind)).toEqual([
      "unresolved"
    ])
    expect(file?.excludedFunctions.get("overloaded")?.reason).toBe("function-overload")
  })

  it("does not accept mutable, dynamic, shadowed or transformed callable bindings", () => {
    for (const source of [
      "let run = () => 1;",
      "const run = function () { return 1 };",
      "const first = () => 1, run = () => 2;",
      "const Effect = factory(); const run = Effect.fn(function* () { return 1 });",
      'import { Effect } from "other"; const run = Effect.fn(function* () { return 1 });',
      'import type { Effect } from "effect"; const run = Effect.fn(function* () { return 1 });',
      'import { Effect } from "effect"; const run = Effect.fn(label)(function* () { return 1 });',
      'import { Effect } from "effect"; const run = Effect.fn<Hidden>(function* () { return 1 });',
      'import { Effect } from "effect"; const run = Effect.fn(function* () { return 1 }, transform);'
    ]) {
      const file = analyzeFunctionFile("a.ts", source)
      expect(file?.functions.has("run")).toBe(false)
      expect(file?.excludedFunctions.get("run")?.reason).toBe("unsupported-callable")
    }
    expect(analyzeFunctionFile("a.ts", "const run = () => 1; const run = () => 2;")).toBeUndefined()
  })

  it("retains outer callable type annotations and lexical arguments as incomplete evidence", () => {
    const file = analyzeFunctionFile(
      "a.ts",
      "interface Item { value: number } export const run: (value: Item) => Item = value => value;"
    )
    expect(
      file && resolveFunctionUnit(file, "run")?.references.map((edge) => [edge.reference.name, edge.target.kind])
    ).toEqual([
      ["Item", "local"],
      ["Item", "local"]
    ])
    const lexical = analyzeFunctionFile("a.ts", "const run = () => arguments[0];")
    expect(lexical && resolveFunctionUnit(lexical, "run")?.references.map((edge) => edge.target.kind)).toEqual([
      "unsupported"
    ])
  })
  it("accepts 1024 callables and refuses the next declaration without publishing partial functions", () => {
    expect(MAX_TYPE_DECLARATIONS).toBe(1024)
    const atLimit = Array.from({ length: MAX_TYPE_DECLARATIONS }, (_, i) => `const f${i} = () => ${i};`).join("\n")
    expect(analyzeFunctionFile("a.ts", atLimit)?.functions.size).toBe(MAX_TYPE_DECLARATIONS)
    const source = Array.from({ length: MAX_TYPE_DECLARATIONS + 1 }, (_, i) => `const f${i} = () => ${i};`).join("\n")
    const file = analyzeFunctionFile("a.ts", source)
    expect(file?.failure).toBe("declaration-limit")
    expect(file?.functions.size).toBe(0)
    const excluded = analyzeFunctionFile(
      "a.ts",
      Array.from({ length: MAX_TYPE_DECLARATIONS + 1 }, (_, i) => `let f${i} = () => ${i};`).join("\n")
    )
    expect(excluded?.failure).toBe("declaration-limit")
    expect(excluded?.excludedFunctions.size).toBe(0)
  })
})
