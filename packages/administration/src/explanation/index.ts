import { sessionAnalyticsSetting } from "@hapsland/runtime-inputs/configuration/resolve"
import type { ConfigurationOrigin, PatternOrigin, ResolvedPolicy } from "@hapsland/runtime-inputs/configuration/types"
import {
  selectGlobalPath,
  type ProtectedGate,
  type SelectionDecision
} from "@hapsland/native-observation/policy/file-policy"

export type PathExplanation = {
  readonly version: 1
  readonly path: string
  readonly normalizedPath: string
  readonly policyDigest: string
  readonly selected: boolean
  readonly reason: SelectionDecision["reason"]
  readonly protectedGate?: ProtectedGate
  readonly effectiveIncludes: ReadonlyArray<PatternOrigin>
  readonly overriddenIncludes: ReadonlyArray<PatternOrigin>
  readonly matchingIncludes: ReadonlyArray<PatternOrigin>
  readonly matchingExcludes: ReadonlyArray<PatternOrigin>
  readonly allExcludes: ReadonlyArray<PatternOrigin>
  readonly origins: ReadonlyArray<ConfigurationOrigin>
  readonly configuration: {
    readonly layers: ReadonlyArray<{ readonly name: string; readonly source: string }>
    readonly sessionAnalytics: ReturnType<typeof sessionAnalyticsSetting>
    readonly credentialEnvVar: ResolvedPolicy["credentialEnvVar"]
    readonly claudeFeedbackMode: ResolvedPolicy["claudeFeedbackMode"]
    readonly graphLimits: ResolvedPolicy["graphLimits"]
  }
}

const uniqueOrigins = (values: ReadonlyArray<ConfigurationOrigin>): ReadonlyArray<ConfigurationOrigin> => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = `${value.layer}\0${value.source}\0${value.field}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Explain the exact policy decision used by runtime selection. No backend is touched. */
export const explainPath = (policy: ResolvedPolicy, path: string): PathExplanation => {
  const selection = selectGlobalPath(policy, path)
  const protectedGate = selection.reason === "protected" ? selection.gate : undefined
  const allExcludes = [...policy.excludes, ...policy.protectedExcludes]
  const origins = uniqueOrigins([
    ...selection.matchingIncludes.map((entry) => entry.origin),
    ...selection.matchingExcludes.map((entry) => entry.origin),
    ...policy.includes.map((entry) => entry.origin),
    ...policy.overriddenIncludes.map((entry) => entry.origin)
  ])
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
    configuration: {
      layers: policy.layers.map(({ name, source }) => ({ name, source })),
      sessionAnalytics: sessionAnalyticsSetting(policy),
      credentialEnvVar: policy.credentialEnvVar,
      claudeFeedbackMode: policy.claudeFeedbackMode,
      graphLimits: policy.graphLimits
    }
  }
}

const formattedPattern = (entry: PatternOrigin): string =>
  `  ${entry.value} [${entry.origin.layer} ${entry.origin.source}#${entry.origin.field}]`
const overriddenIncludeLines = (entries: ReadonlyArray<PatternOrigin>): string[] =>
  entries.length === 0 ? [] : ["overridden includes:", ...entries.map(formattedPattern)]
const matchingExcludeLines = (entries: ReadonlyArray<PatternOrigin>): string[] =>
  entries.length === 0 ? ["  (none)"] : entries.map(formattedPattern)
const pathSelectionLabel = (selected: boolean): string => (selected ? "selected" : "not selected")
export const formatPathExplanation = (explanation: PathExplanation): string =>
  [
    `${explanation.path}: ${pathSelectionLabel(explanation.selected)} (${explanation.reason})`,
    `policy: ${explanation.policyDigest}`,
    "configuration layers (low to high precedence):",
    ...explanation.configuration.layers.map((layer) => `  ${layer.name}: ${layer.source}`),
    `sessionAnalytics: ${explanation.configuration.sessionAnalytics.value} [${explanation.configuration.sessionAnalytics.origin.layer} ${explanation.configuration.sessionAnalytics.origin.source}#sessionAnalytics]`,
    "effective includes:",
    ...explanation.effectiveIncludes.map(formattedPattern),
    ...overriddenIncludeLines(explanation.overriddenIncludes),
    "matching excludes:",
    ...matchingExcludeLines(explanation.matchingExcludes)
  ].join("\n")
