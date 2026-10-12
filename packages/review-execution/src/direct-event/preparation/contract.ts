import type * as Effect from "effect/Effect"
import type { CompiledRule } from "@hapsland/review-definition/rules/compiler"
import type { ReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import type { AnalyzerMaterializationPreflight } from "@hapsland/source-analysis/direct-event/analyzer"
import type { CaptureHooks, CaptureDiagnostic, captureStable } from "@hapsland/native-observation/direct-event/capture"
import type { DirectObservation, DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { DirectFilePolicy } from "@hapsland/native-observation/direct-event/selection"
import type {
  PreparedUnit,
  ObservationResult,
  MaterializationAdmission
} from "@hapsland/review-definition/direct-event/model"

export type DirectReviewContext = {
  /** Explicit operator/fixture authority. Never inferred from matching reads. */
  readonly controlledWriter: boolean
  /** The only advicee for whom this invocation may produce advice. */
  readonly advicee: DirectAdvicee
  readonly settings: Pick<ReviewSettings, "backend" | "destination"> &
    Partial<Pick<ReviewSettings, "configuration" | "rules" | "providerIdentity">>
  readonly policy?: DirectFilePolicy | (() => DirectFilePolicy)
  readonly rules?: ReadonlyArray<CompiledRule> | (() => ReadonlyArray<CompiledRule>) | undefined
  readonly inputContract?: string | (() => string)
  readonly captureHooks?: CaptureHooks
  /** Optional observation of the actual preparation refusal; never participates in review authority. */
  readonly observePreparationOmission?:
    | ((path: string, declaration: string, reason: "missing-evidence" | "no-applicable-rule") => void)
    | undefined
  /** Supporting capture evidence; observing it never changes partial-graph authority. */
  readonly observeCaptureDiagnostic?: (candidatePath: string, sourcePath: string, diagnostic: CaptureDiagnostic) => void
  /** Fixture-only source effect; production uses the stable native capture. */
  readonly captureSource?: typeof captureStable
  /** Fixture-only graph clock for deterministic deadline checks. */
  readonly graphNow?: () => number
  readonly beforePrepare?: Effect.Effect<void>
  /** Reserve bounded analyzer/input materialization after capture, before parsing. */
  readonly beforeAnalyze?: (
    path: string,
    sourceBytes: number,
    preflight: AnalyzerMaterializationPreflight | undefined
  ) => Effect.Effect<MaterializationAdmission>
  readonly beforeDispatch?: Effect.Effect<void>
  readonly beforeHandoff?: Effect.Effect<void>
}

/** Source preparation has no authority to publish advice to an agent. */
export type PreparedSource = Omit<PreparedUnit, "advicee">
export type SourcePreparationContext = Omit<DirectReviewContext, "controlledWriter" | "advicee">

export type PrepareOutcome =
  | { readonly status: "ready"; readonly path: string; readonly prepared: PreparedUnit }
  | { readonly status: "skipped"; readonly path: string }

export type PreparedObservation = {
  readonly observation: ObservationResult
  readonly outcomes: ReadonlyArray<PrepareOutcome>
}

/** One observation and its existing effect ports; private stage state stays internal. */
export type PreparationInput = {
  readonly observation: DirectObservation
  readonly context: DirectReviewContext
  readonly frozenNames?: ReadonlyMap<string, ReadonlySet<string>>
}
