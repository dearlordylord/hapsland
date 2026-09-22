import { describe, expect, it } from "vitest";
import {
  analyzeSingleType,
  analyzeTypeFile,
  MAX_REFERENCED_NAMES,
  MAX_TYPE_DECLARATIONS,
  readyTypeUnits,
} from "./analyzer.ts";

describe("initial direct-event TypeScript analyzer", () => {
  it.each(["ts", "tsx", "mts", "cts"])("accepts one named reference-free .%s declaration", (extension) => {
    expect(analyzeSingleType(`a.${extension}`, "interface Account { count: number }")).toMatchObject({
      kind: "interface",
      name: "Account",
    });
  });

  it("accepts a BOM and extracts only the declaration", () => {
    const result = analyzeSingleType("a.ts", "\ufeff// sibling comment\ntype OrderCount = number\n");
    expect(result?.source).toBe("type OrderCount = number");
  });

  it.each([
    ["unsupported extension", "a.js", "interface A { x: number }"],
    ["no type", "a.ts", "const value = 1"],
    ["two roots", "a.ts", "interface A {}\ninterface B {}"],
    ["merged root", "a.ts", "interface A {}\ninterface A { x: number }"],
    ["required reference", "a.ts", "interface A { child: B }"],
    ["qualified reference", "a.ts", "interface A { child: NS.B }"],
    ["qualified extension", "a.ts", "interface A extends NS.B { count: number }"],
    ["value type query", "a.ts", "type A = typeof external"],
    ["qualified value type query", "a.ts", "type A = typeof NS.external"],
    ["computed external name", "a.ts", "interface A { [external]: string }"],
    ["qualified computed name", "a.ts", "interface A { [NS.key]: string }"],
    ["unsupported nested generic scope", "a.ts", "interface A { value: T; fn: <T>() => T }"],
    ["imported reference", "a.ts", "import type { B } from './b'; interface A { child: B }"],
    ["imports", "a.ts", "import './side-effect'; interface A { count: number }"],
    ["parse failure", "a.ts", "interface A {"],
  ])("quietly rejects %s", (_label, path, source) => {
    expect(analyzeSingleType(path, source)).toBeUndefined();
  });

  it("contains deeply nested bounded input without recursive traversal", () => {
    const depth = 8_000;
    const source = `type Deep = ${"(".repeat(depth)}number${")".repeat(depth)}`;
    expect(Buffer.byteLength(source)).toBeLessThan(32_768);
    expect(() => analyzeSingleType("deep.ts", source)).not.toThrow();
  });

  it("accepts references bound by the declaration's own generic scope", () => {
    expect(analyzeSingleType("generic.ts", "interface Box<T> { value: T }")).toMatchObject({
      name: "Box",
    });
  });

  it("extracts independent roots with finite recursive expanded and included evidence", () => {
    const analysis = analyzeTypeFile(
      "types.ts",
      "interface A { child: B }\ninterface B { parent: A }\ninterface C { value: string }",
    );
    expect(analysis.status).toBe("analyzed");
    if (analysis.status !== "analyzed") return;
    const a = analysis.units.find((item) => item.status === "ready" && item.unit.root.artifact.name === "A");
    expect(a?.status).toBe("ready");
    if (a?.status !== "ready") return;
    expect(a.unit.root.references).toHaveLength(1);
    const toB = a.unit.root.references[0];
    expect(toB?.kind).toBe("expanded");
    if (toB?.kind !== "expanded") return;
    expect(toB.node.artifact.name).toBe("B");
    expect(toB.node.references).toEqual([{
      kind: "included",
      site: { symbol: "A" },
      target: "types.ts:interface:A",
    }]);
    expect(a.unit.root.artifact.name).toBe("A");
  });

  it("records omitted evidence and never promotes missing or unsupported references", () => {
    for (const source of [
      "interface A { child: Missing }",
      "interface A { child: NS.B }",
      "type A = typeof external",
      "interface A { [external]: string }",
    ]) {
      const analysis = analyzeTypeFile("types.ts", source);
      expect(analysis.status).toBe("analyzed");
      if (analysis.status !== "analyzed") continue;
      expect(analysis.units[0]?.status).toBe("unsupported");
      const outcome = analysis.units[0];
      if (outcome?.status !== "unsupported") continue;
      expect(outcome.unit.root.references.some(({ kind }) => kind === "omitted")).toBe(true);
      expect(readyTypeUnits("types.ts", source)).toEqual([]);
    }
  });

  it("accepts exactly 64 declarations and rejects the 65th", () => {
    const declarations = Array.from(
      { length: MAX_TYPE_DECLARATIONS },
      (_, index) => `interface T${index} { value: string }`,
    );
    expect(readyTypeUnits("types.ts", declarations.join("\n"))).toHaveLength(MAX_TYPE_DECLARATIONS);
    const above = analyzeTypeFile("types.ts", [...declarations, "interface TooMany {}"].join("\n"));
    expect(above).toEqual({ status: "unsupported", reason: "declaration-limit", units: [] });
  });

  it("accepts exactly 16 referenced names excluding the root and rejects the 17th", () => {
    const declarations = Array.from(
      { length: MAX_REFERENCED_NAMES + 1 },
      (_, index) => `interface T${index} { next: ${index === MAX_REFERENCED_NAMES ? "string" : `T${index + 1}`} }`,
    );
    const exact = readyTypeUnits("types.ts", declarations.slice(0, MAX_REFERENCED_NAMES + 1).join("\n"));
    expect(exact.some(({ root }) => root.artifact.name === "T0")).toBe(true);

    const aboveSource = [
      `interface Root { ${Array.from({ length: MAX_REFERENCED_NAMES + 1 }, (_, index) => `p${index}: T${index}`).join("; ")} }`,
      ...Array.from({ length: MAX_REFERENCED_NAMES + 1 }, (_, index) => `interface T${index} { value: string }`),
    ].join("\n");
    const above = analyzeTypeFile("types.ts", aboveSource);
    expect(above.status).toBe("analyzed");
    if (above.status !== "analyzed") return;
    expect(above.units.find((item) =>
      (item.status === "ready" ? item.unit.root.artifact.name : item.root.name) === "Root")?.status
    ).toBe("unsupported");
  });

  it("rejects imports, declaration merging, and unsupported schema-only files", () => {
    expect(analyzeTypeFile("a.ts", "import type { B } from './b'; interface A { b: B }")).toMatchObject({ status: "unsupported", reason: "import" });
    expect(analyzeTypeFile("a.ts", "interface A {}\ninterface A { x: string }")).toMatchObject({ status: "unsupported", reason: "declaration-merge" });
    expect(analyzeTypeFile("a.ts", "const A = Schema.Struct({ value: Schema.String })")).toMatchObject({ status: "unsupported", reason: "no-declarations" });
  });

  it.each([
    "type A = import('./b').B",
    "export import A = B.C",
    "type A = typeof import('./b')",
    "interface A { value: import('./b').B }",
    "import A = require('./b'); type B = A.Value",
  ])("rejects every import syntax/evidence form: %s", (source) => {
    expect(analyzeTypeFile("a.ts", source)).toEqual({
      status: "unsupported",
      reason: "import",
      units: [],
    });
  });
});
