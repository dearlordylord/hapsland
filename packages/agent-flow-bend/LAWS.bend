import Base
import ./Advicing.bend as Advicing
import ./Flow.bend as Flow
import ./Admission.bend as Admission
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Lifecycle.bend as Lifecycle
import ./Ledger.bend as Ledger
import ./Round.bend as Round

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

law unconsumed_prospective_round_can_close:
  {Admission.close_prospective(Admission.AdmissionState{1n, 1n, 0n, False{}, 0n, 2n,
      Admission.Permit{1n, 2n, 1n, 10n, 20n} <> Nil{}, Nil{}}, 21n) ==
    Admission.Accepted{Admission.AdmissionState{1n, 1n, 1n, False{}, 21n, 2n,
      Nil{}, Nil{}}, None{}, Some{1n}} : Admission.AdmissionResult}

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


law closed_round_rejects_stop:
  {Flow.step(Flow.initial(), Flow.StopHookFired{}, None{}) ==
    Flow.Rejected{Flow.initial(), Flow.VirtualRoundClosed{}} : Flow.Step}

law edit_opens_first_round:
  {Flow.step(Flow.initial(), Flow.EditObserved{}, None{}) ==
    Flow.Accepted{
      Flow.Flow{Flow.Packet{1n, Flow.Preparation{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}},
      Flow.NoDecision{},
      Flow.Flow{Flow.Packet{1n, Flow.Preparation{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}
    } : Flow.Step}

law zero_capacity_is_rejected:
  {Flow.step(Flow.initial(), Flow.SourceCapacitySet{Flow.Capacity{0n, 0n}}, None{}) ==
    Flow.Rejected{Flow.initial(), Flow.InvalidCapacity{}} : Flow.Step}

def one_jev() -> Flow.Flow:
  Flow.Flow{Flow.Packet{1n, Flow.Jev{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}

def one_pending() -> Flow.Flow:
  Flow.Flow{Flow.Packet{1n, Flow.AdviceStore{}} <> Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 0n, False{}, True{}, None{}, None{}, None{}, None{}, Nil{}}

law finding_enters_pending_in_flow:
  {Flow.step(one_jev(), Flow.JevFindingReceived{}, None{}) ==
    Flow.Accepted{one_pending(), Flow.NoDecision{}, one_pending()} : Flow.Step}

law clear_emits_review_status:
  {Flow.changes(one_jev(), Flow.JevClearReceived{}, None{},
    Flow.step(one_jev(), Flow.JevClearReceived{}, None{})) ==
    Flow.Transition{Flow.JevClearReceived{}, Flow.route_of(Flow.JevClearReceived{}), Some{1n}} <>
    Flow.Emitted{Flow.JevClearReceived{}, Flow.OutcomeStoreNode{}, 1n} <> Nil{} : List<&2, Flow.FlowChange>}

law four_continuations_close_on_stop:
  {Flow.step(
    Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 4n, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}},
    Flow.StopHookFired{}, None{}) ==
    Flow.Accepted{
      Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, False{}, 4n, False{}, False{}, None{}, None{}, None{}, None{}, Nil{}},
      Flow.AllowFinish{Nil{}, Nil{}, Nil{}},
      Flow.Flow{Nil{}, 2n, Flow.Capacity{3n, 0n}, Flow.Capacity{3n, 0n}, 1n, True{}, 4n, True{}, False{}, None{}, None{}, None{}, None{}, Nil{}}
    } : Flow.Step}

def permit_issued() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 0n, False{}, 0n, 2n,
    Admission.Permit{1n, 42n, 1n, 10n, 20n} <> Nil{}, Nil{}}

def permit_consumed() -> Admission.AdmissionState:
  Admission.AdmissionState{7n, 3n, 1n, True{}, 0n, 2n,
    Nil{}, Admission.Used{1n, 42n} <> Nil{}}

law permit_bound_to_first_round:
  {Admission.step(Admission.initial(7n, 3n), 7n, 3n,
    Admission.Issue{42n, 10n, 20n, 11n}) ==
    Admission.Accepted{permit_issued(), Some{1n}, Some{1n}} : Admission.AdmissionResult}

law permit_consumption_opens_round_once:
  {Admission.step(permit_issued(), 7n, 3n, Admission.Consume{1n, 42n, 12n}) ==
    Admission.Accepted{permit_consumed(), Some{1n}, Some{1n}} : Admission.AdmissionResult}

law consumed_permit_cannot_repeat:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Consume{1n, 42n, 13n}) ==
    Admission.Rejected{permit_consumed(), Admission.UsedPermit{}} : Admission.AdmissionResult}

law unknown_permit_cannot_be_released:
  {Admission.step(permit_issued(), 7n, 3n, Admission.Release{2n}) ==
    Admission.Rejected{permit_issued(), Admission.NoPermit{}} : Admission.AdmissionResult}

law consumed_permit_cannot_be_released:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Release{1n}) ==
    Admission.Rejected{permit_consumed(), Admission.UsedPermit{}} : Admission.AdmissionResult}

law consumed_tool_cannot_get_second_permit:
  {Admission.step(permit_consumed(), 7n, 3n, Admission.Issue{42n, 13n, 20n, 13n}) ==
    Admission.Rejected{permit_consumed(), Admission.DuplicateTool{}} : Admission.AdmissionResult}

law closure_fences_old_invocation:
  {Admission.step(
    Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}, Nil{}},
    7n, 3n, Admission.Issue{43n, 29n, 40n, 31n}) ==
    Admission.Rejected{
      Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}, Nil{}},
      Admission.StaleInvocation{}
    } : Admission.AdmissionResult}

law closed_round_rejects_callback:
  {Admission.callback_current(
    Admission.AdmissionState{7n, 3n, 1n, False{}, 30n, 2n, Nil{}, Nil{}},
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

def current_advice() -> Handoff.Advice:
  Handoff.Advice{7n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 300n, True{}}

law handoff_selects_fitting_findings:
  {Handoff.select(Handoff.initial(9n, 1n), current_advice(), 2048n) ==
    Handoff.Selected{Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 2048n}} : Handoff.SelectResult}

law fifth_finding_fits_exact_byte_ceiling:
  {Handoff.fits_batch(5n, 2048n) == True{} : Bool}

law sixth_finding_exceeds_item_ceiling:
  {Handoff.fits_batch(6n, 1n) == False{} : Bool}

law handoff_retains_oversized_item:
  {Handoff.select(Handoff.initial(9n, 1n), current_advice(), 2049n) ==
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
    Handoff.Advice{8n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 2049n, True{}}, 2049n) ==
    Handoff.Limited{Handoff.Selection{9n, 1n, Nil{}, 8n <> Nil{}, 0n, 0n}, 8n} : Handoff.SelectResult}

law same_finding_cannot_be_selected_twice:
  {Handoff.select(Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 300n},
    current_advice(), 400n) ==
    Handoff.Duplicate{Handoff.Selection{9n, 1n, 7n <> Nil{}, Nil{}, 1n, 300n}} : Handoff.SelectResult}

law sixth_finding_from_same_unit_is_retained:
  {Handoff.select(Handoff.Selection{9n, 1n,
      1n <> 2n <> 3n <> 4n <> 5n <> Nil{}, Nil{}, 5n, 1800n},
    Handoff.Advice{6n, 4n, 9n, 1n, 2n, 2n, 3n, 3n, 25n, 300n, True{}}, 1900n) ==
    Handoff.Retained{Handoff.Selection{9n, 1n,
      1n <> 2n <> 3n <> 4n <> 5n <> Nil{}, 6n <> Nil{}, 5n, 1800n}} : Handoff.SelectResult}

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
    Admission.AdmissionState{9n, 2n, 1n, False{}, 40n, 2n, Nil{}, Nil{}},
    Work.initial(), Handoff.Finish{1n, False{}, True{}, 1n, False{}, 1n, 7n, 10n}}

law closed_lifecycle_rejects_late_review:
  {Lifecycle.reviewed(closed_lifecycle(), 9n, 2n, 1n, 1n, Work.Finding{1n, 100n}) ==
    Lifecycle.Denied{closed_lifecycle()} : Lifecycle.LifecycleResult}

law closed_lifecycle_rejects_late_preparation:
  {Lifecycle.prepared(closed_lifecycle(), 9n, 2n, 1n, 1n, 1n) ==
    Lifecycle.Denied{closed_lifecycle()} : Lifecycle.LifecycleResult}

law finish_cannot_invent_actionable_finding:
  {Lifecycle.finish_check(Lifecycle.Lifecycle{
      Admission.AdmissionState{9n, 2n, 1n, True{}, 0n, 2n, Nil{}, Nil{}},
      Work.initial(), Handoff.finish.initial(1n)}, 9n, 2n, 1n, 80n, 1n, 50n, 7n) ==
    Lifecycle.Denied{Lifecycle.Lifecycle{
      Admission.AdmissionState{9n, 2n, 1n, True{}, 0n, 2n, Nil{}, Nil{}},
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
      Ledger.Charge{1n, 1n, 20n} <> Nil{}}, 1n, 40n) ==
    Ledger.Granted{Ledger.Ledger{small_limits(), 3n,
      Ledger.Charge{1n, 1n, 20n} <>
      Ledger.Charge{2n, 1n, 40n} <> Nil{}}, 2n} : Ledger.LedgerResult}

law ledger_rejects_one_byte_over_partition_limit:
  {Ledger.reserve(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n} <> Nil{}}, 1n, 41n) ==
    Ledger.Rejected{Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n} <> Nil{}}} : Ledger.LedgerResult}

law ledger_unknown_release_cannot_change_state:
  {Ledger.release(Ledger.initial(small_limits()), 1n) ==
    Ledger.Rejected{Ledger.initial(small_limits())} : Ledger.LedgerResult}

law ledger_resize_preserves_id_and_count:
  {Ledger.resize(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n} <> Nil{}}, 1n, 60n) ==
    Ledger.Granted{Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 60n} <> Nil{}}, 1n} : Ledger.LedgerResult}

law ledger_clear_keeps_monotonic_reservation_ids:
  {Ledger.clear(Ledger.Ledger{small_limits(), 2n,
      Ledger.Charge{1n, 1n, 20n} <> Nil{}}) ==
    Ledger.Ledger{small_limits(), 2n, Nil{}} : Ledger.Ledger}
