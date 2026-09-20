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

export const normalizeRepositoryPath = (value: string): string | undefined => {
  if (value.includes("\0")) return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return undefined;
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "..")) return undefined;
  return segments.join("/") || ".";
};

export const validateGlobPattern = (pattern: string): string => {
  if (pattern.length === 0) throw new GlobPatternError("glob pattern is empty");
  if (pattern.includes("\0")) throw new GlobPatternError("glob pattern contains NUL");
  if (pattern.startsWith("!")) {
    throw new GlobPatternError("negated re-inclusion patterns are not supported");
  }
  const normalized = pattern.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new GlobPatternError("glob patterns must be repository-relative");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new GlobPatternError("glob patterns cannot traverse the repository root");
  }
  return normalized === "." ? "" : normalized.replace(/^\.\//, "");
};

const escapeRegex = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

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
  return choices.flatMap((choice) =>
    expandBraces(`${pattern.slice(0, start)}${choice}${pattern.slice(end + 1)}`),
  );
};

const segmentRegex = (segment: string): string => {
  let result = "";
  for (let index = 0; index < segment.length; index += 1) {
    const current = segment[index];
    if (current === "*") {
      result += "[^/]*";
    } else if (current === "?") {
      result += "[^/]";
    } else if (current === "[") {
      const close = segment.indexOf("]", index + 1);
      if (close > index + 1) {
        const body = segment.slice(index + 1, close);
        const negated = body.startsWith("!") || body.startsWith("^");
        const content = negated ? body.slice(1) : body;
        result += `[${negated ? "^" : ""}${content.replaceAll("\\", "\\\\")}]`;
        index = close;
      } else {
        result += "\\[";
      }
    } else {
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
  const validated = validateGlobPattern(pattern);
  const normalizedPath = normalizeRepositoryPath(path);
  if (normalizedPath === undefined) return false;
  const candidate = normalizedPath === "." ? "" : normalizedPath;
  return expandBraces(validated).some(
    (expanded) =>
      dotSegmentsAllowed(expanded, normalizedPath) && compile(expanded).test(candidate),
  );
};

export const matchesAnyGlob = (
  patterns: ReadonlyArray<string>,
  path: string,
): boolean => patterns.some((pattern) => matchesGlob(pattern, path));

export const globPatternsEqual = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean =>
  left.length === right.length && left.every((pattern, index) => pattern === right[index]);
