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

  it("rejects inapplicable files, malformed syntax, and nested-only functions", () => {
    expect(analyzeFunctionFile("a.js", "function f() {}" )).toBeUndefined();
    expect(analyzeFunctionFile("a.ts", "function f( {" )).toBeUndefined();
    const file = analyzeFunctionFile("a.ts", "const f = () => 1; class C { method() {} }");
    expect(file?.functions.size).toBe(0);
  });
});
