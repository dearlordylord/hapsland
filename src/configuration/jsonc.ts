import { readFile } from "node:fs/promises";

export class JsoncParseError extends Error {
  readonly code = "jsonc_parse_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "JsoncParseError";
  }
}

/** Remove comments while preserving line/column offsets for diagnostics. */
const stripComments = (text: string): string => {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let blockStart = -1;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (current === "\n" || current === "\r") {
        lineComment = false;
        output += current;
      } else {
        output += " ";
      }
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        output += "  ";
        index += 1;
      } else {
        output += current === "\n" || current === "\r" ? current : " ";
      }
      continue;
    }
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
    } else if (current === "/" && next === "/") {
      lineComment = true;
      output += "  ";
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      blockStart = index;
      output += "  ";
      index += 1;
    } else {
      output += current;
    }
  }
  if (inString) throw new JsoncParseError("unterminated string literal");
  if (blockComment) throw new JsoncParseError(`unterminated comment at offset ${blockStart}`);
  return output;
};

const removeTrailingCommas = (text: string): string => {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    if (inString) {
      output += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }
    if (current === ",") {
      let cursor = index + 1;
      while (/\s/.test(text[cursor] ?? "")) cursor += 1;
      if (text[cursor] === "}" || text[cursor] === "]") continue;
    }
    output += current;
  }
  return output;
};

/**
 * Scan object keys before JSON.parse. JSON.parse intentionally accepts duplicate
 * keys with last-write-wins semantics; configuration must reject that ambiguity.
 */
const rejectDuplicateKeys = (text: string): void => {
  let index = 0;

  const skipWhitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };
  const stringEnd = (): number => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const current = text[index];
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') {
        index += 1;
        return index;
      }
      index += 1;
    }
    throw new JsoncParseError(`unterminated string at offset ${start}`);
  };
  const parseValue = (): void => {
    skipWhitespace();
    const current = text[index];
    if (current === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        if (text[index] !== '"') throw new JsoncParseError(`expected object key at offset ${index}`);
        const tokenStart = index;
        const end = stringEnd();
        const decodedKey = JSON.parse(text.slice(tokenStart, end)) as unknown;
        if (typeof decodedKey !== "string") {
          throw new JsoncParseError(`invalid object key at offset ${tokenStart}`);
        }
        if (keys.has(decodedKey)) {
          throw new JsoncParseError(`duplicate object key '${decodedKey}'`);
        }
        keys.add(decodedKey);
        skipWhitespace();
        if (text[index] !== ":") throw new JsoncParseError(`expected ':' at offset ${index}`);
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new JsoncParseError(`expected ',' at offset ${index}`);
        index += 1;
      }
      throw new JsoncParseError("unterminated object");
    }
    if (current === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (index < text.length) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new JsoncParseError(`expected ',' at offset ${index}`);
        index += 1;
      }
      throw new JsoncParseError("unterminated array");
    }
    if (current === '"') {
      index = stringEnd();
      return;
    }
    while (index < text.length && !/[\s,}\]]/.test(text[index] ?? "")) index += 1;
    if (index === 0) throw new JsoncParseError("expected JSON value");
  };

  parseValue();
  skipWhitespace();
  if (index !== text.length) throw new JsoncParseError(`unexpected token at offset ${index}`);
};

export const parseJsonc = (text: string): unknown => {
  const withoutComments = stripComments(text);
  const normalized = removeTrailingCommas(withoutComments);
  rejectDuplicateKeys(normalized);
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new JsoncParseError("configuration is not valid JSONC");
  }
};

export const readJsonc = async (path: string): Promise<unknown> =>
  parseJsonc(await readFile(path, "utf8"));
