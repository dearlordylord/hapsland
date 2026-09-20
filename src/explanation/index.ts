import type {
  ConfigurationOrigin,
  PatternOrigin,
  ResolvedPolicy,
} from "../configuration/types.ts";
import { selectGlobalPath, type ProtectedGate, type SelectionDecision } from "../policy/file-policy.ts";

export type PathExplanation = {
  readonly version: 1;
  readonly path: string;
  readonly normalizedPath: string;
  readonly policyDigest: string;
  readonly selected: boolean;
  readonly reason: SelectionDecision["reason"];
  readonly protectedGate?: ProtectedGate;
  readonly effectiveIncludes: ReadonlyArray<PatternOrigin>;
  readonly overriddenIncludes: ReadonlyArray<PatternOrigin>;
  readonly matchingIncludes: ReadonlyArray<PatternOrigin>;
  readonly matchingExcludes: ReadonlyArray<PatternOrigin>;
  readonly allExcludes: ReadonlyArray<PatternOrigin>;
  readonly origins: ReadonlyArray<ConfigurationOrigin>;
};

const uniqueOrigins = (
  values: ReadonlyArray<ConfigurationOrigin>,
): ReadonlyArray<ConfigurationOrigin> => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.layer}\0${value.source}\0${value.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** Explain the exact policy decision used by runtime selection. No backend is touched. */
export const explainPath = (
  policy: ResolvedPolicy,
  path: string,
): PathExplanation => {
  const selection = selectGlobalPath(policy, path);
  const protectedGate = selection.reason === "protected" ? selection.gate : undefined;
  const allExcludes = [...policy.excludes, ...policy.protectedExcludes];
  const origins = uniqueOrigins([
    ...selection.matchingIncludes.map((entry) => entry.origin),
    ...selection.matchingExcludes.map((entry) => entry.origin),
    ...policy.includes.map((entry) => entry.origin),
    ...policy.overriddenIncludes.map((entry) => entry.origin),
  ]);
  return {
    version: 1,
    path,
    normalizedPath: selection.path,
    policyDigest: policy.digest,
    selected: selection.selected,
    reason: selection.reason,
    ...(protectedGate === undefined ? {} : { protectedGate }),
    effectiveIncludes: policy.includes,
    overriddenIncludes: policy.overriddenIncludes,
    matchingIncludes: selection.matchingIncludes,
    matchingExcludes: selection.matchingExcludes,
    allExcludes,
    origins,
  };
};

export const formatPathExplanation = (explanation: PathExplanation): string => {
  const lines = [
    `${explanation.path}: ${explanation.selected ? "selected" : "not selected"} (${explanation.reason})`,
    `policy: ${explanation.policyDigest}`,
    "effective includes:",
    ...explanation.effectiveIncludes.map((entry) =>
      `  ${entry.value} [${entry.origin.layer} ${entry.origin.source}#${entry.origin.field}]`,
    ),
  ];
  if (explanation.overriddenIncludes.length > 0) {
    lines.push(
      "overridden includes:",
      ...explanation.overriddenIncludes.map((entry) =>
        `  ${entry.value} [${entry.origin.layer} ${entry.origin.source}#${entry.origin.field}]`,
      ),
    );
  }
  lines.push(
    "matching excludes:",
    ...(explanation.matchingExcludes.length === 0
      ? ["  (none)"]
      : explanation.matchingExcludes.map((entry) =>
          `  ${entry.value} [${entry.origin.layer} ${entry.origin.source}#${entry.origin.field}]`,
        )),
  );
  return lines.join("\n");
};
