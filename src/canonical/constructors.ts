import { Schema } from "effect";
import { Nat, decoder } from "./boundary-schema.ts";

// Lists and nested constructors are decoded separately, so linked tails stay stack safe.
// Every constructor has an exact field set. Scalar domains are shared with input schemas.
export const CanonicalConstructors = {
  "Canonical.AwaitingSourceRead": Schema.Struct({ $: Schema.Literal("Canonical.AwaitingSourceRead") }), 
  "Canonical.SourceReading": Schema.Struct({ $: Schema.Literal("Canonical.SourceReading") }), 
  "Canonical.Preparing": Schema.Struct({ $: Schema.Literal("Canonical.Preparing") }), 
  "Canonical.Reviewing": Schema.Struct({ $: Schema.Literal("Canonical.Reviewing") }), 
  "Canonical.AtJev": Schema.Struct({ $: Schema.Literal("Canonical.AtJev") }), 
  "Admission.AdmissionState": Schema.Struct({
    $: Schema.Literal("Admission.AdmissionState"),
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    active: Schema.Boolean,
    closed_at: Nat,
    next_token: Nat,
    permits: Schema.Unknown,
  }),
  "Admission.DuplicateTool": Schema.Struct({
    $: Schema.Literal("Admission.DuplicateTool"),
  }),
  "Admission.Expired": Schema.Struct({
    $: Schema.Literal("Admission.Expired"),
  }),
  "Admission.InvalidClock": Schema.Struct({
    $: Schema.Literal("Admission.InvalidClock"),
  }),
  "Admission.LifetimeNotFresh": Schema.Struct({
    $: Schema.Literal("Admission.LifetimeNotFresh"),
  }),
  "Admission.NoPermit": Schema.Struct({
    $: Schema.Literal("Admission.NoPermit"),
  }),
  "Admission.OldRound": Schema.Struct({
    $: Schema.Literal("Admission.OldRound"),
  }),
  "Admission.Permit": Schema.Struct({
    $: Schema.Literal("Admission.Permit"),
    token: Nat,
    tool: Nat,
    round: Nat,
    started: Nat,
    deadline: Nat,
  }),
  "Admission.RoundAlreadyClosed": Schema.Struct({
    $: Schema.Literal("Admission.RoundAlreadyClosed"),
  }),
  "Admission.StaleInvocation": Schema.Struct({
    $: Schema.Literal("Admission.StaleInvocation"),
  }),
  "Admission.WrongLifetime": Schema.Struct({
    $: Schema.Literal("Admission.WrongLifetime"),
  }),
  "Admission.WrongPartition": Schema.Struct({
    $: Schema.Literal("Admission.WrongPartition"),
  }),
  "Admission.WrongTool": Schema.Struct({
    $: Schema.Literal("Admission.WrongTool"),
  }),
  "Canonical.Acknowledged": Schema.Struct({
    $: Schema.Literal("Canonical.Acknowledged"),
  }),
  "Canonical.AdmissionForgotten": Schema.Struct({
    $: Schema.Literal("Canonical.AdmissionForgotten"),
  }),
  "Canonical.Advanced": Schema.Struct({
    $: Schema.Literal("Canonical.Advanced"),
    state: Schema.Unknown,
    commands: Schema.Unknown,
  }),
  "Canonical.CacheAlready": Schema.Struct({
    $: Schema.Literal("Canonical.CacheAlready"),
  }),
  "Canonical.CacheCommitted": Schema.Struct({
    $: Schema.Literal("Canonical.CacheCommitted"),
  }),
  "Canonical.CacheDiscarded": Schema.Struct({
    $: Schema.Literal("Canonical.CacheDiscarded"),
    ids: Schema.Unknown,
  }),
  "Canonical.CachePrepared": Schema.Struct({
    $: Schema.Literal("Canonical.CachePrepared"),
    evicted: Schema.Unknown,
  }),
  "Canonical.CacheRejected": Schema.Struct({
    $: Schema.Literal("Canonical.CacheRejected"),
  }),
  "Canonical.CancelWork": Schema.Struct({
    $: Schema.Literal("Canonical.CancelWork"),
    operation: Nat,
  }),
  "Canonical.CandidateFile": Schema.Struct({
    $: Schema.Literal("Canonical.CandidateFile"),
    candidate: Schema.Unknown,
  }),
  "Canonical.CapacityGranted": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityGranted"),
    id: Nat,
    after: Schema.Unknown,
  }),
  "Canonical.CapacityRefused": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityRefused"),
    reason: Schema.Unknown,
    after: Schema.Unknown,
  }),
  "Canonical.CapacityResized": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityResized"),
    id: Nat,
    after: Schema.Unknown,
  }),
  "Canonical.CapacityUnitAdmitted": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityUnitAdmitted"),
    reservation: Nat,
    position: Nat,
    bytes: Nat,
    after: Schema.Unknown,
  }),
  "Canonical.CapacityUnitRefused": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityUnitRefused"),
    position: Nat,
    bytes: Nat,
    reason: Schema.Unknown,
    after: Schema.Unknown,
  }),
  "Canonical.CapacityView": Schema.Struct({
    $: Schema.Literal("Canonical.CapacityView"),
    global: Schema.Unknown,
    local: Schema.Unknown,
    charges: Schema.Unknown,
  }),
  "Canonical.CleanupBusy": Schema.Struct({
    $: Schema.Literal("Canonical.CleanupBusy"),
  }),
  "Canonical.CleanupCommitted": Schema.Struct({
    $: Schema.Literal("Canonical.CleanupCommitted"),
  }),
  "Canonical.CleanupReady": Schema.Struct({
    $: Schema.Literal("Canonical.CleanupReady"),
  }),
  "Canonical.Clear": Schema.Struct({ $: Schema.Literal("Canonical.Clear") }),
  "Canonical.CollectionAdviceRetired": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionAdviceRetired"),
  }),
  "Canonical.CollectionAfter": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionAfter"),
  }),
  "Canonical.CollectionBackgroundClaimed": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionBackgroundClaimed"),
  }),
  "Canonical.CollectionBackgroundKept": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionBackgroundKept"),
  }),
  "Canonical.CollectionBackgroundRefused": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionBackgroundRefused"),
  }),
  "Canonical.CollectionBackgroundReleased": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionBackgroundReleased"),
  }),
  "Canonical.CollectionBefore": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionBefore"),
  }),
  "Canonical.CollectionCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionCandidate"),
  }),
  "Canonical.CollectionCurrent": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionCurrent"),
  }),
  "Canonical.CollectionEligible": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionEligible"),
  }),
  "Canonical.CollectionEqual": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionEqual"),
  }),
  "Canonical.CollectionExpired": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionExpired"),
  }),
  "Canonical.CollectionFindingExpired": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionFindingExpired"),
  }),
  "Canonical.CollectionFindingLimited": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionFindingLimited"),
  }),
  "Canonical.CollectionFindingRetained": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionFindingRetained"),
  }),
  "Canonical.CollectionFindingSelected": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionFindingSelected"),
  }),
  "Canonical.CollectionFits": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionFits"),
  }),
  "Canonical.CollectionLeaseKept": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionLeaseKept"),
  }),
  "Canonical.CollectionLeaseRefused": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionLeaseRefused"),
  }),
  "Canonical.CollectionLeaseReleased": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionLeaseReleased"),
  }),
  "Canonical.CollectionLeaseReserved": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionLeaseReserved"),
  }),
  "Canonical.CollectionLimited": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionLimited"),
  }),
  "Canonical.CollectionNoticeIncluded": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionNoticeIncluded"),
  }),
  "Canonical.CollectionNoticeSkipped": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionNoticeSkipped"),
  }),
  "Canonical.CollectionNoticeStopped": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionNoticeStopped"),
  }),
  "Canonical.CollectionRetainCredential": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionRetainCredential"),
  }),
  "Canonical.CollectionRetireCredential": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionRetireCredential"),
  }),
  "Canonical.CollectionSkip": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionSkip"),
  }),
  "Canonical.CollectionWaiting": Schema.Struct({
    $: Schema.Literal("Canonical.CollectionWaiting"),
  }),
  "Canonical.CollectorFinalProceed": Schema.Struct({
    $: Schema.Literal("Canonical.CollectorFinalProceed"),
  }),
  "Canonical.CollectorFinalRelease": Schema.Struct({
    $: Schema.Literal("Canonical.CollectorFinalRelease"),
  }),
  "Canonical.CollectorProceed": Schema.Struct({
    $: Schema.Literal("Canonical.CollectorProceed"),
  }),
  "Canonical.CollectorUnavailable": Schema.Struct({
    $: Schema.Literal("Canonical.CollectorUnavailable"),
    reason: Schema.Unknown,
  }),
  "Canonical.CompletedEditAbsent": Schema.Struct({
    $: Schema.Literal("Canonical.CompletedEditAbsent"),
  }),
  "Canonical.CompletedEditRemembered": Schema.Struct({
    $: Schema.Literal("Canonical.CompletedEditRemembered"),
    evicted: Schema.Unknown,
  }),
  "Canonical.CompletedEditSeen": Schema.Struct({
    $: Schema.Literal("Canonical.CompletedEditSeen"),
    reason: Schema.Unknown,
    report: Schema.Boolean,
  }),
  "Canonical.ContinuationConsumed": Schema.Struct({
    $: Schema.Literal("Canonical.ContinuationConsumed"),
  }),
  "Canonical.ContinuationRefused": Schema.Struct({
    $: Schema.Literal("Canonical.ContinuationRefused"),
  }),
  "Canonical.ContinueCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.ContinueCandidate"),
  }),
  "Canonical.DeliveryAckEmpty": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryAckEmpty"),
  }),
  "Canonical.DeliveryAckExpired": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryAckExpired"),
  }),
  "Canonical.DeliveryAckReady": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryAckReady"),
  }),
  "Canonical.DeliveryBatchProceed": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryBatchProceed"),
  }),
  "Canonical.DeliveryBatchRelease": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryBatchRelease"),
  }),
  "Canonical.DeliveryCredentialInvalid": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryCredentialInvalid"),
  }),
  "Canonical.DeliveryCredentialValid": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryCredentialValid"),
  }),
  "Canonical.DeliveryExistingTokenAllowed": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryExistingTokenAllowed"),
  }),
  "Canonical.DeliveryExistingTokenDenied": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryExistingTokenDenied"),
  }),
  "Canonical.DeliveryFinalEmpty": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryFinalEmpty"),
  }),
  "Canonical.DeliveryFinalExpired": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryFinalExpired"),
  }),
  "Canonical.DeliveryFinalReady": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryFinalReady"),
  }),
  "Canonical.DeliveryKeepAcknowledged": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryKeepAcknowledged"),
  }),
  "Canonical.DeliveryKeepForReoffer": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryKeepForReoffer"),
  }),
  "Canonical.DeliveryKeepRemaining": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryKeepRemaining"),
  }),
  "Canonical.DeliveryReleaseUnacknowledged": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryReleaseUnacknowledged"),
  }),
  "Canonical.DeliveryRetireAdvice": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryRetireAdvice"),
  }),
  "Canonical.DeliverySubmissionAllowed": Schema.Struct({
    $: Schema.Literal("Canonical.DeliverySubmissionAllowed"),
  }),
  "Canonical.DeliverySubmissionCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.DeliverySubmissionCandidate"),
  }),
  "Canonical.DeliverySubmissionDenied": Schema.Struct({
    $: Schema.Literal("Canonical.DeliverySubmissionDenied"),
  }),
  "Canonical.DeliverySubmissionRefused": Schema.Struct({
    $: Schema.Literal("Canonical.DeliverySubmissionRefused"),
  }),
  "Canonical.DeliveryUnreservedStopAllowed": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryUnreservedStopAllowed"),
  }),
  "Canonical.DeliveryUnreservedStopDenied": Schema.Struct({
    $: Schema.Literal("Canonical.DeliveryUnreservedStopDenied"),
  }),
  "Canonical.DiscardAllUnfinished": Schema.Struct({
    $: Schema.Literal("Canonical.DiscardAllUnfinished"),
  }),
  "Canonical.Discarded": Schema.Struct({
    $: Schema.Literal("Canonical.Discarded"),
  }),
  "Canonical.DiscardNamedOnly": Schema.Struct({
    $: Schema.Literal("Canonical.DiscardNamedOnly"),
  }),
  "Canonical.DispatchDiscarded": Schema.Struct({
    $: Schema.Literal("Canonical.DispatchDiscarded"),
    operation: Nat,
    running: Schema.Boolean,
  }),
  "Canonical.DispatchStarted": Schema.Struct({
    $: Schema.Literal("Canonical.DispatchStarted"),
    operation: Nat,
    sequence: Nat,
  }),
  "Canonical.EmptyAccepted": Schema.Struct({
    $: Schema.Literal("Canonical.EmptyAccepted"),
  }),
  "Canonical.EmptyLost": Schema.Struct({
    $: Schema.Literal("Canonical.EmptyLost"),
  }),
  "Canonical.Failed": Schema.Struct({ $: Schema.Literal("Canonical.Failed") }),
  "Canonical.FailureBackend": Schema.Struct({
    $: Schema.Literal("Canonical.FailureBackend"),
  }),
  "Canonical.FailureCredential": Schema.Struct({
    $: Schema.Literal("Canonical.FailureCredential"),
  }),
  "Canonical.FailureLost": Schema.Struct({
    $: Schema.Literal("Canonical.FailureLost"),
  }),
  "Canonical.FailureNone": Schema.Struct({
    $: Schema.Literal("Canonical.FailureNone"),
  }),
  "Canonical.FileProtection": Schema.Struct({
    $: Schema.Literal("Canonical.FileProtection"),
    protection: Schema.Unknown,
  }),
  "Canonical.FileSelection": Schema.Struct({
    $: Schema.Literal("Canonical.FileSelection"),
    selection: Schema.Unknown,
  }),
  "Canonical.Finding": Schema.Struct({
    $: Schema.Literal("Canonical.Finding"),
  }),
  "Canonical.FindingCountRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.FindingCountRecorded"),
  }),
  "Canonical.FinishAllowedDeadline": Schema.Struct({
    $: Schema.Literal("Canonical.FinishAllowedDeadline"),
  }),
  "Canonical.FinishAllowedNoAdvice": Schema.Struct({
    $: Schema.Literal("Canonical.FinishAllowedNoAdvice"),
  }),
  "Canonical.FinishAllowedUnavailable": Schema.Struct({
    $: Schema.Literal("Canonical.FinishAllowedUnavailable"),
  }),
  "Canonical.FinishAuthorized": Schema.Struct({
    $: Schema.Literal("Canonical.FinishAuthorized"),
  }),
  "Canonical.FinishEnded": Schema.Struct({
    $: Schema.Literal("Canonical.FinishEnded"),
  }),
  "Canonical.FinishLimit": Schema.Struct({
    $: Schema.Literal("Canonical.FinishLimit"),
  }),
  "Canonical.FinishNotices": Schema.Struct({
    $: Schema.Literal("Canonical.FinishNotices"),
  }),
  "Canonical.FinishReady": Schema.Struct({
    $: Schema.Literal("Canonical.FinishReady"),
  }),
  "Canonical.FinishRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.FinishRecorded"),
    outcome: Schema.Unknown,
  }),
  "Canonical.FinishRefused": Schema.Struct({
    $: Schema.Literal("Canonical.FinishRefused"),
  }),
  "Canonical.FinishReleased": Schema.Struct({
    $: Schema.Literal("Canonical.FinishReleased"),
  }),
  "Canonical.FinishReserved": Schema.Struct({
    $: Schema.Literal("Canonical.FinishReserved"),
  }),
  "Canonical.IgnoreCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.IgnoreCandidate"),
  }),
  "Canonical.IncludeChoice": Schema.Struct({
    $: Schema.Literal("Canonical.IncludeChoice"),
    choice: Schema.Unknown,
  }),
  "Canonical.Interrupted": Schema.Struct({
    $: Schema.Literal("Canonical.Interrupted"),
  }),
  "Canonical.JevInterruptionRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.JevInterruptionRecorded"),
  }),
  "Canonical.JevObservationIgnored": Schema.Struct({
    $: Schema.Literal("Canonical.JevObservationIgnored"),
  }),
  "Canonical.JevRequestIssued": Schema.Struct({
    $: Schema.Literal("Canonical.JevRequestIssued"),
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    operation: Nat,
    request: Nat,
  }),
  "Canonical.JevRequestOutcomeRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.JevRequestOutcomeRecorded"),
    outcome: Schema.Unknown,
  }),
  "Canonical.JevRequestStartRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.JevRequestStartRecorded"),
  }),
  "Canonical.JevRequestUnavailable": Schema.Struct({
    $: Schema.Literal("Canonical.JevRequestUnavailable"),
  }),
  "Canonical.NeverSent": Schema.Struct({
    $: Schema.Literal("Canonical.NeverSent"),
  }),
  "Canonical.NoticeCommitted": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeCommitted"),
  }),
  "Canonical.NoticeCreateKey": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeCreateKey"),
  }),
  "Canonical.NoticeCreatePending": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeCreatePending"),
    count: Nat,
  }),
  "Canonical.NoticeDropped": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeDropped"),
  }),
  "Canonical.NoticeKeepLeased": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeKeepLeased"),
  }),
  "Canonical.NoticeLeased": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeLeased"),
  }),
  "Canonical.NoticeMergePending": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeMergePending"),
    count: Nat,
  }),
  "Canonical.NoticePendingCleared": Schema.Struct({
    $: Schema.Literal("Canonical.NoticePendingCleared"),
  }),
  "Canonical.NoticePruned": Schema.Struct({
    $: Schema.Literal("Canonical.NoticePruned"),
    drop_lease: Schema.Boolean,
    drop_pending: Schema.Boolean,
    drop_key: Schema.Boolean,
  }),
  "Canonical.NoticeRefused": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeRefused"),
  }),
  "Canonical.NoticeRejectedFull": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeRejectedFull"),
  }),
  "Canonical.NoticeSelected": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeSelected"),
    ids: Schema.Unknown,
  }),
  "Canonical.NoticeSuppressed": Schema.Struct({
    $: Schema.Literal("Canonical.NoticeSuppressed"),
    count: Nat,
  }),
  "Canonical.ObservationAdmitted": Schema.Struct({
    $: Schema.Literal("Canonical.ObservationAdmitted"),
    id: Nat,
  }),
  "Canonical.ObservationCompleted": Schema.Struct({
    $: Schema.Literal("Canonical.ObservationCompleted"),
  }),
  "Canonical.ObservationInterrupted": Schema.Struct({
    $: Schema.Literal("Canonical.ObservationInterrupted"),
  }),
  "Canonical.ObservationStarted": Schema.Struct({
    $: Schema.Literal("Canonical.ObservationStarted"),
  }),
  "Canonical.PartitionRetired": Schema.Struct({
    $: Schema.Literal("Canonical.PartitionRetired"),
    round: Nat,
  }),
  "Canonical.PendingFinding": Schema.Struct({
    $: Schema.Literal("Canonical.PendingFinding"),
    count: Nat,
  }),
  "Canonical.PermitConsumed": Schema.Struct({
    $: Schema.Literal("Canonical.PermitConsumed"),
    round: Nat,
  }),
  "Canonical.PermitDenied": Schema.Struct({
    $: Schema.Literal("Canonical.PermitDenied"),
    reason: Schema.Unknown,
  }),
  "Canonical.PermitExpired": Schema.Struct({
    $: Schema.Literal("Canonical.PermitExpired"),
  }),
  "Canonical.PermitIssued": Schema.Struct({
    $: Schema.Literal("Canonical.PermitIssued"),
    token: Nat,
    round: Nat,
  }),
  "Canonical.PermitKept": Schema.Struct({
    $: Schema.Literal("Canonical.PermitKept"),
  }),
  "Canonical.PermitReleased": Schema.Struct({
    $: Schema.Literal("Canonical.PermitReleased"),
  }),
  "Canonical.PermitRoundClosed": Schema.Struct({
    $: Schema.Literal("Canonical.PermitRoundClosed"),
    round: Nat,
  }),
  "Canonical.PreparationRefused": Schema.Struct({
    $: Schema.Literal("Canonical.PreparationRefused"),
  }),
  "Canonical.PreparationReleased": Schema.Struct({
    $: Schema.Literal("Canonical.PreparationReleased"),
    id: Nat,
    after: Schema.Unknown,
  }),
  "Canonical.Prepare": Schema.Struct({
    $: Schema.Literal("Canonical.Prepare"),
    operation: Nat,
    reservation: Nat,
  }),
  "Canonical.PreparedAdmitted": Schema.Struct({
    $: Schema.Literal("Canonical.PreparedAdmitted"),
  }),
  "Canonical.PreparedCapacityRefused": Schema.Struct({
    $: Schema.Literal("Canonical.PreparedCapacityRefused"),
  }),
  "Canonical.PreparedSkipped": Schema.Struct({
    $: Schema.Literal("Canonical.PreparedSkipped"),
  }),
  "Canonical.QuietRoundBusy": Schema.Struct({
    $: Schema.Literal("Canonical.QuietRoundBusy"),
  }),
  "Canonical.QuietRoundExpired": Schema.Struct({
    $: Schema.Literal("Canonical.QuietRoundExpired"),
    since: Nat,
  }),
  "Canonical.QuietRoundResetRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.QuietRoundResetRecorded"),
  }),
  "Canonical.QuietRoundWaiting": Schema.Struct({
    $: Schema.Literal("Canonical.QuietRoundWaiting"),
    since: Nat,
  }),
  "Canonical.Rejected": Schema.Struct({
    $: Schema.Literal("Canonical.Rejected"),
    state: Schema.Unknown,
    reason: Schema.Unknown,
  }),
  "Canonical.ReleaseCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.ReleaseCandidate"),
  }),
  "Canonical.ReofferAtStop": Schema.Struct({
    $: Schema.Literal("Canonical.ReofferAtStop"),
  }),
  "Canonical.RequestBackendFailure": Schema.Struct({
    $: Schema.Literal("Canonical.RequestBackendFailure"),
  }),
  "Canonical.RequestClear": Schema.Struct({
    $: Schema.Literal("Canonical.RequestClear"),
  }),
  "Canonical.RequestFinding": Schema.Struct({
    $: Schema.Literal("Canonical.RequestFinding"),
  }),
  "Canonical.RequestInterrupted": Schema.Struct({
    $: Schema.Literal("Canonical.RequestInterrupted"),
  }),
  "Canonical.RequestTimeout": Schema.Struct({
    $: Schema.Literal("Canonical.RequestTimeout"),
  }),
  "Canonical.ReservationReleased": Schema.Struct({
    $: Schema.Literal("Canonical.ReservationReleased"),
    id: Nat,
  }),
  "Canonical.RetainCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.RetainCandidate"),
  }),
  "Canonical.RetainFinding": Schema.Struct({
    $: Schema.Literal("Canonical.RetainFinding"),
  }),
  "Canonical.RetireCandidate": Schema.Struct({
    $: Schema.Literal("Canonical.RetireCandidate"),
  }),
  "Canonical.RetireStaleFinding": Schema.Struct({
    $: Schema.Literal("Canonical.RetireStaleFinding"),
  }),
  "Canonical.ReuseAttached": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseAttached"),
  }),
  "Canonical.ReuseCached": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseCached"),
  }),
  "Canonical.ReuseClaimed": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseClaimed"),
  }),
  "Canonical.ReuseJoinAdvice": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseJoinAdvice"),
  }),
  "Canonical.ReuseJoinClaimed": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseJoinClaimed"),
  }),
  "Canonical.ReuseJoinPending": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseJoinPending"),
  }),
  "Canonical.ReuseKeepMember": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseKeepMember"),
  }),
  "Canonical.ReuseOwn": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseOwn"),
  }),
  "Canonical.ReuseRefused": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseRefused"),
  }),
  "Canonical.ReuseReleased": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseReleased"),
  }),
  "Canonical.ReuseSetMemberClear": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseSetMemberClear"),
  }),
  "Canonical.ReuseSetMemberFinding": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseSetMemberFinding"),
  }),
  "Canonical.ReuseSetMemberLost": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseSetMemberLost"),
  }),
  "Canonical.ReuseSetMemberUnavailable": Schema.Struct({
    $: Schema.Literal("Canonical.ReuseSetMemberUnavailable"),
  }),
  "Canonical.ReviewAdmission": Schema.Struct({
    $: Schema.Literal("Canonical.ReviewAdmission"),
    admission: Schema.Unknown,
  }),
  "Canonical.ReviewRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.ReviewRecorded"),
    outcome: Schema.Unknown,
  }),
  "Canonical.ReviewStarted": Schema.Struct({
    $: Schema.Literal("Canonical.ReviewStarted"),
  }),
  "Canonical.RevisionCount": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionCount"),
    count: Nat,
  }),
  "Canonical.RevisionCurrent": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionCurrent"),
  }),
  "Canonical.RevisionGeneration": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionGeneration"),
    generation: Nat,
  }),
  "Canonical.RevisionNotSuperseded": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionNotSuperseded"),
  }),
  "Canonical.RevisionReleased": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionReleased"),
  }),
  "Canonical.RevisionReplaced": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionReplaced"),
    generation: Nat,
  }),
  "Canonical.RevisionReused": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionReused"),
    generation: Nat,
  }),
  "Canonical.RevisionStale": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionStale"),
  }),
  "Canonical.RevisionSuperseded": Schema.Struct({
    $: Schema.Literal("Canonical.RevisionSuperseded"),
  }),
  "Canonical.Round": Schema.Struct({
    $: Schema.Literal("Canonical.Round"),
    partition: Nat,
    lifetime: Nat,
    id: Nat,
    waiting: Schema.Boolean,
    deciding: Schema.Boolean,
    write: Schema.Unknown,
    uncertain: Schema.Boolean,
    quiet_since: Schema.Unknown,
  }),
  "Canonical.RoundActive": Schema.Struct({
    $: Schema.Literal("Canonical.RoundActive"),
  }),
  "Canonical.RoundBarrierClear": Schema.Struct({
    $: Schema.Literal("Canonical.RoundBarrierClear"),
  }),
  "Canonical.RoundBarrierRaised": Schema.Struct({
    $: Schema.Literal("Canonical.RoundBarrierRaised"),
  }),
  "Canonical.RoundContinuationAvailable": Schema.Struct({
    $: Schema.Literal("Canonical.RoundContinuationAvailable"),
  }),
  "Canonical.RoundContinuationExhausted": Schema.Struct({
    $: Schema.Literal("Canonical.RoundContinuationExhausted"),
  }),
  "Canonical.RoundExpireCloses": Schema.Struct({
    $: Schema.Literal("Canonical.RoundExpireCloses"),
  }),
  "Canonical.RoundExpireKeeps": Schema.Struct({
    $: Schema.Literal("Canonical.RoundExpireKeeps"),
  }),
  "Canonical.RoundInactive": Schema.Struct({
    $: Schema.Literal("Canonical.RoundInactive"),
  }),
  "Canonical.RoundStarted": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStarted"),
    id: Nat,
  }),
  "Canonical.RoundStopBegun": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStopBegun"),
  }),
  "Canonical.RoundStopNotOwned": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStopNotOwned"),
  }),
  "Canonical.RoundStopOwned": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStopOwned"),
  }),
  "Canonical.RoundStopRefused": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStopRefused"),
  }),
  "Canonical.RoundStopTerminal": Schema.Struct({
    $: Schema.Literal("Canonical.RoundStopTerminal"),
    revoke_provisional: Schema.Boolean,
    close: Schema.Boolean,
  }),
  "Canonical.RuleGate": Schema.Struct({
    $: Schema.Literal("Canonical.RuleGate"),
    gate: Schema.Unknown,
  }),
  "Canonical.RuleOrder": Schema.Struct({
    $: Schema.Literal("Canonical.RuleOrder"),
    order: Schema.Unknown,
  }),
  "Canonical.SettleClear": Schema.Struct({
    $: Schema.Literal("Canonical.SettleClear"),
  }),
  "Canonical.SettleStaleClear": Schema.Struct({
    $: Schema.Literal("Canonical.SettleStaleClear"),
  }),
  "Canonical.State": Schema.Struct({
    $: Schema.Literal("Canonical.State"),
    ledger: Schema.Unknown,
    rounds: Schema.Unknown,
    work: Schema.Unknown,
    next_round: Nat,
    next_operation: Nat,
    admissions: Schema.Unknown,
    dispatch: Schema.Unknown,
    collection: Schema.Unknown,
    history: Schema.Unknown,
  }),
  "Canonical.StopEnded": Schema.Struct({
    $: Schema.Literal("Canonical.StopEnded"),
  }),
  "Canonical.SubmissionAuthorized": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionAuthorized"),
  }),
  "Canonical.SubmissionBegun": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionBegun"),
  }),
  "Canonical.SubmissionCurrent": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionCurrent"),
  }),
  "Canonical.SubmissionExpired": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionExpired"),
  }),
  "Canonical.SubmissionForgotten": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionForgotten"),
  }),
  "Canonical.SubmissionNotReofferable": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionNotReofferable"),
  }),
  "Canonical.SubmissionRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionRecorded"),
  }),
  "Canonical.SubmissionRefused": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionRefused"),
  }),
  "Canonical.SubmissionReleased": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionReleased"),
  }),
  "Canonical.SubmissionReofferable": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionReofferable"),
  }),
  "Canonical.SubmissionSuppresses": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionSuppresses"),
  }),
  "Canonical.SubmissionUnsuppressed": Schema.Struct({
    $: Schema.Literal("Canonical.SubmissionUnsuppressed"),
  }),
  "Canonical.Unavailable": Schema.Struct({
    $: Schema.Literal("Canonical.Unavailable"),
  }),
  "Canonical.UnitAdmitted": Schema.Struct({
    $: Schema.Literal("Canonical.UnitAdmitted"),
    operation: Nat,
    reservation: Nat,
    position: Nat,
    bytes: Nat,
    after: Schema.Unknown,
  }),
  "Canonical.UnitRefused": Schema.Struct({
    $: Schema.Literal("Canonical.UnitRefused"),
    position: Nat,
    bytes: Nat,
    reason: Schema.Unknown,
    after: Schema.Unknown,
  }),
  "Canonical.Unknown": Schema.Struct({
    $: Schema.Literal("Canonical.Unknown"),
  }),
  "Canonical.WaitForOutput": Schema.Struct({
    $: Schema.Literal("Canonical.WaitForOutput"),
  }),
  "Canonical.WaitForWork": Schema.Struct({
    $: Schema.Literal("Canonical.WaitForWork"),
  }),
  "Canonical.Work": Schema.Struct({
    $: Schema.Literal("Canonical.Work"),
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    operation: Nat,
    charge: Nat,
    kind: Schema.Unknown,
    parent: Nat,
  }),
  "Canonical.WriteAuthorized": Schema.Struct({
    $: Schema.Literal("Canonical.WriteAuthorized"),
    operation: Nat,
  }),
  "Canonical.WriteRecorded": Schema.Struct({
    $: Schema.Literal("Canonical.WriteRecorded"),
    outcome: Schema.Unknown,
  }),
  "CollectionState.Claim": Schema.Struct({
    $: Schema.Literal("CollectionState.Claim"),
    group: Nat,
    owner: Nat,
  }),
  "CollectionState.Lease": Schema.Struct({
    $: Schema.Literal("CollectionState.Lease"),
    advice: Nat,
    owner: Nat,
  }),
  "CollectionState.State": Schema.Struct({
    $: Schema.Literal("CollectionState.State"),
    ready: Schema.Unknown,
    leases: Schema.Unknown,
    claims: Schema.Unknown,
    delivery: Schema.Unknown,
    revision: Schema.Unknown,
    reuse: Schema.Unknown,
    notices: Schema.Unknown,
  }),
  "CollectorAuthority.Backend": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Backend"),
  }),
  "CollectorAuthority.Capacity": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Capacity"),
  }),
  "CollectorAuthority.Credential": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Credential"),
  }),
  "CollectorAuthority.Expired": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Expired"),
  }),
  "CollectorAuthority.Lost": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Lost"),
  }),
  "CollectorAuthority.Stale": Schema.Struct({
    $: Schema.Literal("CollectorAuthority.Stale"),
  }),
  Con: Schema.Struct({
    $: Schema.Literal("Con"),
    head: Schema.Unknown,
    tail: Schema.Unknown,
  }),
  "Configuration.AdmitReview": Schema.Struct({
    $: Schema.Literal("Configuration.AdmitReview"),
  }),
  "Configuration.AllowedPath": Schema.Struct({
    $: Schema.Literal("Configuration.AllowedPath"),
  }),
  "Configuration.CandidateAllowed": Schema.Struct({
    $: Schema.Literal("Configuration.CandidateAllowed"),
  }),
  "Configuration.EmptyIncludes": Schema.Struct({
    $: Schema.Literal("Configuration.EmptyIncludes"),
  }),
  "Configuration.Excluded": Schema.Struct({
    $: Schema.Literal("Configuration.Excluded"),
  }),
  "Configuration.FileExtension": Schema.Struct({
    $: Schema.Literal("Configuration.FileExtension"),
  }),
  "Configuration.GeneratedOrVendor": Schema.Struct({
    $: Schema.Literal("Configuration.GeneratedOrVendor"),
  }),
  "Configuration.KeepIncludes": Schema.Struct({
    $: Schema.Literal("Configuration.KeepIncludes"),
  }),
  "Configuration.NotIncluded": Schema.Struct({
    $: Schema.Literal("Configuration.NotIncluded"),
  }),
  "Configuration.Protected": Schema.Struct({
    $: Schema.Literal("Configuration.Protected"),
  }),
  "Configuration.RefuseConfiguration": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseConfiguration"),
  }),
  "Configuration.RefuseCredential": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseCredential"),
  }),
  "Configuration.RefuseFileKind": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseFileKind"),
  }),
  "Configuration.RefuseGitAdmin": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseGitAdmin"),
  }),
  "Configuration.RefuseGitIgnore": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseGitIgnore"),
  }),
  "Configuration.RefuseRoot": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseRoot"),
  }),
  "Configuration.RefuseSelection": Schema.Struct({
    $: Schema.Literal("Configuration.RefuseSelection"),
  }),
  "Configuration.ReplaceIncludes": Schema.Struct({
    $: Schema.Literal("Configuration.ReplaceIncludes"),
  }),
  "Configuration.RepositoryBoundary": Schema.Struct({
    $: Schema.Literal("Configuration.RepositoryBoundary"),
  }),
  "Configuration.Selected": Schema.Struct({
    $: Schema.Literal("Configuration.Selected"),
  }),
  "Configuration.SensitivePath": Schema.Struct({
    $: Schema.Literal("Configuration.SensitivePath"),
  }),
  "Delivery.Authorized": Schema.Struct({
    $: Schema.Literal("Delivery.Authorized"),
  }),
  "Delivery.Reserved": Schema.Struct({
    $: Schema.Literal("Delivery.Reserved"),
  }),
  "Delivery.Submitted": Schema.Struct({
    $: Schema.Literal("Delivery.Submitted"),
  }),
  "Delivery.Uncertain": Schema.Struct({
    $: Schema.Literal("Delivery.Uncertain"),
  }),
  "DeliveryState.Authorized": Schema.Struct({
    $: Schema.Literal("DeliveryState.Authorized"),
  }),
  "DeliveryState.Counter": Schema.Struct({
    $: Schema.Literal("DeliveryState.Counter"),
    group: Nat,
    round: Nat,
    used: Nat,
  }),
  "DeliveryState.Failed": Schema.Struct({
    $: Schema.Literal("DeliveryState.Failed"),
  }),
  "DeliveryState.Reserved": Schema.Struct({
    $: Schema.Literal("DeliveryState.Reserved"),
  }),
  "DeliveryState.Slot": Schema.Struct({
    $: Schema.Literal("DeliveryState.Slot"),
    group: Nat,
    round: Nat,
    attempt: Nat,
    token: Nat,
    selected: Schema.Unknown,
    phase: Schema.Unknown,
  }),
  "DeliveryState.State": Schema.Struct({
    $: Schema.Literal("DeliveryState.State"),
    slots: Schema.Unknown,
    counters: Schema.Unknown,
    submissions: Schema.Unknown,
  }),
  "DeliveryState.Submitted": Schema.Struct({
    $: Schema.Literal("DeliveryState.Submitted"),
  }),
  "DeliveryState.Uncertain": Schema.Struct({
    $: Schema.Literal("DeliveryState.Uncertain"),
  }),
  "Dispatch.Entry": Schema.Struct({
    $: Schema.Literal("Dispatch.Entry"),
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    operation: Nat,
    sequence: Nat,
    cancelled: Schema.Boolean,
    preparation: Schema.Boolean,
  }),
  "Dispatch.Request": Schema.Struct({
    $: Schema.Literal("Dispatch.Request"),
    partition: Nat,
    lifetime: Nat,
    round: Nat,
    operation: Nat,
    request: Nat,
    started: Schema.Boolean,
    interrupted: Schema.Boolean,
  }),
  "Dispatch.State": Schema.Struct({
    $: Schema.Literal("Dispatch.State"),
    queued: Schema.Unknown,
    running: Schema.Unknown,
    next_sequence: Nat,
    closed: Schema.Boolean,
    requests: Schema.Unknown,
  }),
  "EditHistory.Closed": Schema.Struct({
    $: Schema.Literal("EditHistory.Closed"),
  }),
  "EditHistory.Completed": Schema.Struct({
    $: Schema.Literal("EditHistory.Completed"),
    tool: Nat,
    reason: Schema.Unknown,
    reported: Schema.Boolean,
  }),
  "EditHistory.Consumed": Schema.Struct({
    $: Schema.Literal("EditHistory.Consumed"),
  }),
  "EditHistory.Expired": Schema.Struct({
    $: Schema.Literal("EditHistory.Expired"),
  }),
  "EditHistory.Released": Schema.Struct({
    $: Schema.Literal("EditHistory.Released"),
  }),
  "EditHistory.State": Schema.Struct({
    $: Schema.Literal("EditHistory.State"),
    entries: Schema.Unknown,
  }),
  "Handoff.Authorized": Schema.Struct({
    $: Schema.Literal("Handoff.Authorized"),
    token: Nat,
    surface: Schema.Unknown,
  }),
  "Handoff.Available": Schema.Struct({
    $: Schema.Literal("Handoff.Available"),
  }),
  "Handoff.Background": Schema.Struct({
    $: Schema.Literal("Handoff.Background"),
  }),
  "Handoff.Edit": Schema.Struct({ $: Schema.Literal("Handoff.Edit") }),
  "Handoff.Lease": Schema.Struct({
    $: Schema.Literal("Handoff.Lease"),
    item: Nat,
    round: Nat,
    closed: Schema.Boolean,
    reoffered: Schema.Boolean,
    phase: Schema.Unknown,
  }),
  "Handoff.Reserved": Schema.Struct({
    $: Schema.Literal("Handoff.Reserved"),
    token: Nat,
    surface: Schema.Unknown,
  }),
  "Handoff.Stop": Schema.Struct({ $: Schema.Literal("Handoff.Stop") }),
  "Handoff.Submitted": Schema.Struct({
    $: Schema.Literal("Handoff.Submitted"),
    surface: Schema.Unknown,
  }),
  "Handoff.Uncertain": Schema.Struct({
    $: Schema.Literal("Handoff.Uncertain"),
    surface: Schema.Unknown,
  }),
  "Ledger.AdviceRecheck": Schema.Struct({
    $: Schema.Literal("Ledger.AdviceRecheck"),
  }),
  "Ledger.Charge": Schema.Struct({
    $: Schema.Literal("Ledger.Charge"),
    id: Nat,
    partition: Nat,
    bytes: Nat,
    purpose: Schema.Unknown,
  }),
  "Ledger.GlobalByteLimit": Schema.Struct({
    $: Schema.Literal("Ledger.GlobalByteLimit"),
  }),
  "Ledger.GlobalItemLimit": Schema.Struct({
    $: Schema.Literal("Ledger.GlobalItemLimit"),
  }),
  "Ledger.InventoryEntry": Schema.Struct({
    $: Schema.Literal("Ledger.InventoryEntry"),
    purpose: Schema.Unknown,
    limits: Schema.Unknown,
  }),
  "Ledger.Ledger": Schema.Struct({
    $: Schema.Literal("Ledger.Ledger"),
    limits: Schema.Unknown,
    next_id: Nat,
    charges: Schema.Unknown,
  }),
  "Ledger.Limits": Schema.Struct({
    $: Schema.Literal("Ledger.Limits"),
    global_items: Nat,
    global_bytes: Nat,
    partition_items: Nat,
    partition_bytes: Nat,
  }),
  "Ledger.ObservationDispatch": Schema.Struct({
    $: Schema.Literal("Ledger.ObservationDispatch"),
  }),
  "Ledger.OperationalNotice": Schema.Struct({
    $: Schema.Literal("Ledger.OperationalNotice"),
  }),
  "Ledger.PartitionByteLimit": Schema.Struct({
    $: Schema.Literal("Ledger.PartitionByteLimit"),
  }),
  "Ledger.PartitionItemLimit": Schema.Struct({
    $: Schema.Literal("Ledger.PartitionItemLimit"),
  }),
  "Ledger.Preparation": Schema.Struct({
    $: Schema.Literal("Ledger.Preparation"),
  }),
  "Ledger.ReviewUnit": Schema.Struct({
    $: Schema.Literal("Ledger.ReviewUnit"),
  }),
  "Ledger.StoredResult": Schema.Struct({
    $: Schema.Literal("Ledger.StoredResult"),
  }),
  "Ledger.Usage": Schema.Struct({
    $: Schema.Literal("Ledger.Usage"),
    items: Nat,
    bytes: Nat,
  }),
  Nil: Schema.Struct({ $: Schema.Literal("Nil") }),
  None: Schema.Struct({ $: Schema.Literal("None") }),
  "NoticeState.Pending": Schema.Struct({
    $: Schema.Literal("NoticeState.Pending"),
    id: Nat,
    count: Nat,
    sequence: Nat,
    leased: Schema.Boolean,
  }),
  "NoticeState.Record": Schema.Struct({
    $: Schema.Literal("NoticeState.Record"),
    id: Nat,
    partition: Nat,
    group: Nat,
    reservation: Nat,
    suppressed: Nat,
    pending: Schema.Unknown,
  }),
  "NoticeState.State": Schema.Struct({
    $: Schema.Literal("NoticeState.State"),
    records: Schema.Unknown,
  }),
  "ReuseState.Claim": Schema.Struct({
    $: Schema.Literal("ReuseState.Claim"),
    id: Nat,
    attached: Schema.Boolean,
  }),
  "ReuseState.Entry": Schema.Struct({
    $: Schema.Literal("ReuseState.Entry"),
    id: Nat,
    partition: Nat,
    bytes: Nat,
    reservation: Nat,
  }),
  "ReuseState.State": Schema.Struct({
    $: Schema.Literal("ReuseState.State"),
    claims: Schema.Unknown,
    cache: Schema.Unknown,
  }),
  "RevisionState.Entry": Schema.Struct({
    $: Schema.Literal("RevisionState.Entry"),
    subject: Nat,
    input: Nat,
    generation: Nat,
    members: Nat,
  }),
  "RevisionState.State": Schema.Struct({
    $: Schema.Literal("RevisionState.State"),
    entries: Schema.Unknown,
    next_generation: Nat,
  }),
  "RulePolicy.Admit": Schema.Struct({ $: Schema.Literal("RulePolicy.Admit") }),
  "RulePolicy.After": Schema.Struct({ $: Schema.Literal("RulePolicy.After") }),
  "RulePolicy.Before": Schema.Struct({
    $: Schema.Literal("RulePolicy.Before"),
  }),
  "RulePolicy.Equal": Schema.Struct({ $: Schema.Literal("RulePolicy.Equal") }),
  "RulePolicy.Omit": Schema.Struct({ $: Schema.Literal("RulePolicy.Omit") }),
  Some: Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown }),
  "SubmissionState.Batch": Schema.Struct({
    $: Schema.Literal("SubmissionState.Batch"),
    advice: Nat,
    group: Nat,
    round: Nat,
    token: Nat,
    surface: Schema.Unknown,
    phase: Schema.Unknown,
    fingerprints: Schema.Unknown,
    units: Schema.Unknown,
  }),
  "SubmissionState.LeaseRecord": Schema.Struct({
    $: Schema.Literal("SubmissionState.LeaseRecord"),
    advice: Nat,
    fingerprint: Nat,
    current: Schema.Unknown,
    previous: Schema.Unknown,
  }),
  "SubmissionState.State": Schema.Struct({
    $: Schema.Literal("SubmissionState.State"),
    leases: Schema.Unknown,
    batches: Schema.Unknown,
  }),
} as const;

const decoders = new Map<string, (value: unknown) => Record<string, unknown>>(
  Object.entries(CanonicalConstructors).map(([name, schema]) => [
    name,
    decoder(schema),
  ]),
);
export const decodeCanonicalConstructor = (
  value: unknown,
  name: string,
): Record<string, unknown> => {
  const decode = decoders.get(name);
  if (decode === undefined)
    throw new TypeError(`unknown canonical constructor ${name}`);
  return decode(value);
};

const CanonicalRejectionSchema = Schema.Union([
  Schema.Struct({ $: Schema.Literals([
    "Canonical.InvalidIdentity", "Canonical.RoundLimit", "Canonical.StaleRound",
    "Canonical.StaleOperation", "Canonical.WrongStage", "Canonical.InconsistentLedger",
    "Canonical.ProspectiveDenied", "Canonical.AdviceePermitLimit", "Canonical.ResidentPermitLimit",
  ]) }),
  Schema.Struct({ $: Schema.Literal("Canonical.PermitDenied"), reason: Schema.Struct({ $: Schema.Literals([
    "Admission.WrongPartition", "Admission.WrongLifetime", "Admission.StaleInvocation",
    "Admission.Expired", "Admission.DuplicateTool", "Admission.NoPermit", "Admission.WrongTool",
    "Admission.OldRound", "Admission.InvalidClock", "Admission.RoundAlreadyClosed", "Admission.LifetimeNotFresh",
  ]) }) }),
]);
export const decodeCanonicalRejection = decoder(CanonicalRejectionSchema);
