import Base
import ./LAWS.bend as Laws
import ./ImportGraph.bend as ImportGraph
import ./Canonical.bend as Canonical

def Laws.completed_edit_history_starts_empty():
  {==}

def Laws.completed_edit_history_remembers_reason():
  {==}

def Laws.completed_edit_history_reports_once():
  {==}

def Laws.completed_edit_history_records_source_free_id():
  {==}

def Laws.completed_edit_history_threshold_branch_evicts_oldest():
  {==}

def Laws.quiet_round_begins_only_when_quiet():
  {==}

def Laws.quiet_round_starts_at_first_quiet_observation():
  {==}

def Laws.quiet_round_waits_before_deadline():
  {==}

def Laws.quiet_round_expires_at_deadline():
  {==}

def Laws.quiet_round_activity_breaks_interval():
  {==}

def Laws.undeclared_rule_target_is_omitted():
  {==}

def Laws.missing_rule_capability_is_omitted():
  {==}

def Laws.source_below_rule_minimum_is_omitted():
  {==}

def Laws.source_at_rule_minimum_is_admitted():
  {==}

def Laws.invalid_source_rung_is_omitted():
  {==}

def Laws.canonical_cross_advicee_identity_is_distinct():
  {==}

def Laws.canonical_pending_work_blocks_finish():
  {==}

def Laws.canonical_completed_finding_does_not_block_finish():
  {==}

def Laws.canonical_source_without_charge_blocks_finish():
  {==}

def Laws.dispatch_first_item_starts_immediately():
  {==}

def Laws.dispatch_has_eight_shared_slots():
  {==}

def Laws.dispatch_review_passes_full_preparation_queue():
  {==}

def Laws.canonical_deadline_releases_exact_charge():
  {==}

def Laws.canonical_uncertain_write_is_not_acknowledged():
  {==}

def Laws.canonical_capacity_reason_uses_first_exceeded_limit():
  {==}

def Laws.canonical_capacity_view_uses_bend_ledger_totals():
  {==}

def Laws.canonical_released_capacity_rejects_duplicate():
  {==}

def Laws.canonical_permit_issue_is_partitioned_and_round_bound():
  {==}

def Laws.canonical_forget_inactive_admission_removes_identity():
  {==}

def Laws.canonical_forget_pending_admission_rejects():
  {==}

def Laws.canonical_eviction_floor_rejects_old_edit_without_state_change():
  {==}

def Laws.canonical_pending_permit_counts_use_reducer_state():
  {==}

def Laws.canonical_expired_permit_does_not_create_round():
  {==}

def Laws.ledger_resize_changes_purpose_without_new_reservation():
  {==}

# Internal lemmas keep the unchanged limit value abstract during conversion.
# The accepted closed laws below retain their exact propositions and constants.
def graph_exclusion_has_no_read_command(
  +limits: ImportGraph.Limits
) -> {ImportGraph.checked(limits, ImportGraph.Edge{2n, 1n}, 2n, False{},
      Nil{}, 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, False{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.GraphReady{},
        Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, True{}, False{}, limits},
        ImportGraph.SkipImport{2n, ImportGraph.Excluded{}}} : ImportGraph.Step}:
  {==}

def graph_exclusion_keeps_remaining_edges(
  +limits: ImportGraph.Limits
) -> {ImportGraph.checked(limits, ImportGraph.Edge{2n, 1n}, 2n, False{},
      ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{}, 1n, 100n, 100n,
      1n, False{}, False{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.GraphReady{},
        ImportGraph.Edge{3n, 1n} <> Nil{}, 2n <> 1n <> Nil{},
        1n, 100n, 100n, 1n, False{}, True{}, False{}, limits},
        ImportGraph.SkipImport{2n, ImportGraph.Excluded{}}} : ImportGraph.Step}:
  {==}

def Laws.import_graph_exclusion_has_no_read_command():
  graph_exclusion_has_no_read_command(Laws.graph_limits())

def Laws.import_graph_exclusion_keeps_remaining_edges():
  graph_exclusion_keeps_remaining_edges(Laws.graph_limits())

# These paths preserve limits without consulting any limit field.
def graph_excluded_finishes_incomplete(
  +limits: ImportGraph.Limits
) -> {ImportGraph.next(limits, Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n,
      1n, False{}, True{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.Excluded{}},
        Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 100n, 1n, False{}, True{}, False{}, limits},
        ImportGraph.UnitIncomplete{ImportGraph.Excluded{}}} : ImportGraph.Step}:
  {==}

def graph_tree_limit_precedes_exclusion(
  +limits: ImportGraph.Limits
) -> {ImportGraph.next(limits, Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 20480n,
      1n, True{}, True{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.TreeLimit{}},
        Nil{}, 2n <> 1n <> Nil{}, 1n, 100n, 20480n, 1n, True{}, True{}, False{}, limits},
        ImportGraph.UnitIncomplete{ImportGraph.TreeLimit{}}} : ImportGraph.Step}:
  {==}

def graph_cycle_does_not_request_source(
  +limits: ImportGraph.Limits
) -> {
  ImportGraph.resolved(
    limits,
    ImportGraph.Edge{2n, 1n},
    1n,
    ImportGraph.Found{},
    Nil{},
    1n <> Nil{},
    1n,
    100n,
    100n,
    1n,
    False{},
    False{},
    False{}
  )
  == ImportGraph.Step{
    ImportGraph.Graph{
      ImportGraph.GraphReady{},
      Nil{},
      1n <> Nil{},
      1n,
      100n,
      100n,
      1n,
      False{},
      False{},
      False{},
      limits
    },
    ImportGraph.NoCommand{}
  }
  : ImportGraph.Step
}:
  {==}

def graph_skipped_tree_finishes_incomplete(
  +limits: ImportGraph.Limits
) -> {ImportGraph.next(limits, Nil{}, 2n <> 1n <> Nil{}, 2n, 200n, 20000n,
      1n, True{}, False{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.TreeLimit{}},
        Nil{}, 2n <> 1n <> Nil{}, 2n, 200n, 20000n, 1n, True{}, False{}, False{}, limits},
        ImportGraph.UnitIncomplete{ImportGraph.TreeLimit{}}} : ImportGraph.Step}:
  {==}

def graph_missing_import_keeps_later_edges(
  +limits: ImportGraph.Limits
) -> {ImportGraph.resolved(limits, ImportGraph.Edge{2n, 1n}, 2n,
      ImportGraph.NotFound{}, ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{},
      1n, 100n, 100n, 1n, False{}, False{}, False{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.GraphReady{},
        ImportGraph.Edge{3n, 1n} <> Nil{}, 1n <> Nil{},
        1n, 100n, 100n, 1n, False{}, False{}, True{}, limits},
        ImportGraph.SkipImport{2n, ImportGraph.Missing{}}} : ImportGraph.Step}:
  {==}

def graph_omitted_import_finishes_incomplete(
  +limits: ImportGraph.Limits
) -> {ImportGraph.next(limits, Nil{}, 1n <> Nil{},
      1n, 100n, 100n, 1n, False{}, False{}, True{}) ==
      ImportGraph.Step{ImportGraph.Graph{ImportGraph.Incomplete{ImportGraph.Omitted{}},
        Nil{}, 1n <> Nil{}, 1n, 100n, 100n, 1n,
        False{}, False{}, True{}, limits},
        ImportGraph.UnitIncomplete{ImportGraph.Omitted{}}} : ImportGraph.Step}:
  {==}

def Laws.import_graph_excluded_finishes_incomplete():
  graph_excluded_finishes_incomplete(Laws.graph_limits())

def Laws.import_graph_tree_limit_precedes_exclusion():
  graph_tree_limit_precedes_exclusion(Laws.graph_limits())

def Laws.import_graph_cycle_does_not_request_source():
  graph_cycle_does_not_request_source(Laws.graph_limits())

def Laws.import_graph_full_tree_can_inspect_remaining_edges():
  {==}

def Laws.import_graph_no_fit_support_skips_and_keeps_pending():
  {==}

def Laws.import_graph_skipped_tree_finishes_incomplete():
  graph_skipped_tree_finishes_incomplete(Laws.graph_limits())

def Laws.import_graph_missing_import_keeps_later_edges():
  graph_missing_import_keeps_later_edges(Laws.graph_limits())

def Laws.import_graph_omitted_import_finishes_incomplete():
  graph_omitted_import_finishes_incomplete(Laws.graph_limits())

def Laws.rotated_in_scope_advice_is_retired():
  {==}

def Laws.current_in_scope_advice_is_retained():
  {==}

def Laws.out_of_scope_rotated_advice_is_retained():
  {==}

def Laws.valid_composed_submission_candidate_is_admitted():
  {==}

def Laws.stale_composed_submission_candidate_is_denied():
  {==}

def Laws.empty_composed_submission_batch_releases():
  {==}

def Laws.valid_composed_submission_batch_proceeds():
  {==}

def Laws.final_credential_mismatch_is_retained_in_fold():
  {==}

def Laws.final_shared_credential_mismatch_releases_batch():
  {==}

def Laws.collector_credential_mismatch_does_not_use_shared_gate():
  {==}

def Laws.provisional_stop_output_revokes_and_closes():
  {==}

def Laws.authorized_stop_output_keeps_requested_open():
  {==}

def Laws.ordinary_stop_close_is_preserved():
  {==}

def Laws.expired_stop_without_barrier_closes():
  {==}

def Laws.expired_stop_with_barrier_stays_open():
  {==}

def Laws.expired_notice_lease_drops_without_pending_expiry():
  {==}

def Laws.expired_pending_notice_drops_key_after_cooldown():
  {==}

def Laws.excepted_notice_key_remains_after_expiry():
  {==}

def Laws.empty_expired_notice_key_is_removed():
  {==}

def Laws.current_finding_is_retained():
  {==}

def Laws.stale_finding_is_retired():
  {==}

def Laws.current_clear_settles_clear():
  {==}

def Laws.stale_clear_settles_unavailable():
  {==}

def Laws.backend_failure_reports_backend():
  {==}

def Laws.credential_failure_reports_credential():
  {==}

def Laws.missing_result_reports_lost():
  {==}

def Laws.stale_joined_member_preserves_stale_status():
  {==}

def Laws.joined_finding_without_identity_is_lost():
  {==}

def Laws.joined_clear_with_revision_settles_clear():
  {==}

def Laws.ready_unit_within_frame_is_admitted():
  {==}

def Laws.oversized_ready_unit_is_rejected():
  {==}

def Laws.skipped_unit_is_not_admitted():
  {==}

def Laws.empty_non_skipped_collector_fails_lost():
  {==}

def Laws.skipped_only_collector_has_no_failure():
  {==}

def Laws.idle_cleanup_is_ready():
  {==}

def Laws.open_virtual_round_blocks_idle_cleanup():
  {==}

def Laws.pending_edit_permit_blocks_idle_cleanup():
  {==}

def Laws.empty_round_and_permit_state_allows_idle_cleanup():
  {==}

def Laws.pending_notice_blocks_cleanup():
  {==}

def Laws.inactive_lifetime_blocks_cleanup():
  {==}

def Laws.ledger_residue_blocks_cleanup_commit():
  {==}

def Laws.exact_cancellation_uses_named_jobs():
  {==}

def Laws.unmatched_cancellation_discards_all_unfinished():
  {==}

def Laws.unnamed_work_discards_all_unfinished():
  {==}

def Laws.revoked_block_collector_releases_final_selection():
  {==}

def Laws.current_block_collector_proceeds():
  {==}

def Laws.advisory_collector_proceeds_without_block_opt_in():
  {==}

def Laws.replaced_candidate_is_ignored_before_revalidation_status():
  {==}

def Laws.unavailable_revalidation_releases_lease():
  {==}

def Laws.stale_revalidation_retires_advice():
  {==}

def Laws.failed_work_revision_retires_advice():
  {==}

def Laws.empty_fitting_selection_releases_lease():
  {==}

def Laws.credential_generation_mismatch_retires_final_candidate():
  {==}

def Laws.credential_revocation_releases_final_candidate():
  {==}

def Laws.current_final_candidate_is_retained():
  {==}

def Laws.selected_finish_output_reserves_exact_unit_and_slot():
  {==}

def Laws.notice_only_finish_output_does_not_reserve():
  {==}

def Laws.overselected_finish_output_is_unavailable():
  {==}

def Laws.empty_finish_output_at_deadline_allows():
  {==}

def Laws.expired_collection_lease_is_dropped():
  {==}

def Laws.live_background_lease_stays_before_terminal_reoffer():
  {==}

def Laws.terminal_background_lease_reoffers_only_to_own_stop():
  {==}

def Laws.other_group_stop_cannot_drop_lease():
  {==}

def Laws.available_advice_requires_collector_and_unsuppressed_finding():
  {==}

def Laws.leased_advice_cannot_be_candidate():
  {==}

def Laws.pending_notice_requires_unleased_owned_record():
  {==}

def Laws.no_delivery_cannot_acknowledge():
  {==}

def Laws.expired_delivery_cannot_acknowledge():
  {==}

def Laws.live_delivery_can_acknowledge():
  {==}

def Laws.unacknowledged_delivery_cannot_finalize():
  {==}

def Laws.expired_acknowledged_delivery_releases():
  {==}

def Laws.composed_delivery_retains_advice_for_reoffer():
  {==}

def Laws.noncomposed_partial_delivery_retains_remaining():
  {==}

def Laws.noncomposed_complete_delivery_retires_advice():
  {==}

def Laws.canonical_delivery_acknowledgement_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_finalization_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_disposition_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_submission_candidate_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_submission_batch_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_credential_fold_uses_delivery_rule():
  {==}

def Laws.canonical_delivery_final_credential_uses_delivery_rule():
  {==}

def Laws.canonical_validation_route_retires_stale_owner():
  {==}

def Laws.canonical_post_validation_releases_unfitting_candidate():
  {==}

def Laws.canonical_final_candidate_retires_expired_work():
  {==}

def Laws.canonical_stop_begin_requires_active_unowned_round():
  {==}

def Laws.canonical_permit_only_round_is_inactive():
  {==}

def Laws.canonical_stop_barrier_uses_continuations_since_claim():
  {==}

def Laws.canonical_deciding_stop_is_not_owned_for_new_decision():
  {==}

def Laws.canonical_provisional_stop_terminal_revokes_and_closes():
  {==}

def Laws.canonical_authorized_stop_expiry_keeps_round():
  {==}

def Laws.canonical_continuation_budget_exhausts_at_four():
  {==}

def Laws.canonical_background_submission_waits_behind_barrier():
  {==}

def Laws.canonical_existing_stop_token_requires_finish_permit():
  {==}

def Laws.canonical_unreserved_stop_output_denied_during_decision():
  {==}

def Laws.output_selection_reserves_pending_unit():
  {==}

def Laws.output_selection_rejects_more_than_pending():
  {==}

def Laws.output_selection_authorizes_once():
  {==}

def Laws.output_selection_consumes_exact_units():
  {==}

def Laws.output_selection_rejects_changed_units():
  {==}

def Laws.output_selection_rejects_unapproved_write():
  {==}

def Laws.output_selection_cannot_be_consumed_twice():
  {==}

def Laws.live_advice_precedes_pending_and_cache():
  {==}

def Laws.attached_pending_precedes_claimed_pending():
  {==}

def Laws.bare_claim_joins_without_cache_lookup():
  {==}

def Laws.no_live_owner_looks_up_success_cache():
  {==}

def Laws.successful_cache_hit_reuses_evaluation():
  {==}

def Laws.cache_miss_claims_evaluation_owner():
  {==}

def Laws.background_submission_blocked_by_stop_barrier():
  {==}

def Laws.edit_submission_allowed_during_stop_barrier():
  {==}

def Laws.existing_stop_token_requires_finish_permit():
  {==}

def Laws.existing_stop_token_accepts_finish_permit():
  {==}

def Laws.existing_background_token_is_denied_before_advice_lookup():
  {==}

def Laws.unreserved_stop_blocked_during_decision():
  {==}

def Laws.selected_findings_require_continuation():
  {==}

def Laws.notice_only_selection_passes_without_slot():
  {==}

def Laws.final_recheck_drops_notice_only_replacement():
  {==}

def Laws.unwritable_selection_closes_at_deadline():
  {==}

def Laws.selection_cannot_exceed_pending_unit_count():
  {==}

def Laws.collector_collect_gate_proceeds_with_valid_authority():
  {==}

def Laws.collector_collect_gate_blocks_credential_change():
  {==}

def Laws.collector_collect_gate_blocks_expiry():
  {==}

def Laws.collector_collect_gate_expiry_precedes_credential():
  {==}

def Laws.stop_cannot_reoffer_submitted_background_lease():
  {==}

def Laws.edit_cannot_reoffer_submitted_background_lease():
  {==}

def Laws.stop_cannot_reoffer_without_fresh_validation():
  {==}

def Laws.available_lease_uses_ordinary_reservation():
  {==}

def Laws.permit_before_deadline_is_retained():
  {==}

def Laws.permit_at_deadline_is_removed():
  {==}

def Laws.expiry_does_not_remove_another_token():
  {==}

def Laws.identical_input_reuses_current_revision():
  {==}

def Laws.changed_input_replaces_current_revision():
  {==}

def Laws.first_input_creates_revision():
  {==}

def Laws.newer_revision_supersedes_same_subject():
  {==}

def Laws.same_generation_is_current():
  {==}

def Laws.other_subject_is_not_superseded():
  {==}

def Laws.notice_suppression_increments_count():
  {==}

def Laws.notice_suppression_saturates_at_bound():
  {==}

def Laws.notice_refresh_creates_pending_after_delivery():
  {==}

def Laws.notice_refresh_merges_unleased_pending():
  {==}

def Laws.notice_merge_saturates_at_bound():
  {==}

def Laws.notice_refresh_preserves_leased_pending():
  {==}

def Laws.notice_full_table_rejects_new_key():
  {==}

def Laws.notice_available_table_creates_new_key():
  {==}

def Laws.fitting_notice_is_included():
  {==}

def Laws.sixth_notice_fits_when_bytes_fit():
  {==}

def Laws.oversized_notice_skips_in_claude():
  {==}

def Laws.oversized_notice_stops_codex_prefix():
  {==}

def Laws.prospective_gate_rejects_late_hook_clock():
  {==}

def Laws.prospective_gate_accepts_before_hook_window_boundary():
  {==}

def Laws.prospective_gate_rejects_at_hook_window_boundary():
  {==}

def Laws.prospective_gate_uses_supplied_hook_window():
  {==}

def Laws.prospective_gate_rejects_reversed_clock():
  {==}

def Laws.existing_cache_entry_reuses_without_byte_check():
  {==}

def Laws.cache_rejects_oversized_success():
  {==}

def Laws.cache_admits_exact_byte_limit():
  {==}

def Laws.cache_evicts_oldest_at_entry_limit():
  {==}

def Laws.cache_evicts_oldest_before_byte_overflow():
  {==}

def Laws.empty_cache_never_evicts():
  {==}

def Laws.reserved_delivery_only_authorizes_once():
  {==}

def Laws.delivered_output_cannot_be_resubmitted():
  {==}

def Laws.authorized_delivery_expires_at_boundary():
  {==}

def Laws.authorized_delivery_does_not_expire_early():
  {==}

def Laws.submitted_background_cannot_reoffer():
  {==}

def Laws.live_background_cannot_reoffer():
  {==}

def Laws.submitted_edit_cannot_reoffer_at_stop():
  {==}

def Laws.collection_orders_by_dispatch_sequence():
  {==}

def Laws.collection_orders_later_sequence_after_earlier():
  {==}

def Laws.collection_waits_for_edit_completion():
  {==}

def Laws.collection_edit_completion_unblocks():
  {==}

def Laws.collection_stop_may_send_ready_part():
  {==}

def Laws.pending_advice_expires_at_boundary():
  {==}

def Laws.pending_advice_remains_before_boundary():
  {==}

def Laws.active_notice_cooldown_suppresses_even_at_capacity():
  {==}

def Laws.elapsed_notice_cooldown_refreshes_at_capacity():
  {==}

def Laws.full_notice_table_rejects_new_key():
  {==}

def Laws.notice_table_creates_below_capacity():
  {==}

def Laws.background_writer_claims_one_slot():
  {==}

def Laws.second_background_writer_cannot_take_slot():
  {==}

def Laws.wrong_background_writer_cannot_release():
  {==}

def Laws.background_writer_expires_at_boundary():
  {==}

def Laws.background_writer_remains_before_boundary():
  {==}

def Laws.background_capacity_denies_new_writer():
  {==}

def Laws.round_begin_stop_claims_single_owner():
  {==}

def Laws.second_stop_cannot_take_claim():
  {==}

def Laws.four_continuations_exhaust_budget():
  {==}

def Laws.finish_closure_fences_late_output():
  {==}

def Laws.reopening_requires_next_generation():
  {==}

def Laws.uncertain_background_suppresses_ordinary_collection():
  {==}

def Laws.uncertain_background_may_reoffer_at_stop():
  {==}

def Laws.edit_submission_cannot_reoffer_at_stop():
  {==}

def Laws.unconsumed_permit_cannot_close_a_round():
  {==}

def Laws.finding_enters_pending_advice(item):
  {==}

def Laws.finding_preserves_second_value(item, second_item):
  {==}

def Laws.permit_bound_to_first_round():
  {==}

def Laws.pending_tool_cannot_get_second_permit():
  {==}

def Laws.permit_consumption_opens_round_once():
  {==}

def Laws.consumed_permit_cannot_repeat():
  {==}

def Laws.unknown_permit_cannot_be_released():
  {==}

def Laws.consumed_permit_cannot_be_released():
  {==}

def Laws.consumed_tool_can_receive_new_permit_after_history_eviction():
  {==}

def Laws.closure_fences_old_invocation():
  {==}

def Laws.closed_round_rejects_callback():
  {==}

def Laws.fanout_keeps_each_review_unfinished():
  {==}

def Laws.four_units_count_as_four_unfinished():
  {==}

def Laws.streamed_fanout_keeps_source_open():
  {==}

def Laws.running_source_overrides_logical_queue_projection():
  {==}

def Laws.running_review_overrides_logical_queue_projection():
  {==}

def Laws.source_completion_removes_only_source_work():
  {==}

def Laws.cached_finding_is_terminal_advice():
  {==}

def Laws.revalidated_finding_count_replaces_old_count():
  {==}

def Laws.pending_count_is_owned_by_exact_unit():
  {==}

def Laws.unknown_unit_cannot_authorize_findings():
  {==}

def Laws.unfinished_unit_cannot_retire():
  {==}

def Laws.terminal_finding_can_retire():
  {==}

def Laws.finish_waits_for_all_unfinished_work():
  {==}

def Laws.finish_deadline_or_budget_ends_wait():
  {==}

def Laws.lowering_review_capacity_preserves_active_units():
  {==}

def Laws.zero_units_settle_quietly():
  {==}

def Laws.first_result_preserves_other_review_work():
  {==}

def Laws.clear_result_is_not_finding():
  {==}

def Laws.unavailable_result_is_not_clear():
  {==}

def Laws.interrupted_review_is_terminal_before_finish():
  {==}

def Laws.interrupted_source_does_not_leave_unfinished_work():
  {==}

def Laws.decision_cancels_all_unfinished_but_keeps_advice():
  {==}

def Laws.cutoff_fences_round_and_names_exact_cancellations():
  {==}

def Laws.wrong_stop_cannot_cut_off_work():
  {==}

def Laws.finish_gate_waits_for_live_work_and_external_owners():
  {==}

def Laws.finish_gate_deadline_cancels_exact_work():
  {==}

def Laws.wrong_stop_cannot_pass_finish_gate():
  {==}

def Laws.exhausted_budget_does_not_wait_for_work():
  {==}

def Laws.final_output_reserves_exact_pending_unit_findings():
  {==}

def Laws.final_output_cannot_invent_third_unit_finding():
  {==}

def Laws.final_output_cannot_reserve_empty_advice():
  {==}

def Laws.final_output_cannot_reserve_unknown_unit():
  {==}

def Laws.unwritten_output_releases_its_continuation():
  {==}

def Laws.wrong_stop_cannot_release_output():
  {==}

def Laws.handoff_selects_fitting_findings():
  {==}

def Laws.findings_fit_exact_byte_ceiling():
  {==}

def Laws.sixth_finding_has_no_separate_item_ceiling():
  {==}

def Laws.handoff_retains_oversized_item():
  {==}

def Laws.handoff_rejects_stale_generation():
  {==}

def Laws.handoff_rejects_stale_snapshot():
  {==}

def Laws.handoff_rejects_stale_credential():
  {==}

def Laws.individually_oversized_finding_has_limitation():
  {==}

def Laws.same_finding_cannot_be_selected_twice():
  {==}

def Laws.sixth_finding_from_same_unit_is_selected_when_bytes_fit():
  {==}

def Laws.finish_waits_for_review_work():
  {==}

def Laws.finish_ignores_notice_without_findings():
  {==}

def Laws.finish_four_continuation_limit():
  {==}

def Laws.completed_first_attempt_allows_second_continuation():
  {==}

def Laws.original_finish_deadline_cannot_be_replaced():
  {==}

def Laws.wrong_writer_cannot_complete_attempt():
  {==}

def Laws.next_attempt_gets_its_own_deadline():
  {==}

def Laws.live_background_lease_excludes_stop():
  {==}

def Laws.authorized_background_suppresses_stop():
  {==}

def Laws.failed_provisional_lease_releases_item():
  {==}

def Laws.authorized_writer_cannot_be_revoked():
  {==}

def Laws.uncertain_background_can_reoffer_once():
  {==}

def Laws.closed_round_denies_late_writer():
  {==}

def Laws.closed_lifecycle_rejects_late_review():
  {==}

def Laws.closed_lifecycle_rejects_late_preparation():
  {==}

def Laws.finish_cannot_invent_actionable_finding():
  {==}

def Laws.closing_work_names_active_cancellations():
  {==}

def Laws.ledger_accepts_exact_partition_byte_limit():
  {==}

def Laws.ledger_rejects_one_byte_over_partition_limit():
  {==}

def Laws.ledger_unknown_release_cannot_change_state():
  {==}

def Laws.ledger_resize_preserves_id_and_count():
  {==}

def Laws.ledger_clear_keeps_monotonic_reservation_ids():
  {==}

def Laws.privacy_protection_precedes_generated_and_kind():
  {==}

def Laws.generated_protection_precedes_kind():
  {==}

def Laws.git_admin_precedes_file_kind_and_ignore():
  {==}

def Laws.incomplete_rule_unit_is_omitted():
  {==}

def Laws.exact_threshold_is_not_a_finding():
  {==}

def Laws.next_binary64_probability_is_a_finding():
  {==}

def Laws.probability_precedes_rule_rank():
  {==}

def Laws.advice_budget_is_exclusive():
  {==}

def Laws.canonical_edit_open_failure_is_atomic(state, provisional, round, reason):
  {==}

def Laws.released_permit_does_not_open_round():
  {==}

def Laws.expired_permit_does_not_open_round():
  {==}

def Laws.retired_tool_can_receive_new_permit_after_history_eviction():
  {==}

def Laws.retired_permit_does_not_prevent_fresh_tool():
  {==}

def Laws.closure_retires_pending_permits():
  {==}

def Laws.closure_allows_fresh_reissue_after_history_eviction():
  {==}

def Laws.canonical_open_rejects_existing_partition(state, partition, lifetime, existing):
  match state:
    case Canonical.State{
      ledger,
      rounds,
      work,
      next_round,
      next_operation,
      admissions,
      dispatch,
      collection,
      +history
    }:
      {==}

def Laws.canonical_edit_joins_existing_round_without_insertion(
  original,
  updated,
  partition,
  round,
  existing_round
):
  {==}

def Laws.canonical_round_invariant_failure_rolls_back(original, updated, outputs):
  {==}

def Laws.canonical_duplicate_partitions_fail_even_across_lifetimes():
  {==}

def Laws.canonical_post_state_duplicates_roll_back(original, outputs):
  {==}

def Laws.canonical_round_guard_preserves_rejections(original, rejected, reason):
  {==}

def Laws.stop_bundle_terminal_rejects_partial():
  {==}

def Laws.stop_bundle_failed_stage_keeps_original(original):
  {==}

def Laws.stop_bundle_terminal_records_every_member():
  {==}
