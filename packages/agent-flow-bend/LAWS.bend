import Base
import ./Advicing.bend as Advicing
import ./Flow.bend as Flow
import ./Admission.bend as Admission
import ./EditHistory.bend as EditHistory
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Lifecycle.bend as Lifecycle
import ./Ledger.bend as Ledger
import ./Configuration.bend as Configuration
import ./RulePolicy.bend as RulePolicy
import ./Round.bend as Round
import ./Background.bend as Background
import ./Notice.bend as Notice
import ./Collection.bend as Collection
import ./CollectionState.bend as CollectionState
import ./Delivery.bend as Delivery
import ./Cache.bend as Cache
import ./Ticket.bend as Ticket
import ./TicketState.bend as TicketState
import ./Revision.bend as Revision
import ./Reuse.bend as Reuse
import ./Retention.bend as Retention
import ./ImportGraph.bend as ImportGraph
import ./Canonical.bend as Canonical
import ./Dispatch.bend as Dispatch

law completed_edit_history_starts_empty:
  {EditHistory.count(EditHistory.initial()) == 0n : Nat}

law completed_edit_history_remembers_reason:
  {EditHistory.lookup(7n, EditHistory.State{
    EditHistory.Completed{7n, EditHistory.Consumed{}, False{}} <> Nil{}}) ==
    EditHistory.Seen{EditHistory.Consumed{}, True{}} : EditHistory.Lookup}

law completed_edit_history_reports_once:
  {EditHistory.lookup(7n, EditHistory.mark_reported(7n, EditHistory.State{
    EditHistory.Completed{7n, EditHistory.Consumed{}, False{}} <> Nil{}})) ==
    EditHistory.Seen{EditHistory.Consumed{}, False{}} : EditHistory.Lookup}

law completed_edit_history_records_source_free_id:
  {EditHistory.record(7n, EditHistory.Released{}, EditHistory.initial()) ==
    EditHistory.Recorded{EditHistory.State{
      EditHistory.Completed{7n, EditHistory.Released{}, False{}} <> Nil{}}, None{}} : EditHistory.Record}

law completed_edit_history_threshold_branch_evicts_oldest:
  {EditHistory.record_entries(9n, EditHistory.Closed{},
    EditHistory.Completed{1n, EditHistory.Consumed{}, False{}} <>
      EditHistory.Completed{2n, EditHistory.Released{}, False{}} <> Nil{}, 1000n) ==
    EditHistory.Recorded{EditHistory.State{
      EditHistory.Completed{2n, EditHistory.Released{}, False{}} <>
        EditHistory.Completed{9n, EditHistory.Closed{}, False{}} <> Nil{}}, Some{1n}} : EditHistory.Record}

law canonical_cross_advicee_identity_is_distinct:
  {Canonical.same_ids(1n, 1n, 1n, 2n, 1n, 1n) == False{} : Bool}

law canonical_pending_work_blocks_finish:
  {Canonical.pending(1n, 1n, 1n,
    Canonical.Work{1n, 1n, 1n, 3n, 2n, Canonical.Reviewing{}, 0n} <> Nil{}) ==
    True{} : Bool}

law canonical_completed_finding_does_not_block_finish:
  {Canonical.pending(1n, 1n, 1n,
    Canonical.Work{1n, 1n, 1n, 3n, 2n, Canonical.PendingFinding{1n}, 1n} <> Nil{}) ==
    False{} : Bool}

law canonical_source_without_charge_blocks_finish:
  {Canonical.pending(1n, 1n, 1n,
    Canonical.Work{1n, 1n, 1n, 2n, 0n, Canonical.SourceReading{}, 0n} <> Nil{}) ==
    True{} : Bool}

law dispatch_first_item_starts_cycle_one:
  {Dispatch.enqueue(Dispatch.initial(), 1n, 1n, 1n, 7n, True{}) ==
    Dispatch.Advanced{Dispatch.State{Nil{}, Nil{},
      Dispatch.Entry{1n, 1n, 1n, 7n, 0n, 1n, False{}, True{}} <> Nil{},
      1n, 1n, False{}, Nil{}},
      Dispatch.Started{7n, 0n, 1n} <> Nil{}} : Dispatch.DispatchResult}

law dispatch_has_eight_shared_slots:
  {Bool.and(Nat.is_eq(Dispatch.max_running(), 8n),
    Nat.is_eq(Dispatch.max_requests(), 8n)) == True{} : Bool}

law canonical_deadline_releases_exact_charge:
  {Canonical.release_round_charges(
    Canonical.Work{1n, 1n, 1n, 3n, 2n, Canonical.Preparing{}, 0n} <> Nil{},
    Ledger.Ledger{Ledger.Limits{3n, 100n, 2n, 60n}, 3n,
      Ledger.Charge{2n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}, 1n, 1n, 1n) ==
    Ledger.Ledger{Ledger.Limits{3n, 100n, 2n, 60n}, 3n, Nil{}} : Ledger.Ledger}

law canonical_uncertain_write_is_not_acknowledged:
  {Canonical.write_is_unknown(Canonical.Unknown{}) == True{} : Bool}

law canonical_capacity_reason_uses_first_exceeded_limit:
  {Ledger.fit_decision(Ledger.Limits{3n, 100n, 2n, 60n},
    Ledger.Usage{3n, 80n}, Ledger.Usage{1n, 40n}, 40n) ==
    Ledger.GlobalItemLimit{} : Ledger.FitDecision}

law canonical_capacity_view_uses_bend_ledger_totals:
  {Canonical.capacity_view(Ledger.Ledger{Ledger.Limits{3n, 100n, 2n, 60n},
    3n, Ledger.Charge{1n, 1n, 10n, Ledger.ReviewUnit{}} <> Ledger.Charge{2n, 2n, 20n, Ledger.ReviewUnit{}} <> Nil{}}, 1n) ==
    Canonical.CapacityView{Ledger.Usage{2n, 30n}, Ledger.Usage{1n, 10n},
      Ledger.Charge{1n, 1n, 10n, Ledger.ReviewUnit{}} <> Ledger.Charge{2n, 2n, 20n, Ledger.ReviewUnit{}} <> Nil{}} :
    Canonical.CapacityView}

law canonical_released_capacity_rejects_duplicate:
  {Canonical.capacity_release(Canonical.State{Ledger.Ledger{
    Ledger.Limits{3n, 100n, 2n, 60n}, 2n, Nil{}},
    Nil{}, Nil{}, 1n, 1n, Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, 1n) ==
    Canonical.Rejected{Canonical.State{Ledger.Ledger{
      Ledger.Limits{3n, 100n, 2n, 60n}, 2n, Nil{}},
      Nil{}, Nil{}, 1n, 1n, Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, Canonical.StaleOperation{}} : Canonical.Step}

law canonical_permit_issue_is_partitioned_and_round_bound:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.IssuePermit{1n, 1n, 11n, 100n, 300n, 110n, 0n,
      Admission.ProspectiveFacts{True{}, 2500n, 100n, 110n,
        32n, 4096n}}) ==
    Canonical.Advanced{Canonical.State{Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Nil{}, Nil{}, 1n, 1n,
      Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
        Admission.Permit{1n, 11n, 1n, 100n, 300n} <> Nil{}} <> Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()},
      Canonical.PermitIssued{1n, 1n} <> Nil{}} : Canonical.Step}

law canonical_forget_inactive_admission_removes_identity:
  {Canonical.forget_admission(Canonical.State{
    Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}), Nil{}, Nil{}, 1n, 1n,
    Admission.AdmissionState{1n, 1n, 1n, False{}, 100n, 2n, Nil{}} <> Nil{},
    Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, 1n, 1n) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.AdmissionForgotten{} <> Nil{}} : Canonical.Step}

law canonical_forget_pending_admission_rejects:
  {Canonical.forget_admission(Canonical.State{
    Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}), Nil{}, Nil{}, 1n, 1n,
    Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
      Admission.Permit{1n, 11n, 1n, 100n, 300n} <> Nil{}} <> Nil{},
    Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, 1n, 1n) ==
    Canonical.Rejected{Canonical.State{
      Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}), Nil{}, Nil{}, 1n, 1n,
      Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
        Admission.Permit{1n, 11n, 1n, 100n, 300n} <> Nil{}} <> Nil{},
      Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, Canonical.WrongStage{}} : Canonical.Step}

law canonical_eviction_floor_rejects_old_edit_without_state_change:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.IssuePermit{1n, 1n, 11n, 100n, 300n, 110n, 100n,
      Admission.ProspectiveFacts{True{}, 2500n, 100n, 110n,
        32n, 4096n}}) ==
    Canonical.Rejected{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.PermitDenied{Admission.StaleInvocation{}}} : Canonical.Step}

def two_pending_advicees() -> List<&2, Admission.AdmissionState>:
  Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
    Admission.Permit{1n, 11n, 1n, 100n, 300n} <> Nil{}} <>
  Admission.AdmissionState{2n, 1n, 0n, False{}, 0n, 2n,
    Admission.Permit{1n, 21n, 1n, 100n, 300n} <> Nil{}} <> Nil{}

law canonical_pending_permit_counts_use_reducer_state:
  {Bool.and(Nat.is_eq(Canonical.pending_advicee_permits(1n, two_pending_advicees()), 1n),
    Nat.is_eq(Canonical.pending_resident_permits(two_pending_advicees()), 2n)) == True{} : Bool}

law canonical_expired_permit_does_not_create_round:
  {Canonical.step(Canonical.State{Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Nil{}, Nil{}, 1n, 1n,
    Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n, Nil{}} <> Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()},
    Canonical.ClosePermitRound{1n, 1n, 1n, 200n}) ==
    Canonical.Rejected{Canonical.State{Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Nil{}, Nil{}, 1n, 1n,
      Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n, Nil{}} <> Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()},
      Canonical.PermitDenied{Admission.RoundAlreadyClosed{}}} : Canonical.Step}

law ledger_resize_changes_purpose_without_new_reservation:
  {Ledger.resize_for(Ledger.Ledger{Ledger.Limits{3n, 100n, 2n, 60n}, 2n,
    Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}},
    1n, 20n, Ledger.StoredResult{}) ==
    Ledger.Granted{Ledger.Ledger{Ledger.Limits{3n, 100n, 2n, 60n}, 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.StoredResult{}} <> Nil{}}, 1n}
    : Ledger.LedgerResult}

def graph_limits() -> ImportGraph.Limits:
  ImportGraph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n}

law import_graph_exclusion_has_no_read_command:
  {ImportGraph.checked(graph_limits(), ImportGraph.Edge{2n, 1n}, 2n, False{},
    Nil{}, 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Ready{},
      Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, True{}, False{}, graph_limits()},
      ImportGraph.SkipImport{2n, ImportGraph.Excluded{}}} : ImportGraph.Step}

law import_graph_exclusion_keeps_remaining_edges:
  {ImportGraph.checked(graph_limits(), ImportGraph.Edge{2n, 1n}, 2n, False{},
    ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{}, 1n, 100n, 100n,
    1n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Ready{},
      ImportGraph.Edge{3n, 1n} <> Nil{}, 2n <> 1n <> Nil{},
      1n, 100n, 100n, 1n, False{}, True{}, False{}, graph_limits()},
      ImportGraph.SkipImport{2n, ImportGraph.Excluded{}}} : ImportGraph.Step}

law import_graph_excluded_finishes_incomplete:
  {ImportGraph.next(graph_limits(), Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n,
    1n, False{}, True{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.Excluded{}},
      Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, True{}, False{}, graph_limits()},
      ImportGraph.UnitIncomplete{ImportGraph.Excluded{}}} : ImportGraph.Step}

law import_graph_tree_limit_precedes_exclusion:
  {ImportGraph.next(graph_limits(), Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 20480n,
    1n, True{}, True{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.TreeLimit{}},
      Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 20480n, 1n, True{}, True{}, False{}, graph_limits()},
      ImportGraph.UnitIncomplete{ImportGraph.TreeLimit{}}} : ImportGraph.Step}

law import_graph_cycle_does_not_request_source:
  {ImportGraph.resolved(graph_limits(), ImportGraph.Edge{2n, 1n}, 1n, ImportGraph.Found{},
    Nil{}, 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Ready{}, Nil{},
      1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, False{}, False{}, graph_limits()}, ImportGraph.NoCommand{}} : ImportGraph.Step}

law import_graph_full_tree_can_inspect_remaining_edges:
  {ImportGraph.next(graph_limits(), ImportGraph.Edge{2n, 1n} <> Nil{}, 1n <> Nil{},
    1n, 100n, 20480n, 0n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Resolving{ImportGraph.Edge{2n, 1n}},
      Nil{}, 1n <> Nil{}, 1n, 100n, 20480n, 1n, False{}, False{}, False{}, graph_limits()},
      ImportGraph.ResolveEdge{2n}} : ImportGraph.Step}

law import_graph_no_fit_support_skips_and_keeps_pending:
  {ImportGraph.captured(graph_limits(), ImportGraph.Edge{2n, 1n}, 2n, 100n, 1000n, 0n, Nil{},
    ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{}, 1n, 100n, 20000n,
    1n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Ready{},
      ImportGraph.Edge{3n, 1n} <> Nil{}, 2n <> 1n <> Nil{},
      2n, 200n, 20000n, 1n, True{}, False{}, False{}, graph_limits()},
      ImportGraph.SkipImport{2n, ImportGraph.TreeLimit{}}} : ImportGraph.Step}

law import_graph_skipped_tree_finishes_incomplete:
  {ImportGraph.next(graph_limits(), Nil{}, 2n <> 1n <> Nil{}, 2n, 200n, 20000n,
    1n, True{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.TreeLimit{}},
      Nil{}, 2n <> 1n <> Nil{}, 2n, 200n, 20000n, 1n, True{}, False{}, False{}, graph_limits()},
      ImportGraph.UnitIncomplete{ImportGraph.TreeLimit{}}} : ImportGraph.Step}

law import_graph_missing_import_keeps_later_edges:
  {ImportGraph.resolved(graph_limits(), ImportGraph.Edge{2n, 1n}, 2n,
    ImportGraph.NotFound{}, ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{},
    1n, 100n, 100n, 1n, False{}, False{}, False{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Ready{},
      ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{},
      1n, 100n, 100n, 1n, False{}, False{}, True{}, graph_limits()},
      ImportGraph.SkipImport{2n, ImportGraph.Missing{}}} : ImportGraph.Step}

law import_graph_omitted_import_finishes_incomplete:
  {ImportGraph.next(graph_limits(), Nil{}, 1n <> Nil{},
    1n, 100n, 100n, 1n, False{}, False{}, True{}) ==
    ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.Omitted{}},
      Nil{}, 1n <> Nil{}, 1n, 100n, 100n, 1n,
      False{}, False{}, True{}, graph_limits()},
      ImportGraph.UnitIncomplete{ImportGraph.Omitted{}}} : ImportGraph.Step}

law rotated_in_scope_advice_is_retired:
  {Collection.credential_disposition(True{}, False{}) ==
    Collection.RetireAdvice{} : Collection.CredentialDisposition}

law current_in_scope_advice_is_retained:
  {Collection.credential_disposition(True{}, True{}) ==
    Collection.RetainAdvice{} : Collection.CredentialDisposition}

law out_of_scope_rotated_advice_is_retained:
  {Collection.credential_disposition(False{}, False{}) ==
    Collection.RetainAdvice{} : Collection.CredentialDisposition}

law valid_composed_submission_candidate_is_admitted:
  {Delivery.submission_candidate(Delivery.SubmissionFacts{True{}, True{}, True{},
    True{}, True{}, True{}, True{}, True{}}) == True{} : Bool}

law stale_composed_submission_candidate_is_denied:
  {Delivery.submission_candidate(Delivery.SubmissionFacts{True{}, True{}, True{},
    True{}, True{}, True{}, False{}, True{}}) == False{} : Bool}

law empty_composed_submission_batch_releases:
  {Delivery.submission_batch_gate(0n, True{}) ==
    Delivery.BatchRelease{} : Delivery.BatchGate}

law valid_composed_submission_batch_proceeds:
  {Delivery.submission_batch_gate(1n, True{}) ==
    Delivery.BatchProceed{} : Delivery.BatchGate}

law final_credential_mismatch_is_retained_in_fold:
  {Delivery.credential_observe(True{}, True{}, True{}) == True{} : Bool}

law final_shared_credential_mismatch_releases_batch:
  {Delivery.final_credential_gate(True{}, True{}) ==
    Delivery.BatchRelease{} : Delivery.BatchGate}

law ticket_credential_mismatch_does_not_use_shared_gate:
  {Delivery.final_credential_gate(False{}, True{}) ==
    Delivery.BatchProceed{} : Delivery.BatchGate}

law provisional_stop_output_revokes_and_closes:
  {Round.stop_terminal(True{}, False{}, False{}) ==
    Round.StopTerminal{True{}, True{}} : Round.StopTerminal}

law authorized_stop_output_keeps_requested_open:
  {Round.stop_terminal(True{}, True{}, False{}) ==
    Round.StopTerminal{False{}, False{}} : Round.StopTerminal}

law ordinary_stop_close_is_preserved:
  {Round.stop_terminal(False{}, False{}, True{}) ==
    Round.StopTerminal{False{}, True{}} : Round.StopTerminal}

law expired_stop_without_barrier_closes:
  {Round.expire_close(False{}) == True{} : Bool}

law expired_stop_with_barrier_stays_open:
  {Round.expire_close(True{}) == False{} : Bool}

law expired_notice_lease_drops_without_pending_expiry:
  {Notice.prune(True{}, True{}, True{}, False{}, False{}, False{}) ==
    Notice.Prune{True{}, False{}, False{}} : Notice.Prune}

law expired_pending_notice_drops_key_after_cooldown:
  {Notice.prune(True{}, False{}, False{}, True{}, False{}, True{}) ==
    Notice.Prune{False{}, True{}, True{}} : Notice.Prune}

law excepted_notice_key_remains_after_expiry:
  {Notice.prune(True{}, False{}, False{}, True{}, True{}, True{}) ==
    Notice.Prune{False{}, True{}, False{}} : Notice.Prune}

law empty_expired_notice_key_is_removed:
  {Notice.prune(False{}, False{}, False{}, False{}, False{}, True{}) ==
    Notice.Prune{False{}, False{}, True{}} : Notice.Prune}

law current_finding_is_retained:
  {Work.evaluated_disposition(True{}, True{}) ==
    Work.RetainFinding{} : Work.EvaluatedDisposition}

law stale_finding_is_retired:
  {Work.evaluated_disposition(True{}, False{}) ==
    Work.RetireStaleFinding{} : Work.EvaluatedDisposition}

law current_clear_settles_clear:
  {Work.evaluated_disposition(False{}, True{}) ==
    Work.SettleClear{} : Work.EvaluatedDisposition}

law stale_clear_settles_unavailable:
  {Work.evaluated_disposition(False{}, False{}) ==
    Work.SettleStaleClear{} : Work.EvaluatedDisposition}

law backend_failure_reports_backend:
  {Work.failure_disposition(True{}, False{}, False{}) ==
    Work.BackendUnavailable{} : Work.FailureDisposition}

law credential_failure_reports_credential:
  {Work.failure_disposition(False{}, True{}, False{}) ==
    Work.CredentialUnavailable{} : Work.FailureDisposition}

law missing_result_reports_lost:
  {Work.failure_disposition(False{}, False{}, True{}) ==
    Work.LostUnavailable{} : Work.FailureDisposition}

law stale_joined_ticket_preserves_stale_status:
  {Ticket.joined_disposition(Ticket.JoinedFinding{}, True{}, True{}, True{}) ==
    Ticket.KeepJoined{} : Ticket.JoinedDisposition}

law joined_finding_without_identity_is_lost:
  {Ticket.joined_disposition(Ticket.JoinedFinding{}, False{}, True{}, False{}) ==
    Ticket.SetJoinedLost{} : Ticket.JoinedDisposition}

law joined_clear_with_revision_settles_clear:
  {Ticket.joined_disposition(Ticket.JoinedClear{}, False{}, True{}, False{}) ==
    Ticket.SetJoinedClear{} : Ticket.JoinedDisposition}

law ready_unit_within_frame_is_admitted:
  {Work.prepared_offer(True{}, True{}) ==
    Work.AdmitPrepared{} : Work.PreparedOffer}

law oversized_ready_unit_is_rejected:
  {Work.prepared_offer(True{}, False{}) ==
    Work.RejectPreparedCapacity{} : Work.PreparedOffer}

law skipped_unit_is_not_admitted:
  {Work.prepared_offer(False{}, True{}) ==
    Work.SkipPrepared{} : Work.PreparedOffer}

law empty_non_skipped_ticket_fails_lost:
  {Work.empty_prepared(0n, True{}, True{}) ==
    Work.FailEmptyLost{} : Work.EmptyPrepared}

law skipped_only_ticket_has_no_failure:
  {Work.empty_prepared(0n, False{}, True{}) ==
    Work.NoEmptyFailure{} : Work.EmptyPrepared}

law idle_cleanup_is_ready:
  {Retention.cleanup_gate(Retention.CleanupFacts{True{}, True{}, True{}, True{},
    True{}, True{}, True{}, True{}, True{}}) ==
    Retention.CleanupReady{} : Retention.CleanupGate}

law open_virtual_round_blocks_idle_cleanup:
  {Retention.cleanup_live_state(False{}, True{}) == False{} : Bool}

law pending_edit_permit_blocks_idle_cleanup:
  {Retention.cleanup_live_state(True{}, False{}) == False{} : Bool}

law empty_round_and_permit_state_allows_idle_cleanup:
  {Retention.cleanup_live_state(True{}, True{}) == True{} : Bool}

law pending_notice_blocks_cleanup:
  {Retention.cleanup_gate(Retention.CleanupFacts{True{}, True{}, True{}, False{},
    True{}, True{}, True{}, True{}, True{}}) ==
    Retention.CleanupBusy{} : Retention.CleanupGate}

law inactive_lifetime_blocks_cleanup:
  {Retention.cleanup_gate(Retention.CleanupFacts{False{}, True{}, True{}, True{},
    True{}, True{}, True{}, True{}, True{}}) ==
    Retention.CleanupBusy{} : Retention.CleanupGate}

law ledger_residue_blocks_cleanup_commit:
  {Retention.cleanup_commit(False{}) ==
    Retention.CleanupBusy{} : Retention.CleanupGate}

law excess_ticket_evicts_oldest:
  {Retention.ticket_retention(2n, 1n, True{}) ==
    Retention.EvictOldest{} : Retention.TicketRetention}

law ticket_limit_keeps_existing:
  {Retention.ticket_retention(1n, 1n, True{}) ==
    Retention.KeepTickets{} : Retention.TicketRetention}

law exact_cancellation_uses_named_jobs:
  {Retention.discard_scope(2n, 2n, False{}) ==
    Retention.NamedOnly{} : Retention.DiscardScope}

law unmatched_cancellation_discards_all_unfinished:
  {Retention.discard_scope(1n, 2n, False{}) ==
    Retention.AllUnfinished{} : Retention.DiscardScope}

law unnamed_work_discards_all_unfinished:
  {Retention.discard_scope(2n, 2n, True{}) ==
    Retention.AllUnfinished{} : Retention.DiscardScope}

law revoked_block_ticket_releases_final_selection:
  {Ticket.final_authority(True{}, False{}) ==
    Ticket.FinalRelease{} : Ticket.FinalAuthority}

law current_block_ticket_proceeds:
  {Ticket.final_authority(True{}, True{}) ==
    Ticket.FinalProceed{} : Ticket.FinalAuthority}

law advisory_ticket_proceeds_without_block_opt_in:
  {Ticket.final_authority(False{}, False{}) ==
    Ticket.FinalProceed{} : Ticket.FinalAuthority}

law replaced_candidate_is_ignored_before_revalidation_status:
  {Handoff.validation_route(False{}, Handoff.Stale{}) ==
    Handoff.IgnoreCandidate{} : Handoff.CandidateAction}

law unavailable_revalidation_releases_lease:
  {Handoff.validation_route(True{}, Handoff.Unavailable{}) ==
    Handoff.ReleaseCandidate{} : Handoff.CandidateAction}

law stale_revalidation_retires_advice:
  {Handoff.validation_route(True{}, Handoff.Stale{}) ==
    Handoff.RetireCandidate{} : Handoff.CandidateAction}

law failed_work_revision_retires_advice:
  {Handoff.post_validation(False{}, False{}, True{}) ==
    Handoff.RetireCandidate{} : Handoff.CandidateAction}

law empty_fitting_selection_releases_lease:
  {Handoff.post_validation(True{}, False{}, False{}) ==
    Handoff.ReleaseCandidate{} : Handoff.CandidateAction}

law credential_generation_mismatch_retires_final_candidate:
  {Handoff.final_candidate(True{}, False{}, False{}, False{}, True{}, True{}) ==
    Handoff.RetireCandidate{} : Handoff.CandidateAction}

law credential_revocation_releases_final_candidate:
  {Handoff.final_candidate(True{}, True{}, False{}, False{}, True{}, True{}) ==
    Handoff.ReleaseCandidate{} : Handoff.CandidateAction}

law current_final_candidate_is_retained:
  {Handoff.final_candidate(True{}, True{}, True{}, False{}, True{}, True{}) ==
    Handoff.RetainCandidate{} : Handoff.CandidateAction}

law expired_collection_lease_is_dropped:
  {Delivery.collection_lease(True{}, True{}, False{}, False{}, False{}) ==
    Delivery.DropLease{} : Delivery.CollectionLeaseAction}

law live_background_lease_stays_before_terminal_reoffer:
  {Delivery.collection_lease(True{}, False{}, True{}, True{}, False{}) ==
    Delivery.KeepLease{} : Delivery.CollectionLeaseAction}

law terminal_background_lease_reoffers_only_to_own_stop:
  {Delivery.collection_lease(True{}, False{}, True{}, True{}, True{}) ==
    Delivery.DropLease{} : Delivery.CollectionLeaseAction}

law other_group_stop_cannot_drop_lease:
  {Delivery.collection_lease(True{}, False{}, True{}, False{}, True{}) ==
    Delivery.KeepLease{} : Delivery.CollectionLeaseAction}

law available_advice_requires_ticket_and_unsuppressed_finding:
  {Delivery.advice_candidate(True{}, True{}, True{}, True{}) == True{} : Bool}

law leased_advice_cannot_be_candidate:
  {Delivery.advice_candidate(True{}, False{}, True{}, True{}) == False{} : Bool}

law pending_notice_requires_unleased_owned_record:
  {Delivery.notice_candidate(True{}, True{}, False{}, True{}) == False{} : Bool}

law no_delivery_cannot_acknowledge:
  {Delivery.acknowledge(0n, False{}) == Delivery.AckEmpty{} : Delivery.AckDecision}

law expired_delivery_cannot_acknowledge:
  {Delivery.acknowledge(1n, True{}) == Delivery.AckExpired{} : Delivery.AckDecision}

law live_delivery_can_acknowledge:
  {Delivery.acknowledge(1n, False{}) == Delivery.AckReady{} : Delivery.AckDecision}

law unacknowledged_delivery_cannot_finalize:
  {Delivery.finalize(1n, False{}, False{}) == Delivery.FinalEmpty{} : Delivery.FinalDecision}

law expired_acknowledged_delivery_releases:
  {Delivery.finalize(1n, True{}, True{}) == Delivery.FinalExpired{} : Delivery.FinalDecision}

law composed_delivery_retains_advice_for_reoffer:
  {Delivery.finding_disposition(True{}, 0n) == Delivery.KeepForReoffer{} : Delivery.FindingDisposition}

law noncomposed_partial_delivery_retains_remaining:
  {Delivery.finding_disposition(False{}, 1n) == Delivery.KeepRemaining{} : Delivery.FindingDisposition}

law noncomposed_complete_delivery_retires_advice:
  {Delivery.finding_disposition(False{}, 0n) == Delivery.RetireAdvice{} : Delivery.FindingDisposition}

law canonical_delivery_acknowledgement_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryAcknowledgeCheck{1n, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryAckReady{} <> Nil{}} : Canonical.Step}

law canonical_delivery_finalization_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryFinalizeCheck{1n, True{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryFinalExpired{} <> Nil{}} : Canonical.Step}

law canonical_delivery_disposition_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryFindingDispositionCheck{False{}, 0n}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryRetireAdvice{} <> Nil{}} : Canonical.Step}

law canonical_delivery_submission_candidate_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliverySubmissionCandidateCheck{Delivery.SubmissionFacts{
      True{}, True{}, True{}, True{}, True{}, True{}, True{}, True{}}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliverySubmissionCandidate{} <> Nil{}} : Canonical.Step}

law canonical_delivery_submission_batch_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliverySubmissionBatchCheck{0n, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryBatchRelease{} <> Nil{}} : Canonical.Step}

law canonical_delivery_credential_fold_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryCredentialObserveCheck{False{}, False{}, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryCredentialInvalid{} <> Nil{}} : Canonical.Step}

law canonical_delivery_final_credential_uses_delivery_rule:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryFinalCredentialCheck{True{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryBatchRelease{} <> Nil{}} : Canonical.Step}

law canonical_validation_route_retires_stale_owner:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.ValidationRouteCheck{True{}, Handoff.Stale{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RetireCandidate{} <> Nil{}} : Canonical.Step}

law canonical_post_validation_releases_unfitting_candidate:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.PostValidationCheck{True{}, False{}, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.ReleaseCandidate{} <> Nil{}} : Canonical.Step}

law canonical_final_candidate_retires_expired_work:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.FinalCandidateCheck{True{}, True{}, True{}, True{}, True{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RetireCandidate{} <> Nil{}} : Canonical.Step}

law canonical_stop_begin_requires_active_unowned_round:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundBeginStopCheck{True{}, False{}, 1n}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundStopBegun{} <> Nil{}} : Canonical.Step}

law canonical_permit_only_round_is_inactive:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundActivityCheck{True{}, True{}, 0n, False{}, 0n, 1n}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundInactive{} <> Nil{}} : Canonical.Step}

law canonical_stop_barrier_uses_continuations_since_claim:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundBarrierCheck{True{}, 1n, 2n}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundBarrierRaised{} <> Nil{}} : Canonical.Step}

law canonical_deciding_stop_is_not_owned_for_new_decision:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundOwnsStopCheck{True{}, True{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundStopNotOwned{} <> Nil{}} : Canonical.Step}

law canonical_provisional_stop_terminal_revokes_and_closes:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundStopTerminalCheck{True{}, False{}, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundStopTerminal{True{}, True{}} <> Nil{}} : Canonical.Step}

law canonical_authorized_stop_expiry_keeps_round:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundExpireCloseCheck{False{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundExpireKeeps{} <> Nil{}} : Canonical.Step}

law canonical_continuation_budget_exhausts_at_four:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.RoundContinuationBudgetCheck{True{}, 4n}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.RoundContinuationExhausted{} <> Nil{}} : Canonical.Step}

law canonical_background_submission_waits_behind_barrier:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliverySubmissionAllowedCheck{True{}, True{}, False{},
      Delivery.Background{}, False{}, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliverySubmissionDenied{} <> Nil{}} : Canonical.Step}

law canonical_existing_stop_token_requires_finish_permit:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryExistingTokenCheck{Delivery.Stop{}, True{}, False{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryExistingTokenDenied{} <> Nil{}} : Canonical.Step}

law canonical_unreserved_stop_output_denied_during_decision:
  {Canonical.step(Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
    Canonical.DeliveryUnreservedStopCheck{True{}, True{}}) ==
    Canonical.Advanced{Canonical.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.DeliveryUnreservedStopDenied{} <> Nil{}} : Canonical.Step}

def reserved_output_selection() -> Lifecycle.OutputSelection:
  Lifecycle.OutputSelection{1n <> 2n <> Nil{}, False{}, False{}}

def authorized_output_selection() -> Lifecycle.OutputSelection:
  Lifecycle.OutputSelection{1n <> 2n <> Nil{}, True{}, False{}}

def consumed_output_selection() -> Lifecycle.OutputSelection:
  Lifecycle.OutputSelection{1n <> 2n <> Nil{}, True{}, True{}}

def one_pending_selection_work() -> Work.Work:
  Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}}

def deciding_output_round() -> Round.Round:
  Round.Round{1n, True{}, 0n, 0n, 7n, False{}, True{}, False{}}

law selected_finish_output_reserves_exact_unit_and_slot:
  {Lifecycle.finish_output(deciding_output_round(), one_pending_selection_work(), 7n,
      1n <> Nil{}, False{}, True{}, True{}, True{}, False{}) ==
    Lifecycle.OutputReserved{Round.Round{1n, True{}, 0n, 1n, 7n, True{}, True{}, True{}},
      Lifecycle.OutputSelection{1n <> Nil{}, False{}, False{}}} : Lifecycle.FinishOutput}

law notice_only_finish_output_does_not_reserve:
  {Lifecycle.finish_output(deciding_output_round(), one_pending_selection_work(), 7n,
      Nil{}, True{}, True{}, True{}, True{}, False{}) ==
    Lifecycle.OutputNotices{} : Lifecycle.FinishOutput}

law overselected_finish_output_is_unavailable:
  {Lifecycle.finish_output(deciding_output_round(), one_pending_selection_work(), 7n,
      1n <> 1n <> Nil{}, False{}, True{}, True{}, True{}, False{}) ==
    Lifecycle.OutputAllowed{Lifecycle.AllowUnavailable{}} : Lifecycle.FinishOutput}

law empty_finish_output_at_deadline_allows:
  {Lifecycle.finish_output(deciding_output_round(), one_pending_selection_work(), 7n,
      Nil{}, False{}, True{}, True{}, True{}, True{}) ==
    Lifecycle.OutputAllowed{Lifecycle.AllowDeadline{}} : Lifecycle.FinishOutput}

law output_selection_reserves_pending_unit:
  {Lifecycle.selection_reserve(one_pending_selection_work(), 1n <> Nil{}) ==
    Lifecycle.SelectionReserved{Lifecycle.OutputSelection{1n <> Nil{}, False{}, False{}}}
      : Lifecycle.OutputSelectionReservation}

law output_selection_rejects_more_than_pending:
  {Lifecycle.selection_reserve(one_pending_selection_work(), 1n <> 1n <> Nil{}) ==
    Lifecycle.SelectionRejected{} : Lifecycle.OutputSelectionReservation}

law output_selection_authorizes_once:
  {Lifecycle.selection_authorize(reserved_output_selection()) ==
    Lifecycle.SelectionGranted{authorized_output_selection()} : Lifecycle.OutputSelectionStep}

law output_selection_consumes_exact_units:
  {Lifecycle.selection_consume(authorized_output_selection(), 1n <> 2n <> Nil{}) ==
    Lifecycle.SelectionGranted{consumed_output_selection()} : Lifecycle.OutputSelectionStep}

law output_selection_rejects_changed_units:
  {Lifecycle.selection_consume(authorized_output_selection(), 2n <> 1n <> Nil{}) ==
    Lifecycle.SelectionDenied{authorized_output_selection()} : Lifecycle.OutputSelectionStep}

law output_selection_rejects_unapproved_write:
  {Lifecycle.selection_consume(reserved_output_selection(), 1n <> 2n <> Nil{}) ==
    Lifecycle.SelectionDenied{reserved_output_selection()} : Lifecycle.OutputSelectionStep}

law output_selection_cannot_be_consumed_twice:
  {Lifecycle.selection_consume(consumed_output_selection(), 1n <> 2n <> Nil{}) ==
    Lifecycle.SelectionDenied{consumed_output_selection()} : Lifecycle.OutputSelectionStep}

law live_advice_precedes_pending_and_cache:
  {Reuse.route(True{}, True{}, True{}) == Reuse.JoinAdvice{} : Reuse.Route}

law attached_pending_precedes_claimed_pending:
  {Reuse.route(False{}, True{}, True{}) == Reuse.JoinPending{} : Reuse.Route}

law bare_claim_joins_without_cache_lookup:
  {Reuse.route(False{}, False{}, True{}) == Reuse.JoinClaimed{} : Reuse.Route}

law no_live_owner_looks_up_success_cache:
  {Reuse.route(False{}, False{}, False{}) == Reuse.LookupCache{} : Reuse.Route}

law successful_cache_hit_reuses_evaluation:
  {Reuse.cache_route(True{}) == Reuse.Cached{} : Reuse.CacheRoute}

law cache_miss_claims_evaluation_owner:
  {Reuse.cache_route(False{}) == Reuse.Own{} : Reuse.CacheRoute}

law background_submission_blocked_by_stop_barrier:
  {Delivery.submission_allowed(
      Round.Round{1n, True{}, 0n, 0n, 1n, True{}, False{}, False{}},
      Delivery.Background{}, False{}, False{}) == False{} : Bool}

law edit_submission_allowed_during_stop_barrier:
  {Delivery.submission_allowed(
      Round.Round{1n, True{}, 0n, 0n, 1n, True{}, False{}, False{}},
      Delivery.Edit{}, False{}, False{}) == True{} : Bool}

law existing_stop_token_requires_finish_permit:
  {Delivery.submission_allowed(Round.initial(), Delivery.Stop{}, True{}, False{}) == False{} : Bool}

law existing_stop_token_accepts_finish_permit:
  {Delivery.submission_allowed(Round.initial(), Delivery.Stop{}, True{}, True{}) == True{} : Bool}

law existing_background_token_is_denied_before_advice_lookup:
  {Delivery.existing_token_allowed(Delivery.Background{}, True{}, False{}) == False{} : Bool}

law unreserved_stop_blocked_during_decision:
  {Delivery.unreserved_stop_allowed(
      Round.Round{1n, True{}, 0n, 0n, 1n, False{}, True{}, False{}}) == False{} : Bool}

law ticket_collect_gate_proceeds_with_valid_authority:
  {Ticket.collect_gate(False{}, True{}) ==
    Ticket.CollectProceed{} : Ticket.CollectGate}

law ticket_collect_gate_blocks_credential_change:
  {Ticket.collect_gate(False{}, False{}) ==
    Ticket.CollectUnavailable{Ticket.Credential{}} : Ticket.CollectGate}

law ticket_collect_gate_blocks_expiry:
  {Ticket.collect_gate(True{}, True{}) ==
    Ticket.CollectUnavailable{Ticket.Expired{}} : Ticket.CollectGate}

law ticket_collect_gate_expiry_precedes_credential:
  {Ticket.collect_gate(True{}, False{}) ==
    Ticket.CollectUnavailable{Ticket.Expired{}} : Ticket.CollectGate}

def submitted_background_lease() -> Handoff.Lease:
  Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Submitted{Handoff.Background{}}}

law stop_cannot_reoffer_submitted_background_lease:
  {Handoff.lease.offer(submitted_background_lease(), 1n, 12n,
      Handoff.Stop{}, True{}) ==
    Handoff.Denied{submitted_background_lease()} : Handoff.LeaseResult}

law edit_cannot_reoffer_submitted_background_lease:
  {Handoff.lease.offer(submitted_background_lease(), 1n, 12n,
      Handoff.Edit{}, True{}) ==
    Handoff.Denied{submitted_background_lease()} : Handoff.LeaseResult}

law stop_cannot_reoffer_without_fresh_validation:
  {Handoff.lease.offer(submitted_background_lease(), 1n, 12n,
      Handoff.Stop{}, False{}) ==
    Handoff.Denied{submitted_background_lease()} : Handoff.LeaseResult}

law available_lease_uses_ordinary_reservation:
  {Handoff.lease.offer(Handoff.lease.initial(7n, 1n), 1n, 12n,
      Handoff.Background{}, True{}) ==
    Handoff.Granted{Handoff.Lease{7n, 1n, False{}, False{},
      Handoff.Reserved{12n, Handoff.Background{}}}} : Handoff.LeaseResult}

def expirable_permit() -> Admission.AdmissionState:
  Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
    Admission.Permit{1n, 1n, 1n, 100n, 200n} <> Nil{}}

law permit_before_deadline_is_retained:
  {Admission.expire(expirable_permit(), 1n, False{}) ==
    Admission.KeepPermit{expirable_permit()} : Admission.ExpiryResult}

law permit_at_deadline_is_removed:
  {Admission.expire(expirable_permit(), 1n, True{}) ==
    Admission.RemovePermit{Admission.AdmissionState{1n, 1n, 0n, False{}, 0n,
      2n, Nil{}}} : Admission.ExpiryResult}

law expiry_does_not_remove_another_token:
  {Admission.expire(expirable_permit(), 2n, True{}) ==
    Admission.RemovePermit{expirable_permit()} : Admission.ExpiryResult}

law identical_input_reuses_current_revision:
  {Revision.register(True{}, True{}) == Revision.Reuse{} : Revision.Registration}

law changed_input_replaces_current_revision:
  {Revision.register(True{}, False{}) == Revision.Replace{} : Revision.Registration}

law first_input_creates_revision:
  {Revision.register(False{}, False{}) == Revision.Replace{} : Revision.Registration}

law newer_revision_supersedes_same_subject:
  {Revision.superseded(1n, 1n, 2n, 3n) == True{} : Bool}

law same_generation_is_current:
  {Revision.superseded(1n, 1n, 3n, 3n) == False{} : Bool}

law other_subject_is_not_superseded:
  {Revision.superseded(2n, 1n, 2n, 3n) == False{} : Bool}

law notice_suppression_increments_count:
  {Notice.advance(Some{1n}, 1n, 64n, 3n, Some{2n}, False{}, 5n) ==
    Notice.Suppressed{4n} : Notice.Advance}

law notice_suppression_saturates_at_bound:
  {Notice.advance(Some{1n}, 1n, 64n, 5n, None{}, False{}, 5n) ==
    Notice.Suppressed{5n} : Notice.Advance}

law notice_refresh_creates_pending_after_delivery:
  {Notice.advance(Some{0n}, 1n, 64n, 3n, None{}, False{}, 5n) ==
    Notice.CreatePending{3n} : Notice.Advance}

law notice_refresh_merges_unleased_pending:
  {Notice.advance(Some{0n}, 1n, 64n, 3n, Some{2n}, False{}, 5n) ==
    Notice.MergePending{5n} : Notice.Advance}

law notice_merge_saturates_at_bound:
  {Notice.advance(Some{0n}, 1n, 64n, 2n, Some{5n}, False{}, 5n) ==
    Notice.MergePending{5n} : Notice.Advance}

law notice_refresh_preserves_leased_pending:
  {Notice.advance(Some{0n}, 1n, 64n, 3n, Some{2n}, True{}, 5n) ==
    Notice.KeepLeased{} : Notice.Advance}

law notice_full_table_rejects_new_key:
  {Notice.advance(None{}, 64n, 64n, 0n, None{}, False{}, 5n) ==
    Notice.RejectedFull{} : Notice.Advance}

law notice_available_table_creates_new_key:
  {Notice.advance(None{}, 63n, 64n, 0n, None{}, False{}, 5n) ==
    Notice.CreateKey{} : Notice.Advance}

law fitting_notice_is_included:
  {Handoff.notice_offer(5n, 10240n, False{}) ==
    Handoff.IncludeNotice{} : Handoff.NoticeOffer}

law sixth_notice_fits_when_bytes_fit:
  {Handoff.notice_offer(6n, 100n, False{}) ==
    Handoff.IncludeNotice{} : Handoff.NoticeOffer}

law oversized_notice_skips_in_claude:
  {Handoff.notice_offer(2n, 10241n, True{}) ==
    Handoff.SkipNotice{} : Handoff.NoticeOffer}

law oversized_notice_stops_codex_prefix:
  {Handoff.notice_offer(2n, 10241n, False{}) ==
    Handoff.StopNotices{} : Handoff.NoticeOffer}

def permit_facts() -> Admission.ProspectiveFacts:
  Admission.ProspectiveFacts{True{}, 2500n, 100n, 110n,
    32n, 4096n}

law prospective_gate_rejects_late_hook_clock:
  {Admission.prospective_gate(permit_facts(), 100n, 2601n) ==
    Admission.PermitLate{} : Admission.ProspectiveDecision}

law prospective_gate_accepts_before_hook_window_boundary:
  {Admission.prospective_gate(permit_facts(), 100n, 2599n) ==
    Admission.PermitAllowed{} : Admission.ProspectiveDecision}

law prospective_gate_rejects_at_hook_window_boundary:
  {Admission.prospective_gate(permit_facts(), 100n, 2600n) ==
    Admission.PermitLate{} : Admission.ProspectiveDecision}

law prospective_gate_uses_supplied_hook_window:
  {Admission.prospective_gate(Admission.ProspectiveFacts{True{}, 100n, 100n, 199n,
      32n, 4096n}, 100n, 199n) ==
    Admission.PermitAllowed{} : Admission.ProspectiveDecision}

law prospective_gate_rejects_reversed_clock:
  {Admission.prospective_gate(Admission.ProspectiveFacts{True{}, 2500n, 200n, 100n,
      32n, 4096n}, 200n, 100n) ==
    Admission.PermitInvalidClock{} : Admission.ProspectiveDecision}

law ticket_admission_stores_only_identity_and_units:
  {TicketState.open(TicketState.initial(), 1n) ==
    TicketState.Granted{TicketState.State{TicketState.Record{1n} <> Nil{}, Nil{}}} : TicketState.Decision}

law ticket_unit_requires_its_originating_admission:
  {TicketState.unit_snapshot(TicketState.State{
      TicketState.Record{1n} <> TicketState.Record{2n} <> Nil{},
      TicketState.TicketUnit{10n, 1n, Ticket.UnitPending{}, None{}} <> Nil{}},
    2n, 10n) == None{} : Maybe<&2, TicketState.TicketUnit>}

law ticket_revision_only_updates_pending_unit:
  {Ticket.unit.step(Ticket.UnitFinding{False{}}, Ticket.Revise{}) ==
    Ticket.UnitDenied{Ticket.UnitFinding{False{}}} : Ticket.UnitStep}

law ticket_failure_overrides_previous_unit_result:
  {Ticket.unit.step(Ticket.UnitFinding{True{}}, Ticket.FailUnit{}) ==
    Ticket.UnitGranted{Ticket.UnitUnavailable{}} : Ticket.UnitStep}

law unavailable_ticket_unit_cannot_become_clear:
  {Ticket.unit.step(Ticket.UnitUnavailable{}, Ticket.ClearResult{}) ==
    Ticket.UnitDenied{Ticket.UnitUnavailable{}} : Ticket.UnitStep}

law unavailable_ticket_unit_cannot_become_finding:
  {Ticket.unit.step(Ticket.UnitUnavailable{}, Ticket.FindingResult{}) ==
    Ticket.UnitDenied{Ticket.UnitUnavailable{}} : Ticket.UnitStep}

law ticket_finding_delivery_is_terminal_marker:
  {Ticket.unit.step(Ticket.UnitFinding{False{}}, Ticket.MarkDelivered{}) ==
    Ticket.UnitGranted{Ticket.UnitFinding{True{}}} : Ticket.UnitStep}

law ticket_clear_unit_cannot_mark_delivery:
  {Ticket.unit.step(Ticket.UnitClear{}, Ticket.MarkDelivered{}) ==
    Ticket.UnitDenied{Ticket.UnitClear{}} : Ticket.UnitStep}

law existing_cache_entry_reuses_without_byte_check:
  {Cache.admit(True{}, 200n, 100n) == Cache.Already{} : Cache.Admission}

law cache_rejects_oversized_success:
  {Cache.admit(False{}, 101n, 100n) == Cache.Reject{} : Cache.Admission}

law cache_admits_exact_byte_limit:
  {Cache.admit(False{}, 100n, 100n) == Cache.Add{} : Cache.Admission}

law cache_evicts_oldest_at_entry_limit:
  {Cache.evict(8n, 10n, 1n, 8n, 100n) == True{} : Bool}

law cache_evicts_oldest_before_byte_overflow:
  {Cache.evict(1n, 70n, 40n, 8n, 100n) == True{} : Bool}

law empty_cache_never_evicts:
  {Cache.evict(0n, 0n, 100n, 8n, 100n) == False{} : Bool}

law reserved_delivery_only_authorizes_once:
  {Delivery.transition(Delivery.Reserved{}, Delivery.Authorized{}) ==
    Delivery.Granted{Delivery.Authorized{}} : Delivery.Step}

law delivered_output_cannot_be_resubmitted:
  {Delivery.transition(Delivery.Submitted{}, Delivery.Submitted{}) ==
    Delivery.Denied{Delivery.Submitted{}} : Delivery.Step}

law authorized_delivery_expires_at_boundary:
  {Delivery.expired(Delivery.Authorized{}, 20000n, 20000n) == True{} : Bool}

law authorized_delivery_does_not_expire_early:
  {Delivery.expired(Delivery.Authorized{}, 19999n, 20000n) == False{} : Bool}

law submitted_background_cannot_reoffer:
  {Delivery.background_reofferable(Delivery.Submitted{}, Delivery.Background{}) == False{} : Bool}

law live_background_cannot_reoffer:
  {Delivery.background_reofferable(Delivery.Authorized{}, Delivery.Background{}) == False{} : Bool}

law submitted_edit_cannot_reoffer_at_stop:
  {Delivery.background_reofferable(Delivery.Submitted{}, Delivery.Edit{}) == False{} : Bool}

law collection_orders_cycle_before_sequence:
  {Collection.order(2n, 99n, 3n, 1n) == Collection.Before{} : Collection.Order}

law collection_orders_sequence_inside_cycle:
  {Collection.order(2n, 9n, 2n, 4n) == Collection.After{} : Collection.Order}

law collection_waits_until_exact_window:
  {Collection.eligible(False{}, False{}, False{}, 49n, 50n) == False{} : Bool}

law collection_cycle_completion_unblocks_early:
  {Collection.eligible(False{}, False{}, True{}, 0n, 50n) == True{} : Bool}

law pending_advice_expires_at_boundary:
  {Collection.expired(600000n, 600000n) == True{} : Bool}

law pending_advice_remains_before_boundary:
  {Collection.expired(599999n, 600000n) == False{} : Bool}

law active_notice_cooldown_suppresses_even_at_capacity:
  {Notice.decide(Some{1n}, 64n, 64n) == Notice.Suppress{} : Notice.Action}

law elapsed_notice_cooldown_refreshes_at_capacity:
  {Notice.decide(Some{0n}, 64n, 64n) == Notice.Refresh{} : Notice.Action}

law full_notice_table_rejects_new_key:
  {Notice.decide(None{}, 64n, 64n) == Notice.RejectFull{} : Notice.Action}

law notice_table_creates_below_capacity:
  {Notice.decide(None{}, 63n, 64n) == Notice.Create{} : Notice.Action}

law background_writer_claims_one_slot:
  {Background.claim(Background.initial(), 7n, True{}, 0n, 64n) ==
    Background.Granted{Background.Waiter{7n}} : Background.Step}

law second_background_writer_cannot_take_slot:
  {Background.claim(Background.Waiter{7n}, 8n, True{}, 1n, 64n) ==
    Background.Denied{Background.Waiter{7n}} : Background.Step}

law wrong_background_writer_cannot_release:
  {Background.release(Background.Waiter{7n}, 8n) ==
    Background.Denied{Background.Waiter{7n}} : Background.Step}

law background_writer_expires_at_boundary:
  {Background.expire(Background.Waiter{7n}, 20000n, 20000n) ==
    Background.initial() : Background.Waiter}

law background_writer_remains_before_boundary:
  {Background.expire(Background.Waiter{7n}, 19999n, 20000n) ==
    Background.Waiter{7n} : Background.Waiter}

law background_capacity_denies_new_writer:
  {Background.claim(Background.initial(), 7n, True{}, 64n, 64n) ==
    Background.Denied{Background.initial()} : Background.Step}

law round_begin_stop_claims_single_owner:
  {Round.begin_stop(Round.initial(), 7n) ==
    Round.Granted{Round.Round{1n, True{}, 0n, 0n, 7n, False{}, False{}, False{}}} : Round.Step}

law second_stop_cannot_take_claim:
  {Round.begin_stop(Round.Round{1n, True{}, 0n, 0n, 7n, False{}, False{}, False{}}, 8n) ==
    Round.Denied{Round.Round{1n, True{}, 0n, 0n, 7n, False{}, False{}, False{}}} : Round.Step}

law four_continuations_exhaust_budget:
  {Round.consume(Round.Round{1n, True{}, 0n, 4n, 0n, False{}, False{}, False{}}) ==
    Round.Denied{Round.Round{1n, True{}, 0n, 4n, 0n, False{}, False{}, False{}}} : Round.Step}

law finish_closure_fences_late_output:
  {Round.reserve_output(Round.Round{1n, False{}, 20n, 1n, 7n, True{}, True{}, False{}}, 7n) ==
    Round.Denied{Round.Round{1n, False{}, 20n, 1n, 7n, True{}, True{}, False{}}} : Round.Step}

law reopening_requires_next_generation:
  {Round.reopen(Round.Round{1n, False{}, 20n, 1n, 0n, False{}, False{}, False{}}, 2n) ==
    Round.Granted{Round.Round{2n, True{}, 20n, 0n, 0n, False{}, False{}, False{}}} : Round.Step}

law uncertain_background_suppresses_ordinary_collection:
  {Handoff.lease.suppresses(Handoff.Lease{1n, 1n, False{}, False{},
      Handoff.Uncertain{Handoff.Background{}}}, 1n, Handoff.Edit{}) == True{} : Bool}

law uncertain_background_may_reoffer_at_stop:
  {Handoff.lease.suppresses(Handoff.Lease{1n, 1n, False{}, False{},
      Handoff.Uncertain{Handoff.Background{}}}, 1n, Handoff.Stop{}) == False{} : Bool}

law edit_submission_cannot_reoffer_at_stop:
  {Handoff.lease.reoffer(Handoff.Lease{1n, 1n, False{}, False{},
      Handoff.Submitted{Handoff.Edit{}}}, 1n, 2n, True{}) ==
    Handoff.Denied{Handoff.Lease{1n, 1n, False{}, False{},
      Handoff.Submitted{Handoff.Edit{}}}} : Handoff.LeaseResult}

law unconsumed_permit_cannot_close_a_round:
  {Admission.close_round(permit_issued(), 21n) ==
    Admission.Rejected{permit_issued(), Admission.RoundAlreadyClosed{}} : Admission.AdmissionResult}

# A Jev finding ends the item's Jeview and produces pending advice for the
# same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Advicing.receive_finding(Advicing.AtJev{item}) == Advicing.AdvicePending{item} : Advicing.PendingAdvice}

# A finding for the first value leaves the second Jeview value unchanged.
# This law allows both values to carry the same item ID.
law finding_preserves_second_value:
  for item: Nat
  for second_item: Nat
  {Advicing.receive_finding_with_second(
    Advicing.AtJev{item}, Advicing.AtJev{second_item}
  ) == (
    Advicing.AdvicePending{item}, Advicing.AtJev{second_item}
  ) : Advicing.PendingAdvice & Advicing.Jeview}


def permit_issued() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 0n, False{}, 0n, 2n,
    Admission.Permit{1n, 42n, 1n, 10n, 20n} <> Nil{}}

def permit_consumed() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 1n, True{}, 0n, 2n,
    Nil{}}

law permit_bound_to_first_round:
  {Admission.step(Admission.initial(7n, 3n), 7n, 3n,
    Admission.Issue{42n, 10n, 20n, 11n}) ==
    Admission.Accepted{permit_issued(), Some{1n}, Some{1n}} : Admission.AdmissionResult}

law pending_tool_cannot_get_second_permit:
  {Admission.step(permit_issued(), 7n, 3n, Admission.Issue{42n, 11n, 20n, 12n}) ==
    Admission.Rejected{permit_issued(), Admission.DuplicateTool{}} : Admission.AdmissionResult}

law permit_consumption_opens_round_once:
  {Admission.step(permit_issued(), 7n, 3n, Admission.Consume{1n, 42n, 12n}) ==
    Admission.Accepted{permit_consumed(), Some{1n}, Some{1n}} : Admission.AdmissionResult}

law consumed_permit_cannot_repeat:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Consume{1n, 42n, 13n}) ==
    Admission.Rejected{permit_consumed(), Admission.NoPermit{}} : Admission.AdmissionResult}

def permit_retired() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 0n, False{}, 0n, 2n,
    Nil{}}

law released_permit_does_not_open_round:
  {Admission.release(permit_issued(), 1n) ==
    Admission.Accepted{permit_retired(), None{}, None{}} : Admission.AdmissionResult}

law expired_permit_does_not_open_round:
  {Admission.expire(permit_issued(), 1n, True{}) ==
    Admission.RemovePermit{permit_retired()} : Admission.ExpiryResult}

law retired_tool_can_receive_new_permit_after_history_eviction:
  {Admission.issue(permit_retired(), 42n, 21n, 30n, 22n) ==
    Admission.Accepted{Admission.AdmissionState{7n, 3n, 0n, False{}, 0n, 3n,
      Admission.Permit{2n, 42n, 1n, 21n, 30n} <> Nil{}}, Some{2n}, Some{1n}} : Admission.AdmissionResult}

law retired_permit_does_not_prevent_fresh_tool:
  {Admission.issue(permit_retired(), 43n, 21n, 30n, 22n) ==
    Admission.Accepted{Admission.AdmissionState{7n, 3n, 0n, False{}, 0n, 3n,
      Admission.Permit{2n, 43n, 1n, 21n, 30n} <> Nil{}}, Some{2n}, Some{1n}} : Admission.AdmissionResult}

law unknown_permit_cannot_be_released:
  {Admission.step(permit_issued(), 7n, 3n, Admission.Release{2n}) ==
    Admission.Rejected{permit_issued(), Admission.NoPermit{}} : Admission.AdmissionResult}

law consumed_permit_cannot_be_released:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Release{1n}) ==
    Admission.Rejected{permit_consumed(), Admission.NoPermit{}} : Admission.AdmissionResult}

law consumed_tool_can_receive_new_permit_after_history_eviction:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Issue{42n, 13n, 20n, 13n}) ==
    Admission.Accepted{Admission.AdmissionState{7n, 3n, 1n, True{}, 0n, 3n,
      Admission.Permit{2n, 42n, 1n, 13n, 20n} <> Nil{}}, Some{2n}, Some{1n}} : Admission.AdmissionResult}

law closure_fences_old_invocation:
  {Admission.step(
    Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}},
    7n, 3n, Admission.Issue{43n, 29n, 40n, 31n}) ==
    Admission.Rejected{
      Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}},
      Admission.StaleInvocation{}
    } : Admission.AdmissionResult}

law closed_round_rejects_callback:
  {Admission.callback_current(
    Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}},
    7n, 3n, 1n) == False{} : Bool}

def one_reading() -> Work.Work:
  Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
    Work.Observation{1n, Work.SourceReading{}} <> Nil{}, Nil{}}

def four_units() -> Work.Work:
  Work.Work{2n, 5n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <>
    Work.ReviewUnit{2n, 1n, Work.AtJev{}, 0n, 0n} <>
    Work.ReviewUnit{3n, 1n, Work.AtJev{}, 0n, 0n} <>
    Work.ReviewUnit{4n, 1n, Work.ReviewQueued{}, 0n, 0n} <> Nil{}}

law fanout_keeps_each_review_unfinished:
  {Work.prepare(one_reading(), 1n, 4n) ==
    Work.Accepted{four_units(), 1n <> 2n <> 3n <> 4n <> Nil{}} : Work.WorkStep}

law four_units_count_as_four_unfinished:
  {Work.unfinished(four_units()) == 4n : Nat}

law streamed_fanout_keeps_source_open:
  {Work.spawn(one_reading(), 1n, 1n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
      Work.Observation{1n, Work.SourceReading{}} <> Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}, 1n <> Nil{}} : Work.WorkStep}

law running_source_overrides_logical_queue_projection:
  {Work.start_source(Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
      Work.Observation{1n, Work.SourceQueued{}} <> Nil{}, Nil{}}, 1n) ==
    Work.Accepted{one_reading(), Nil{}} : Work.WorkStep}

law running_review_overrides_logical_queue_projection:
  {Work.start_unit(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.ReviewQueued{}, 0n, 0n} <> Nil{}}, 1n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}, Nil{}} : Work.WorkStep}

law source_completion_removes_only_source_work:
  {Work.complete_source(one_reading(), 1n) ==
    Work.Accepted{Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}},
      Nil{}} : Work.WorkStep}

law cached_finding_is_terminal_advice:
  {Work.cached_finding(one_reading(), 1n, 1n, 20n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
      Work.Observation{1n, Work.SourceReading{}} <> Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n <> Nil{}} : Work.WorkStep}

law revalidated_finding_count_replaces_old_count:
  {Work.revise_finding(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 2n, 20n} <> Nil{}}, 1n, 1n, 12n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 12n} <> Nil{}}, Nil{}} : Work.WorkStep}

law pending_count_is_owned_by_exact_unit:
  {Work.pending_for(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 2n, 20n} <> Nil{}}, 1n) == 2n : Nat}

law unknown_unit_cannot_authorize_findings:
  {Work.pending_for(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 2n, 20n} <> Nil{}}, 2n) == 0n : Nat}

law unfinished_unit_cannot_retire:
  {Work.retire(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}, 1n) ==
    Work.Rejected{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}, Work.UnitStillUnfinished{}} : Work.WorkStep}

law terminal_finding_can_retire:
  {Work.retire(Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}}, 1n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}},
      Nil{}} : Work.WorkStep}

law finish_waits_for_all_unfinished_work:
  {Work.finish_wait(2n, False{}, True{}) == True{} : Bool}

law finish_deadline_or_budget_ends_wait:
  {Bool.and(Bool.not(Work.finish_wait(2n, True{}, True{})),
    Bool.not(Work.finish_wait(2n, False{}, False{}))) == True{} : Bool}

law lowering_review_capacity_preserves_active_units:
  {Work.set_review_capacity(four_units(), Flow.Capacity{1n, 0n}) ==
    Work.Accepted{Work.Work{2n, 5n, Flow.Capacity{3n, 0n}, Flow.Capacity{1n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <>
      Work.ReviewUnit{2n, 1n, Work.AtJev{}, 0n, 0n} <>
      Work.ReviewUnit{3n, 1n, Work.AtJev{}, 0n, 0n} <>
      Work.ReviewUnit{4n, 1n, Work.ReviewQueued{}, 0n, 0n} <> Nil{}}, Nil{}} : Work.WorkStep}

law zero_units_settle_quietly:
  {Work.prepare(one_reading(), 1n, 0n) ==
    Work.Accepted{Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}}, Nil{}} : Work.WorkStep}

law first_result_preserves_other_review_work:
  {Work.unfinished(Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 1n, 20n} <>
    Work.ReviewUnit{2n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}) == 1n : Nat}

def one_work_at_jev() -> Work.Work:
  Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <> Nil{}}

law clear_result_is_not_finding:
  {Work.outcome(one_work_at_jev(), 1n, Work.Clear{}) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.ClearResult{}, 0n, 0n} <> Nil{}}, Nil{}} : Work.WorkStep}

law unavailable_result_is_not_clear:
  {Work.outcome(one_work_at_jev(), 1n, Work.Unavailable{}) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.UnavailableResult{}, 0n, 0n} <> Nil{}}, Nil{}} : Work.WorkStep}

law interrupted_review_is_terminal_before_finish:
  {Work.interrupt_unit(one_work_at_jev(), 1n) ==
    Work.Accepted{Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{1n, 1n, Work.InterruptedResult{}, 0n, 0n} <> Nil{}}, Nil{}} : Work.WorkStep}

law interrupted_source_does_not_leave_unfinished_work:
  {Work.interrupt_observation(one_reading(), 1n) ==
    Work.Accepted{Work.Work{2n, 1n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}}, Nil{}} : Work.WorkStep}

law decision_cancels_all_unfinished_but_keeps_advice:
  {Work.cancel_unfinished(Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
      Work.Observation{1n, Work.SourceReading{}} <> Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <>
      Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}}) ==
    Work.Cancelled{Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
      Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n <> Nil{}, 1n <> Nil{}} : Work.CancelResult}

def cutoff_work() -> Work.Work:
  Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
    Work.Observation{1n, Work.SourceReading{}} <> Nil{},
    Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <>
    Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}}

def claimed_round() -> Round.Round:
  Round.Round{1n, True{}, 0n, 0n, 7n, False{}, False{}, False{}}

law cutoff_fences_round_and_names_exact_cancellations:
  {Lifecycle.cutoff(claimed_round(), cutoff_work(), 7n) ==
    Lifecycle.CutoffGranted{Round.Round{1n, True{}, 0n, 0n, 7n, False{}, True{}, False{}},
      Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
        Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n <> Nil{}, 1n <> Nil{}} : Lifecycle.CutoffResult}

law wrong_stop_cannot_cut_off_work:
  {Lifecycle.cutoff(claimed_round(), cutoff_work(), 8n) ==
    Lifecycle.CutoffDenied{claimed_round(), cutoff_work()} : Lifecycle.CutoffResult}

law finish_gate_waits_for_live_work_and_external_owners:
  {Lifecycle.finish_gate(claimed_round(), cutoff_work(), 7n, 1n, False{}) ==
    Lifecycle.GateWaiting{claimed_round(), cutoff_work()} : Lifecycle.FinishGateResult}

law finish_gate_deadline_cancels_exact_work:
  {Lifecycle.finish_gate(claimed_round(), cutoff_work(), 7n, 1n, True{}) ==
    Lifecycle.GateCutoff{Round.Round{1n, True{}, 0n, 0n, 7n, False{}, True{}, False{}},
      Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
        Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n <> Nil{}, 1n <> Nil{}} : Lifecycle.FinishGateResult}

law wrong_stop_cannot_pass_finish_gate:
  {Lifecycle.finish_gate(claimed_round(), cutoff_work(), 8n, 0n, True{}) ==
    Lifecycle.GateDenied{claimed_round(), cutoff_work()} : Lifecycle.FinishGateResult}

law exhausted_budget_does_not_wait_for_work:
  {Lifecycle.finish_gate(Round.Round{1n, True{}, 0n, 4n, 7n, False{}, False{}, False{}},
      cutoff_work(), 7n, 0n, False{}) ==
    Lifecycle.GateCutoff{Round.Round{1n, True{}, 0n, 4n, 7n, False{}, True{}, False{}},
      Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
        Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 20n} <> Nil{}},
      1n <> Nil{}, 1n <> Nil{}} : Lifecycle.FinishGateResult}

def deciding_round() -> Round.Round:
  Round.Round{1n, True{}, 0n, 0n, 7n, False{}, True{}, False{}}

def selected_work() -> Work.Work:
  Work.Work{2n, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{},
    Work.ReviewUnit{1n, 1n, Work.PendingFinding{}, 2n, 20n} <> Nil{}}

law selected_findings_require_continuation:
  {Lifecycle.finish_disposition(selected_work(), 1n <> 1n <> Nil{},
      False{}, True{}, True{}, True{}, False{}) ==
    Lifecycle.ReserveFindings{} : Lifecycle.FinishDisposition}

law notice_only_selection_passes_without_slot:
  {Lifecycle.finish_disposition(selected_work(), Nil{}, True{}, True{},
      True{}, True{}, False{}) ==
    Lifecycle.PassNotices{} : Lifecycle.FinishDisposition}

law final_recheck_drops_notice_only_replacement:
  {Lifecycle.finish_disposition(selected_work(), Nil{}, True{}, False{},
      True{}, True{}, False{}) ==
    Lifecycle.AllowNoAdvice{} : Lifecycle.FinishDisposition}

law unwritable_selection_closes_at_deadline:
  {Lifecycle.finish_disposition(selected_work(), 1n <> Nil{}, False{}, False{},
      False{}, True{}, True{}) ==
    Lifecycle.AllowDeadline{} : Lifecycle.FinishDisposition}

law selection_cannot_exceed_pending_unit_count:
  {Lifecycle.finish_disposition(selected_work(), 1n <> 1n <> 1n <> Nil{},
      False{}, True{}, True{}, True{}, False{}) ==
    Lifecycle.AllowUnavailable{} : Lifecycle.FinishDisposition}

law final_output_reserves_exact_pending_unit_findings:
  {Lifecycle.reserve_selected(deciding_round(), selected_work(), 7n,
      1n <> 1n <> Nil{}) ==
    Round.Granted{Round.Round{1n, True{}, 0n, 1n, 7n, True{}, True{}, True{}}} : Round.Step}

law final_output_cannot_invent_third_unit_finding:
  {Lifecycle.reserve_selected(deciding_round(), selected_work(), 7n,
      1n <> 1n <> 1n <> Nil{}) ==
    Round.Denied{deciding_round()} : Round.Step}

law final_output_cannot_reserve_empty_advice:
  {Lifecycle.reserve_selected(deciding_round(), selected_work(), 7n, Nil{}) ==
    Round.Denied{deciding_round()} : Round.Step}

law final_output_cannot_reserve_unknown_unit:
  {Lifecycle.reserve_selected(deciding_round(), selected_work(), 7n, 2n <> Nil{}) ==
    Round.Denied{deciding_round()} : Round.Step}

law unwritten_output_releases_its_continuation:
  {Lifecycle.release_unwritten(
      Round.Round{1n, True{}, 0n, 1n, 7n, True{}, True{}, True{}}, 7n) ==
    Round.Granted{deciding_round()} : Round.Step}

law wrong_stop_cannot_release_output:
  {Lifecycle.release_unwritten(
      Round.Round{1n, True{}, 0n, 1n, 7n, True{}, True{}, True{}}, 8n) ==
    Round.Denied{Round.Round{1n, True{}, 0n, 1n, 7n, True{}, True{}, True{}}} : Round.Step}

def current_advice() -> Handoff.Advice:
  Handoff.Advice{7n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 300n, True{}}

law handoff_selects_fitting_findings:
  {Handoff.select(Handoff.initial(9n, 1n), current_advice(), 2048n) ==
    Handoff.Selected{Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 2048n}} : Handoff.SelectResult}

law findings_fit_exact_byte_ceiling:
  {Handoff.fits_batch(5n, 10240n) == True{} : Bool}

law sixth_finding_has_no_separate_item_ceiling:
  {Handoff.fits_batch(6n, 1n) == True{} : Bool}

law handoff_retains_oversized_item:
  {Handoff.select(Handoff.initial(9n, 1n), current_advice(), 10241n) ==
    Handoff.Retained{Handoff.Selection{9n, 1n, Nil{}, 7n <> Nil{}, 0n, 0n}} : Handoff.SelectResult}

law handoff_rejects_stale_generation:
  {Handoff.select(Handoff.initial(9n, 2n), current_advice(), 300n) ==
    Handoff.Expired{Handoff.initial(9n, 2n)} : Handoff.SelectResult}

law handoff_rejects_stale_snapshot:
  {Handoff.select(Handoff.initial(9n, 1n),
    Handoff.Advice{7n, 4n, 9n, 1n, 2n, 4n, 3n, 3n, 25n, 300n, True{}}, 300n) ==
    Handoff.Expired{Handoff.initial(9n, 1n)} : Handoff.SelectResult}

law handoff_rejects_stale_credential:
  {Handoff.select(Handoff.initial(9n, 1n),
    Handoff.Advice{7n, 4n, 9n, 1n, 2n, 2n, 3n, 4n, 25n, 300n, True{}}, 300n) ==
    Handoff.Expired{Handoff.initial(9n, 1n)} : Handoff.SelectResult}

law individually_oversized_finding_has_limitation:
  {Handoff.select(Handoff.initial(9n, 1n),
    Handoff.Advice{8n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 10241n, True{}}, 10241n) ==
    Handoff.Limited{Handoff.Selection{9n, 1n, Nil{}, 8n <> Nil{}, 0n, 0n}, 8n} : Handoff.SelectResult}

law same_finding_cannot_be_selected_twice:
  {Handoff.select(Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 300n},
    current_advice(), 400n) ==
    Handoff.Duplicate{Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 300n}} : Handoff.SelectResult}

law sixth_finding_from_same_unit_is_selected_when_bytes_fit:
  {Handoff.select(Handoff.Selection{9n, 1n,
      1n <> 2n <> 3n <> 4n <> 5n <> Nil{}, Nil{}, 5n, 1800n},
    Handoff.Advice{6n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 300n, True{}}, 1900n) ==
    Handoff.Selected{Handoff.Selection{9n, 1n,
      1n <> 2n <> 3n <> 4n <> 5n <> 6n <> Nil{}, Nil{}, 6n, 1900n}} : Handoff.SelectResult}

law finish_waits_for_review_work:
  {Handoff.finish.decide(Handoff.finish.initial(1n), 1n, False{}, 1n) ==
    Handoff.Wait{Handoff.finish.initial(1n)} : Handoff.FinishResult}

law finish_ignores_notice_without_findings:
  {Handoff.finish.decide(Handoff.finish.initial(1n), 0n, False{}, 0n) ==
    Handoff.Allow{Handoff.Finish{1n, False{}, True{}, 0n, False{}, 0n, 0n, 0n}} : Handoff.FinishResult}

law finish_four_continuation_limit:
  {Handoff.finish.decide(Handoff.Finish{1n, True{}, False{}, 4n, False{}, 0n, 0n, 0n}, 0n, False{}, 1n) ==
    Handoff.Allow{Handoff.Finish{1n, False{}, True{}, 4n, False{}, 0n, 0n, 0n}} : Handoff.FinishResult}

law completed_first_attempt_allows_second_continuation:
  {Handoff.finish.decide(
    Handoff.finish.complete(Handoff.Finish{1n, True{}, False{}, 1n, True{}, 1n, 7n, 10n}, 1n, 1n, 1n, 7n),
    0n, False{}, 1n) ==
    Handoff.Continue{Handoff.Finish{1n, True{}, False{}, 2n, True{}, 1n, 7n, 0n}} : Handoff.FinishResult}

law original_finish_deadline_cannot_be_replaced:
  {Handoff.finish.start(Handoff.Finish{1n, True{}, False{}, 1n, False{}, 1n, 7n, 20n}, 1n) ==
    Handoff.Finish{1n, True{}, False{}, 1n, False{}, 1n, 7n, 20n} : Handoff.Finish}

law wrong_writer_cannot_complete_attempt:
  {Handoff.finish.can_complete(
    Handoff.Finish{1n, True{}, False{}, 1n, True{}, 1n, 7n, 20n},
    1n, 1n, 1n, 8n) == False{} : Bool}

law next_attempt_gets_its_own_deadline:
  {Handoff.finish.decide_at(
    Handoff.finish.complete(Handoff.Finish{1n, True{}, False{}, 1n, True{}, 1n, 7n, 20n},
      1n, 1n, 1n, 7n), 1n, 30n, 50n, 1n) ==
    Handoff.Wait{Handoff.Finish{1n, True{}, False{}, 1n, False{}, 1n, 7n, 50n}} : Handoff.FinishResult}

def background_reserved() -> Handoff.Lease:
  Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Reserved{11n, Handoff.Background{}}}

law live_background_lease_excludes_stop:
  {Handoff.lease.reserve(background_reserved(), 1n, 12n, Handoff.Stop{}) ==
    Handoff.Denied{background_reserved()} : Handoff.LeaseResult}

law authorized_background_suppresses_stop:
  {Handoff.lease.suppresses(
    Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Authorized{11n, Handoff.Background{}}},
    1n, Handoff.Stop{}) == True{} : Bool}

law failed_provisional_lease_releases_item:
  {Handoff.lease.release(background_reserved(), 1n, 11n) ==
    Handoff.Granted{Handoff.lease.initial(7n, 1n)} : Handoff.LeaseResult}

law authorized_writer_cannot_be_revoked:
  {Handoff.lease.release(
    Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Authorized{11n, Handoff.Background{}}},
    1n, 11n) ==
    Handoff.Denied{Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Authorized{11n, Handoff.Background{}}}} : Handoff.LeaseResult}

law uncertain_background_can_reoffer_once:
  {Handoff.lease.reoffer(
    Handoff.Lease{7n, 1n, False{}, False{}, Handoff.Uncertain{Handoff.Background{}}},
    1n, 12n, True{}) ==
    Handoff.Granted{Handoff.Lease{7n, 1n, False{}, True{}, Handoff.Reserved{12n, Handoff.Stop{}}}} : Handoff.LeaseResult}

law closed_round_denies_late_writer:
  {Handoff.lease.authorize(Handoff.lease.close(background_reserved()), 1n, 11n) ==
    Handoff.Denied{Handoff.lease.close(background_reserved())} : Handoff.LeaseResult}

def closed_lifecycle() -> Lifecycle.Lifecycle:
  Lifecycle.Lifecycle{
    Admission.AdmissionState{9n, 2n, 1n, False{}, 40n, 2n, Nil{}},
    Work.initial(), Handoff.Finish{1n, False{}, True{}, 1n, False{}, 1n, 7n, 10n}}

law closed_lifecycle_rejects_late_review:
  {Lifecycle.reviewed(closed_lifecycle(), 9n, 2n, 1n, 1n, Work.Finding{1n, 100n}) ==
    Lifecycle.Denied{closed_lifecycle()} : Lifecycle.LifecycleResult}

law closed_lifecycle_rejects_late_preparation:
  {Lifecycle.prepared(closed_lifecycle(), 9n, 2n, 1n, 1n, 1n) ==
    Lifecycle.Denied{closed_lifecycle()} : Lifecycle.LifecycleResult}

law finish_cannot_invent_actionable_finding:
  {Lifecycle.finish_check(Lifecycle.Lifecycle{
      Admission.AdmissionState{9n, 2n, 1n, True{}, 0n, 2n, Nil{}},
      Work.initial(), Handoff.finish.initial(1n)}, 9n, 2n, 1n, 80n, 1n, 50n, 7n) ==
    Lifecycle.Denied{Lifecycle.Lifecycle{
      Admission.AdmissionState{9n, 2n, 1n, True{}, 0n, 2n, Nil{}},
      Work.initial(), Handoff.finish.initial(1n)}} : Lifecycle.LifecycleResult}

law closing_work_names_active_cancellations:
  {Work.close(Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n},
      Work.Observation{1n, Work.SourceReading{}} <> Nil{},
      Work.ReviewUnit{1n, 1n, Work.AtJev{}, 0n, 0n} <>
      Work.ReviewUnit{2n, 1n, Work.PendingFinding{}, 1n, 100n} <> Nil{}}) ==
    Work.Closed{Work.Work{2n, 3n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, Nil{}, Nil{}},
      1n <> Nil{}, 1n <> Nil{}, 2n <> Nil{}} : Work.CloseResult}

def small_limits() -> Ledger.Limits:
  Ledger.Limits{4n, 100n, 2n, 60n}

law ledger_accepts_exact_partition_byte_limit:
  {Ledger.reserve(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}, 1n, 40n) ==
    Ledger.Granted{Ledger.Ledger{small_limits(), 3n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <>
      Ledger.Charge{2n, 1n, 40n, Ledger.ReviewUnit{}} <> Nil{}}, 2n} : Ledger.LedgerResult}

law ledger_rejects_one_byte_over_partition_limit:
  {Ledger.reserve(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}, 1n, 41n) ==
    Ledger.Rejected{Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}} : Ledger.LedgerResult}

law ledger_unknown_release_cannot_change_state:
  {Ledger.release(Ledger.initial(small_limits()), 1n) ==
    Ledger.Rejected{Ledger.initial(small_limits())} : Ledger.LedgerResult}

law ledger_resize_preserves_id_and_count:
  {Ledger.resize(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}, 1n, 60n) ==
    Ledger.Granted{Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 60n, Ledger.ReviewUnit{}} <> Nil{}}, 1n} : Ledger.LedgerResult}

law ledger_clear_keeps_monotonic_reservation_ids:
  {Ledger.clear(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n, Ledger.ReviewUnit{}} <> Nil{}}) ==
    Ledger.Ledger{small_limits(), 2n, Nil{}} : Ledger.Ledger}

law privacy_protection_precedes_generated_and_kind:
  {Configuration.protection(True{}, True{}, False{}) ==
    Configuration.SensitivePath{} : Configuration.Protection}

law generated_protection_precedes_kind:
  {Configuration.protection(False{}, True{}, False{}) ==
    Configuration.GeneratedOrVendor{} : Configuration.Protection}

law git_admin_precedes_file_kind_and_ignore:
  {Configuration.candidate(True{}, False{}, False{}) ==
    Configuration.RefuseGitAdmin{} : Configuration.Candidate}

law incomplete_rule_unit_is_omitted:
  {RulePolicy.applicable(True{}, False{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, True{}, True{}, 2n, 1n) ==
    RulePolicy.Omit{} : RulePolicy.Gate}

law undeclared_rule_target_is_omitted:
  {RulePolicy.applicable(True{}, True{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, False{}, True{}, 2n, 1n) ==
    RulePolicy.Omit{} : RulePolicy.Gate}

law missing_rule_capability_is_omitted:
  {RulePolicy.applicable(True{}, True{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, True{}, False{}, 2n, 1n) ==
    RulePolicy.Omit{} : RulePolicy.Gate}

law source_below_rule_minimum_is_omitted:
  {RulePolicy.applicable(True{}, True{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, True{}, True{}, 1n, 2n) ==
    RulePolicy.Omit{} : RulePolicy.Gate}

law source_at_rule_minimum_is_admitted:
  {RulePolicy.applicable(True{}, True{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, True{}, True{}, 2n, 2n) ==
    RulePolicy.Admit{} : RulePolicy.Gate}

law invalid_source_rung_is_omitted:
  {RulePolicy.applicable(True{}, True{}, RulePolicy.TypeShape{}, True{}, False{},
    True{}, True{}, True{}, False{}, True{}, True{}, 4n, 2n) ==
    RulePolicy.Omit{} : RulePolicy.Gate}

law exact_threshold_is_not_a_finding:
  {RulePolicy.finding(RulePolicy.Words{2n, 3n}, RulePolicy.Words{2n, 3n}) == RulePolicy.Omit{} : RulePolicy.Gate}

law next_binary64_probability_is_a_finding:
  {RulePolicy.finding(RulePolicy.Words{2n, 4n}, RulePolicy.Words{2n, 3n}) == RulePolicy.Admit{} : RulePolicy.Gate}

law probability_precedes_rule_rank:
  {RulePolicy.rank_order(RulePolicy.Words{3n, 0n}, RulePolicy.Words{2n, 3n},
    9n, 0n) == RulePolicy.Before{} : RulePolicy.Order}

law advice_budget_is_exclusive:
  {RulePolicy.budget(2n, 2n) == RulePolicy.Omit{} : RulePolicy.Gate}

# Failed canonical creation cannot commit the edit's provisional admission.
law canonical_edit_open_failure_is_atomic:
  for state: Canonical.State
  for provisional: Canonical.State
  for round: Nat
  for reason: Canonical.Reason
  {Canonical.consume_opened(state, round, Canonical.Rejected{provisional, reason}) ==
    Canonical.Rejected{state, reason} : Canonical.Step}

def round_with_pending_permit() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 1n, True{}, 0n, 3n,
    Admission.Permit{2n, 43n, 1n, 11n, 30n} <> Nil{}}

def closed_round_with_retired_permit() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 1n, False{}, 20n, 3n, Nil{}}

law closure_retires_pending_permits:
  {Admission.close_round(round_with_pending_permit(), 20n) ==
    Admission.Accepted{closed_round_with_retired_permit(), None{}, Some{1n}} : Admission.AdmissionResult}

law closure_allows_fresh_reissue_after_history_eviction:
  {Admission.issue(closed_round_with_retired_permit(), 43n, 21n, 30n, 22n) ==
    Admission.Accepted{Admission.AdmissionState{7n, 3n, 1n, False{}, 20n, 4n,
      Admission.Permit{3n, 43n, 2n, 21n, 30n} <> Nil{}}, Some{3n}, Some{2n}} : Admission.AdmissionResult}

# The insertion guard is universal over the existing round and whole state.
# Trace checks separately exercise lookup and complete lifecycle transitions.
law canonical_open_rejects_existing_partition:
  for state: Canonical.State
  for partition: Nat
  for lifetime: Nat
  for existing: Canonical.Round
  {Canonical.open_found(state, partition, lifetime, Some{existing}) ==
    Canonical.Rejected{state, Canonical.StaleRound{}} : Canonical.Step}

law canonical_edit_joins_existing_round_without_insertion:
  for original: Canonical.State
  for updated: Canonical.State
  for partition: Nat
  for round: Nat
  for existing_round: Nat
  {Canonical.consume_existing(original, updated, partition, 1n, round,
    Some{Canonical.Round{partition, 1n, existing_round, False{}, False{}, None{}, False{}}}) ==
    Canonical.Advanced{updated, Canonical.PermitConsumed{round} <> Nil{}} : Canonical.Step}

law canonical_round_invariant_failure_rolls_back:
  for original: Canonical.State
  for updated: Canonical.State
  for commands: List<&2, Canonical.Command>
  {Canonical.check_round_invariant(original, updated, commands, False{}) ==
    Canonical.Rejected{original, Canonical.InconsistentLedger{}} : Canonical.Step}

law canonical_duplicate_partitions_fail_even_across_lifetimes:
  {Canonical.unique_rounds(
    Canonical.Round{1n, 1n, 1n, False{}, False{}, None{}, False{}} <>
    Canonical.Round{1n, 2n, 2n, False{}, False{}, None{}, False{}} <> Nil{}) == False{} : Bool}

law canonical_post_state_duplicates_roll_back:
  for original: Canonical.State
  for commands: List<&2, Canonical.Command>
  {Canonical.check_step(original, Canonical.Advanced{
    Canonical.State{Ledger.initial(Ledger.Limits{3n, 100n, 2n, 60n}),
      Canonical.Round{1n, 1n, 1n, False{}, False{}, None{}, False{}} <>
      Canonical.Round{1n, 2n, 2n, False{}, False{}, None{}, False{}} <> Nil{},
      Nil{}, 3n, 1n, Nil{}, Dispatch.initial(), CollectionState.initial(), EditHistory.initial()}, commands}) ==
    Canonical.Rejected{original, Canonical.InconsistentLedger{}} : Canonical.Step}

law canonical_round_guard_preserves_rejections:
  for original: Canonical.State
  for rejected: Canonical.State
  for reason: Canonical.Reason
  {Canonical.check_step(original, Canonical.Rejected{rejected, reason}) ==
    Canonical.Rejected{rejected, reason} : Canonical.Step}
