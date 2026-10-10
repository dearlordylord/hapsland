import type * as HttpClient from "effect/http/HttpClient"
import type { AnalyticsKind } from "@hapsland/activity-observation/activity/analytics"
import type { makeResidentInspection } from "../../inspection/observer.ts"
import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { ResidentDispatchControls } from "../../execution-controls/dispatch-controls.ts"
import type { makeResidentRuntimeConfiguration } from "../../runtime-configuration.ts"
import type { Advice } from "../../state/advice-records.ts"
import type { JoinedReviewOutcome } from "../../state/joined-reviews.ts"
import { type WorkRevision } from "../../state/revision.ts"
import type * as Effect from "effect/Effect"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type ControlledDecisionModelOptions } from "@hapsland/review-execution/review-execution/controlled-decision-model"
import {
  type ResidentDispatchContext,
  type ResidentUnavailableReason
} from "@hapsland/resident-transport/resident/protocol"
import type { Context } from "effect"
import { type OperationalNoticeKind } from "../../state/collection-facts.ts"
import type { ReviewControls } from "../../execution-controls/review-controls.ts"
import { type ResidentLedger, type UnitJob, type Job } from "../../work-ownership/jobs.ts"
import type { ResidentAdapterError } from "../../adapter-error.ts"
import { type JevRequestObservation } from "../request-observation.ts"
import { type DispatchAuthorityObservationDetails } from "../../authorization/observation.ts"
import type { resolveEvaluationCredentials } from "./authorization.ts"
import type { evaluateAuthorizedUnit } from "./request.ts"

export type Dependencies = {
  readonly lifetime: string
  readonly residentRecordAnalytics: (
    job: Pick<Job, "dispatch" | "observation"> & { readonly analyticsEnabled?: boolean },
    kind: AnalyticsKind,
    findings?: readonly Finding[] | undefined
  ) => Effect.Effect<void>
  readonly residentObserveJevRequest: (observation: JevRequestObservation) => void
  readonly residentLifetimeController: AbortController
  readonly residentLedger: ResidentLedger
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly residentReleaseReuseClaim: (
    key: string,
    reason?: ResidentUnavailableReason | undefined
  ) => Effect.Effect<void>
  readonly residentReleaseUnit: (job: Pick<UnitJob, "reservation" | "released" | "revision">) => Effect.Effect<void>
  readonly residentJobActive: (job: Job) => Effect.Effect<boolean>
  readonly residentIsCurrentWork: (revision: WorkRevision, prepared: PreparedUnit) => Effect.Effect<boolean>
  readonly residentAwaitBackendGate: () => Effect.Effect<void, ResidentAdapterError, never>
  readonly residentSettleJoined: (
    key: string,
    state: "clear" | "unavailable" | "pending",
    reason?: ResidentUnavailableReason | undefined,
    adviceId?: string | undefined
  ) => Effect.Effect<void>
  readonly residentReviewControls: ReviewControls
  readonly residentOfflineHttpClient: HttpClient.HttpClient | undefined
  readonly residentControlledRequestEffect: ((signal: AbortSignal) => Promise<void>) | undefined
  readonly residentObserveDispatchAuthority: (
    job: UnitJob,
    details: DispatchAuthorityObservationDetails
  ) => Effect.Effect<void>
  readonly residentCredentialRequired: (controlled: ControlledDecisionModelOptions | undefined) => boolean
  readonly residentCredentialShapeMatches: (
    dispatch: ResidentDispatchContext,
    name: string,
    required: boolean
  ) => boolean
  readonly residentDispatchControls: Context.Service.Shape<typeof ResidentDispatchControls>
  readonly residentRecordOperationalFailure: (
    observation: DirectObservation,
    kind: OperationalNoticeKind,
    now?: number | undefined
  ) => Effect.Effect<void>
  readonly residentReuse: ReturnType<ResidentLedger["reuse"]>
  readonly runtimeConfiguration: Effect.Success<ReturnType<typeof makeResidentRuntimeConfiguration>>
  readonly residentAdvice: () => Effect.Effect<readonly Advice[]>
  readonly residentRecordJoinedOutcomes: (
    outcomes: readonly JoinedReviewOutcome[],
    adviceId?: string | undefined
  ) => Effect.Effect<void>
  readonly residentNow: () => number
  readonly residentRemoveAdvice: (
    id: string,
    token?: string | undefined,
    retirement?: {
      readonly fate: Parameters<typeof captureInspectionFate>[1]
      readonly reason: Parameters<typeof captureInspectionFate>[2]
    }
  ) => Effect.Effect<boolean>
}

export type EvaluationState = {
  issuedRequest?: number
  requestStarted: boolean
  requestSettled: boolean
  interruptionReported: boolean
  readyReported: boolean
  evaluationOutcomeObserved: boolean
  requestIdentity?: Pick<
    JevRequestObservation,
    "partition" | "canonicalPartition" | "lifetime" | "canonicalLifetime" | "round" | "hapslandRound" | "operation"
  >
}

export type EvaluationContext<Needs extends keyof Dependencies = keyof Dependencies> = {
  readonly deps: Pick<Dependencies, Needs>
  readonly job: UnitJob
  readonly sequence: number
  readonly signal: AbortSignal
  readonly state: EvaluationState
}

export type ResolvedEvaluationCredentials = Exclude<
  Effect.Success<ReturnType<typeof resolveEvaluationCredentials>>,
  { status: "notAuthorized" }
>

export type EvaluationResult = Effect.Success<ReturnType<typeof evaluateAuthorizedUnit>> | undefined
