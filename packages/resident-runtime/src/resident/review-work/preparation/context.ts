import {
  type DirectReviewContext,
  type EvaluatedUnit,
  type PreparedObservation
} from "@hapsland/review-execution/direct-event/pipeline"
import type { makeResidentInspection } from "../../inspection/observer.ts"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { makeResidentRuntimeConfiguration } from "../../runtime-configuration.ts"
import type { Advice } from "../../state/advice-records.ts"
import type { RoundWork } from "../../state/round-records.ts"
import type { JoinedReviewOutcome } from "../../state/joined-reviews.ts"
import { type WorkRevision } from "../../state/revision.ts"
import type * as Effect from "effect/Effect"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import {
  type ResidentDispatchContext,
  type ResidentUnavailableReason
} from "@hapsland/resident-transport/resident/protocol"
import { type CapacityReservation } from "../../state/resident/state.ts"
import { type Dispatcher } from "../../state/dispatch.ts"
import { type OperationalNoticeKind } from "../../state/collection-facts.ts"
import type { PreparationControls } from "../../execution-controls/preparation-controls.ts"
import { type ResidentLedger, type IngressJob, type UnitJob, type Job } from "../../work-ownership/jobs.ts"
import type { ResidentAdapterError } from "../../adapter-error.ts"
import type { planPreparedUnits } from "./planning.ts"

export type Dependencies = {
  readonly lifetime: string
  readonly residentLifetimeController: AbortController
  readonly residentLedger: ResidentLedger
  readonly residentAwaitBackendGate: () => Effect.Effect<void, ResidentAdapterError, never>
  readonly residentCredentialRequired: (controlled: ControlledDecisionModelOptions | undefined) => boolean
  readonly residentCredentialShapeMatches: (
    dispatch: ResidentDispatchContext,
    name: string,
    required: boolean
  ) => boolean
  readonly residentCredentialGenerationCurrent: (dispatch: ResidentDispatchContext, required: boolean) => boolean
  readonly residentJobActive: (job: Job) => Effect.Effect<boolean, never, never>
  readonly residentRecordAnalytics: (
    job: Pick<Job, "dispatch" | "observation"> & { readonly analyticsEnabled?: boolean },
    kind:
      | "submitted"
      | "request-started"
      | "request-clear"
      | "request-findings"
      | "request-failed"
      | "request-timeout"
      | "request-interrupted"
      | "request-never-sent"
      | "cache-hit"
      | "joined-review"
      | "skipped-candidate"
      | "incomplete-candidate"
      | "work-discarded"
      | "preparation-failed"
      | "capacity-rejected"
      | "review-unavailable",
    findings?: readonly Finding[] | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly residentCaptureSource: DirectReviewContext["captureSource"]
  readonly residentReuse: ReturnType<ResidentLedger["reuse"]>
  readonly residentAdvice: () => Effect.Effect<readonly Advice[], never, never>
  readonly residentRestoreCurrentWork: (
    partition: string,
    prepared: PreparedUnit
  ) => Effect.Effect<WorkRevision, never, never>
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
  readonly residentPreparationControls: PreparationControls
  readonly residentRecordOperationalFailure: (
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    now?: number | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentRegisterCurrentWork: (
    partition: string,
    prepared: PreparedUnit
  ) => Effect.Effect<WorkRevision, never, never>
  readonly residentReleaseCurrentWork: (revision: WorkRevision) => Effect.Effect<void, never, never>
  readonly residentRecordJoinedOutcomes: (
    outcomes: readonly JoinedReviewOutcome[],
    adviceId?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentJoined: ReturnType<ResidentLedger["joinedReviews"]>
  readonly residentReleaseReuseClaim: (
    key: string,
    reason?: ResidentUnavailableReason | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentRetainAdvice: (
    job: UnitJob,
    evaluation: EvaluatedUnit,
    sequence: number
  ) => Effect.Effect<void, ResidentAdapterError, never>
  readonly residentRetireCachedUnit: (
    unit: UnitJob,
    round: RoundWork | undefined,
    id: number | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly residentReleaseUnit: (
    job: Pick<UnitJob, "reservation" | "released" | "revision">
  ) => Effect.Effect<void, never, never>
  readonly runtimeConfiguration: Effect.Success<ReturnType<typeof makeResidentRuntimeConfiguration>>
}

export type PreparationContext<Needs extends keyof Dependencies = keyof Dependencies> = {
  readonly deps: Pick<Dependencies, Needs>
  readonly job: IngressJob
  readonly sequence: number
  readonly expectedActivityUnits: Array<string>
  readonly unassignedClaims: Set<string>
  readonly activeWorkspaces: Set<CapacityReservation>
  readonly preparationSignal: AbortSignal
}

export type ReadyPreparedOutcome = Extract<PreparedObservation["outcomes"][number], { status: "ready" }>

export type PlannedPreparationItem = Effect.Success<ReturnType<typeof planPreparedUnits>>[number]

export type RetainedPreparationItem = Extract<PlannedPreparationItem, { kind: "owner" | "cached" }>

export type PreparationReservation = Effect.Success<ReturnType<ResidentLedger["completePreparation"]>>[number]

export type PreparedUnitFacts = {
  readonly item: RetainedPreparationItem
  readonly admitted: NonNullable<PreparationReservation>
  readonly pathObservation: DirectObservation
  readonly analyticsEnabled: boolean
  readonly sourceHash: string | undefined
  readonly revision: WorkRevision
  readonly workUnitId: number | undefined
}
