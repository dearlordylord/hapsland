// Raw Canonical event transport declared by Canonical.bend and its payload owners.

// Numbers retain the existing checked immediate-Nat boundary; lists retain order.

type List<Value> = { readonly $: "Nil" } | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }

type Maybe<Value> = { readonly $: "None" } | { readonly $: "Some"; readonly value: Value }

export type Canonical_CanonicalEvent =
  | {
      readonly $: "Canonical.ReserveCapacity"
      readonly partition: number
      readonly bytes: number
      readonly purpose: Ledger_Purpose
    }
  | {
      readonly $: "Canonical.ResizeCapacity"
      readonly reservation: number
      readonly bytes: number
      readonly purpose: Ledger_Purpose
    }
  | { readonly $: "Canonical.ReleaseCapacity"; readonly reservation: number }
  | { readonly $: "Canonical.ReplaceCapacity"; readonly reservation: number; readonly unit_bytes: List<number> }
  | {
      readonly $: "Canonical.IssuePermit"
      readonly partition: number
      readonly lifetime: number
      readonly tool: number
      readonly started: number
      readonly deadline: number
      readonly now: number
      readonly minimum_started: number
      readonly facts: Admission_ProspectiveFacts
    }
  | { readonly $: "Canonical.CheckCompletedEdit"; readonly tool: number }
  | { readonly $: "Canonical.RememberCompletedEdit"; readonly tool: number; readonly reason: EditHistory_Reason }
  | {
      readonly $: "Canonical.QuietRoundTick"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly now: number
      readonly window: number
      readonly facts: Quiescence_Facts
    }
  | {
      readonly $: "Canonical.QuietRoundReset"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
    }
  | {
      readonly $: "Canonical.ConsumePermit"
      readonly partition: number
      readonly lifetime: number
      readonly token: number
      readonly tool: number
      readonly now: number
    }
  | {
      readonly $: "Canonical.ReleasePermit"
      readonly partition: number
      readonly lifetime: number
      readonly token: number
    }
  | {
      readonly $: "Canonical.ExpirePermit"
      readonly partition: number
      readonly lifetime: number
      readonly token: number
      readonly deadline_reached: boolean
    }
  | {
      readonly $: "Canonical.ClosePermitRound"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly at: number
    }
  | { readonly $: "Canonical.ForgetAdmission"; readonly partition: number; readonly lifetime: number }
  | { readonly $: "Canonical.OpenRound"; readonly partition: number; readonly lifetime: number }
  | {
      readonly $: "Canonical.AdmitObservation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
    }
  | {
      readonly $: "Canonical.StartObservation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly observation: number
    }
  | {
      readonly $: "Canonical.CompleteObservation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly observation: number
    }
  | {
      readonly $: "Canonical.InterruptObservation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly observation: number
    }
  | {
      readonly $: "Canonical.BeginPreparation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly bytes: number
    }
  | {
      readonly $: "Canonical.BeginObservedPreparation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly observation: number
      readonly bytes: number
    }
  | {
      readonly $: "Canonical.InterruptPreparation"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | {
      readonly $: "Canonical.PreparationCompleted"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly unit_bytes: List<number>
    }
  | {
      readonly $: "Canonical.StartReview"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | {
      readonly $: "Canonical.JevRequestReady"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly root_valid: boolean
      readonly configuration_valid: boolean
      readonly credential_ready: boolean
      readonly selected: boolean
      readonly current_work: boolean
      readonly physical_available: boolean
    }
  | {
      readonly $: "Canonical.JevRequestStarted"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
    }
  | {
      readonly $: "Canonical.JevRequestInterrupted"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
    }
  | {
      readonly $: "Canonical.JevRequestSettled"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly request: number
      readonly outcome: Canonical_RequestOutcome
      readonly current_work: boolean
    }
  | {
      readonly $: "Canonical.ReviewCompleted"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly outcome: Canonical_Outcome
    }
  | {
      readonly $: "Canonical.RetireReview"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | {
      readonly $: "Canonical.CancelReview"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | {
      readonly $: "Canonical.ReviewObserved"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly outcome: Canonical_Outcome
      readonly current_work: boolean
    }
  | {
      readonly $: "Canonical.FindingCountUpdated"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly count: number
    }
  | {
      readonly $: "Canonical.QueueDispatch"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | {
      readonly $: "Canonical.DispatchSettled"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
    }
  | { readonly $: "Canonical.DiscardDispatch"; readonly operations: List<number> }
  | {
      readonly $: "Canonical.DispatchScopeCheck"
      readonly named_count: number
      readonly cancelled_count: number
      readonly has_unnamed: boolean
    }
  | { readonly $: "Canonical.CloseDispatch" }
  | { readonly $: "Canonical.PreparedOfferCheck"; readonly ready: boolean; readonly within_frame: boolean }
  | {
      readonly $: "Canonical.EmptyPreparedCheck"
      readonly ready_count: number
      readonly has_non_skipped: boolean
      readonly authority_bound: boolean
    }
  | {
      readonly $: "Canonical.ReviewFailureCheck"
      readonly backend_or_timeout: boolean
      readonly credential: boolean
      readonly missing: boolean
    }
  | {
      readonly $: "Canonical.StopPolled"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly deadline: boolean
    }
  | {
      readonly $: "Canonical.StopGroupPolled"
      readonly group: number
      readonly lifetime: number
      readonly round: number
      readonly scopes: List<Canonical_StopScope>
      readonly deadline: boolean
      readonly extra_pending: boolean
      readonly continuations: number
    }
  | {
      readonly $: "Canonical.StopGroupEnded"
      readonly group: number
      readonly lifetime: number
      readonly round: number
      readonly scopes: List<Canonical_StopScope>
    }
  | {
      readonly $: "Canonical.CollectionReady"
      readonly advice: number
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly observation: number
      readonly joined_pending: boolean
    }
  | {
      readonly $: "Canonical.CollectionCredentialCheck"
      readonly same_scope: boolean
      readonly generation_valid: boolean
    }
  | {
      readonly $: "Canonical.CollectionCandidateCheck"
      readonly same_partition: boolean
      readonly unleased: boolean
      readonly has_unsuppressed: boolean
      readonly authority_owns: boolean
    }
  | { readonly $: "Canonical.CollectionOrderCheck"; readonly left_sequence: number; readonly right_sequence: number }
  | { readonly $: "Canonical.CollectionExpiryCheck"; readonly elapsed: number; readonly lifetime: number }
  | { readonly $: "Canonical.CollectionFitCheck"; readonly items: number; readonly bytes: number }
  | {
      readonly $: "Canonical.CollectionFindingCheck"
      readonly selection_partition: number
      readonly selection_round: number
      readonly unit: number
      readonly partition: number
      readonly round: number
      readonly snapshot: number
      readonly current_snapshot: number
      readonly credential: number
      readonly current_credential: number
      readonly age_ms: number
      readonly solo_bytes: number
      readonly collection_ready: boolean
      readonly selected_count: number
      readonly prospective_bytes: number
    }
  | {
      readonly $: "Canonical.CollectionNoticeCheck"
      readonly items: number
      readonly bytes: number
      readonly skip_unfitting: boolean
    }
  | { readonly $: "Canonical.CollectionReserveLease"; readonly advice: number; readonly token: number }
  | { readonly $: "Canonical.CollectionReleaseLease"; readonly advice: number; readonly token: number }
  | {
      readonly $: "Canonical.CollectionLeaseCheck"
      readonly advice: number
      readonly token: number
      readonly expired: boolean
      readonly stop_collector: boolean
      readonly same_group: boolean
      readonly reofferable: boolean
    }
  | { readonly $: "Canonical.CollectionRetireAdvice"; readonly advice: number }
  | {
      readonly $: "Canonical.CollectionClaimBackground"
      readonly group: number
      readonly token: number
      readonly active: boolean
      readonly capacity: number
    }
  | { readonly $: "Canonical.CollectionReleaseBackground"; readonly group: number; readonly token: number }
  | {
      readonly $: "Canonical.CollectionExpireBackground"
      readonly group: number
      readonly token: number
      readonly elapsed: number
      readonly lifetime: number
    }
  | {
      readonly $: "Canonical.FinishReserve"
      readonly group: number
      readonly lifetime: number
      readonly round: number
      readonly attempt: number
      readonly token: number
      readonly selected: List<number>
      readonly has_notice: boolean
      readonly pass_notices: boolean
      readonly can_write: boolean
      readonly binding_valid: boolean
      readonly deadline_reached: boolean
    }
  | {
      readonly $: "Canonical.FinishRelease"
      readonly group: number
      readonly round: number
      readonly attempt: number
      readonly token: number
    }
  | {
      readonly $: "Canonical.FinishAuthorize"
      readonly group: number
      readonly round: number
      readonly attempt: number
      readonly token: number
      readonly selected: List<number>
    }
  | {
      readonly $: "Canonical.FinishTerminal"
      readonly group: number
      readonly round: number
      readonly attempt: number
      readonly token: number
      readonly selected: List<number>
      readonly outcome: Canonical_WriteOutcome
    }
  | {
      readonly $: "Canonical.FinishEnd"
      readonly group: number
      readonly round: number
      readonly attempt: number
      readonly token: number
    }
  | { readonly $: "Canonical.ContinuationConsume"; readonly group: number; readonly round: number }
  | {
      readonly $: "Canonical.SubmissionBegin"
      readonly advice: number
      readonly group: number
      readonly round: number
      readonly token: number
      readonly surface: Handoff_Surface
      readonly authorize_now: boolean
      readonly fingerprints: List<number>
      readonly units: List<number>
    }
  | { readonly $: "Canonical.SubmissionAuthorize"; readonly advice: number; readonly token: number }
  | {
      readonly $: "Canonical.SubmissionTerminal"
      readonly advice: number
      readonly token: number
      readonly certain: boolean
    }
  | { readonly $: "Canonical.SubmissionRelease"; readonly advice: number; readonly token: number }
  | { readonly $: "Canonical.SubmissionForget"; readonly advice: number }
  | {
      readonly $: "Canonical.SubmissionSuppressCheck"
      readonly advice: number
      readonly fingerprint: number
      readonly round: number
      readonly surface: Handoff_Surface
    }
  | { readonly $: "Canonical.SubmissionReofferCheck"; readonly advice: number; readonly token: number }
  | {
      readonly $: "Canonical.SubmissionExpiryCheck"
      readonly advice: number
      readonly token: number
      readonly elapsed: number
      readonly lifetime: number
    }
  | {
      readonly $: "Canonical.RevisionRegister"
      readonly subject: number
      readonly input: number
      readonly add_member: boolean
    }
  | { readonly $: "Canonical.RevisionRelease"; readonly subject: number; readonly generation: number }
  | {
      readonly $: "Canonical.RevisionCurrentCheck"
      readonly subject: number
      readonly input: number
      readonly generation: number
    }
  | {
      readonly $: "Canonical.RevisionSupersededCheck"
      readonly subject: number
      readonly candidate_subject: number
      readonly generation: number
    }
  | { readonly $: "Canonical.RevisionGenerationCheck"; readonly subject: number }
  | { readonly $: "Canonical.RevisionCountCheck" }
  | { readonly $: "Canonical.CollectorGateCheck"; readonly expired: boolean; readonly credential_valid: boolean }
  | {
      readonly $: "Canonical.CollectorFinalAuthorityCheck"
      readonly admitted_block: boolean
      readonly current_block: boolean
    }
  | {
      readonly $: "Canonical.ReuseMemberCheck"
      readonly joined_state: Reuse_JoinedState
      readonly stale_unavailable: boolean
      readonly has_revision: boolean
      readonly has_advice_id: boolean
    }
  | { readonly $: "Canonical.CleanupCheck"; readonly facts: Retention_CleanupFacts }
  | { readonly $: "Canonical.CleanupCommit" }
  | { readonly $: "Canonical.DeliveryReleaseCheck"; readonly acknowledged: boolean }
  | { readonly $: "Canonical.DeliveryAcknowledgeCheck"; readonly items: number; readonly any_expired: boolean }
  | {
      readonly $: "Canonical.DeliveryFinalizeCheck"
      readonly items: number
      readonly all_acknowledged: boolean
      readonly any_expired: boolean
    }
  | { readonly $: "Canonical.DeliveryFindingDispositionCheck"; readonly composed: boolean; readonly remaining: number }
  | { readonly $: "Canonical.DeliverySubmissionCandidateCheck"; readonly facts: Delivery_SubmissionFacts }
  | { readonly $: "Canonical.DeliverySubmissionBatchCheck"; readonly count: number; readonly all_valid: boolean }
  | {
      readonly $: "Canonical.DeliveryCredentialObserveCheck"
      readonly invalid_seen: boolean
      readonly generation_valid: boolean
      readonly authorized: boolean
    }
  | {
      readonly $: "Canonical.DeliveryFinalCredentialCheck"
      readonly shared_collect: boolean
      readonly invalid_seen: boolean
    }
  | { readonly $: "Canonical.SourceCacheCheck"; readonly remaining: number; readonly aborted: boolean }
  | {
      readonly $: "Canonical.ValidationRouteCheck"
      readonly owner_current: boolean
      readonly status: Handoff_ValidationStatus
    }
  | {
      readonly $: "Canonical.PostValidationCheck"
      readonly work_accepted: boolean
      readonly expired: boolean
      readonly has_fitting: boolean
    }
  | {
      readonly $: "Canonical.FinalCandidateCheck"
      readonly owner_current: boolean
      readonly credential_generation: boolean
      readonly credential_authorized: boolean
      readonly expired: boolean
      readonly work_current: boolean
      readonly has_findings: boolean
    }
  | {
      readonly $: "Canonical.RoundBeginStopCheck"
      readonly active: boolean
      readonly has_stop: boolean
      readonly token: number
    }
  | {
      readonly $: "Canonical.RoundActivityCheck"
      readonly bound: boolean
      readonly has_admission: boolean
      readonly round: number
      readonly active: boolean
      readonly closed_at: number
      readonly expected_generation: number
    }
  | {
      readonly $: "Canonical.RoundBarrierCheck"
      readonly has_stop: boolean
      readonly used_at_start: number
      readonly used_now: number
    }
  | {
      readonly $: "Canonical.RoundOwnsStopCheck"
      readonly active: boolean
      readonly token_matches: boolean
      readonly deciding: boolean
    }
  | {
      readonly $: "Canonical.RoundStopTerminalCheck"
      readonly has_output: boolean
      readonly authorized: boolean
      readonly requested_close: boolean
    }
  | { readonly $: "Canonical.RoundExpireCloseCheck"; readonly barrier: boolean; readonly authorized_output: boolean }
  | { readonly $: "Canonical.RoundContinuationBudgetCheck"; readonly active: boolean; readonly count: number }
  | {
      readonly $: "Canonical.DeliverySubmissionAllowedCheck"
      readonly active: boolean
      readonly barrier: boolean
      readonly deciding: boolean
      readonly surface: Delivery_Surface
      readonly existing_token: boolean
      readonly finish_permit: boolean
    }
  | {
      readonly $: "Canonical.DeliveryExistingTokenCheck"
      readonly surface: Delivery_Surface
      readonly existing_token: boolean
      readonly finish_permit: boolean
    }
  | { readonly $: "Canonical.DeliveryUnreservedStopCheck"; readonly active: boolean; readonly deciding: boolean }
  | {
      readonly $: "Canonical.IncludeLayerCheck"
      readonly supplied: boolean
      readonly current_rank: number
      readonly candidate_rank: number
    }
  | {
      readonly $: "Canonical.FileSelectionCheck"
      readonly protected: boolean
      readonly excluded: boolean
      readonly includes_empty: boolean
      readonly included: boolean
    }
  | { readonly $: "Canonical.FileProtectionInvalid" }
  | {
      readonly $: "Canonical.FileProtectionCheck"
      readonly sensitive_name: boolean
      readonly generated_or_vendor: boolean
      readonly allowed_extension: boolean
    }
  | {
      readonly $: "Canonical.CandidateFileCheck"
      readonly git_admin: boolean
      readonly physical_safe: boolean
      readonly git_allowed: boolean
    }
  | {
      readonly $: "Canonical.ReviewAdmissionCheck"
      readonly root_valid: boolean
      readonly configuration_valid: boolean
      readonly credential_ready: boolean
      readonly selected: boolean
    }
  | { readonly $: "Canonical.RuleEnableCheck"; readonly pack_enabled: boolean; readonly rule_enabled: boolean }
  | {
      readonly $: "Canonical.RuleApplicabilityCheck"
      readonly consent: boolean
      readonly complete: boolean
      readonly target: RulePolicy_Target
      readonly global_included: boolean
      readonly global_excluded: boolean
      readonly pack_enabled: boolean
      readonly rule_enabled: boolean
      readonly rule_included: boolean
      readonly rule_excluded: boolean
      readonly target_declared: boolean
      readonly capabilities_available: boolean
      readonly source_rung: number
      readonly minimum_rung: number
    }
  | {
      readonly $: "Canonical.RuleFindingCheck"
      readonly probability: RulePolicy_ProbabilityWords
      readonly threshold: RulePolicy_ProbabilityWords
    }
  | {
      readonly $: "Canonical.RuleRankOrderCheck"
      readonly left: RulePolicy_ProbabilityWords
      readonly right: RulePolicy_ProbabilityWords
      readonly left_rank: number
      readonly right_rank: number
    }
  | {
      readonly $: "Canonical.AdviceOrderCheck"
      readonly left: RulePolicy_ProbabilityWords
      readonly right: RulePolicy_ProbabilityWords
      readonly path_order: RulePolicy_Order
      readonly id_order: RulePolicy_Order
    }
  | { readonly $: "Canonical.RuleBudgetCheck"; readonly position: number; readonly limit: number }
  | { readonly $: "Canonical.ReuseRoute"; readonly id: number; readonly live_advice: boolean }
  | { readonly $: "Canonical.ReuseClaim"; readonly id: number }
  | { readonly $: "Canonical.ReuseAttach"; readonly id: number }
  | { readonly $: "Canonical.ReuseRelease"; readonly id: number }
  | { readonly $: "Canonical.ReuseTouch"; readonly id: number }
  | {
      readonly $: "Canonical.CachePrepare"
      readonly id: number
      readonly bytes: number
      readonly entry_limit: number
      readonly byte_limit: number
    }
  | {
      readonly $: "Canonical.CacheCommit"
      readonly id: number
      readonly partition: number
      readonly bytes: number
      readonly reservation: number
      readonly entry_limit: number
      readonly byte_limit: number
    }
  | { readonly $: "Canonical.CacheDiscardPartition"; readonly partition: number }
  | { readonly $: "Canonical.CacheClear" }
  | {
      readonly $: "Canonical.NoticeAdvance"
      readonly key: number
      readonly remaining: Maybe<number>
      readonly maximum_keys: number
      readonly proposed: number
      readonly sequence: number
      readonly max_count: number
    }
  | {
      readonly $: "Canonical.NoticeCommit"
      readonly key: number
      readonly partition: number
      readonly group: number
      readonly reservation: number
      readonly pending: number
      readonly sequence: number
      readonly maximum_keys: number
    }
  | {
      readonly $: "Canonical.NoticePrune"
      readonly key: number
      readonly lease_expired: boolean
      readonly pending_expired: boolean
      readonly excepted: boolean
      readonly cooldown_expired: boolean
    }
  | { readonly $: "Canonical.NoticeDrop"; readonly key: number }
  | { readonly $: "Canonical.NoticeLease"; readonly key: number; readonly leased: boolean }
  | { readonly $: "Canonical.NoticeClearPending"; readonly key: number }
  | {
      readonly $: "Canonical.NoticeSelect"
      readonly partition: number
      readonly group: number
      readonly composed: boolean
      readonly authority_bound: boolean
      readonly allowed: List<number>
    }
  | {
      readonly $: "Canonical.OutputStarted"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
    }
  | {
      readonly $: "Canonical.OutputTerminal"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
      readonly operation: number
      readonly outcome: Canonical_WriteOutcome
    }
  | {
      readonly $: "Canonical.RetirePartition"
      readonly partition: number
      readonly lifetime: number
      readonly round: number
    }

export type Ledger_Purpose =
  | { readonly $: "Ledger.ObservationDispatch" }
  | { readonly $: "Ledger.Preparation" }
  | { readonly $: "Ledger.ReviewUnit" }
  | { readonly $: "Ledger.StoredResult" }
  | { readonly $: "Ledger.OperationalNotice" }
  | { readonly $: "Ledger.AdviceRecheck" }

export type Admission_ProspectiveFacts = {
  readonly $: "Admission.ProspectiveFacts"
  readonly clock_valid: boolean
  readonly hook_window: number
  readonly started_upper: number
  readonly now_lower: number
  readonly advicee_permit_limit: number
  readonly resident_permit_limit: number
}

export type EditHistory_Reason =
  | { readonly $: "EditHistory.Consumed" }
  | { readonly $: "EditHistory.Released" }
  | { readonly $: "EditHistory.Expired" }
  | { readonly $: "EditHistory.Closed" }

export type Quiescence_Facts = {
  readonly $: "Quiescence.Facts"
  readonly native_work_idle: boolean
  readonly advice_empty: boolean
  readonly handoff_idle: boolean
  readonly stop_absent: boolean
}

export type Canonical_RequestOutcome =
  | { readonly $: "Canonical.NeverSent" }
  | { readonly $: "Canonical.RequestFinding" }
  | { readonly $: "Canonical.RequestClear" }
  | { readonly $: "Canonical.RequestBackendFailure" }
  | { readonly $: "Canonical.RequestTimeout" }
  | { readonly $: "Canonical.RequestInterrupted" }

export type Canonical_Outcome =
  | { readonly $: "Canonical.Finding" }
  | { readonly $: "Canonical.Clear" }
  | { readonly $: "Canonical.Unavailable" }
  | { readonly $: "Canonical.Interrupted" }
  | { readonly $: "Canonical.Discarded" }

export type Canonical_StopScope = {
  readonly $: "Canonical.StopScope"
  readonly partition: number
  readonly round: number
}

export type Canonical_WriteOutcome =
  | { readonly $: "Canonical.Acknowledged" }
  | { readonly $: "Canonical.Failed" }
  | { readonly $: "Canonical.Unknown" }

export type Handoff_Surface =
  | { readonly $: "Handoff.Edit" }
  | { readonly $: "Handoff.Background" }
  | { readonly $: "Handoff.Stop" }

export type Reuse_JoinedState =
  | { readonly $: "Reuse.JoinedPending" }
  | { readonly $: "Reuse.JoinedClear" }
  | { readonly $: "Reuse.JoinedFinding" }
  | { readonly $: "Reuse.JoinedUnavailable" }

export type Retention_CleanupFacts = {
  readonly $: "Retention.CleanupFacts"
  readonly active: boolean
  readonly dispatcher_idle: boolean
  readonly no_advice: boolean
  readonly no_notices: boolean
  readonly no_pending_evaluations: boolean
  readonly no_current_work: boolean
  readonly no_cooldowns: boolean
  readonly connection_count_ok: boolean
  readonly cache_matches_ledger: boolean
}

export type Delivery_SubmissionFacts = {
  readonly $: "Delivery.SubmissionFacts"
  readonly round_active: boolean
  readonly has_round: boolean
  readonly has_unit: boolean
  readonly has_delivery: boolean
  readonly pending_capacity: boolean
  readonly submission_allowed: boolean
  readonly current_work: boolean
  readonly credential_authorized: boolean
}

export type Handoff_ValidationStatus =
  | { readonly $: "Handoff.Current" }
  | { readonly $: "Handoff.Stale" }
  | { readonly $: "Handoff.Unavailable" }
  | { readonly $: "Handoff.Unattributed" }

export type Delivery_Surface =
  | { readonly $: "Delivery.Edit" }
  | { readonly $: "Delivery.Background" }
  | { readonly $: "Delivery.Stop" }

export type RulePolicy_Target =
  | { readonly $: "RulePolicy.TypeShape" }
  | { readonly $: "RulePolicy.FunctionTarget" }
  | { readonly $: "RulePolicy.UnsupportedTarget" }

export type RulePolicy_ProbabilityWords = {
  readonly $: "RulePolicy.Words"
  readonly high: number
  readonly low: number
}

export type RulePolicy_Order =
  | { readonly $: "RulePolicy.Before" }
  | { readonly $: "RulePolicy.Equal" }
  | { readonly $: "RulePolicy.After" }

export type RawCanonicalEvent = Canonical_CanonicalEvent
