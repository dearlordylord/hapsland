import fc from "fast-check";
import { expect, it } from "vitest";
import { JsoncParseError, parseJsonc } from "./jsonc.ts";

it("agrees with JSON.parse for JSON values surrounded by JSONC comments", () => {
  fc.assert(
    fc.property(
      fc.jsonValue({ maxDepth: 3 }),
      fc.constantFrom("", " ", "\n", "\r\n", "/* block\ncomment */", "// line\r\n"),
      (value, padding) => {
        const encoded = JSON.stringify(value);
        expect(parseJsonc(`${padding}${encoded}${padding}`)).toEqual(JSON.parse(encoded));
        expect(parseJsonc(`[${padding}${encoded},${padding}]`)).toEqual([JSON.parse(encoded)]);
        expect(parseJsonc(`{${padding}"value":${encoded},${padding}}`)).toEqual({ value: JSON.parse(encoded) });
      },
    ),
    { numRuns: 150, seed: 5918 },
  );
});

it("rejects duplicate decoded keys independently of spelling or nesting", () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 24 }), (key) => {
      const escaped =
        '"' +
        [...key]
          .map((character) => {
            const encoded = JSON.stringify(character).slice(1, -1);
            return character.length === 1 ? `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}` : encoded;
          })
          .join("") +
        '"';
      const duplicate = `{${JSON.stringify(key)}:0,${escaped}:1}`;
      expect(() => parseJsonc(`[${duplicate}]`)).toThrow(JsoncParseError);
      expect(() => parseJsonc(duplicate)).toThrow(`duplicate object key '${key}'`);
      expect(parseJsonc(`[{${JSON.stringify(key)}:0},{${JSON.stringify(key)}:1}]`)).toEqual([
        { [key]: 0 },
        { [key]: 1 },
      ]);
    }),
    { numRuns: 100, seed: 1821 },
  );
});

it.each([
  ['"// /* */ ,] } \\" \\\\ 😀"', '// /* */ ,] } " \\ 😀'],
  ['/* before */ {"value":"*/ //",} // after', { value: "*/ //" }],
  ["[1,/* comma */2,\r\n]", [1, 2]],
])("preserves string data while processing %s", (text, expected) => {
  expect(parseJsonc(text)).toEqual(expected);
});

it.each([
  ['"unfinished', "unterminated string literal"],
  ["/* unfinished", "unterminated comment at offset 0"],
  ["{word:1}", "expected object key at offset 1"],
  ['{"a" 1}', "expected ':' at offset 5"],
  ['{"a":1 "b":2}', "expected ',' at offset 7"],
  ["[1 2]", "expected ',' at offset 3"],
  ["[", "unterminated array"],
  ["{", "unterminated object"],
  ["", "expected JSON value"],
  ["null trailing", "unexpected token at offset 5"],
  ['{"a":}', "configuration is not valid JSONC"],
])("reports the exact malformed-input diagnostic for %s", (text, message) => {
  expect(() => parseJsonc(text)).toThrow(message);
});
