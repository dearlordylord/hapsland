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
    expect(() => decodeConfigurationText(
      persisted,
      "malformed-glob-z-a.jsonc",
    )).toThrowError(ConfigurationError);
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
      fc.array(fc.constantFrom("a", "!", "[", "-"), { minLength: 0, maxLength: 8 })
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
});
