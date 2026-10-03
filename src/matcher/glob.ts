/**
 * Small, deterministic repository-relative glob matcher.
 *
 * This is deliberately not a Git-ignore matcher: `!` has no special meaning and
 * is rejected at configuration decoding time. Paths use `/`, matching is
 * case-sensitive, and a wildcard does not cross a separator. Dot-files are
 * matched only when the corresponding pattern segment starts with `.`.
 */

export class GlobPatternError extends Error {
  readonly code = "invalid_glob_pattern" as const;

  constructor(message: string) {
    super(message);
    this.name = "GlobPatternError";
  }
}

/** Bounded dialect limits keep validation and matching predictable. */
export const GLOB_COMPLEXITY_LIMITS = {
  maxPatternLength: 1_024,
  maxBraceGroups: 8,
  maxBraceChoices: 8,
  maxExpansions: 256,
} as const;

export const normalizeRepositoryPath = (value: string): string | undefined => {
  if (value.includes("\0")) return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return undefined;
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "..")) return undefined;
  return segments.join("/") || ".";
};

const normalizeGlobPattern = (pattern: string): string => {
  if (pattern.length === 0) throw new GlobPatternError("glob pattern is empty");
  if (pattern.includes("\0")) throw new GlobPatternError("glob pattern contains NUL");
  if (pattern.startsWith("!")) throw new GlobPatternError("negated re-inclusion patterns are not supported");
  const normalized = pattern.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new GlobPatternError("glob patterns must be repository-relative");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new GlobPatternError("glob patterns cannot traverse the repository root");
  }
  return normalized === "." ? "" : normalized.replace(/^\.\//, "");
};

const validateClassRange = (content: string, index: number) => {
  const left = content[index - 1];
  const right = content[index + 1];
  if (left === undefined || right === undefined || right === "-") return;
  if ((left.codePointAt(0) ?? 0) > (right.codePointAt(0) ?? 0)) {
    throw new GlobPatternError("glob character class range is reversed");
  }
};

const validateCharacterClass = (pattern: string, start: number): number => {
  const close = pattern.indexOf("]", start + 1);
  if (close < 0) throw new GlobPatternError("glob character class is not closed");
  const body = pattern.slice(start + 1, close);
  const { content } = classContent(body);
  if (content.length === 0 || content.includes("[")) {
    throw new GlobPatternError("glob character class is empty or nested");
  }
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "-") validateClassRange(content, index);
  }
  return close;
};

const braceChoices = (pattern: string, start: number) => {
  const close = pattern.indexOf("}", start + 1);
  if (close < 0) throw new GlobPatternError("glob brace alternative is not closed");
  const choices = pattern.slice(start + 1, close).split(",");
  if (choices.length < 2 || choices.some((choice) => choice.length === 0 || choice.includes("{"))) {
    throw new GlobPatternError("glob brace alternative must contain non-empty choices");
  }
  return { close, count: choices.length };
};

const validateExpansionBudget = (groups: number, expansions: number, choices: number) => {
  if (groups > GLOB_COMPLEXITY_LIMITS.maxBraceGroups) {
    throw new GlobPatternError(`glob pattern exceeds the ${GLOB_COMPLEXITY_LIMITS.maxBraceGroups}-group limit`);
  }
  if (choices > GLOB_COMPLEXITY_LIMITS.maxBraceChoices) {
    throw new GlobPatternError(
      `glob brace alternatives exceed the ${GLOB_COMPLEXITY_LIMITS.maxBraceChoices}-choice limit`,
    );
  }
  if (expansions > GLOB_COMPLEXITY_LIMITS.maxExpansions / choices) {
    throw new GlobPatternError(
      `glob brace expansion exceeds the ${GLOB_COMPLEXITY_LIMITS.maxExpansions}-expansion limit`,
    );
  }
};

const validateGlobStructure = (pattern: string) => {
  let groups = 0;
  let expansions = 1;
  for (let index = 0; index < pattern.length; index += 1) {
    switch (pattern[index]) {
      case "[":
        index = validateCharacterClass(pattern, index);
        break;
      case "]":
        throw new GlobPatternError("glob character class closes without opening");
      case "{": {
        const choices = braceChoices(pattern, index);
        groups += 1;
        validateExpansionBudget(groups, expansions, choices.count);
        expansions *= choices.count;
        index = choices.close;
        break;
      }
      case "}":
        throw new GlobPatternError("glob brace alternative closes without opening");
    }
  }
};

export const validateGlobPattern = (pattern: string): string => {
  const canonical = normalizeGlobPattern(pattern);
  if (canonical.length > GLOB_COMPLEXITY_LIMITS.maxPatternLength) {
    throw new GlobPatternError(`glob pattern exceeds the ${GLOB_COMPLEXITY_LIMITS.maxPatternLength}-character limit`);
  }
  validateGlobStructure(canonical);
  try {
    // Compile at the decode boundary to catch engine-level invalid classes.
    expandBraces(canonical).forEach((expanded) => compile(expanded));
  } catch {
    throw new GlobPatternError("glob pattern contains invalid regular-expression syntax");
  }
  return canonical;
};

const escapeRegex = (value: string): string => value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

const expandBraces = (pattern: string): ReadonlyArray<string> => {
  const start = pattern.indexOf("{");
  if (start < 0) return [pattern];
  const end = pattern.indexOf("}", start + 1);
  if (end < 0) return [pattern];
  const choices = pattern
    .slice(start + 1, end)
    .split(",")
    .filter((choice) => choice.length > 0);
  if (choices.length === 0) return [pattern];
  return choices.flatMap((choice) => expandBraces(`${pattern.slice(0, start)}${choice}${pattern.slice(end + 1)}`));
};

const classContent = (body: string) => {
  const negated = body.startsWith("!") || body.startsWith("^");
  return { negated, content: negated ? body.slice(1) : body };
};

const compileCharacterClass = (segment: string, index: number) => {
  const close = segment.indexOf("]", index + 1);
  if (close <= index + 1) return { expression: "\\[", end: index };
  const { negated, content } = classContent(segment.slice(index + 1, close));
  return { expression: `[${negated ? "^" : ""}${content.replaceAll("\\", "\\\\")}]`, end: close };
};

const segmentRegex = (segment: string): string => {
  let result = "";
  for (let index = 0; index < segment.length; index += 1) {
    const current = segment[index];
    switch (current) {
      case "*":
        result += "[^/]*";
        break;
      case "?":
        result += "[^/]";
        break;
      case "[": {
        const compiled = compileCharacterClass(segment, index);
        result += compiled.expression;
        index = compiled.end;
        break;
      }
      default:
        result += escapeRegex(current ?? "");
    }
  }
  return result;
};

const compile = (pattern: string): RegExp => {
  const segments = pattern.split("/");
  let expression = "^";
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    if (index > 0 && segments[index - 1] !== "**") expression += "/";
    if (segment === "**") {
      if (isLast) expression += ".*";
      else expression += "(?:[^/]+/)*";
      return;
    }
    expression += segmentRegex(segment);
  });
  return new RegExp(`${expression}$`);
};

const dotSegmentsAllowed = (pattern: string, path: string): boolean => {
  const patternSegments = pattern.split("/");
  const pathSegments = path.split("/");
  // A globstar may consume zero or more non-hidden segments. Hidden path
  // segments must be introduced by an explicit dot segment in the pattern.
  let patternIndex = 0;
  for (const pathSegment of pathSegments) {
    if (!pathSegment.startsWith(".")) {
      if (patternSegments[patternIndex] !== "**") patternIndex += 1;
      continue;
    }
    let matchedExplicitDot = false;
    while (patternIndex < patternSegments.length) {
      const candidate = patternSegments[patternIndex];
      if (candidate === "**") {
        patternIndex += 1;
        continue;
      }
      matchedExplicitDot = candidate?.startsWith(".") ?? false;
      break;
    }
    if (!matchedExplicitDot) return false;
    patternIndex += 1;
  }
  return true;
};

/** Compile and match one repository-relative path against one glob. */
export const matchesGlob = (pattern: string, path: string): boolean => {
  let validated: string;
  try {
    validated = validateGlobPattern(pattern);
  } catch {
    // Callers may use this low-level matcher with untrusted input. Configuration
    // decoding rejects invalid syntax; direct matching remains total as well.
    return false;
  }
  const normalizedPath = normalizeRepositoryPath(path);
  if (normalizedPath === undefined) return false;
  const candidate = normalizedPath === "." ? "" : normalizedPath;
  try {
    return expandBraces(validated).some(
      (expanded) => dotSegmentsAllowed(expanded, normalizedPath) && compile(expanded).test(candidate),
    );
  } catch {
    // RegExp syntax must never escape from this boundary, even if a future
    // matcher feature is added without a corresponding decoder check.
    return false;
  }
};

export const matchesAnyGlob = (patterns: ReadonlyArray<string>, path: string): boolean =>
  patterns.some((pattern) => matchesGlob(pattern, path));

export const globPatternsEqual = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((pattern, index) => pattern === right[index]);
