import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeConfigurationText } from "../configuration/decode.ts";
import { ConfigurationError } from "../configuration/errors.ts";
import { matchesGlob, validateGlobPattern } from "./glob.ts";

describe("repository glob validation", () => {
  it("rejects the persisted reversed-range regression at the field boundary", () => {
    const persisted = readFileSync(
      new URL("../configuration/fixtures/malformed-glob-z-a.jsonc", import.meta.url),
      "utf8",
    );
    expect(() => decodeConfigurationText(persisted, "malformed-glob-z-a.jsonc")).toThrowError(ConfigurationError);
    try {
      decodeConfigurationText('{"version":1,"includes":["[z-a]"]}', "malformed-glob-z-a.jsonc");
    } catch (error) {
      expect(error).toMatchObject({ field: "includes[0]" });
    }
  });

  it("keeps direct matching total for malformed patterns", () => {
    expect(() => matchesGlob("[z-a]", "src/example.ts")).not.toThrow();
    expect(matchesGlob("[z-a]", "src/example.ts")).toBe(false);
    expect(() => validateGlobPattern("src/[unterminated")).toThrow();
  });

  it("replays valid and invalid syntax generators with shrinking", () => {
    const validPatterns = fc.constantFrom("src/**", "**/*.ts", "src/[ab].ts", "src/{a,b}.ts");
    const invalidPatterns = fc.oneof(
      fc.constant("[z-a]"),
      fc.constant("[a--]"),
      fc.constant("src/[unterminated"),
      fc
        .array(fc.constantFrom("a", "!", "[", "-"), { minLength: 0, maxLength: 8 })
        .map((parts) => `src/[${parts.join("")}`),
    );
    fc.assert(
      fc.property(validPatterns, (pattern) => {
        expect(() => validateGlobPattern(pattern)).not.toThrow();
      }),
      { seed: 10_017, numRuns: 30 },
    );
    fc.assert(
      fc.property(invalidPatterns, (pattern) => {
        expect(() => validateGlobPattern(pattern)).toThrow();
        expect(matchesGlob(pattern, "src/example.ts")).toBe(false);
      }),
      { seed: 10_018, numRuns: 30 },
    );
  });

  it("rejects oversized brace expansion before materializing products", () => {
    const tooManyChoices = `src/{${Array.from({ length: 9 }, (_, index) => `v${index}`).join(",")}}`;
    const tooManyGroups = Array.from({ length: 9 }, () => "{a,b}").join("");
    const tooManyExpansions = Array.from({ length: 6 }, () => "{a,b,c}").join("");
    expect(() => validateGlobPattern(tooManyChoices)).toThrow(/choice limit/);
    expect(() => validateGlobPattern(tooManyGroups)).toThrow(/group limit/);
    expect(() => validateGlobPattern(tooManyExpansions)).toThrow(/expansion limit/);
    expect(() => validateGlobPattern("a".repeat(1_025))).toThrow(/character limit/);
    expect(matchesGlob(tooManyExpansions, "abc")).toBe(false);
  });
});

it.each([
  ["", "empty"],
  ["a\0b", "NUL"],
  ["!src/**", "negated"],
  ["/src/**", "repository-relative"],
  ["C:/src/**", "repository-relative"],
  ["src/../**", "traverse"],
  ["[]", "empty or nested"],
  ["[!a[b]", "empty or nested"],
  ["]", "without opening"],
  ["{a,b", "not closed"],
  ["{a}", "non-empty choices"],
  ["{a,}", "non-empty choices"],
  ["{{a,b}", "non-empty choices"],
  ["}", "without opening"],
])("rejects %j with its specific syntax error", (pattern, message) => {
  expect(() => validateGlobPattern(pattern)).toThrow(message);
  expect(matchesGlob(pattern, "src/a.ts")).toBe(false);
});

it.each([
  ["src/{a,b}.[tj]s", "src/a.ts", true],
  ["src/?.[!x]s", "src/a.ts", true],
  ["src/?.[^t]s", "src/a.ts", false],
  ["**/*.ts", ".hidden/a.ts", false],
  ["**/.hidden/*.ts", "src/.hidden/a.ts", true],
  ["**/.hidden/*.ts", "src/.other/a.ts", false],
  ["./src/**", "src/a.ts", true],
  [".", ".", false],
  ["**", "../a.ts", false],
  ["**", "/a.ts", false],
  ["**", "C:/a.ts", false],
  ["**", "a\0.ts", false],
])("matches %j against %j as %s", (pattern, path, expected) => {
  expect(matchesGlob(pattern, path)).toBe(expected);
});
