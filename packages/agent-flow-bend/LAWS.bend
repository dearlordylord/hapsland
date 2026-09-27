import Base
import ./Advicing.bend as Advicing
import ./Flow.bend as Flow
import ./Admission.bend as Admission
import ./Work.bend as Work
import ./Handoff.bend as Handoff
import ./Lifecycle.bend as Lifecycle

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

def current_advice() -> Handoff.Advice:
  Handoff.Advice{7n, 4n, 9n, 1n, 2n, 3n, 25n, 300n, True{}}

law handoff_selects_fitting_findings:
  {Handoff.select(Handoff.initial(9n, 1n, 2n, 3n), current_advice(), 2048n) ==
    Handoff.Selected{Handoff.Selection{9n, 1n, 2n, 3n, 7n <> Nil{}, Nil{}, 1n, 2048n}} : Handoff.SelectResult}

law handoff_retains_oversized_item:
  {Handoff.select(Handoff.initial(9n, 1n, 2n, 3n), current_advice(), 2049n) ==
    Handoff.Retained{Handoff.Selection{9n, 1n, 2n, 3n, Nil{}, 7n <> Nil{}, 0n, 0n}} : Handoff.SelectResult}

law handoff_rejects_stale_generation:
  {Handoff.select(Handoff.initial(9n, 1n, 4n, 3n), current_advice(), 300n) ==
    Handoff.Expired{Handoff.initial(9n, 1n, 4n, 3n)} : Handoff.SelectResult}

law individually_oversized_finding_has_limitation:
  {Handoff.select(Handoff.initial(9n, 1n, 2n, 3n),
    Handoff.Advice{8n, 4n, 9n, 1n, 2n, 3n, 25n, 2049n, True{}}, 2049n) ==
    Handoff.Limited{Handoff.Selection{9n, 1n, 2n, 3n, Nil{}, 8n <> Nil{}, 0n, 0n}, 8n} : Handoff.SelectResult}

law same_finding_cannot_be_selected_twice:
  {Handoff.select(Handoff.Selection{9n, 1n, 2n, 3n, 7n <> Nil{}, Nil{}, 1n, 300n},
    current_advice(), 400n) ==
    Handoff.Duplicate{Handoff.Selection{9n, 1n, 2n, 3n, 7n <> Nil{}, Nil{}, 1n, 300n}} : Handoff.SelectResult}

law sixth_finding_from_same_unit_is_retained:
  {Handoff.select(Handoff.Selection{9n, 1n, 2n, 3n,
      1n <> 2n <> 3n <> 4n <> 5n <> Nil{}, Nil{}, 5n, 1800n},
    Handoff.Advice{6n, 4n, 9n, 1n, 2n, 3n, 25n, 300n, True{}}, 1900n) ==
    Handoff.Retained{Handoff.Selection{9n, 1n, 2n, 3n,
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
