// Exact Canonical state and output transport; payload contracts retain their existing owner.
import type {
  Canonical_Outcome,
  Canonical_RequestOutcome,
  Canonical_WriteOutcome,
  EditHistory_Reason,
  Handoff_Surface,
  Ledger_Purpose,
  RulePolicy_Order
} from "./raw-canonical-event.d.ts"
export type List<Value> =
  | { readonly $: "Nil" }
  | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }
type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }
export type Canonical_State = {
  readonly $: "Canonical.State"
  readonly ledger: Ledger_Ledger
  readonly rounds: List<Canonical_Round>
  readonly work: List<Canonical_Work>
  readonly next_round: number
  readonly next_operation: number
  readonly admissions: List<Admission_AdmissionState>
  readonly dispatch: Dispatch_State
  readonly collection: CollectionState_State
  readonly history: EditHistory_State
}

export type Ledger_Ledger = {
  readonly $: "Ledger.Ledger"
  readonly limits: Ledger_Limits
  readonly next_id: number
  readonly charges: List<Ledger_Charge>
}

export type Ledger_Limits = {
  readonly $: "Ledger.Limits"
  readonly global_items: number
  readonly global_bytes: number
  readonly partition_items: number
  readonly partition_bytes: number
}

export type Ledger_Charge = {
  readonly $: "Ledger.Charge"
  readonly id: number
  readonly partition: number
  readonly bytes: number
  readonly purpose: Ledger_Purpose
}

export type Canonical_Round = {
  readonly $: "Canonical.Round"
  readonly partition: number
  readonly lifetime: number
  readonly id: number
  readonly waiting: boolean
  readonly deciding: boolean
  readonly write: Maybe<number>
  readonly uncertain: boolean
  readonly quiet_since: Maybe<number>
}

export type Canonical_Work = {
  readonly $: "Canonical.Work"
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly operation: number
  readonly charge: number
  readonly kind: Canonical_WorkKind
  readonly parent: number
}

export type Canonical_WorkKind =
  | { readonly $: "Canonical.AwaitingSourceRead" }
  | { readonly $: "Canonical.SourceReading" }
  | { readonly $: "Canonical.Preparing" }
  | { readonly $: "Canonical.Reviewing" }
  | { readonly $: "Canonical.AtJev" }
  | { readonly $: "Canonical.PendingFinding"; readonly count: number }

export type Admission_AdmissionState = {
  readonly $: "Admission.AdmissionState"
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly active: boolean
  readonly closed_at: number
  readonly next_token: number
  readonly permits: List<Admission_Permit>
}

export type Admission_Permit = {
  readonly $: "Admission.Permit"
  readonly token: number
  readonly tool: number
  readonly round: number
  readonly started: number
  readonly deadline: number
}

export type Dispatch_State = {
  readonly $: "Dispatch.State"
  readonly queued: List<Dispatch_Entry>
  readonly running: List<Dispatch_Entry>
  readonly next_sequence: number
  readonly closed: boolean
  readonly requests: List<Dispatch_Request>
}

export type Dispatch_Entry = {
  readonly $: "Dispatch.Entry"
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly operation: number
  readonly sequence: number
  readonly cancelled: boolean
  readonly preparation: boolean
}

export type Dispatch_Request = {
  readonly $: "Dispatch.Request"
  readonly partition: number
  readonly lifetime: number
  readonly round: number
  readonly operation: number
  readonly request: number
  readonly started: boolean
  readonly interrupted: boolean
}

export type CollectionState_State = {
  readonly $: "CollectionState.State"
  readonly ready: List<number>
  readonly leases: List<CollectionState_Lease>
  readonly claims: List<CollectionState_Claim>
  readonly delivery: DeliveryState_State
  readonly revision: RevisionState_State
  readonly reuse: ReuseState_State
  readonly notices: NoticeState_State
}

export type CollectionState_Lease = {
  readonly $: "CollectionState.Lease"
  readonly advice: number
  readonly owner: number
}

export type CollectionState_Claim = {
  readonly $: "CollectionState.Claim"
  readonly group: number
  readonly owner: number
}

export type DeliveryState_State = {
  readonly $: "DeliveryState.State"
  readonly slots: List<DeliveryState_Slot>
  readonly counters: List<DeliveryState_Counter>
  readonly submissions: SubmissionState_State
}

export type DeliveryState_Slot = {
  readonly $: "DeliveryState.Slot"
  readonly group: number
  readonly round: number
  readonly attempt: number
  readonly token: number
  readonly selected: List<number>
  readonly phase: DeliveryState_Phase
}

export type DeliveryState_Phase =
  | { readonly $: "DeliveryState.Reserved" }
  | { readonly $: "DeliveryState.Authorized" }
  | { readonly $: "DeliveryState.Submitted" }
  | { readonly $: "DeliveryState.Failed" }
  | { readonly $: "DeliveryState.Uncertain" }

export type DeliveryState_Counter = {
  readonly $: "DeliveryState.Counter"
  readonly group: number
  readonly round: number
  readonly used: number
}

export type SubmissionState_State = {
  readonly $: "SubmissionState.State"
  readonly leases: List<SubmissionState_LeaseRecord>
  readonly batches: List<SubmissionState_Batch>
}

export type SubmissionState_LeaseRecord = {
  readonly $: "SubmissionState.LeaseRecord"
  readonly advice: number
  readonly fingerprint: number
  readonly current: Handoff_Lease
  readonly previous: Maybe<Handoff_Lease>
}

export type Handoff_Lease = {
  readonly $: "Handoff.Lease"
  readonly item: number
  readonly round: number
  readonly closed: boolean
  readonly reoffered: boolean
  readonly phase: Handoff_LeasePhase
}

export type Handoff_LeasePhase =
  | { readonly $: "Handoff.Available" }
  | { readonly $: "Handoff.Reserved"; readonly token: number; readonly surface: Handoff_Surface }
  | { readonly $: "Handoff.Authorized"; readonly token: number; readonly surface: Handoff_Surface }
  | { readonly $: "Handoff.Submitted"; readonly surface: Handoff_Surface }
  | { readonly $: "Handoff.Uncertain"; readonly surface: Handoff_Surface }

export type SubmissionState_Batch = {
  readonly $: "SubmissionState.Batch"
  readonly advice: number
  readonly group: number
  readonly round: number
  readonly token: number
  readonly surface: Handoff_Surface
  readonly phase: Delivery_Phase
  readonly fingerprints: List<number>
  readonly units: List<number>
}

export type Delivery_Phase =
  | { readonly $: "Delivery.Reserved" }
  | { readonly $: "Delivery.Authorized" }
  | { readonly $: "Delivery.Submitted" }
  | { readonly $: "Delivery.Uncertain" }

export type RevisionState_State = {
  readonly $: "RevisionState.State"
  readonly entries: List<RevisionState_Entry>
  readonly next_generation: number
}

export type RevisionState_Entry = {
  readonly $: "RevisionState.Entry"
  readonly subject: number
  readonly input: number
  readonly generation: number
  readonly members: number
}

export type ReuseState_State = {
  readonly $: "ReuseState.State"
  readonly claims: List<ReuseState_Claim>
  readonly cache: List<ReuseState_Entry>
}

export type ReuseState_Claim = { readonly $: "ReuseState.Claim"; readonly id: number; readonly attached: boolean }

export type ReuseState_Entry = {
  readonly $: "ReuseState.Entry"
  readonly id: number
  readonly partition: number
  readonly bytes: number
  readonly reservation: number
}

export type NoticeState_State = { readonly $: "NoticeState.State"; readonly records: List<NoticeState_Record> }

export type NoticeState_Record = {
  readonly $: "NoticeState.Record"
  readonly id: number
  readonly partition: number
  readonly group: number
  readonly reservation: number
  readonly suppressed: number
  readonly pending: Maybe<NoticeState_Pending>
}

export type NoticeState_Pending = {
  readonly $: "NoticeState.Pending"
  readonly id: number
  readonly count: number
  readonly sequence: number
  readonly leased: boolean
}

export type EditHistory_State = { readonly $: "EditHistory.State"; readonly entries: List<EditHistory_Completed> }

export type EditHistory_Completed = {
  readonly $: "EditHistory.Completed"
  readonly tool: number
  readonly reason: EditHistory_Reason
  readonly reported: boolean
}

export type Canonical_Output =
  | { readonly $: "Canonical.ActionRequested"; readonly request: Canonical_ActionRequest }
  | { readonly $: "Canonical.EventEstablished"; readonly event: Canonical_DomainEvent }
  | { readonly $: "Canonical.PolicyDecided"; readonly decision: Canonical_PolicyDecision }

export type Canonical_ActionRequest =
  | { readonly $: "Canonical.Prepare"; readonly operation: number; readonly reservation: number }
  | { readonly $: "Canonical.CancelWork"; readonly operation: number }
  | { readonly $: "Canonical.CreateNoticeKey" }

export type Canonical_DomainEvent =
  | { readonly $: "Canonical.CapacityGranted"; readonly id: number; readonly after: Canonical_CapacityView }
  | { readonly $: "Canonical.CapacityResized"; readonly id: number; readonly after: Canonical_CapacityView }
  | {
      readonly $: "Canonical.CapacityUnitAdmitted"
      readonly reservation: number
      readonly position: number
      readonly bytes: number
      readonly after: Canonical_CapacityView
    }
  | { readonly $: "Canonical.PermitIssued"; readonly token: number; readonly round: number }
  | { readonly $: "Canonical.CompletedEditSeen"; readonly reason: EditHistory_Reason; readonly report: boolean }
  | { readonly $: "Canonical.CompletedEditRemembered"; readonly evicted: Maybe<number> }
  | { readonly $: "Canonical.QuietRoundBusy" }
  | { readonly $: "Canonical.QuietRoundWaiting"; readonly since: number }
  | { readonly $: "Canonical.QuietRoundResetRecorded" }
  | { readonly $: "Canonical.PermitConsumed"; readonly round: number }
  | { readonly $: "Canonical.PermitReleased" }
  | { readonly $: "Canonical.PermitExpired" }
  | { readonly $: "Canonical.PermitRoundClosed"; readonly round: number }
  | { readonly $: "Canonical.RoundStarted"; readonly id: number }
  | { readonly $: "Canonical.ObservationAdmitted"; readonly id: number }
  | { readonly $: "Canonical.ObservationStarted" }
  | { readonly $: "Canonical.ObservationCompleted" }
  | { readonly $: "Canonical.ObservationInterrupted" }
  | {
      readonly $: "Canonical.UnitAdmitted"
      readonly operation: number
      readonly reservation: number
      readonly position: number
      readonly bytes: number
      readonly after: Canonical_CapacityView
    }
  | { readonly $: "Canonical.PreparationReleased"; readonly id: number; readonly after: Canonical_CapacityView }
  | { readonly $: "Canonical.ReviewStarted" }
  | {
      readonly $: "Canonical.JevRequestIssued"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
    }
  | { readonly $: "Canonical.JevRequestStartRecorded" }
  | { readonly $: "Canonical.JevInterruptionRecorded" }
  | { readonly $: "Canonical.JevRequestOutcomeRecorded"; readonly outcome: Canonical_RequestOutcome }
  | { readonly $: "Canonical.ReservationReleased"; readonly id: number }
  | { readonly $: "Canonical.ReviewRecorded"; readonly outcome: Canonical_Outcome }
  | { readonly $: "Canonical.FindingRetained" }
  | { readonly $: "Canonical.FindingCountRecorded" }
  | { readonly $: "Canonical.ClearSettled" }
  | { readonly $: "Canonical.StaleClearSettled" }
  | { readonly $: "Canonical.StaleFindingRetired" }
  | { readonly $: "Canonical.DispatchStarted"; readonly operation: number; readonly sequence: number }
  | { readonly $: "Canonical.DispatchDiscarded"; readonly operation: number; readonly running: boolean }
  | { readonly $: "Canonical.WaitForWork" }
  | { readonly $: "Canonical.FinishReady" }
  | { readonly $: "Canonical.FinishLimit" }
  | { readonly $: "Canonical.StopEnded" }
  | { readonly $: "Canonical.CollectionEligible" }
  | { readonly $: "Canonical.CollectionLeaseReserved" }
  | { readonly $: "Canonical.CollectionLeaseReleased" }
  | { readonly $: "Canonical.CollectionAdviceRetired" }
  | { readonly $: "Canonical.CollectionBackgroundClaimed" }
  | { readonly $: "Canonical.CollectionBackgroundReleased" }
  | { readonly $: "Canonical.FinishReserved" }
  | { readonly $: "Canonical.FinishReleased" }
  | { readonly $: "Canonical.FinishAuthorized" }
  | { readonly $: "Canonical.FinishRecorded"; readonly outcome: Canonical_WriteOutcome }
  | { readonly $: "Canonical.FinishEnded" }
  | { readonly $: "Canonical.ContinuationConsumed" }
  | { readonly $: "Canonical.SubmissionBegun" }
  | { readonly $: "Canonical.SubmissionAuthorized" }
  | { readonly $: "Canonical.SubmissionRecorded" }
  | { readonly $: "Canonical.SubmissionReleased" }
  | { readonly $: "Canonical.SubmissionForgotten" }
  | { readonly $: "Canonical.RevisionReused"; readonly generation: number }
  | { readonly $: "Canonical.RevisionReplaced"; readonly generation: number }
  | { readonly $: "Canonical.RevisionReleased" }
  | { readonly $: "Canonical.CleanupCommitted" }
  | { readonly $: "Canonical.ReuseAdviceJoined" }
  | { readonly $: "Canonical.ReusePendingJoined" }
  | { readonly $: "Canonical.ReuseClaimedJoined" }
  | { readonly $: "Canonical.ReuseCacheHit" }
  | { readonly $: "Canonical.ReuseOwned" }
  | { readonly $: "Canonical.ReuseClaimed" }
  | { readonly $: "Canonical.ReuseAttached" }
  | { readonly $: "Canonical.ReuseReleased" }
  | { readonly $: "Canonical.CachePrepared"; readonly evicted: List<number> }
  | { readonly $: "Canonical.CacheCommitted" }
  | { readonly $: "Canonical.CacheDiscarded"; readonly ids: List<number> }
  | { readonly $: "Canonical.NoticeSuppressed"; readonly count: number }
  | { readonly $: "Canonical.NoticePendingCreated"; readonly count: number }
  | { readonly $: "Canonical.NoticePendingMerged"; readonly count: number }
  | { readonly $: "Canonical.NoticeLeaseKept" }
  | { readonly $: "Canonical.NoticeCommitted" }
  | {
      readonly $: "Canonical.NoticePruned"
      readonly drop_lease: boolean
      readonly drop_pending: boolean
      readonly drop_key: boolean
    }
  | { readonly $: "Canonical.NoticeDropped" }
  | { readonly $: "Canonical.NoticeLeased" }
  | { readonly $: "Canonical.NoticePendingCleared" }
  | { readonly $: "Canonical.WriteAuthorized"; readonly operation: number }
  | { readonly $: "Canonical.WriteRecorded"; readonly outcome: Canonical_WriteOutcome }
  | { readonly $: "Canonical.ReofferAtStop" }
  | { readonly $: "Canonical.PartitionRetired"; readonly round: number }
  | { readonly $: "Canonical.AdmissionForgotten" }

export type Canonical_CapacityView = {
  readonly $: "Canonical.CapacityView"
  readonly global: Ledger_Usage
  readonly local: Ledger_Usage
  readonly charges: List<Ledger_Charge>
}

export type Ledger_Usage = { readonly $: "Ledger.Usage"; readonly items: number; readonly bytes: number }

export type Canonical_PolicyDecision =
  | {
      readonly $: "Canonical.CapacityRefused"
      readonly reason: Ledger_FitDecision
      readonly after: Canonical_CapacityView
    }
  | {
      readonly $: "Canonical.CapacityUnitRefused"
      readonly position: number
      readonly bytes: number
      readonly reason: Ledger_FitDecision
      readonly after: Canonical_CapacityView
    }
  | { readonly $: "Canonical.CompletedEditAbsent" }
  | { readonly $: "Canonical.QuietRoundExpired"; readonly since: number }
  | { readonly $: "Canonical.PermitKept" }
  | { readonly $: "Canonical.PreparationRefused" }
  | {
      readonly $: "Canonical.UnitRefused"
      readonly position: number
      readonly bytes: number
      readonly reason: Ledger_FitDecision
      readonly after: Canonical_CapacityView
    }
  | { readonly $: "Canonical.JevRequestUnavailable" }
  | { readonly $: "Canonical.JevObservationIgnored" }
  | { readonly $: "Canonical.PreparedSkipped" }
  | { readonly $: "Canonical.PreparedAdmitted" }
  | { readonly $: "Canonical.PreparedCapacityRefused" }
  | { readonly $: "Canonical.EmptyLost" }
  | { readonly $: "Canonical.EmptyAccepted" }
  | { readonly $: "Canonical.FailureBackend" }
  | { readonly $: "Canonical.FailureCredential" }
  | { readonly $: "Canonical.FailureLost" }
  | { readonly $: "Canonical.FailureNone" }
  | { readonly $: "Canonical.DiscardNamedOnly" }
  | { readonly $: "Canonical.DiscardAllUnfinished" }
  | { readonly $: "Canonical.CollectionWaiting" }
  | { readonly $: "Canonical.CollectionRetireCredential" }
  | { readonly $: "Canonical.CollectionRetainCredential" }
  | { readonly $: "Canonical.CollectionCandidate" }
  | { readonly $: "Canonical.CollectionSkip" }
  | { readonly $: "Canonical.CollectionBefore" }
  | { readonly $: "Canonical.CollectionEqual" }
  | { readonly $: "Canonical.CollectionAfter" }
  | { readonly $: "Canonical.CollectionExpired" }
  | { readonly $: "Canonical.CollectionCurrent" }
  | { readonly $: "Canonical.CollectionFits" }
  | { readonly $: "Canonical.CollectionLimited" }
  | { readonly $: "Canonical.CollectionFindingSelected" }
  | { readonly $: "Canonical.CollectionFindingRetained" }
  | { readonly $: "Canonical.CollectionFindingLimited" }
  | { readonly $: "Canonical.CollectionFindingExpired" }
  | { readonly $: "Canonical.CollectionNoticeIncluded" }
  | { readonly $: "Canonical.CollectionNoticeSkipped" }
  | { readonly $: "Canonical.CollectionNoticeStopped" }
  | { readonly $: "Canonical.CollectionLeaseRefused" }
  | { readonly $: "Canonical.CollectionLeaseKept" }
  | { readonly $: "Canonical.CollectionBackgroundRefused" }
  | { readonly $: "Canonical.CollectionBackgroundKept" }
  | { readonly $: "Canonical.FinishNotices" }
  | { readonly $: "Canonical.FinishAllowedNoAdvice" }
  | { readonly $: "Canonical.FinishAllowedDeadline" }
  | { readonly $: "Canonical.FinishAllowedUnavailable" }
  | { readonly $: "Canonical.FinishRefused" }
  | { readonly $: "Canonical.ContinuationRefused" }
  | { readonly $: "Canonical.SubmissionRefused" }
  | { readonly $: "Canonical.SubmissionSuppresses" }
  | { readonly $: "Canonical.SubmissionUnsuppressed" }
  | { readonly $: "Canonical.SubmissionReofferable" }
  | { readonly $: "Canonical.SubmissionNotReofferable" }
  | { readonly $: "Canonical.SubmissionExpired" }
  | { readonly $: "Canonical.SubmissionCurrent" }
  | { readonly $: "Canonical.RevisionCurrent" }
  | { readonly $: "Canonical.RevisionStale" }
  | { readonly $: "Canonical.RevisionSuperseded" }
  | { readonly $: "Canonical.RevisionNotSuperseded" }
  | { readonly $: "Canonical.RevisionGeneration"; readonly generation: number }
  | { readonly $: "Canonical.RevisionCount"; readonly count: number }
  | { readonly $: "Canonical.CollectorProceed" }
  | { readonly $: "Canonical.CollectorUnavailable"; readonly reason: CollectorAuthority_Reason }
  | { readonly $: "Canonical.CollectorFinalProceed" }
  | { readonly $: "Canonical.CollectorFinalRelease" }
  | { readonly $: "Canonical.ReuseKeepMember" }
  | { readonly $: "Canonical.ReuseSetMemberClear" }
  | { readonly $: "Canonical.ReuseSetMemberFinding" }
  | { readonly $: "Canonical.ReuseSetMemberUnavailable" }
  | { readonly $: "Canonical.ReuseSetMemberLost" }
  | { readonly $: "Canonical.CleanupReady" }
  | { readonly $: "Canonical.CleanupBusy" }
  | { readonly $: "Canonical.DeliveryReleaseUnacknowledged" }
  | { readonly $: "Canonical.DeliveryKeepAcknowledged" }
  | { readonly $: "Canonical.DeliveryAckReady" }
  | { readonly $: "Canonical.DeliveryAckExpired" }
  | { readonly $: "Canonical.DeliveryAckEmpty" }
  | { readonly $: "Canonical.DeliveryFinalReady" }
  | { readonly $: "Canonical.DeliveryFinalExpired" }
  | { readonly $: "Canonical.DeliveryFinalEmpty" }
  | { readonly $: "Canonical.DeliveryRetireAdvice" }
  | { readonly $: "Canonical.DeliveryKeepRemaining" }
  | { readonly $: "Canonical.DeliveryKeepForReoffer" }
  | { readonly $: "Canonical.DeliverySubmissionCandidate" }
  | { readonly $: "Canonical.DeliverySubmissionRefused" }
  | { readonly $: "Canonical.DeliveryBatchProceed" }
  | { readonly $: "Canonical.DeliveryBatchRelease" }
  | { readonly $: "Canonical.DeliveryCredentialInvalid" }
  | { readonly $: "Canonical.DeliveryCredentialValid" }
  | { readonly $: "Canonical.SourceCacheDrop" }
  | { readonly $: "Canonical.SourceCacheRetain" }
  | { readonly $: "Canonical.IgnoreCandidate" }
  | { readonly $: "Canonical.ReleaseCandidate" }
  | { readonly $: "Canonical.RetireCandidate" }
  | { readonly $: "Canonical.ContinueCandidate" }
  | { readonly $: "Canonical.RetainCandidate" }
  | { readonly $: "Canonical.RoundStopBegun" }
  | { readonly $: "Canonical.RoundStopRefused" }
  | { readonly $: "Canonical.RoundActive" }
  | { readonly $: "Canonical.RoundInactive" }
  | { readonly $: "Canonical.RoundBarrierRaised" }
  | { readonly $: "Canonical.RoundBarrierClear" }
  | { readonly $: "Canonical.RoundStopOwned" }
  | { readonly $: "Canonical.RoundStopNotOwned" }
  | { readonly $: "Canonical.RoundStopTerminal"; readonly revoke_provisional: boolean; readonly close: boolean }
  | { readonly $: "Canonical.RoundExpireCloses" }
  | { readonly $: "Canonical.RoundExpireKeeps" }
  | { readonly $: "Canonical.RoundContinuationAvailable" }
  | { readonly $: "Canonical.RoundContinuationExhausted" }
  | { readonly $: "Canonical.DeliverySubmissionAllowed" }
  | { readonly $: "Canonical.DeliverySubmissionDenied" }
  | { readonly $: "Canonical.DeliveryExistingTokenAllowed" }
  | { readonly $: "Canonical.DeliveryExistingTokenDenied" }
  | { readonly $: "Canonical.DeliveryUnreservedStopAllowed" }
  | { readonly $: "Canonical.DeliveryUnreservedStopDenied" }
  | { readonly $: "Canonical.ReuseRefused" }
  | { readonly $: "Canonical.CacheAlready" }
  | { readonly $: "Canonical.CacheRejected" }
  | { readonly $: "Canonical.NoticeRejectedFull" }
  | { readonly $: "Canonical.NoticeRefused" }
  | { readonly $: "Canonical.NoticeSelected"; readonly ids: List<number> }
  | { readonly $: "Canonical.IncludeChoice"; readonly choice: Configuration_IncludeChoice }
  | { readonly $: "Canonical.FileSelection"; readonly selection: Configuration_Selection }
  | { readonly $: "Canonical.FileProtection"; readonly protection: Configuration_Protection }
  | { readonly $: "Canonical.CandidateFile"; readonly candidate: Configuration_Candidate }
  | { readonly $: "Canonical.ReviewAdmission"; readonly admission: Configuration_Admission }
  | { readonly $: "Canonical.RuleGate"; readonly gate: RulePolicy_Gate }
  | { readonly $: "Canonical.RuleOrder"; readonly order: RulePolicy_Order }
  | { readonly $: "Canonical.WaitForOutput" }

export type Ledger_FitDecision =
  | { readonly $: "Ledger.Fits" }
  | { readonly $: "Ledger.GlobalItemLimit" }
  | { readonly $: "Ledger.GlobalByteLimit" }
  | { readonly $: "Ledger.PartitionItemLimit" }
  | { readonly $: "Ledger.PartitionByteLimit" }

export type CollectorAuthority_Reason =
  | { readonly $: "CollectorAuthority.Backend" }
  | { readonly $: "CollectorAuthority.Credential" }
  | { readonly $: "CollectorAuthority.Capacity" }
  | { readonly $: "CollectorAuthority.Stale" }
  | { readonly $: "CollectorAuthority.Lost" }
  | { readonly $: "CollectorAuthority.Expired" }

export type Configuration_IncludeChoice =
  | { readonly $: "Configuration.ReplaceIncludes" }
  | { readonly $: "Configuration.KeepIncludes" }

export type Configuration_Selection =
  | { readonly $: "Configuration.Protected" }
  | { readonly $: "Configuration.Excluded" }
  | { readonly $: "Configuration.EmptyIncludes" }
  | { readonly $: "Configuration.NotIncluded" }
  | { readonly $: "Configuration.Selected" }

export type Configuration_Protection =
  | { readonly $: "Configuration.AllowedPath" }
  | { readonly $: "Configuration.RepositoryBoundary" }
  | { readonly $: "Configuration.SensitivePath" }
  | { readonly $: "Configuration.GeneratedOrVendor" }
  | { readonly $: "Configuration.FileExtension" }

export type Configuration_Candidate =
  | { readonly $: "Configuration.CandidateAllowed" }
  | { readonly $: "Configuration.RefuseGitAdmin" }
  | { readonly $: "Configuration.RefuseFileKind" }
  | { readonly $: "Configuration.RefuseGitIgnore" }

export type Configuration_Admission =
  | { readonly $: "Configuration.AdmitReview" }
  | { readonly $: "Configuration.RefuseRoot" }
  | { readonly $: "Configuration.RefuseConfiguration" }
  | { readonly $: "Configuration.RefuseCredential" }
  | { readonly $: "Configuration.RefuseSelection" }

export type RulePolicy_Gate = { readonly $: "RulePolicy.Admit" } | { readonly $: "RulePolicy.Omit" }

export type Canonical_Reason =
  | { readonly $: "Canonical.InvalidIdentity" }
  | { readonly $: "Canonical.RoundLimit" }
  | { readonly $: "Canonical.StaleRound" }
  | { readonly $: "Canonical.StaleOperation" }
  | { readonly $: "Canonical.WrongStage" }
  | { readonly $: "Canonical.InconsistentLedger" }
  | { readonly $: "Canonical.ProspectiveDenied" }
  | { readonly $: "Canonical.AdviceePermitLimit" }
  | { readonly $: "Canonical.ResidentPermitLimit" }
  | { readonly $: "Canonical.PermitDenied"; readonly reason: Admission_AdmissionRejection }

export type Admission_AdmissionRejection =
  | { readonly $: "Admission.WrongPartition" }
  | { readonly $: "Admission.WrongLifetime" }
  | { readonly $: "Admission.StaleInvocation" }
  | { readonly $: "Admission.Expired" }
  | { readonly $: "Admission.DuplicateTool" }
  | { readonly $: "Admission.NoPermit" }
  | { readonly $: "Admission.WrongTool" }
  | { readonly $: "Admission.OldRound" }
  | { readonly $: "Admission.InvalidClock" }
  | { readonly $: "Admission.RoundAlreadyClosed" }
  | { readonly $: "Admission.LifetimeNotFresh" }
