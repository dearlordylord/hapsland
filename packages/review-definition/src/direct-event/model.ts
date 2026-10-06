import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { PathEligibilityReason } from "@hapsland/native-observation/direct-event/selection"
import type { ProviderIdentity } from "../review-providers/catalog.ts"
import { createHash } from "node:crypto"
import { reviewTargetForInput, type CompiledRule } from "../rules/compiler.ts"
import type { ReviewTarget } from "../rules/targets.ts"
import type { RuleLanguage } from "../rules/schema.ts"
import type { PostEditLocation } from "@hapsland/native-observation/direct-event/edit-attribution"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"

import type { ReviewArtifact, ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"

export type SourceSnapshot = {
  readonly path: string
  readonly operation: "add" | "update"
  readonly sourceHash: string
}

export type PathObservationOutcome =
  | {
      readonly status: "observed"
      readonly path: string
      readonly snapshot: SourceSnapshot
      readonly units: ReadonlyArray<ReviewUnit>
      readonly analysis:
        | { readonly status: "complete" }
        | {
            readonly status: "incomplete"
            readonly failures: ReadonlyArray<{
              readonly root: string | undefined
              readonly reason:
                | "extension"
                | "parse"
                | "import"
                | "declaration-limit"
                | "declaration-merge"
                | "no-declarations"
                | "missing-evidence"
                | "unsupported-reference"
                | "reference-limit"
                | "ambiguous-update"
            }>
          }
    }
  | {
      readonly status: "incomplete"
      readonly path: string
      readonly reason: "unsupported-operation" | "metadata-only" | PathEligibilityReason | "capture-unavailable"
    }

export type ChangeSet = {
  readonly status: "complete"
  readonly changes: ReadonlyArray<SourceSnapshot>
  readonly units: ReadonlyArray<ReviewUnit>
}

export type ObservationResult =
  | {
      readonly status: "complete"
      readonly changeSet: ChangeSet
      readonly outcomes: ReadonlyArray<PathObservationOutcome>
    }
  | {
      readonly status: "incomplete"
      readonly outcomes: ReadonlyArray<PathObservationOutcome>
      readonly units: ReadonlyArray<ReviewUnit>
    }

export type FrozenRule = {
  readonly id: string
  readonly source: string
  readonly definitionDigest: string
  readonly threshold: number
  readonly message: string
  readonly rank: number
  readonly decision: CompiledRule["decision"]
  readonly target?: ReviewTarget
}

export type ReviewInput = {
  readonly providerIdentity: ProviderIdentity
  readonly contract: string
  readonly graphLimits?: GraphLimits
  /** Complete graph projection uses the type/function renderer. */
  readonly candidateProjection?: boolean
  /** Parser-derived selected root range for attribution and freshness. */
  readonly rootLocation?: PostEditLocation
  readonly sourceFingerprints?: ReadonlyArray<{
    readonly path: string
    readonly contentHash: string
    readonly byteLength: number
  }>
  /** Missing evidence may be irrelevant to every selected rule. */
  readonly completeness: "complete" | "incomplete-irrelevant"
  readonly path: string
  readonly declaration: ReviewArtifact
  readonly unit: ReviewUnit
  readonly rules: ReadonlyArray<FrozenRule>
  readonly interpretation: "probability-strictly-greater-than-threshold"
}

export type PreparedUnit = {
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly input: ReviewInput
  readonly identity: string
}

export const canonicalValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const record = value as Readonly<Record<string, unknown>>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export const semanticIdentity = (input: ReviewInput): string => {
  const { sourceFingerprints: _capture, rootLocation: _location, ...reviewInput } = input
  return createHash("sha256").update(canonicalValue(reviewInput), "utf8").digest("hex")
}

const deepFreeze = <A>(value: A): A => {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}

export const freezeInput = (value: ReviewInput): ReviewInput => deepFreeze(value)

type FrozenRuleSelection = {
  readonly language: RuleLanguage
  readonly artifactKind: "typeShape" | "function"
  readonly inputContract: string
}
const selectedRuleTarget = (rule: CompiledRule, target: FrozenRuleSelection | undefined): ReviewTarget | undefined => {
  if (target === undefined) return undefined
  const kind = target.artifactKind === "typeShape" ? "type" : "function"
  const input = rule.inputs.find(
    (candidate) => candidate.kind === kind && candidate.languages.includes(target.language)
  )
  return input === undefined ? undefined : reviewTargetForInput(input, target.inputContract)
}
export const freezeRules = (
  rules: ReadonlyArray<CompiledRule>,
  target?: FrozenRuleSelection
): ReadonlyArray<FrozenRule> =>
  deepFreeze(
    rules.map((rule) => {
      const selected = selectedRuleTarget(rule, target)
      return {
        id: rule.id,
        source: rule.source,
        definitionDigest: rule.definitionDigest,
        threshold: rule.threshold,
        message: rule.message,
        rank: rule.rank,
        decision: { ...rule.decision, criteria: { ...rule.decision.criteria } },
        ...(selected === undefined ? {} : { target: selected })
      }
    })
  )
