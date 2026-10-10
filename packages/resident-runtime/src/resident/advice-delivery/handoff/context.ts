import type { DirectReviewContext } from "@hapsland/review-execution/direct-event/pipeline"
import type { makeResidentInspection } from "../../inspection/observer.ts"
import { type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import type { Advice } from "../../state/advice-records.ts"
import type { PendingNoticeSnapshot as PendingNotice } from "../../state/notice-records.ts"
import type { RoundWork } from "../../state/round-records.ts"
import { type WorkRevision } from "../../state/revision.ts"
import type * as Effect from "effect/Effect"
import { type PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type FindingSelectionFacts, type CanonicalFindingOffer } from "../../state/collection-facts.ts"
import type { ReviewControls } from "../../execution-controls/review-controls.ts"
import { type ResidentLedger } from "../../work-ownership/jobs.ts"
import { type ResponseAuthority, type HandoffRequest } from "../authority.ts"
import type { CandidateRoute } from "../advice-collection.ts"

export type Dependencies = {
  readonly lifetime: string
  readonly releaseDelivery: (token: string) => Effect.Effect<void>
  readonly releaseComposedSubmission: (token: string) => Effect.Effect<ResidentResponse>
  readonly residentLedger: ResidentLedger
  readonly residentRoundActive: (round: RoundWork | undefined) => Effect.Effect<boolean, never, never>
  readonly residentAdvice: () => Effect.Effect<readonly Advice[], never, never>
  readonly residentAdviceExpired: (
    advice: Pick<Advice, "pendingAt">,
    now: number
  ) => Effect.Effect<boolean, never, never>
  readonly residentCollectionWorkCount: (
    root: string,
    advicee: DirectAdvicee,
    composed?: boolean
  ) => Effect.Effect<number, never, never>
  readonly residentReviewControls: ReviewControls
  readonly residentLifetimeController: AbortController
  readonly residentInspection: Effect.Success<ReturnType<typeof makeResidentInspection>>
  readonly residentIsCurrentWork: (
    revision: WorkRevision,
    prepared: PreparedUnit
  ) => Effect.Effect<boolean, never, never>
  readonly residentCaptureSource: DirectReviewContext["captureSource"]
  readonly inspection: Effect.Success<ReturnType<typeof makeResidentInspection>>["recorder"]
  readonly residentCollectionWorkState: (
    root: string,
    advicee: DirectAdvicee,
    composed?: boolean
  ) => Effect.Effect<{ readonly status: "pending" | "empty" }, never, never>
  readonly residentNow: () => number
  readonly residentExpirePending: (now: number) => Effect.Effect<void, never, never>
  readonly residentPruneNoticeCooldowns: (
    now: number,
    exceptKey?: string | undefined
  ) => Effect.Effect<void, never, never>
  readonly residentCandidateRoute: (
    event:
      | {
          readonly kind: "validationRouteCheck"
          readonly ownerCurrent: boolean
          readonly status: "unavailable" | "current" | "stale" | "unattributed"
        }
      | {
          readonly kind: "postValidationCheck"
          readonly workAccepted: boolean
          readonly expired: boolean
          readonly hasFitting: boolean
        }
      | {
          readonly kind: "finalCandidateCheck"
          readonly ownerCurrent: boolean
          readonly credentialGeneration: boolean
          readonly credentialAuthorized: boolean
          readonly expired: boolean
          readonly workCurrent: boolean
          readonly hasFindings: boolean
        }
  ) => Effect.Effect<CandidateRoute, never, never>
  readonly residentReleaseAdviceLease: (advice: Advice) => Effect.Effect<boolean, never, never>
  readonly residentRemoveAdvice: (
    id: string,
    token?: string | undefined,
    retirement?:
      | {
          readonly fate: Parameters<typeof captureInspectionFate>[1]
          readonly reason: Parameters<typeof captureInspectionFate>[2]
        }
      | undefined
  ) => Effect.Effect<boolean, never, never>
  readonly residentPendingCanonicalFindings: (operation: number) => Effect.Effect<number, never, never>
  readonly residentFindingSelectionFacts: (
    advice: Advice,
    partition: string,
    credentialGeneration: number | null,
    now: number,
    composed: boolean
  ) => Effect.Effect<FindingSelectionFacts, never, never>
  readonly residentCollectionFindingOffer: CanonicalFindingOffer
  readonly residentNoticesForToken: (token: string) => Effect.Effect<PendingNotice[], never, never>
  readonly residentNotices: ReturnType<ResidentLedger["notices"]>
  readonly residentComposedDelivery: ReturnType<ResidentLedger["delivery"]>
  readonly residentAllowFinish: (
    group: string,
    token: string,
    reason: "deadline" | "unavailable" | "limit" | "no-advice" | "output-failed" | "abandoned-stop" | "quiescent"
  ) => Effect.Effect<void, never, never>
}

export type HandoffContext<Needs extends keyof Dependencies = keyof Dependencies> = {
  readonly deps: Pick<Dependencies, Needs>
  readonly request: HandoffRequest
  readonly response: Extract<ResidentResponse, { status: "advice" }>
  readonly sourceCurrent: ReadonlyMap<string, boolean>
  readonly authority: ResponseAuthority | undefined
  readonly now: number
}

export type HandoffNotices = Effect.Success<ReturnType<Dependencies["residentNoticesForToken"]>>
