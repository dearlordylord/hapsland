import * as Schema from "effect/Schema"
import { Nat, decoder } from "./boundary-schema.ts"

// Lists and nested constructors are decoded separately, so linked tails stay stack safe.
// Every constructor has an exact field set. Scalar domains are shared with input schemas.
export const CanonicalConstructors = {
  "Canonical.StopScope": Schema.Struct({ $: Schema.Literal("Canonical.StopScope"), partition: Nat, round: Nat }),
  "Reuse.JoinedPending": Schema.Struct({ $: Schema.Literal("Reuse.JoinedPending") }),
  "Reuse.JoinedClear": Schema.Struct({ $: Schema.Literal("Reuse.JoinedClear") }),
  "Reuse.JoinedFinding": Schema.Struct({ $: Schema.Literal("Reuse.JoinedFinding") }),
  "Reuse.JoinedUnavailable": Schema.Struct({ $: Schema.Literal("Reuse.JoinedUnavailable") }),

  "Canonical.AwaitingSourceRead": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.AwaitingSourceRead") })
  ),
  "Canonical.SourceReading": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.SourceReading") })),
  "Canonical.Preparing": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Preparing") })),
  "Canonical.Reviewing": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Reviewing") })),
  "Canonical.AtJev": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.AtJev") })),
  "Admission.AdmissionState": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Admission.AdmissionState"),
      partition: Nat,
      lifetime: Nat,
      round: Nat,
      active: Schema.Boolean,
      closed_at: Nat,
      next_token: Nat,
      permits: Schema.Unknown
    })
  ),
  "Admission.DuplicateTool": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.DuplicateTool") })),
  "Admission.Expired": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.Expired") })),
  "Admission.InvalidClock": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.InvalidClock") })),
  "Admission.LifetimeNotFresh": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Admission.LifetimeNotFresh") })
  ),
  "Admission.NoPermit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.NoPermit") })),
  "Admission.OldRound": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.OldRound") })),
  "Admission.Permit": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Admission.Permit"),
      token: Nat,
      tool: Nat,
      round: Nat,
      started: Nat,
      deadline: Nat
    })
  ),
  "Admission.RoundAlreadyClosed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Admission.RoundAlreadyClosed") })
  ),
  "Admission.StaleInvocation": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.StaleInvocation") })),
  "Admission.WrongLifetime": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.WrongLifetime") })),
  "Admission.WrongPartition": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.WrongPartition") })),
  "Admission.WrongTool": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Admission.WrongTool") })),
  "Canonical.Acknowledged": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Acknowledged") })),
  "Canonical.AdmissionForgotten": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.AdmissionForgotten") })
  ),
  "Canonical.ActionRequested": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ActionRequested"), request: Schema.Unknown })
  ),
  "Canonical.EventEstablished": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.EventEstablished"), event: Schema.Unknown })
  ),
  "Canonical.PolicyDecided": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PolicyDecided"), decision: Schema.Unknown })
  ),
  "Canonical.Advanced": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.Advanced"), state: Schema.Unknown, outputs: Schema.Unknown })
  ),
  "Canonical.CacheAlready": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CacheAlready") })),
  "Canonical.CacheCommitted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CacheCommitted") })),
  "Canonical.CacheDiscarded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CacheDiscarded"), ids: Schema.Unknown })
  ),
  "Canonical.CachePrepared": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CachePrepared"), evicted: Schema.Unknown })
  ),
  "Canonical.CacheRejected": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CacheRejected") })),
  "Canonical.CancelWork": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CancelWork"), operation: Nat })
  ),
  "Canonical.CandidateFile": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CandidateFile"), candidate: Schema.Unknown })
  ),
  "Canonical.CapacityGranted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CapacityGranted"), id: Nat, after: Schema.Unknown })
  ),
  "Canonical.CapacityRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CapacityRefused"), reason: Schema.Unknown, after: Schema.Unknown })
  ),
  "Canonical.CapacityResized": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CapacityResized"), id: Nat, after: Schema.Unknown })
  ),
  "Canonical.CapacityUnitAdmitted": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.CapacityUnitAdmitted"),
      reservation: Nat,
      position: Nat,
      bytes: Nat,
      after: Schema.Unknown
    })
  ),
  "Canonical.CapacityUnitRefused": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.CapacityUnitRefused"),
      position: Nat,
      bytes: Nat,
      reason: Schema.Unknown,
      after: Schema.Unknown
    })
  ),
  "Canonical.CapacityView": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.CapacityView"),
      global: Schema.Unknown,
      local: Schema.Unknown,
      charges: Schema.Unknown
    })
  ),
  "Canonical.CleanupBusy": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CleanupBusy") })),
  "Canonical.CleanupCommitted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CleanupCommitted") })
  ),
  "Canonical.CleanupReady": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CleanupReady") })),
  "Canonical.Clear": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Clear") })),
  "Canonical.CollectionAdviceRetired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionAdviceRetired") })
  ),
  "Canonical.CollectionAfter": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CollectionAfter") })),
  "Canonical.CollectionBackgroundClaimed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionBackgroundClaimed") })
  ),
  "Canonical.CollectionBackgroundKept": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionBackgroundKept") })
  ),
  "Canonical.CollectionBackgroundRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionBackgroundRefused") })
  ),
  "Canonical.CollectionBackgroundReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionBackgroundReleased") })
  ),
  "Canonical.CollectionBefore": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionBefore") })
  ),
  "Canonical.CollectionCandidate": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionCandidate") })
  ),
  "Canonical.CollectionCurrent": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionCurrent") })
  ),
  "Canonical.CollectionEligible": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionEligible") })
  ),
  "Canonical.CollectionEqual": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CollectionEqual") })),
  "Canonical.CollectionExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionExpired") })
  ),
  "Canonical.CollectionFindingExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionFindingExpired") })
  ),
  "Canonical.CollectionFindingLimited": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionFindingLimited") })
  ),
  "Canonical.CollectionFindingRetained": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionFindingRetained") })
  ),
  "Canonical.CollectionFindingSelected": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionFindingSelected") })
  ),
  "Canonical.CollectionFits": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CollectionFits") })),
  "Canonical.CollectionLeaseKept": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionLeaseKept") })
  ),
  "Canonical.CollectionLeaseRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionLeaseRefused") })
  ),
  "Canonical.CollectionLeaseReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionLeaseReleased") })
  ),
  "Canonical.CollectionLeaseReserved": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionLeaseReserved") })
  ),
  "Canonical.CollectionLimited": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionLimited") })
  ),
  "Canonical.CollectionNoticeIncluded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionNoticeIncluded") })
  ),
  "Canonical.CollectionNoticeSkipped": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionNoticeSkipped") })
  ),
  "Canonical.CollectionNoticeStopped": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionNoticeStopped") })
  ),
  "Canonical.CollectionRetainCredential": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionRetainCredential") })
  ),
  "Canonical.CollectionRetireCredential": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionRetireCredential") })
  ),
  "Canonical.CollectionSkip": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CollectionSkip") })),
  "Canonical.CollectionWaiting": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectionWaiting") })
  ),
  "Canonical.CollectorFinalProceed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectorFinalProceed") })
  ),
  "Canonical.CollectorFinalRelease": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectorFinalRelease") })
  ),
  "Canonical.CollectorProceed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectorProceed") })
  ),
  "Canonical.CollectorUnavailable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CollectorUnavailable"), reason: Schema.Unknown })
  ),
  "Canonical.CompletedEditAbsent": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CompletedEditAbsent") })
  ),
  "Canonical.CompletedEditRemembered": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CompletedEditRemembered"), evicted: Schema.Unknown })
  ),
  "Canonical.CompletedEditSeen": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.CompletedEditSeen"), reason: Schema.Unknown, report: Schema.Boolean })
  ),
  "Canonical.ContinuationConsumed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ContinuationConsumed") })
  ),
  "Canonical.ContinuationRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ContinuationRefused") })
  ),
  "Canonical.ContinueCandidate": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ContinueCandidate") })
  ),
  "Canonical.DeliveryAckEmpty": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryAckEmpty") })
  ),
  "Canonical.DeliveryAckExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryAckExpired") })
  ),
  "Canonical.DeliveryAckReady": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryAckReady") })
  ),
  "Canonical.DeliveryBatchProceed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryBatchProceed") })
  ),
  "Canonical.DeliveryBatchRelease": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryBatchRelease") })
  ),
  "Canonical.DeliveryCredentialInvalid": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryCredentialInvalid") })
  ),
  "Canonical.DeliveryCredentialValid": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryCredentialValid") })
  ),
  "Canonical.DeliveryExistingTokenAllowed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryExistingTokenAllowed") })
  ),
  "Canonical.DeliveryExistingTokenDenied": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryExistingTokenDenied") })
  ),
  "Canonical.DeliveryFinalEmpty": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryFinalEmpty") })
  ),
  "Canonical.DeliveryFinalExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryFinalExpired") })
  ),
  "Canonical.DeliveryFinalReady": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryFinalReady") })
  ),
  "Canonical.DeliveryKeepAcknowledged": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryKeepAcknowledged") })
  ),
  "Canonical.DeliveryKeepForReoffer": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryKeepForReoffer") })
  ),
  "Canonical.DeliveryKeepRemaining": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryKeepRemaining") })
  ),
  "Canonical.DeliveryReleaseUnacknowledged": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryReleaseUnacknowledged") })
  ),
  "Canonical.DeliveryRetireAdvice": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryRetireAdvice") })
  ),
  "Canonical.DeliverySubmissionAllowed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliverySubmissionAllowed") })
  ),
  "Canonical.DeliverySubmissionCandidate": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliverySubmissionCandidate") })
  ),
  "Canonical.DeliverySubmissionDenied": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliverySubmissionDenied") })
  ),
  "Canonical.DeliverySubmissionRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliverySubmissionRefused") })
  ),
  "Canonical.DeliveryUnreservedStopAllowed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryUnreservedStopAllowed") })
  ),
  "Canonical.DeliveryUnreservedStopDenied": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DeliveryUnreservedStopDenied") })
  ),
  "Canonical.DiscardAllUnfinished": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DiscardAllUnfinished") })
  ),
  "Canonical.Discarded": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Discarded") })),
  "Canonical.DiscardNamedOnly": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DiscardNamedOnly") })
  ),
  "Canonical.DispatchDiscarded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DispatchDiscarded"), operation: Nat, running: Schema.Boolean })
  ),
  "Canonical.DispatchStarted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.DispatchStarted"), operation: Nat, sequence: Nat })
  ),
  "Canonical.EmptyAccepted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.EmptyAccepted") })),
  "Canonical.EmptyLost": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.EmptyLost") })),
  "Canonical.Failed": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Failed") })),
  "Canonical.FailureBackend": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FailureBackend") })),
  "Canonical.FailureCredential": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FailureCredential") })
  ),
  "Canonical.FailureLost": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FailureLost") })),
  "Canonical.FailureNone": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FailureNone") })),
  "Canonical.FileProtection": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FileProtection"), protection: Schema.Unknown })
  ),
  "Canonical.FileSelection": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FileSelection"), selection: Schema.Unknown })
  ),
  "Canonical.Finding": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Finding") })),
  "Canonical.FindingCountRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FindingCountRecorded") })
  ),
  "Canonical.FinishAllowedDeadline": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FinishAllowedDeadline") })
  ),
  "Canonical.FinishAllowedNoAdvice": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FinishAllowedNoAdvice") })
  ),
  "Canonical.FinishAllowedUnavailable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FinishAllowedUnavailable") })
  ),
  "Canonical.FinishAuthorized": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FinishAuthorized") })
  ),
  "Canonical.FinishEnded": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishEnded") })),
  "Canonical.FinishLimit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishLimit") })),
  "Canonical.FinishNotices": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishNotices") })),
  "Canonical.FinishReady": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishReady") })),
  "Canonical.FinishRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.FinishRecorded"), outcome: Schema.Unknown })
  ),
  "Canonical.FinishRefused": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishRefused") })),
  "Canonical.FinishReleased": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishReleased") })),
  "Canonical.FinishReserved": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FinishReserved") })),
  "Canonical.IgnoreCandidate": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.IgnoreCandidate") })),
  "Canonical.IncludeChoice": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.IncludeChoice"), choice: Schema.Unknown })
  ),
  "Canonical.Interrupted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Interrupted") })),
  "Canonical.JevInterruptionRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.JevInterruptionRecorded") })
  ),
  "Canonical.JevObservationIgnored": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.JevObservationIgnored") })
  ),
  "Canonical.JevRequestIssued": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.JevRequestIssued"),
      partition: Nat,
      lifetime: Nat,
      round: Nat,
      operation: Nat,
      request: Nat
    })
  ),
  "Canonical.JevRequestOutcomeRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.JevRequestOutcomeRecorded"), outcome: Schema.Unknown })
  ),
  "Canonical.JevRequestStartRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.JevRequestStartRecorded") })
  ),
  "Canonical.JevRequestUnavailable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.JevRequestUnavailable") })
  ),
  "Canonical.NeverSent": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NeverSent") })),
  "Canonical.NoticeCommitted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NoticeCommitted") })),
  "Canonical.CreateNoticeKey": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.CreateNoticeKey") })),
  "Canonical.NoticePendingCreated": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticePendingCreated"), count: Nat })
  ),
  "Canonical.NoticeDropped": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NoticeDropped") })),
  "Canonical.NoticeLeaseKept": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NoticeLeaseKept") })),
  "Canonical.NoticeLeased": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NoticeLeased") })),
  "Canonical.NoticePendingMerged": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticePendingMerged"), count: Nat })
  ),
  "Canonical.NoticePendingCleared": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticePendingCleared") })
  ),
  "Canonical.NoticePruned": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.NoticePruned"),
      drop_lease: Schema.Boolean,
      drop_pending: Schema.Boolean,
      drop_key: Schema.Boolean
    })
  ),
  "Canonical.NoticeRefused": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.NoticeRefused") })),
  "Canonical.NoticeRejectedFull": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticeRejectedFull") })
  ),
  "Canonical.NoticeSelected": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticeSelected"), ids: Schema.Unknown })
  ),
  "Canonical.NoticeSuppressed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.NoticeSuppressed"), count: Nat })
  ),
  "Canonical.ObservationAdmitted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ObservationAdmitted"), id: Nat })
  ),
  "Canonical.ObservationCompleted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ObservationCompleted") })
  ),
  "Canonical.ObservationInterrupted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ObservationInterrupted") })
  ),
  "Canonical.ObservationStarted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ObservationStarted") })
  ),
  "Canonical.PartitionRetired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PartitionRetired"), round: Nat })
  ),
  "Canonical.PendingFinding": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PendingFinding"), count: Nat })
  ),
  "Canonical.PermitConsumed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PermitConsumed"), round: Nat })
  ),
  "Canonical.PermitDenied": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PermitDenied"), reason: Schema.Unknown })
  ),
  "Canonical.PermitExpired": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.PermitExpired") })),
  "Canonical.PermitIssued": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PermitIssued"), token: Nat, round: Nat })
  ),
  "Canonical.PermitKept": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.PermitKept") })),
  "Canonical.PermitReleased": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.PermitReleased") })),
  "Canonical.PermitRoundClosed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PermitRoundClosed"), round: Nat })
  ),
  "Canonical.PreparationRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PreparationRefused") })
  ),
  "Canonical.PreparationReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PreparationReleased"), id: Nat, after: Schema.Unknown })
  ),
  "Canonical.Prepare": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.Prepare"), operation: Nat, reservation: Nat })
  ),
  "Canonical.PreparedAdmitted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PreparedAdmitted") })
  ),
  "Canonical.PreparedCapacityRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.PreparedCapacityRefused") })
  ),
  "Canonical.PreparedSkipped": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.PreparedSkipped") })),
  "Canonical.QuietRoundBusy": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.QuietRoundBusy") })),
  "Canonical.QuietRoundExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.QuietRoundExpired"), since: Nat })
  ),
  "Canonical.QuietRoundResetRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.QuietRoundResetRecorded") })
  ),
  "Canonical.QuietRoundWaiting": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.QuietRoundWaiting"), since: Nat })
  ),
  "Canonical.Rejected": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.Rejected"), state: Schema.Unknown, reason: Schema.Unknown })
  ),
  "Canonical.ReleaseCandidate": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReleaseCandidate") })
  ),
  "Canonical.ReofferAtStop": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReofferAtStop") })),
  "Canonical.RequestBackendFailure": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RequestBackendFailure") })
  ),
  "Canonical.RequestClear": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RequestClear") })),
  "Canonical.RequestFinding": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RequestFinding") })),
  "Canonical.RequestInterrupted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RequestInterrupted") })
  ),
  "Canonical.RequestTimeout": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RequestTimeout") })),
  "Canonical.ReservationReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReservationReleased"), id: Nat })
  ),
  "Canonical.RetainCandidate": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RetainCandidate") })),
  "Canonical.FindingRetained": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.FindingRetained") })),
  "Canonical.RetireCandidate": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RetireCandidate") })),
  "Canonical.StaleFindingRetired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.StaleFindingRetired") })
  ),
  "Canonical.ReuseAttached": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseAttached") })),
  "Canonical.ReuseCacheHit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseCacheHit") })),
  "Canonical.ReuseClaimed": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseClaimed") })),
  "Canonical.ReuseAdviceJoined": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseAdviceJoined") })
  ),
  "Canonical.ReuseClaimedJoined": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseClaimedJoined") })
  ),
  "Canonical.ReusePendingJoined": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReusePendingJoined") })
  ),
  "Canonical.ReuseKeepMember": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseKeepMember") })),
  "Canonical.ReuseOwned": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseOwned") })),
  "Canonical.ReuseRefused": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseRefused") })),
  "Canonical.ReuseReleased": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReuseReleased") })),
  "Canonical.ReuseSetMemberClear": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseSetMemberClear") })
  ),
  "Canonical.ReuseSetMemberFinding": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseSetMemberFinding") })
  ),
  "Canonical.ReuseSetMemberLost": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseSetMemberLost") })
  ),
  "Canonical.ReuseSetMemberUnavailable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReuseSetMemberUnavailable") })
  ),
  "Canonical.ReviewAdmission": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReviewAdmission"), admission: Schema.Unknown })
  ),
  "Canonical.ReviewRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.ReviewRecorded"), outcome: Schema.Unknown })
  ),
  "Canonical.ReviewStarted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ReviewStarted") })),
  "Canonical.RevisionCount": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionCount"), count: Nat })
  ),
  "Canonical.RevisionCurrent": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RevisionCurrent") })),
  "Canonical.RevisionGeneration": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionGeneration"), generation: Nat })
  ),
  "Canonical.RevisionNotSuperseded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionNotSuperseded") })
  ),
  "Canonical.RevisionReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionReleased") })
  ),
  "Canonical.RevisionReplaced": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionReplaced"), generation: Nat })
  ),
  "Canonical.RevisionReused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionReused"), generation: Nat })
  ),
  "Canonical.RevisionStale": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RevisionStale") })),
  "Canonical.RevisionSuperseded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RevisionSuperseded") })
  ),
  "Canonical.Round": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.Round"),
      partition: Nat,
      lifetime: Nat,
      id: Nat,
      waiting: Schema.Boolean,
      deciding: Schema.Boolean,
      write: Schema.Unknown,
      uncertain: Schema.Boolean,
      quiet_since: Schema.Unknown
    })
  ),
  "Canonical.RoundActive": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RoundActive") })),
  "Canonical.RoundBarrierClear": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundBarrierClear") })
  ),
  "Canonical.RoundBarrierRaised": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundBarrierRaised") })
  ),
  "Canonical.RoundContinuationAvailable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundContinuationAvailable") })
  ),
  "Canonical.RoundContinuationExhausted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundContinuationExhausted") })
  ),
  "Canonical.RoundExpireCloses": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundExpireCloses") })
  ),
  "Canonical.RoundExpireKeeps": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundExpireKeeps") })
  ),
  "Canonical.RoundInactive": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RoundInactive") })),
  "Canonical.RoundStarted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundStarted"), id: Nat })
  ),
  "Canonical.RoundStopBegun": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RoundStopBegun") })),
  "Canonical.RoundStopNotOwned": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundStopNotOwned") })
  ),
  "Canonical.RoundStopOwned": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.RoundStopOwned") })),
  "Canonical.RoundStopRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RoundStopRefused") })
  ),
  "Canonical.RoundStopTerminal": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.RoundStopTerminal"),
      revoke_provisional: Schema.Boolean,
      close: Schema.Boolean
    })
  ),
  "Canonical.RuleGate": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RuleGate"), gate: Schema.Unknown })
  ),
  "Canonical.RuleOrder": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.RuleOrder"), order: Schema.Unknown })
  ),
  "Canonical.ClearSettled": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.ClearSettled") })),
  "Canonical.StaleClearSettled": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.StaleClearSettled") })
  ),
  "Canonical.State": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.State"),
      ledger: Schema.Unknown,
      rounds: Schema.Unknown,
      work: Schema.Unknown,
      next_round: Nat,
      next_operation: Nat,
      admissions: Schema.Unknown,
      dispatch: Schema.Unknown,
      collection: Schema.Unknown,
      history: Schema.Unknown
    })
  ),
  "Canonical.StopEnded": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.StopEnded") })),
  "Canonical.SubmissionAuthorized": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionAuthorized") })
  ),
  "Canonical.SubmissionBegun": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.SubmissionBegun") })),
  "Canonical.SubmissionCurrent": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionCurrent") })
  ),
  "Canonical.SubmissionExpired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionExpired") })
  ),
  "Canonical.SubmissionForgotten": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionForgotten") })
  ),
  "Canonical.SubmissionNotReofferable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionNotReofferable") })
  ),
  "Canonical.SubmissionRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionRecorded") })
  ),
  "Canonical.SubmissionRefused": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionRefused") })
  ),
  "Canonical.SubmissionReleased": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionReleased") })
  ),
  "Canonical.SubmissionReofferable": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionReofferable") })
  ),
  "Canonical.SubmissionSuppresses": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionSuppresses") })
  ),
  "Canonical.SubmissionUnsuppressed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.SubmissionUnsuppressed") })
  ),
  "Canonical.Unavailable": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Unavailable") })),
  "Canonical.UnitAdmitted": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.UnitAdmitted"),
      operation: Nat,
      reservation: Nat,
      position: Nat,
      bytes: Nat,
      after: Schema.Unknown
    })
  ),
  "Canonical.UnitRefused": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.UnitRefused"),
      position: Nat,
      bytes: Nat,
      reason: Schema.Unknown,
      after: Schema.Unknown
    })
  ),
  "Canonical.Unknown": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.Unknown") })),
  "Canonical.WaitForOutput": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.WaitForOutput") })),
  "Canonical.WaitForWork": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Canonical.WaitForWork") })),
  "Canonical.Work": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Canonical.Work"),
      partition: Nat,
      lifetime: Nat,
      round: Nat,
      operation: Nat,
      charge: Nat,
      kind: Schema.Unknown,
      parent: Nat
    })
  ),
  "Canonical.WriteAuthorized": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.WriteAuthorized"), operation: Nat })
  ),
  "Canonical.WriteRecorded": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Canonical.WriteRecorded"), outcome: Schema.Unknown })
  ),
  "CollectionState.Claim": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectionState.Claim"), group: Nat, owner: Nat })
  ),
  "CollectionState.Lease": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectionState.Lease"), advice: Nat, owner: Nat })
  ),
  "CollectionState.State": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("CollectionState.State"),
      ready: Schema.Unknown,
      leases: Schema.Unknown,
      claims: Schema.Unknown,
      delivery: Schema.Unknown,
      revision: Schema.Unknown,
      reuse: Schema.Unknown,
      notices: Schema.Unknown
    })
  ),
  "CollectorAuthority.Backend": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectorAuthority.Backend") })
  ),
  "CollectorAuthority.Capacity": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectorAuthority.Capacity") })
  ),
  "CollectorAuthority.Credential": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectorAuthority.Credential") })
  ),
  "CollectorAuthority.Expired": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("CollectorAuthority.Expired") })
  ),
  "CollectorAuthority.Lost": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("CollectorAuthority.Lost") })),
  "CollectorAuthority.Stale": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("CollectorAuthority.Stale") })),
  Con: Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Con"), head: Schema.Unknown, tail: Schema.Unknown })),
  "Configuration.AdmitReview": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.AdmitReview") })),
  "Configuration.AllowedPath": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.AllowedPath") })),
  "Configuration.CandidateAllowed": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.CandidateAllowed") })
  ),
  "Configuration.EmptyIncludes": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.EmptyIncludes") })
  ),
  "Configuration.Excluded": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.Excluded") })),
  "Configuration.FileExtension": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.FileExtension") })
  ),
  "Configuration.GeneratedOrVendor": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.GeneratedOrVendor") })
  ),
  "Configuration.KeepIncludes": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.KeepIncludes") })
  ),
  "Configuration.NotIncluded": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.NotIncluded") })),
  "Configuration.Protected": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.Protected") })),
  "Configuration.RefuseConfiguration": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseConfiguration") })
  ),
  "Configuration.RefuseCredential": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseCredential") })
  ),
  "Configuration.RefuseFileKind": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseFileKind") })
  ),
  "Configuration.RefuseGitAdmin": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseGitAdmin") })
  ),
  "Configuration.RefuseGitIgnore": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseGitIgnore") })
  ),
  "Configuration.RefuseRoot": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.RefuseRoot") })),
  "Configuration.RefuseSelection": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RefuseSelection") })
  ),
  "Configuration.ReplaceIncludes": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.ReplaceIncludes") })
  ),
  "Configuration.RepositoryBoundary": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.RepositoryBoundary") })
  ),
  "Configuration.Selected": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Configuration.Selected") })),
  "Configuration.SensitivePath": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Configuration.SensitivePath") })
  ),
  "Delivery.Authorized": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Delivery.Authorized") })),
  "Delivery.Reserved": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Delivery.Reserved") })),
  "Delivery.Submitted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Delivery.Submitted") })),
  "Delivery.Uncertain": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Delivery.Uncertain") })),
  "DeliveryState.Authorized": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("DeliveryState.Authorized") })),
  "DeliveryState.Counter": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("DeliveryState.Counter"), group: Nat, round: Nat, used: Nat })
  ),
  "DeliveryState.Failed": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("DeliveryState.Failed") })),
  "DeliveryState.Reserved": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("DeliveryState.Reserved") })),
  "DeliveryState.Slot": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("DeliveryState.Slot"),
      group: Nat,
      round: Nat,
      attempt: Nat,
      token: Nat,
      selected: Schema.Unknown,
      phase: Schema.Unknown
    })
  ),
  "DeliveryState.State": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("DeliveryState.State"),
      slots: Schema.Unknown,
      counters: Schema.Unknown,
      submissions: Schema.Unknown
    })
  ),
  "DeliveryState.Submitted": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("DeliveryState.Submitted") })),
  "DeliveryState.Uncertain": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("DeliveryState.Uncertain") })),
  "Dispatch.Entry": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Dispatch.Entry"),
      partition: Nat,
      lifetime: Nat,
      round: Nat,
      operation: Nat,
      sequence: Nat,
      cancelled: Schema.Boolean,
      preparation: Schema.Boolean
    })
  ),
  "Dispatch.Request": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Dispatch.Request"),
      partition: Nat,
      lifetime: Nat,
      round: Nat,
      operation: Nat,
      request: Nat,
      started: Schema.Boolean,
      interrupted: Schema.Boolean
    })
  ),
  "Dispatch.State": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Dispatch.State"),
      queued: Schema.Unknown,
      running: Schema.Unknown,
      next_sequence: Nat,
      closed: Schema.Boolean,
      requests: Schema.Unknown
    })
  ),
  "EditHistory.Closed": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("EditHistory.Closed") })),
  "EditHistory.Completed": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("EditHistory.Completed"),
      tool: Nat,
      reason: Schema.Unknown,
      reported: Schema.Boolean
    })
  ),
  "EditHistory.Consumed": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("EditHistory.Consumed") })),
  "EditHistory.Expired": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("EditHistory.Expired") })),
  "EditHistory.Released": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("EditHistory.Released") })),
  "EditHistory.State": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("EditHistory.State"), entries: Schema.Unknown })
  ),
  "Handoff.Authorized": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Handoff.Authorized"), token: Nat, surface: Schema.Unknown })
  ),
  "Handoff.Available": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Handoff.Available") })),
  "Handoff.Background": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Handoff.Background") })),
  "Handoff.Edit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Handoff.Edit") })),
  "Handoff.Lease": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Handoff.Lease"),
      item: Nat,
      round: Nat,
      closed: Schema.Boolean,
      reoffered: Schema.Boolean,
      phase: Schema.Unknown
    })
  ),
  "Handoff.Reserved": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Handoff.Reserved"), token: Nat, surface: Schema.Unknown })
  ),
  "Handoff.Stop": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Handoff.Stop") })),
  "Handoff.Submitted": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Handoff.Submitted"), surface: Schema.Unknown })
  ),
  "Handoff.Uncertain": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Handoff.Uncertain"), surface: Schema.Unknown })
  ),
  "Ledger.AdviceRecheck": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.AdviceRecheck") })),
  "Ledger.Charge": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Ledger.Charge"), id: Nat, partition: Nat, bytes: Nat, purpose: Schema.Unknown })
  ),
  "Ledger.GlobalByteLimit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.GlobalByteLimit") })),
  "Ledger.GlobalItemLimit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.GlobalItemLimit") })),
  "Ledger.InventoryEntry": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Ledger.InventoryEntry"), purpose: Schema.Unknown, limits: Schema.Unknown })
  ),
  "Ledger.Ledger": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Ledger.Ledger"), limits: Schema.Unknown, next_id: Nat, charges: Schema.Unknown })
  ),
  "Ledger.Limits": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("Ledger.Limits"),
      global_items: Nat,
      global_bytes: Nat,
      partition_items: Nat,
      partition_bytes: Nat
    })
  ),
  "Ledger.ObservationDispatch": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("Ledger.ObservationDispatch") })
  ),
  "Ledger.OperationalNotice": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.OperationalNotice") })),
  "Ledger.PartitionByteLimit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.PartitionByteLimit") })),
  "Ledger.PartitionItemLimit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.PartitionItemLimit") })),
  "Ledger.Preparation": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.Preparation") })),
  "Ledger.ReviewUnit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.ReviewUnit") })),
  "Ledger.StoredResult": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.StoredResult") })),
  "Ledger.Usage": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Ledger.Usage"), items: Nat, bytes: Nat })),
  Nil: Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Nil") })),
  None: Schema.suspend(() => Schema.Struct({ $: Schema.Literal("None") })),
  "NoticeState.Pending": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("NoticeState.Pending"),
      id: Nat,
      count: Nat,
      sequence: Nat,
      leased: Schema.Boolean
    })
  ),
  "NoticeState.Record": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("NoticeState.Record"),
      id: Nat,
      partition: Nat,
      group: Nat,
      reservation: Nat,
      suppressed: Nat,
      pending: Schema.Unknown
    })
  ),
  "NoticeState.State": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("NoticeState.State"), records: Schema.Unknown })
  ),
  "ReuseState.Claim": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("ReuseState.Claim"), id: Nat, attached: Schema.Boolean })
  ),
  "ReuseState.Entry": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("ReuseState.Entry"), id: Nat, partition: Nat, bytes: Nat, reservation: Nat })
  ),
  "ReuseState.State": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("ReuseState.State"), claims: Schema.Unknown, cache: Schema.Unknown })
  ),
  "RevisionState.Entry": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("RevisionState.Entry"), subject: Nat, input: Nat, generation: Nat, members: Nat })
  ),
  "RevisionState.State": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("RevisionState.State"), entries: Schema.Unknown, next_generation: Nat })
  ),
  "RulePolicy.Admit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("RulePolicy.Admit") })),
  "RulePolicy.After": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("RulePolicy.After") })),
  "RulePolicy.Before": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("RulePolicy.Before") })),
  "RulePolicy.Equal": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("RulePolicy.Equal") })),
  "RulePolicy.Omit": Schema.suspend(() => Schema.Struct({ $: Schema.Literal("RulePolicy.Omit") })),
  Some: Schema.suspend(() => Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown })),
  "SubmissionState.Batch": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("SubmissionState.Batch"),
      advice: Nat,
      group: Nat,
      round: Nat,
      token: Nat,
      surface: Schema.Unknown,
      phase: Schema.Unknown,
      fingerprints: Schema.Unknown,
      units: Schema.Unknown
    })
  ),
  "SubmissionState.LeaseRecord": Schema.suspend(() =>
    Schema.Struct({
      $: Schema.Literal("SubmissionState.LeaseRecord"),
      advice: Nat,
      fingerprint: Nat,
      current: Schema.Unknown,
      previous: Schema.Unknown
    })
  ),
  "SubmissionState.State": Schema.suspend(() =>
    Schema.Struct({ $: Schema.Literal("SubmissionState.State"), leases: Schema.Unknown, batches: Schema.Unknown })
  )
} as const

type CanonicalConstructorTemplate = { readonly name: string; readonly value: Readonly<Record<string, unknown>> }
type CanonicalConstructorReuseTransaction = {
  readonly parent: CanonicalConstructorReuseTransaction | undefined
  readonly staged: Array<readonly [object, CanonicalConstructorTemplate]>
  readonly byValue: WeakMap<object, CanonicalConstructorTemplate>
}

const canonicalConstructorTemplates = new WeakMap<object, CanonicalConstructorTemplate>()
let activeCanonicalConstructorReuse: CanonicalConstructorReuseTransaction | undefined

/** Scope constructor template reuse to a complete, trusted canonical projection. */
export const withCanonicalConstructorReuse = <A>(project: () => A): A => {
  const transaction: CanonicalConstructorReuseTransaction = {
    parent: activeCanonicalConstructorReuse,
    staged: [],
    byValue: new WeakMap()
  }
  activeCanonicalConstructorReuse = transaction
  try {
    const result = project()
    if (transaction.parent === undefined) {
      for (const [value, entry] of transaction.staged) {
        if (!canonicalConstructorTemplates.has(value)) canonicalConstructorTemplates.set(value, entry)
      }
    } else {
      for (const [value, entry] of transaction.staged) {
        if (!transaction.parent.byValue.has(value)) {
          transaction.parent.byValue.set(value, entry)
          transaction.parent.staged.push([value, entry])
        }
      }
    }
    return result
  } finally {
    activeCanonicalConstructorReuse = transaction.parent
  }
}

const cachedCanonicalConstructor = (value: object, name: string): Record<string, unknown> | undefined => {
  for (let transaction = activeCanonicalConstructorReuse; transaction !== undefined; transaction = transaction.parent) {
    const entry = transaction.byValue.get(value)
    if (entry?.name === name) return { ...entry.value }
  }
  const entry = canonicalConstructorTemplates.get(value)
  return entry?.name === name ? { ...entry.value } : undefined
}

const cacheableCanonicalConstructorInput = (value: unknown, decoded: Record<string, unknown>): value is object => {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.isFrozen(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>
  if (!Reflect.ownKeys(descriptors).every((key) => "value" in descriptors[key]!)) return false
  return Reflect.ownKeys(decoded).every((key) => {
    const descriptor = descriptors[key]
    return descriptor !== undefined && "value" in descriptor
  })
}

const stageCanonicalConstructorTemplate = (value: unknown, name: string, decoded: Record<string, unknown>): void => {
  const transaction = activeCanonicalConstructorReuse
  if (transaction === undefined || !cacheableCanonicalConstructorInput(value, decoded)) return
  const source = value as object
  if (transaction.byValue.has(source) || canonicalConstructorTemplates.has(source)) return
  const entry: CanonicalConstructorTemplate = { name, value: Object.freeze({ ...decoded }) }
  transaction.byValue.set(source, entry)
  transaction.staged.push([source, entry])
}

// Compile a constructor interpreter only when that constructor crosses the boundary.
const decoders = new Map<string, (value: unknown) => Record<string, unknown>>()
const decodeWithCanonicalConstructor = (value: unknown, name: string): Record<string, unknown> => {
  let decode = decoders.get(name)
  if (decode === undefined) {
    if (!Object.hasOwn(CanonicalConstructors, name)) throw new TypeError(`unknown canonical constructor ${name}`)
    const schema = CanonicalConstructors[name as keyof typeof CanonicalConstructors]
    decode = decoder(schema)
    decoders.set(name, decode)
  }
  return decode(value)
}

/** Public boundary decoding always validates the supplied value. */
export const decodeCanonicalConstructor = (value: unknown, name: string): Record<string, unknown> =>
  decodeWithCanonicalConstructor(value, name)

/** Owner-internal decoding for records reached from an admitted canonical projection. */
export const decodeCanonicalProjectionConstructor = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && activeCanonicalConstructorReuse !== undefined) {
    const cached = cachedCanonicalConstructor(value, name)
    if (cached !== undefined) return cached
  }
  const decoded = decodeWithCanonicalConstructor(value, name)
  stageCanonicalConstructorTemplate(value, name, decoded)
  return decoded
}

const CanonicalRejectionSchema = Schema.Union([
  Schema.Struct({
    $: Schema.Literals([
      "Canonical.InvalidIdentity",
      "Canonical.RoundLimit",
      "Canonical.StaleRound",
      "Canonical.StaleOperation",
      "Canonical.WrongStage",
      "Canonical.InconsistentLedger",
      "Canonical.ProspectiveDenied",
      "Canonical.AdviceePermitLimit",
      "Canonical.ResidentPermitLimit"
    ])
  }),
  Schema.Struct({
    $: Schema.Literal("Canonical.PermitDenied"),
    reason: Schema.Struct({
      $: Schema.Literals([
        "Admission.WrongPartition",
        "Admission.WrongLifetime",
        "Admission.StaleInvocation",
        "Admission.Expired",
        "Admission.DuplicateTool",
        "Admission.NoPermit",
        "Admission.WrongTool",
        "Admission.OldRound",
        "Admission.InvalidClock",
        "Admission.RoundAlreadyClosed",
        "Admission.LifetimeNotFresh"
      ])
    })
  })
])
export const decodeCanonicalRejection = decoder(CanonicalRejectionSchema)
