import { makeResidentResponses } from "../advice-delivery/response.ts"
import { residentAwaitBackendGate } from "../review-work/backend-gate.ts"
import {
  residentCredentialRequired,
  residentCredentialShapeMatches,
  residentCredentialGenerationCurrent,
  residentAdviceCredentialAuthority
} from "../authorization/credentials.ts"
import { makeResidentAdmission } from "../review-work/admission.ts"
import { makeResidentAdviceCollection } from "../advice-delivery/advice-collection.ts"
import { makeResidentDelivery } from "../advice-delivery/delivery.ts"
import { makeResidentWorkLifecycle } from "../work-ownership/lifecycle.ts"
import { makeResidentReviewObservation } from "../review-work/review-observation.ts"
import { makeResidentPreparation } from "../review-work/preparation/workflow.ts"
import { makeResidentEvaluation } from "../review-work/evaluation/workflow.ts"
import { makeResidentRequests } from "../ipc/requests.ts"
import { makeResidentHandoff } from "../advice-delivery/handoff/workflow.ts"
import { makeResidentIpc } from "../ipc/socket.ts"
import type * as Effect from "effect/Effect"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type Dispatcher } from "../state/dispatch.ts"
import type { ResidentAdapterError } from "../adapter-error.ts"
import { type Job } from "../work-ownership/jobs.ts"
import { type ResidentRuntime } from "../runtime.ts"
import { type ResidentResources } from "./resources.ts"

type RuntimePorts = {
  readonly stats: () => Effect.Effect<Extract<ResidentResponse, { status: "stats" }>>
  readonly close: Effect.Effect<void, ResidentAdapterError>
  readonly residentDispatcher: Dispatcher<string, Job>
  readonly residentAdvice: ResidentResources["residentLedger"]["advice"]["values"]
  readonly residentScheduleRetirementClose: () => Effect.Effect<void>
  readonly residentScheduleIdleCheck: () => Effect.Effect<void>
  readonly cleanup: () => Effect.Effect<"busy" | "cleaned">
  readonly sweepQuietRounds: ResidentRuntime["sweepQuietRounds"]
  readonly releaseInspectionConnection: () => void
}

const makeResidentReviewWorkflows = (resources: ResidentResources, ports: RuntimePorts) => {
  const {
    runtimeConfiguration,
    reviewSettings,
    residentLedger,
    admissionLock,
    lifetime,
    residentInspection,
    inspection,
    residentJoined,
    residentComposedDelivery,
    residentLifetimeController,
    residentCollectionFindingOffer,
    residentNow,
    residentNotices,
    residentCaptureSource,
    residentPreparationControls,
    residentReviewControls,
    residentDispatchControls,
    residentDispatchAuthorityObserver,
    residentJevRequestObserver,
    residentOfflineHttpClient,
    residentControlledRequestEffect,
    residentReuse
  } = resources
  const admission = makeResidentAdmission({
    residentComposedDelivery,
    residentLedger,
    residentNotices,
    lifetime,
    get residentRecordAnalytics() {
      return reviewObservation.residentRecordAnalytics
    },
    runtimeConfiguration,
    reviewSettings,
    get residentOptionalUserConfig() {
      return reviewObservation.residentOptionalUserConfig
    },
    residentNow,
    get residentExpirePending() {
      return workLifecycle.residentExpirePending
    },
    get residentPruneNoticeCooldowns() {
      return workLifecycle.residentPruneNoticeCooldowns
    },
    get residentDispatcher() {
      return ports.residentDispatcher
    },
    inspection,

    residentInspection,
    admissionLock
  })
  const adviceCollection = makeResidentAdviceCollection({
    residentLedger,
    residentComposedDelivery,
    residentInspection,
    residentNow,
    get residentRemoveAdvice() {
      return workLifecycle.residentRemoveAdvice
    },
    get residentExpirePending() {
      return workLifecycle.residentExpirePending
    },
    get residentPruneNoticeCooldowns() {
      return workLifecycle.residentPruneNoticeCooldowns
    },
    get residentAdvice() {
      return ports.residentAdvice
    },
    residentJoined,
    residentCollectionFindingOffer,
    get residentFindingSelectionFacts() {
      return workLifecycle.residentFindingSelectionFacts
    },
    get residentRecordOperationalFailure() {
      return workLifecycle.residentRecordOperationalFailure
    },
    residentReviewControls,
    get residentIsCurrentWork() {
      return workLifecycle.residentIsCurrentWork
    },
    releaseDelivery: (token) => delivery.releaseDelivery(token)
  })
  const delivery = makeResidentDelivery({
    get residentExpirePending() {
      return workLifecycle.residentExpirePending
    },
    get residentPruneNoticeCooldowns() {
      return workLifecycle.residentPruneNoticeCooldowns
    },
    residentLedger,
    get residentNoticesForToken() {
      return workLifecycle.residentNoticesForToken
    },
    residentReleaseAdviceLease: adviceCollection.residentReleaseAdviceLease,
    residentNotices,
    lifetime,
    residentNow,
    residentComposedDelivery,
    get residentRemoveAdvice() {
      return workLifecycle.residentRemoveAdvice
    },
    get residentRemovePendingNotice() {
      return workLifecycle.residentRemovePendingNotice
    },
    residentPendingCanonicalFindings: adviceCollection.residentPendingCanonicalFindings,
    get residentRoundActive() {
      return workLifecycle.residentRoundActive
    },
    get residentIsCurrentWork() {
      return workLifecycle.residentIsCurrentWork
    },
    get residentAdviceCredentialAuthority() {
      return residentAdviceCredentialAuthority
    },
    get residentDispatcher() {
      return ports.residentDispatcher
    },
    residentReuse
  })
  const workLifecycle = makeResidentWorkLifecycle({
    residentNotices,
    residentLedger,
    residentNow,
    residentComposedDelivery,
    residentJoined,
    lifetime,
    get residentAdvice() {
      return ports.residentAdvice
    },
    residentAdviceExpired: adviceCollection.residentAdviceExpired,
    residentInspection,
    get residentDispatcher() {
      return ports.residentDispatcher
    },
    residentLifetimeController,
    residentRoundSnapshot: admission.residentRoundSnapshot,
    get residentRecordAnalytics() {
      return reviewObservation.residentRecordAnalytics
    },
    residentReuse
  })
  const reviewObservation = makeResidentReviewObservation({
    residentDispatchAuthorityObserver,
    residentLedger,
    lifetime,
    residentJevRequestObserver
  })
  const preparation = makeResidentPreparation({
    lifetime,
    residentLifetimeController,
    residentLedger,
    get residentAwaitBackendGate() {
      return () => residentAwaitBackendGate(residentLifetimeController)
    },
    residentCredentialRequired,
    residentCredentialShapeMatches,
    residentCredentialGenerationCurrent,
    residentJobActive: workLifecycle.residentJobActive,
    residentRecordAnalytics: reviewObservation.residentRecordAnalytics,
    residentInspection,
    residentCaptureSource,
    residentReuse,
    get residentAdvice() {
      return ports.residentAdvice
    },
    residentRestoreCurrentWork: workLifecycle.residentRestoreCurrentWork,
    inspection,
    residentPreparationControls,
    residentRecordOperationalFailure: workLifecycle.residentRecordOperationalFailure,
    residentRegisterCurrentWork: workLifecycle.residentRegisterCurrentWork,
    residentReleaseCurrentWork: workLifecycle.residentReleaseCurrentWork,
    residentRecordJoinedOutcomes: workLifecycle.residentRecordJoinedOutcomes,
    residentJoined,
    residentReleaseReuseClaim: workLifecycle.residentReleaseReuseClaim,
    get residentRetainAdvice() {
      return evaluation.residentRetainAdvice
    },
    residentRetireCachedUnit: workLifecycle.residentRetireCachedUnit,
    get residentDispatcher() {
      return ports.residentDispatcher
    },
    residentReleaseUnit: workLifecycle.residentReleaseUnit,
    runtimeConfiguration
  })
  const evaluation = makeResidentEvaluation({
    lifetime,
    residentRecordAnalytics: reviewObservation.residentRecordAnalytics,
    residentObserveJevRequest: reviewObservation.residentObserveJevRequest,
    residentLifetimeController,
    residentLedger,
    inspection,
    residentInspection,
    residentReleaseReuseClaim: workLifecycle.residentReleaseReuseClaim,
    residentReleaseUnit: workLifecycle.residentReleaseUnit,
    residentJobActive: workLifecycle.residentJobActive,
    residentIsCurrentWork: workLifecycle.residentIsCurrentWork,
    get residentAwaitBackendGate() {
      return () => residentAwaitBackendGate(residentLifetimeController)
    },
    residentSettleJoined: workLifecycle.residentSettleJoined,
    residentReviewControls,
    residentOfflineHttpClient,
    residentControlledRequestEffect,
    residentObserveDispatchAuthority: reviewObservation.residentObserveDispatchAuthority,
    residentCredentialRequired,
    residentCredentialShapeMatches,
    residentDispatchControls,
    residentRecordOperationalFailure: workLifecycle.residentRecordOperationalFailure,
    residentReuse,
    runtimeConfiguration,
    get residentAdvice() {
      return ports.residentAdvice
    },
    residentRecordJoinedOutcomes: workLifecycle.residentRecordJoinedOutcomes,
    residentNow,
    residentRemoveAdvice: workLifecycle.residentRemoveAdvice
  })
  return { admission, adviceCollection, delivery, workLifecycle, reviewObservation, preparation, evaluation }
}

type ResidentReviewWorkflows = {
  readonly admission: ReturnType<typeof makeResidentAdmission>
  readonly adviceCollection: ReturnType<typeof makeResidentAdviceCollection>
  readonly delivery: ReturnType<typeof makeResidentDelivery>
  readonly workLifecycle: ReturnType<typeof makeResidentWorkLifecycle>
  readonly reviewObservation: ReturnType<typeof makeResidentReviewObservation>
  readonly preparation: ReturnType<typeof makeResidentPreparation>
  readonly evaluation: ReturnType<typeof makeResidentEvaluation>
}

const makeResidentInteractionWorkflows = (
  resources: ResidentResources,
  ports: RuntimePorts,
  review: ResidentReviewWorkflows
) => {
  const {
    paths,
    runtimeConfiguration,
    reviewSettings,
    residentLedger,
    updateNoticeBudgets,
    lifetime,
    residentInspection,
    inspection,
    residentRuntimeScope,
    residentDispatchScope,
    residentStopExpiries,
    residentComposedDelivery,
    residentLifetimeController,
    residentCollectionFindingOffer,
    residentNow,
    residentNotices,
    residentCaptureSource,
    residentReviewControls
  } = resources
  const { admission, adviceCollection, delivery, workLifecycle } = review
  const requests = makeResidentRequests({
    get stats() {
      return ports.stats
    },
    get close() {
      return ports.close
    },
    lifetime,
    releaseDelivery: delivery.releaseDelivery,
    releaseComposedSubmission: delivery.releaseComposedSubmission,
    beginComposedSubmission: delivery.beginComposedSubmission,
    acknowledge: delivery.acknowledge,
    finalize: delivery.finalize,
    residentLifetimeController,
    residentLedger,
    residentNow,
    residentAdmit: admission.residentAdmit,
    get residentCollectorGate() {
      return handoff.residentCollectorGate
    },
    residentCollect: adviceCollection.residentCollect,
    get residentEditCollectionStatus() {
      return handoff.residentEditCollectionStatus
    },
    residentComposedDelivery,
    residentStopExpiries,
    residentCloseRound: workLifecycle.residentCloseRound,
    residentDispatchScope,
    residentRootIdentityMatches: admission.residentRootIdentityMatches,
    reviewSettings,
    residentPinnedActivity: admission.residentPinnedActivity,
    residentInspection,
    admit: admission.admit,
    residentPruneNoticeCooldowns: workLifecycle.residentPruneNoticeCooldowns,
    residentReleaseAdviceLease: adviceCollection.residentReleaseAdviceLease,
    residentCollectionWorkCount: delivery.residentCollectionWorkCount,
    residentDiscardUnfinishedWork: workLifecycle.residentDiscardUnfinishedWork,
    residentAllowFinish: workLifecycle.residentAllowFinish,
    residentCollectionWorkState: delivery.residentCollectionWorkState,
    get cleanup() {
      return ports.cleanup
    },

    paths,
    inspection,
    residentRuntimeScope,
    updateNoticeBudgets,
    sweepQuietRounds: workLifecycle.sweepQuietRounds
  })
  const handoff = makeResidentHandoff({
    lifetime,
    releaseDelivery: delivery.releaseDelivery,
    releaseComposedSubmission: delivery.releaseComposedSubmission,
    residentLedger,
    residentRoundActive: workLifecycle.residentRoundActive,
    get residentAdvice() {
      return ports.residentAdvice
    },
    residentAdviceExpired: adviceCollection.residentAdviceExpired,
    residentCollectionWorkCount: delivery.residentCollectionWorkCount,
    residentReviewControls,
    residentLifetimeController,
    residentInspection,
    residentIsCurrentWork: workLifecycle.residentIsCurrentWork,
    residentCaptureSource,
    inspection,
    residentCollectionWorkState: delivery.residentCollectionWorkState,
    residentNow,
    residentExpirePending: workLifecycle.residentExpirePending,
    residentPruneNoticeCooldowns: workLifecycle.residentPruneNoticeCooldowns,
    residentCandidateRoute: adviceCollection.residentCandidateRoute,
    residentReleaseAdviceLease: adviceCollection.residentReleaseAdviceLease,
    residentRemoveAdvice: workLifecycle.residentRemoveAdvice,
    residentPendingCanonicalFindings: adviceCollection.residentPendingCanonicalFindings,
    residentFindingSelectionFacts: workLifecycle.residentFindingSelectionFacts,
    residentCollectionFindingOffer,
    residentNoticesForToken: workLifecycle.residentNoticesForToken,
    residentNotices,
    residentComposedDelivery,
    residentAllowFinish: workLifecycle.residentAllowFinish
  })
  const responses = makeResidentResponses({
    handoff,
    controls: residentReviewControls,
    releaseDelivery: delivery.releaseDelivery
  })
  const ipc = makeResidentIpc({
    releaseInspectionConnection: () => ports.releaseInspectionConnection(),
    incompatibleCallerResponse: requests.incompatibleCallerResponse,
    residentPruneCollectionTokenIds: admission.residentPruneCollectionTokenIds,
    lifetime,
    releaseDelivery: delivery.releaseDelivery,
    residentHandle: requests.residentHandle,
    responses,
    residentEditCollectionRequest: requests.residentEditCollectionRequest,
    get residentScheduleRetirementClose() {
      return ports.residentScheduleRetirementClose
    },
    runtimeConfiguration,
    residentLedger,
    get residentScheduleIdleCheck() {
      return ports.residentScheduleIdleCheck
    },
    residentRequestLifetime: requests.residentRequestLifetime,
    paths,

    inspection
  })
  return { requests, handoff, responses, ipc }
}

export const makeResidentWorkflows = (resources: ResidentResources, ports: RuntimePorts) => {
  const review = makeResidentReviewWorkflows(resources, ports)
  const interaction = makeResidentInteractionWorkflows(resources, ports, review)
  return { ...review, ...interaction }
}
