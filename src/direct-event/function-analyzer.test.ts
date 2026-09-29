import { describe, expect, it } from "vitest";
import { analyzeFunctionFile } from "./function-analyzer.ts";
import { resolveFunctionUnit } from "./function-resolver.ts";

describe("function native facts", () => {
  it("retains the full function body and binds ordered type/call references", () => {
    const file = analyzeFunctionFile("src/a.ts", [
      "import type { Thing as Item } from './thing';",
      "import { help as helper } from './help';",
      "interface Local { value: number }",
      "function sibling(x: Local): Local { return x }",
      "export function run(item: Item): Local { helper(item); return sibling({ value: 1 }) }",
    ].join("\n"));
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(file.functions.get("run")?.artifact.source).toContain("return sibling({ value: 1 })");
    expect(file.functions.get("run")?.exported).toBe(true);
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => [edge.reference.kind, edge.reference.name, edge.target.kind])).toEqual([
      ["named-type", "Item", "import"],
      ["named-type", "Local", "local"],
      ["named-function", "helper", "import"],
      ["named-function", "sibling", "local"],
    ]);
  });

  it("keeps overload groups and duplicate functions ambiguous", () => {
    expect(analyzeFunctionFile("a.ts", "function f(x: string): string; function f(x: string) { return x }" )).toBeUndefined();
    expect(analyzeFunctionFile("a.ts", "function f() {} function f() {}" )).toBeUndefined();
  });

  it("does not invent a binding for dynamic or shadowed calls", () => {
    const file = analyzeFunctionFile("a.ts", "function f(helper: () => void) { helper(); obj.method(); factory()[key](); missing() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    const facts = resolveFunctionUnit(file, "f")?.references ?? [];
    expect(facts.some((edge) => edge.reference.name === "helper" && edge.target.kind === "unsupported")).toBe(true);
    expect(facts.some((edge) => edge.reference.name === "missing" && edge.target.kind === "unresolved")).toBe(true);
    expect(facts.some((edge) => edge.reference.name === "obj" && edge.target.kind === "unsupported")).toBe(true);
  });

  it("emits no outbound facts for constants and bound parameter reads", () => {
    for (const source of ["function run() { return 1 }", "function run(value: number) { return value }"]) {
      const file = analyzeFunctionFile("a.ts", source);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      expect(resolveFunctionUnit(file, "run")?.references).toEqual([]);
    }
  });

  it("keeps a named helper call as supported evidence", () => {
    const file = analyzeFunctionFile("a.ts", "function helper() { return 1 } function run() { return helper() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => [edge.reference.kind, edge.reference.name, edge.target.kind])).toEqual([
      ["named-function", "helper", "local"],
    ]);
  });

  it("keeps a bare named function value as supporting evidence", () => {
    const file = analyzeFunctionFile("a.ts", "function helper() { return 1 } function run() { return helper }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => [edge.reference.kind, edge.reference.name, edge.target.kind])).toEqual([
      ["named-function", "helper", "local"],
    ]);
  });

  it("keeps a named imported function value and rejects a type-only value use", () => {
    const valueFile = analyzeFunctionFile("a.ts", "import { helper } from './helper'; function run() { return helper }");
    expect(valueFile).toBeDefined();
    if (valueFile !== undefined) {
      expect(resolveFunctionUnit(valueFile, "run")?.references.map((edge) => edge.target.kind)).toEqual(["import"]);
    }
    const typeFile = analyzeFunctionFile("a.ts", "import type { helper } from './helper'; function run() { return helper }");
    expect(typeFile).toBeDefined();
    if (typeFile !== undefined) {
      expect(resolveFunctionUnit(typeFile, "run")?.references.map((edge) => edge.target.kind)).toEqual(["unsupported"]);
    }
  });

  it("marks ambient member and bare value reads unsupported", () => {
    for (const [source, name] of [
      ["function helper() { return globalThis.fetch }", "globalThis"],
      ["function helper() { return globalCounter }", "globalCounter"],
      ["function helper() { return Math.random() }", "Math"],
      ["function helper() { return Date.now() }", "Date"],
      ["function helper() { return this.fetch }", "this"],
      ["function helper() { return import.meta.env }", "import.meta"],
    ] as const) {
      const file = analyzeFunctionFile("a.ts", source);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      expect(resolveFunctionUnit(file, "helper")?.references.some((edge) =>
        edge.reference.name === name && edge.target.kind === "unsupported"
      )).toBe(true);
    }
  });

  it("exposes an ambient helper as incomplete supporting evidence for its caller", () => {
    const file = analyzeFunctionFile("a.ts", "function helper() { return globalThis.fetch } function run() { return helper() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => edge.target.kind)).toEqual(["local"]);
    expect(resolveFunctionUnit(file, "helper")?.references.some((edge) => edge.target.kind === "unsupported")).toBe(true);
  });

  it("retains imports whose local names also name intrinsic types", () => {
    const file = analyzeFunctionFile("a.ts", "import type { Map } from './custom'; export function read(value: Map): Map { return value }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "read")?.references.map((edge) => [edge.reference.name, edge.target.kind])).toEqual([
      ["Map", "import"], ["Map", "import"],
    ]);
  });

  it("retains a local type whose name also names an intrinsic type", () => {
    const file = analyzeFunctionFile("a.ts", "interface Map { value: string } function read(value: Map): Map { return value }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "read")?.references.map((edge) => edge.target.kind)).toEqual(["local", "local"]);
  });

  it("marks destructured bindings uncertain instead of binding calls to a top-level function", () => {
    for (const source of [
      "function helper() {} function run({ helper }: { helper: () => void }) { helper() }",
      "function helper() {} function run(value: unknown) { const { helper } = value as { helper: () => void }; helper() }",
    ]) {
      const file = analyzeFunctionFile("a.ts", source);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      const edges = resolveFunctionUnit(file, "run")?.references;
      expect(edges?.some((edge) => edge.target.kind === "unsupported")).toBe(true);
      expect(edges?.filter((edge) => edge.reference.kind === "named-function" && edge.reference.name === "helper")
        .every((edge) => edge.target.kind === "unsupported")).toBe(true);
    }
  });

  it("marks catch, for-in/of, and nested declarations uncertain", () => {
    for (const body of [
      "try {} catch (helper) { helper() }",
      "for (const helper of values) helper()",
      "for (helper in values) helper()",
      "{ function helper() {} helper() }",
      "{ class helper {} helper() }",
    ]) {
      const file = analyzeFunctionFile("a.ts", `function helper() {} function run(values: any) { ${body} }`);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      const edges = resolveFunctionUnit(file, "run")?.references ?? [];
      expect(edges.some((edge) => edge.target.kind === "unsupported")).toBe(true);
      expect(edges.filter((edge) => edge.reference.name === "helper").every((edge) => edge.target.kind !== "local")).toBe(true);
    }
  });

  it("rejects top-level value collisions and preserves named import aliases", () => {
    expect(analyzeFunctionFile("a.ts", "const helper = 1; function helper() {} function run() { helper() }" )).toBeUndefined();
    const file = analyzeFunctionFile("a.ts", "import { helper as localHelp } from './helper'; function run() { localHelp() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => edge.target.kind)).toEqual(["import"]);
  });

  it("marks reassigned top-level function bindings uncertain", () => {
    const file = analyzeFunctionFile("a.ts", "function helper() {} function run(other: () => void) { helper = other; helper() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    expect(resolveFunctionUnit(file, "run")?.references.map((edge) => edge.target.kind)).toContain("unsupported");
    expect(resolveFunctionUnit(file, "run")?.references.some((edge) => edge.reference.name === "helper" && edge.target.kind === "local")).toBe(false);
  });

  it("marks object and array assignment patterns uncertain", () => {
    for (const write of ["({ helper } = value)", "[helper] = value"]) {
      const file = analyzeFunctionFile("a.ts", `function helper() {} function run(value: any) { ${write}; helper() }`);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      const edges = resolveFunctionUnit(file, "run")?.references ?? [];
      expect(edges.some((edge) => edge.target.kind === "unsupported")).toBe(true);
      expect(edges.some((edge) => edge.reference.name === "helper" && edge.target.kind === "local")).toBe(false);
    }
  });

  it("marks compound and update writes of a bound function uncertain", () => {
    for (const write of ["helper += value", "helper &&= value", "++helper", "helper--"]) {
      const file = analyzeFunctionFile("a.ts", `function helper() {} function run(value: any) { ${write}; helper() }`);
      expect(file).toBeDefined();
      if (file === undefined) continue;
      const edges = resolveFunctionUnit(file, "run")?.references ?? [];
      expect(edges.some((edge) => edge.target.kind === "unsupported")).toBe(true);
      expect(edges.some((edge) => edge.reference.name === "helper" && edge.target.kind === "local")).toBe(false);
    }
  });

  it("rejects imports colliding with top-level variables or classes", () => {
    for (const declaration of ["const helper = 1", "class helper {}"]) {
      expect(analyzeFunctionFile("a.ts", `import { helper } from './helper'; ${declaration}; function run() { helper() }`)).toBeUndefined();
    }
  });

  it("marks parenthesized assignment targets uncertain", () => {
    const file = analyzeFunctionFile("a.ts", "function helper() {} function run(value: any) { (helper) = value; helper() }");
    expect(file).toBeDefined();
    if (file === undefined) return;
    const edges = resolveFunctionUnit(file, "run")?.references ?? [];
    expect(edges.some((edge) => edge.target.kind === "unsupported")).toBe(true);
    expect(edges.some((edge) => edge.reference.name === "helper" && edge.target.kind === "local")).toBe(false);
  });

  it("rejects inapplicable files, malformed syntax, and nested-only functions", () => {
    expect(analyzeFunctionFile("a.js", "function f() {}" )).toBeUndefined();
    expect(analyzeFunctionFile("a.ts", "function f( {" )).toBeUndefined();
    const file = analyzeFunctionFile("a.ts", "const f = () => 1; class C { method() {} }");
    expect(file?.functions.size).toBe(0);
  });
});
