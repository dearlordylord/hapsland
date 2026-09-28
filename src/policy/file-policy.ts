import { extname } from "node:path";
import type {
  ConfigurationOrigin,
  PatternOrigin,
  ResolvedPolicy,
} from "../configuration/types.ts";
import {
  matchesAnyGlob,
  normalizeRepositoryPath,
} from "../matcher/glob.ts";
import { selectFile } from "../configuration/decision.ts";

const allowedExtensions = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html", ".java",
  ".js", ".jsx", ".json", ".kt", ".md", ".php", ".py", ".rb", ".rs", ".scala",
  ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx", ".yaml", ".yml",
]);

const sensitiveNames = /(^|\/)(\.env(?:\..*)?|.*\.(?:key|pem|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const generatedNames = /(?:^|\/)(?:package-lock\.json|bun\.lock|yarn\.lock|pnpm-lock\.yaml)$/i;
const generatedSegments = new Set([
  ".git", ".idea", ".vscode", "build", "coverage", "dist", "generated", "node_modules",
  "target", "vendor",
]);

export type ProtectedGate =
  | "repository-boundary"
  | "sensitive"
  | "generated-or-vendor"
  | "file-extension";

type SelectionContext = {
  readonly path: string;
  readonly matchingIncludes: ReadonlyArray<PatternOrigin>;
  readonly matchingExcludes: ReadonlyArray<PatternOrigin>;
};

export type SelectionDecision =
  | (SelectionContext & { readonly selected: true; readonly reason: "selected" })
  | (SelectionContext & { readonly selected: false; readonly reason: "empty-includes" })
  | (SelectionContext & { readonly selected: false; readonly reason: "not-included" })
  | (SelectionContext & { readonly selected: false; readonly reason: "excluded" })
  | (SelectionContext & {
      readonly selected: false;
      readonly reason: "protected";
      readonly gate: ProtectedGate;
    });

const normalized = (path: string): string | undefined => normalizeRepositoryPath(path);

/** Filesystem-independent gates. SnapshotReader repeats regular/size/symlink checks. */
export const protectedPathReason = (path: string): ProtectedGate | undefined => {
  const value = normalized(path);
  if (value === undefined || value === ".") return "repository-boundary";
  if (sensitiveNames.test(value)) return "sensitive";
  if (generatedNames.test(value)) return "generated-or-vendor";
  if (value.split("/").some((segment) => generatedSegments.has(segment))) {
    return "generated-or-vendor";
  }
  if (!allowedExtensions.has(extname(value).toLowerCase())) return "file-extension";
  return undefined;
};

const matching = (
  patterns: ReadonlyArray<PatternOrigin>,
  path: string,
): ReadonlyArray<PatternOrigin> => patterns.filter((pattern) => matchesAnyGlob([pattern.value], path));

export const selectGlobalPath = (
  policy: ResolvedPolicy,
  path: string,
): SelectionDecision => {
  const value = normalized(path);
  // Compute configured matches before protected gates so explain can account for
  // an attempted sensitive/generated path without implying that it was eligible.
  const matchingIncludes = value === undefined ? [] : matching(policy.includes, value);
  const matchingExcludes = value === undefined
    ? []
    : matching([...policy.excludes, ...policy.protectedExcludes], value);
  const gate = protectedPathReason(path);
  const reason = selectFile({
    protected: gate !== undefined,
    excluded: matchingExcludes.length > 0,
    includesEmpty: policy.includes.length === 0,
    included: matchingIncludes.length > 0,
  });
  if (reason === "protected") return {
    path: value ?? path, selected: false, reason,
    gate: gate ?? "repository-boundary", matchingIncludes, matchingExcludes,
  };
  return {
    path: value ?? path,
    selected: reason === "selected",
    reason,
    matchingIncludes,
    matchingExcludes,
  } as SelectionDecision;
};

export const originLabel = (value: ConfigurationOrigin): string =>
  `${value.layer}:${value.source}#${value.field}`;

export const policyCanSelect = (policy: ResolvedPolicy, path: string): boolean =>
  selectGlobalPath(policy, path).selected;
