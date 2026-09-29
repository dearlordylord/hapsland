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
    expect(resolveFunctionUnit(file, "f")?.references.map((edge) => edge.target.kind)).toEqual([
      "unsupported", "unsupported", "unsupported", "unresolved", "unresolved",
    ]);
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
