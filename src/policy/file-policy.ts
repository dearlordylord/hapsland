import { extname } from "node:path";
import type {
  ConfigurationOrigin,
  PatternOrigin,
  ResolvedPolicy,
  ResolvedRule,
} from "../configuration/types.ts";
import {
  matchesAnyGlob,
  normalizeRepositoryPath,
} from "../matcher/glob.ts";

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

export type SelectionDecision = {
  readonly selected: boolean;
  readonly path: string;
  readonly reason:
    | "selected"
    | "empty-includes"
    | "not-included"
    | "excluded"
    | "protected";
  readonly gate?: ProtectedGate;
  readonly matchingIncludes: ReadonlyArray<PatternOrigin>;
  readonly matchingExcludes: ReadonlyArray<PatternOrigin>;
  readonly matchingRuleIncludes?: ReadonlyArray<PatternOrigin>;
  readonly matchingRuleExcludes?: ReadonlyArray<PatternOrigin>;
};

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

const decision = (
  path: string,
  selected: boolean,
  reason: SelectionDecision["reason"],
  extra: Pick<SelectionDecision, "matchingIncludes" | "matchingExcludes"> &
    Partial<Pick<SelectionDecision, "gate" | "matchingRuleIncludes" | "matchingRuleExcludes">>,
): SelectionDecision => ({ path, selected, reason, ...extra });

export const selectGlobalPath = (
  policy: ResolvedPolicy,
  path: string,
): SelectionDecision => {
  const value = normalized(path);
  const gate = protectedPathReason(path);
  if (value === undefined || gate === "repository-boundary") {
    return decision(path, false, "protected", { gate: "repository-boundary", matchingIncludes: [], matchingExcludes: [] });
  }
  if (gate !== undefined) {
    return decision(value, false, "protected", { gate, matchingIncludes: [], matchingExcludes: [] });
  }
  const matchingIncludes = matching(policy.includes, value);
  const matchingExcludes = matching(
    [...policy.excludes, ...policy.protectedExcludes],
    value,
  );
  if (matchingExcludes.length > 0) {
    return decision(value, false, "excluded", { matchingIncludes, matchingExcludes });
  }
  if (policy.includes.length === 0) {
    return decision(value, false, "empty-includes", { matchingIncludes, matchingExcludes });
  }
  if (matchingIncludes.length === 0) {
    return decision(value, false, "not-included", { matchingIncludes, matchingExcludes });
  }
  return decision(value, true, "selected", { matchingIncludes, matchingExcludes });
};

export const selectRulePath = (
  policy: ResolvedPolicy,
  rule: ResolvedRule | undefined,
  path: string,
): SelectionDecision => {
  const global = selectGlobalPath(policy, path);
  if (!global.selected || rule === undefined || !rule.enabled) return global;
  const value = global.path;
  const matchingRuleIncludes = matching(rule.includes, value);
  const matchingRuleExcludes = matching(rule.excludes, value);
  if (matchingRuleExcludes.length > 0) {
    return decision(value, false, "excluded", {
      matchingIncludes: global.matchingIncludes,
      matchingExcludes: global.matchingExcludes,
      matchingRuleIncludes,
      matchingRuleExcludes,
    });
  }
  if (rule.includesSpecified && matchingRuleIncludes.length === 0) {
    return decision(value, false, "not-included", {
      matchingIncludes: global.matchingIncludes,
      matchingExcludes: global.matchingExcludes,
      matchingRuleIncludes,
      matchingRuleExcludes,
    });
  }
  return decision(value, true, "selected", {
    ...global,
    matchingRuleIncludes,
    matchingRuleExcludes,
  });
};

export const originLabel = (value: ConfigurationOrigin): string =>
  `${value.layer}:${value.source}#${value.field}`;

export const policyCanSelect = (policy: ResolvedPolicy, path: string): boolean =>
  selectGlobalPath(policy, path).selected;
