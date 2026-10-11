import { fromProductValue, unlist, hostNatural } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { List, ProductValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { CaptureDiagnostic } from "@hapsland/native-observation/direct-event/capture"
import type { ReviewUnit } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type {
  ObservationResult,
  PathObservationOutcome,
  PreparationDiagnostic
} from "@hapsland/review-definition/direct-event/model"
import type { PreparedObservation, PreparedSource, PrepareOutcome } from "./contract.ts"

type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
type ObservedPath = Extract<PathObservationOutcome, { status: "observed" }>
type IncompletePath = Extract<PathObservationOutcome, { status: "incomplete"; reason: string }>
type AnalysisFailure = Extract<ObservedPath["analysis"], { status: "incomplete" }>["failures"][number]
type WireDiagnostic =
  | { readonly $: "ProviderDiagnostic"; readonly value: ProductValue }
  | {
      readonly $: "CaptureBudget"
      readonly resource: "files" | "bytes"
      readonly used: bigint
      readonly requested: bigint
      readonly limit: bigint
    }
  | {
      readonly $: "MaterializationRefused"
      readonly requested: bigint
      readonly constraint: "globalItems" | "globalBytes" | "partitionItems" | "partitionBytes"
    }
  | { readonly $: "PreparationPanic" }
type WirePath =
  | {
      readonly $: "Incomplete"
      readonly path: string
      readonly reason: Maybe<IncompletePath["reason"]>
      readonly diagnostic: Maybe<WireDiagnostic>
    }
  | {
      readonly $: "Observed"
      readonly path: string
      readonly operation: { readonly $: "CandidateAdd" | "CandidateUpdate" }
      readonly content_hash: string
      readonly units: List<ProductValue>
      readonly failures: List<{ readonly root: Maybe<string>; readonly reason: AnalysisFailure["reason"] }>
    }
type WireOutcome =
  | { readonly $: "OutcomeSkipped"; readonly path: string }
  | { readonly $: "OutcomeReady"; readonly path: string; readonly prepared: ProductValue }
/** Producer-valid terminal ABI; private to the whole preparation capability.
 * String/product fields use the existing native producer contracts. This is not
 * validation of arbitrary raw Bend values; guards below preserve decoder errors.
 */
export type PreparationResult = {
  readonly $: "PreparationResult"
  readonly complete: boolean
  readonly paths: List<WirePath>
  readonly outcomes: List<WireOutcome>
  readonly units: List<ProductValue>
  readonly line_roots: List<string>
  readonly selected: bigint
}
type SourceOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedSource }
  | { readonly status: "skipped"; readonly path: string }
type SourceResult = { readonly observation: ObservationResult; readonly outcomes: readonly SourceOutcome[] }

const optional = <Value>(value: Maybe<Value>): Value | undefined => {
  if (value.$ === "None") return undefined
  if (value.$ === "Some") return value.value
  throw new TypeError("Malformed preparation Maybe")
}
const diagnostic = (value: WireDiagnostic): CaptureDiagnostic | PreparationDiagnostic => {
  switch (value.$) {
    case "ProviderDiagnostic":
      // The foreign producer supplies the existing diagnostic schema.
      return fromProductValue(value.value) as CaptureDiagnostic | PreparationDiagnostic
    case "CaptureBudget":
      return {
        stage: "capture",
        code: "capture-budget-limit",
        args: {
          resource: value.resource,
          used: hostNatural(value.used),
          requested: hostNatural(value.requested),
          limit: hostNatural(value.limit)
        }
      }
    case "MaterializationRefused":
      return {
        stage: "preparation",
        code: "preparation-resource-refused",
        args: { phase: "materialization", requestedBytes: hostNatural(value.requested), constraint: value.constraint }
      }
    case "PreparationPanic":
      return { stage: "preparation", code: "panic", args: { boundary: "review-preparation" } }
    default:
      throw new TypeError("Unknown preparation diagnostic")
  }
}
// Closed nominal ABI projection. Selection, merging and completeness are Bend
// results; this adapter does not re-run preparation or calculate semantic identity.
export function decodePreparationResult(result: PreparationResult, advicee: DirectAdvicee): PreparedObservation
export function decodePreparationResult(result: PreparationResult, advicee?: undefined): SourceResult
export function decodePreparationResult(
  result: PreparationResult,
  advicee?: DirectAdvicee
): { readonly observation: ObservationResult; readonly outcomes: readonly (PrepareOutcome | SourceOutcome)[] } {
  if (result.$ !== "PreparationResult" || typeof result.complete !== "boolean")
    throw new TypeError("Malformed preparation result")
  const paths = unlist(result.paths).map((path): PathObservationOutcome => {
    if (path.$ === "Incomplete") {
      const reason = optional(path.reason),
        rawDiagnostic = optional(path.diagnostic)
      return {
        status: "incomplete",
        path: path.path,
        ...(reason === undefined ? {} : { reason }),
        ...(rawDiagnostic === undefined ? {} : { diagnostic: diagnostic(rawDiagnostic) })
      } as PathObservationOutcome
    }
    if (path.$ !== "Observed") throw new TypeError("Unknown preparation path")
    const operation = ({ CandidateAdd: "add", CandidateUpdate: "update" } as const)[path.operation.$]
    if (operation === undefined) throw new TypeError("Invalid observed operation")
    const failures = unlist(path.failures).map((failure) => ({ root: optional(failure.root), reason: failure.reason }))
    return {
      status: "observed",
      path: path.path,
      snapshot: { path: path.path, operation, sourceHash: path.content_hash },
      units: unlist(path.units).map((value) => fromProductValue(value) as ReviewUnit),
      analysis: failures.length ? { status: "incomplete", failures } : { status: "complete" }
    }
  })
  const units = unlist(result.units).map((value) => fromProductValue(value) as ReviewUnit)
  const observation: ObservationResult = result.complete
    ? {
        status: "complete",
        changeSet: {
          status: "complete",
          changes: paths.map((path) => {
            if (path.status !== "observed") throw new TypeError("Malformed complete preparation path")
            return path.snapshot
          }),
          units
        },
        outcomes: paths
      }
    : { status: "incomplete", outcomes: paths, units }
  const outcomes = unlist(result.outcomes).map((outcome): PrepareOutcome | SourceOutcome => {
    if (outcome.$ === "OutcomeSkipped") return { status: "skipped", path: outcome.path }
    if (outcome.$ !== "OutcomeReady") throw new TypeError("Unknown preparation outcome")
    const prepared = fromProductValue(outcome.prepared) as PreparedSource
    if (advicee === undefined) return { status: "ready", path: outcome.path, prepared }
    const ready: Extract<PrepareOutcome, { status: "ready" }> = {
      status: "ready",
      path: outcome.path,
      prepared: { ...prepared, advicee }
    }
    return ready
  })
  return { observation, outcomes }
}
