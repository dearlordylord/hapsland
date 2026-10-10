import type { InspectionPersistence } from "@hapsland/inspection-records/inspection/recorder"
import type { ResidentDispatchControls } from "./execution-controls/dispatch-controls.ts"
import type { ResidentReviewControls } from "./execution-controls/review-controls.ts"
import type { ResidentPreparationControls } from "./execution-controls/preparation-controls.ts"
import type * as HttpClient from "effect/http/HttpClient"
import { type DirectReviewContext } from "@hapsland/review-execution/direct-event/pipeline"
import type { Layer } from "effect"
import { type DispatchAuthorityObservation } from "./authorization/observation.ts"
import { type JevRequestObservation } from "./review-work/request-observation.ts"

export type ResidentRuntimeOptions = {
  /** Local persistence failure seam; never supplied by IPC. Production uses the private per-user journal. */
  readonly inspectionPersistence?: InspectionPersistence

  /** Scoped local review coordination; never supplied by resident IPC. */
  readonly reviewControls?: Layer.Layer<ResidentReviewControls>
  /** Fixture-only source effect; never supplied by resident IPC. */
  readonly captureSource?: DirectReviewContext["captureSource"]
  /** Scoped local preparation coordination; never supplied by resident IPC. */
  readonly preparationControls?: Layer.Layer<ResidentPreparationControls>
  readonly dispatchControls?: Layer.Layer<ResidentDispatchControls>
  /** Fixture-only authority observation; never supplied by resident IPC. */
  readonly dispatchAuthorityObserver?: (observation: DispatchAuthorityObservation) => void
  /** Fixture-only source-free command/effect witness. */
  readonly jevRequestObserver?: (observation: JevRequestObservation) => void
  readonly maximumOperationalNoticeKeys?: number
  /** Fixture-only HTTP transport; never supplied by resident IPC. */
  readonly offlineHttpClient?: HttpClient.HttpClient
  /** Fixture-only gate entered by the controlled DecisionModel call. */
  readonly controlledRequestEffect?: (signal: AbortSignal) => Promise<void>
}
