import { describe, expect, it } from "vitest";
import { analyzeSingleType } from "./analyzer.ts";

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
    ["imported reference", "a.ts", "import type { B } from './b'; interface A { child: B }"],
    ["imports", "a.ts", "import './side-effect'; interface A { count: number }"],
    ["parse failure", "a.ts", "interface A {"],
  ])("quietly rejects %s", (_label, path, source) => {
    expect(analyzeSingleType(path, source)).toBeUndefined();
  });
});
