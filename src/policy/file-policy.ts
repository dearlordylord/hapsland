import type { ConfigurationOrigin, PatternOrigin, ResolvedPolicy } from "../configuration/types.ts"
import { matchesAnyGlob } from "../matcher/glob.ts"
import { classifyFileProtection, selectFile } from "../configuration/decision.ts"
import { rootLanguageForPath } from "../direct-event/languages/path-language.ts"
import { pathFacts } from "./path-facts.ts"

export type ProtectedGate = "repository-boundary" | "sensitive" | "generated-or-vendor" | "file-extension"

type SelectionContext = {
  readonly path: string
  readonly matchingIncludes: ReadonlyArray<PatternOrigin>
  readonly matchingExcludes: ReadonlyArray<PatternOrigin>
}

export type SelectionDecision =
  | (SelectionContext & { readonly selected: true; readonly reason: "selected" })
  | (SelectionContext & { readonly selected: false; readonly reason: "empty-includes" })
  | (SelectionContext & { readonly selected: false; readonly reason: "not-included" })
  | (SelectionContext & { readonly selected: false; readonly reason: "excluded" })
  | (SelectionContext & { readonly selected: false; readonly reason: "protected"; readonly gate: ProtectedGate })

/** Filesystem-independent gates. SnapshotReader repeats regular/size/symlink checks. */
export const protectedPathReason = (path: string): ProtectedGate | undefined => {
  const observed = pathFacts(path)
  const protection =
    observed.kind === "invalid"
      ? classifyFileProtection({ kind: "invalid" })
      : classifyFileProtection({
          kind: "valid",
          sensitiveName: observed.sensitiveName,
          generatedOrVendor: observed.generatedOrVendor,
          allowedExtension: observed.allowedExtension
        })
  switch (protection) {
    case "allowedPath":
      return undefined
    case "repositoryBoundary":
      return "repository-boundary"
    case "sensitivePath":
      return "sensitive"
    case "generatedOrVendor":
      return "generated-or-vendor"
    case "fileExtension":
      return "file-extension"
  }
}

const matching = (patterns: ReadonlyArray<PatternOrigin>, path: string): ReadonlyArray<PatternOrigin> =>
  patterns.filter((pattern) => matchesAnyGlob([pattern.value], path))

export const selectGlobalPath = (policy: ResolvedPolicy, path: string): SelectionDecision =>
  selectPolicyPath(policy, path, false)

export const selectContextPath = (policy: ResolvedPolicy, path: string): SelectionDecision =>
  selectPolicyPath(policy, path, true)

const selectPolicyPath = (policy: ResolvedPolicy, path: string, context: boolean): SelectionDecision => {
  const includes = context ? policy.contextIncludes : policy.includes
  const excludes = context ? policy.contextExcludes : policy.excludes
  const observed = pathFacts(path)
  const value = observed.kind === "valid" ? observed.normalized : undefined
  // Compute configured matches before protected gates so explain can account for
  // an attempted sensitive/generated path without implying that it was eligible.
  const matchingIncludes = value === undefined ? [] : matching(includes, value)
  const matchingExcludes = value === undefined ? [] : matching([...excludes, ...policy.protectedExcludes], value)
  const gate = protectedPathReason(path)
  const reason = selectFile({
    protected: gate !== undefined,
    excluded: matchingExcludes.length > 0,
    includesEmpty: includes.length === 0,
    included:
      matchingIncludes.length > 0 &&
      (context || policy.languages.value.includes(rootLanguageForPath(path) as "typescript" | "rust" | "bend"))
  })
  if (reason === "protected")
    return {
      path: value ?? path,
      selected: false,
      reason,
      gate: gate ?? "repository-boundary",
      matchingIncludes,
      matchingExcludes
    }
  return {
    path: value ?? path,
    selected: reason === "selected",
    reason,
    matchingIncludes,
    matchingExcludes
  } as SelectionDecision
}

export const originLabel = (value: ConfigurationOrigin): string => `${value.layer}:${value.source}#${value.field}`

export const policyCanSelect = (policy: ResolvedPolicy, path: string): boolean =>
  selectGlobalPath(policy, path).selected
