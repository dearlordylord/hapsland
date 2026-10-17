import Base
import ../CollectionHandoff.bend as R
import ../Handoff.bend as H
import ../../Collection.bend as C
import ../../verification/CollectionSpecification.bend as CollectionSpec
import ./FinalizeSpecification.bend as FinishSpec
import ./DeliveryTrace.bend as Trace

# Draft independent root contract: actual nominal protocol data, independent
# gate/collection/reservation equations. No calls to production transition helpers.
# A finite reply tape may finish, refuse, or remain Await. It does not promise
# eventual edit completion. Native deadlines, custody and IO retain their owners.

def gate_request(+inv: Nat, +id: Nat, +phase: H.GPhase, +command: H.GCommand) -> H.GStep:
  H.GAwait{inv, id, phase, H.GRequest{inv, id, command}}

def gate_initial(+inv: Nat, +input: H.GInput) -> H.GStep:
  match input:
    case H.GInput{False{}, _, _}: H.GDone{H.GUnsupported{}}
    case H.GInput{True{}, True{}, False{}}: H.GDone{H.GUnsupported{}}
    case H.GInput{True{}, False{}, False{}}: H.GDone{H.GCollect{}}
    case H.GInput{True{}, _, True{}}:
      gate_request(inv, 1n, H.GStopOwned{}, H.GOwnStop{})

def gate_member(
  +partition: Bool,
  +delivery: Bool,
  +handle: Nat,
  +tail: List<&2, Nat>
) -> List<&2, Nat>:
  match partition delivery:
    case True{} True{}: handle <> tail
    case _ _: tail

def gate_members(+leases: List<&2, H.GLease>) -> List<&2, Nat>:
  match leases:
    case Nil{}: []
    case H.GLease{+handle, +partition, +delivery} <> +tail:
      gate_member(partition, delivery, handle, gate_members(tail))

def gate_expiries(+inv: Nat, +id: Nat, +remaining: List<&2, Nat>) -> H.GStep:
  match remaining:
    case Nil{}: gate_request(inv, id, H.GRoundRead{}, H.GRound{})
    case +handle <> +tail:
      gate_request(inv, id, H.GExpiryRead{handle, tail}, H.GExpired{handle})

def gate_limit(+inv: Nat, +id: Nat, +limited: Bool) -> H.GStep:
  match limited:
    case False{}: H.GDone{H.GCollect{}}
    case True{}: gate_request(inv, id, H.GAllowed{}, H.GAllow{H.GLimit{}})

def gate_cutoff(+inv: Nat, +id: Nat, +round: Bool, +limited: Bool) -> H.GStep:
  match round:
    case False{}: gate_limit(inv, id, limited)
    case True{}: gate_request(inv, id, H.GDiscarded{limited}, H.GDiscard{})

def gate_total(+inv: Nat, +id: Nat, +round: Bool, +total: Nat) -> H.GStep:
  match round:
    case False{}: gate_request(inv, id, H.GGateRead{False{}}, H.GGate{total})
    case True{}: gate_request(inv, id, H.GOwnRead{total}, H.GOwnUnfinished{})

def gate_response(+inv: Nat, +id: Nat, +phase: H.GPhase, +response: H.GResponse) -> H.GStep:
  match phase response:
    case H.GStopOwned{} H.GTruth{False{}}: H.GDone{H.GEmpty{}}
    case H.GStopOwned{} H.GTruth{True{}}:
      gate_request(inv, id, H.GNoticesPruned{}, H.GPruneNotices{})
    case H.GNoticesPruned{} H.GAck{}: gate_request(inv, id, H.GAdviceRead{}, H.GAdvice{})
    case H.GAdviceRead{} H.GLeases{+leases}: gate_expiries(inv, id, gate_members(leases))
    case H.GExpiryRead{_, +remaining} H.GTruth{False{}}: gate_expiries(inv, id, remaining)
    case H.GExpiryRead{+handle, +remaining} H.GTruth{True{}}:
      gate_request(inv, id, H.GLeaseReleased{remaining}, H.GRelease{handle})
    case H.GLeaseReleased{+remaining} H.GAck{}: gate_expiries(inv, id, remaining)
    case H.GRoundRead{} H.GTruth{+round}:
      gate_request(inv, id, H.GTotalRead{round}, H.GTotalUnfinished{})
    case H.GTotalRead{+round} H.GCount{+total}: gate_total(inv, id, round, total)
    case H.GOwnRead{+total} H.GCount{+own}:
      gate_request(inv, id, H.GGateRead{True{}}, H.GGate{Nat.sub(total, own)})
    case H.GGateRead{_} H.GNoGate{}: H.GDone{H.GEmpty{}}
    case H.GGateRead{_} H.GWaiting{}: H.GDone{H.GPending{}}
    case H.GGateRead{+round} H.GCutoff{+limited}: gate_cutoff(inv, id, round, limited)
    case H.GDiscarded{_} H.GTruth{False{}}:
      gate_request(inv, id, H.GAllowed{}, H.GAllow{H.GUnavailable{}})
    case H.GDiscarded{+limited} H.GTruth{True{}}: gate_limit(inv, id, limited)
    case H.GAllowed{} H.GAck{}: H.GDone{H.GEmpty{}}
    case _ _: H.GRejected{}

def gate_accept(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: H.GPhase,
  +response: H.GResponse
) -> H.GStep:
  match valid:
    case True{}: gate_response(inv, Nat.add(id, 1n), phase, response)
    case False{}: H.GRejected{}

def gate_resume(+step: H.GStep, +reply: H.GReply) -> H.GStep:
  match step reply:
    case H.GAwait{+inv, +id, +phase, H.GRequest{+owner, +request, _}} H.GReply{
      +actual,
      +received,
      +response
    }:
      gate_accept(
        FinishSpec.correlated(inv, id, owner, request, actual, received),
        inv,
        id,
        phase,
        response
      )
    case _ _: H.GRejected{}

def gate_atomic(+step: H.GStep) -> Bool:
  match step:
    case H.GAwait{_, _, H.GGateRead{_}, _}: True{}
    case H.GAwait{_, _, H.GDiscarded{_}, _}: True{}
    case H.GAwait{_, _, H.GAllowed{}, _}: True{}
    case _: False{}

def request(+inv: Nat, +id: Nat, +phase: R.RootPhase, +command: R.RootCommand) -> R.RootStep:
  R.RootAwait{inv, id, phase, R.RootRequest{inv, id, command}}

def enter_collection(+inv: Nat, +id: Nat, +mode: R.RootMode, +step: C.FlowStep) -> R.RootStep:
  match step:
    case C.FlowAwait{_, C.FlowRequest{_, _, +command}}:
      request(inv, id, R.RootCollecting{step, mode}, R.RootCollect{command})
    case C.FlowEmpty{}:
      request(inv, id, R.RootDecoding{mode}, R.RootDecode{step})
    case C.FlowDone{_, _, _}:
      request(inv, id, R.RootDecoding{mode}, R.RootDecode{step})
    case C.FlowRejected{}: R.RootRejected{}

def gate_done(+inv: Nat, +id: Nat, +composed: Bool, +turn_end: Bool,
    +flags: R.RootFlags, +result: H.GResult) -> R.RootStep:
  match result:
    case H.GCollect{}: enter_collection(inv, id, R.RootRequestMode{flags},
      CollectionSpec.collection_spec_initial(inv, composed, turn_end))
    case H.GEmpty{}: R.RootDone{R.RootEmpty{}}
    case H.GPending{}: R.RootDone{R.RootPending{}}
    case H.GUnsupported{}: R.RootDone{R.RootUnsupported{}}

def enter_gate(+inv: Nat, +id: Nat, +composed: Bool, +turn_end: Bool,
    +flags: R.RootFlags, +step: H.GStep) -> R.RootStep:
  match step:
    case H.GAwait{_, _, _, H.GRequest{_, _, +command}}:
      request(inv, id, R.RootGating{step, composed, turn_end, flags}, R.RootGate{command})
    case H.GDone{+result}: gate_done(inv, id, composed, turn_end, flags, result)
    case H.GRejected{}: R.RootRejected{}

def enter_reservation(+inv: Nat, +id: Nat, +step: H.RStep) -> R.RootStep:
  match step:
    case H.RAwait{_, _, _, H.RRequest{_, _, +command}}:
      request(inv, id, R.RootReserving{step}, R.RootReserve{command})
    case H.RFinal{}: R.RootDone{R.RootSelected{}}
    case H.REmpty{}: R.RootDone{R.RootEmpty{}}
    case H.RRejected{}: R.RootRejected{}

def decoded_request(
  +inv: Nat,
  +id: Nat,
  +flags: R.RootFlags,
  +input: H.RInput,
  +empty: Bool
) -> R.RootStep:
  match flags empty:
    case R.RootFlags{True{}, _} _:
      enter_reservation(inv, id, FinishSpec.reserve_finish_spec_initial(inv, input))
    case R.RootFlags{False{}, True{}} True{}:
      request(inv, id, R.RootReporting{}, R.RootWorkState{})
    case _ _: R.RootDone{R.RootSelected{}}

def root_spec_initial(+inv: Nat, +input: R.RootInput) -> R.RootStep:
  match input:
    case R.RootInput{H.GInput{+composed, +turn_end, +finish}, +report}:
      enter_gate(inv, 1n, composed, turn_end, R.RootFlags{finish, report},
        gate_initial(inv, H.GInput{composed, turn_end, finish}))

def root_spec_direct_initial(+inv: Nat, +composed: Bool, +turn_end: Bool) -> R.RootStep:
  enter_collection(
    inv,
    1n,
    R.RootDirectMode{},
    CollectionSpec.collection_spec_initial(inv, composed, turn_end)
  )

def root_spec_edit_initial(+inv: Nat, +partition: String) -> R.RootStep:
  request(inv, 1n, R.RootEditGating{partition}, R.RootEditGate{})

def root_spec_status_initial(+inv: Nat, +partition: String) -> R.RootStep:
  request(inv, 1n, R.RootEditStatusRead{partition, False{}}, R.RootEditStatus{})

def edit_pending(+inv: Nat, +id: Nat, +partition: String, +poll: Bool) -> R.RootStep:
  match poll:
    case False{}: R.RootDone{R.RootEditPending{}}
    case True{}: request(inv, id, R.RootEditWaiting{partition}, R.RootEditSleep{})

def matched_advice(+same: Bool, +handle: Nat, +tail: List<&2, Nat>) -> List<&2, Nat>:
  match same:
    case True{}: handle <> tail
    case False{}: tail

def matching_advice(+advice: List<&2, R.RootAdvice>, +partition: String) -> List<&2, Nat>:
  match advice:
    case Nil{}: []
    case R.RootAdvice{+handle, +actual} <> +tail:
      matched_advice(String.eq(actual, partition), handle, matching_advice(tail, partition))

def scan_status(
  +inv: Nat,
  +id: Nat,
  +partition: String,
  +poll: Bool,
  +remaining: List<&2, Nat>
) -> R.RootStep:
  match remaining:
    case Nil{}: request(inv, id, R.RootEditCounted{partition, poll}, R.RootEditWorkCount{})
    case +handle <> +tail:
      request(inv, id, R.RootEditChecking{tail, partition, poll}, R.RootEditExpired{handle})

def edit_allowed(+inv: Nat, +id: Nat, +partition: String, +allowed: Bool) -> R.RootStep:
  match allowed:
    case False{}: R.RootDone{R.RootSelected{}}
    case True{}: request(inv, id, R.RootEditStarting{partition}, R.RootEditStartPass{})

def edit_result(+inv: Nat, +id: Nat, +partition: String, +advice: Bool) -> R.RootStep:
  match advice:
    case True{}: R.RootDone{R.RootSelected{}}
    case False{}: request(inv, id, R.RootEditStatusRead{partition, True{}}, R.RootEditStatus{})

def edit_expiry(+inv: Nat, +id: Nat, +partition: String, +poll: Bool,
    +remaining: List<&2, Nat>, +expired: Bool) -> R.RootStep:
  match expired:
    case True{}: scan_status(inv, id, partition, poll, remaining)
    case False{}: edit_pending(inv, id, partition, poll)

def edit_count(+inv: Nat, +id: Nat, +partition: String, +poll: Bool, +count: Nat) -> R.RootStep:
  match count:
    case 0n: R.RootDone{R.RootEditEmpty{}}
    case _: edit_pending(inv, id, partition, poll)

def edit_active(+phase: R.RootPhase) -> Bool:
  match phase:
    case R.RootCollecting{_, R.RootEditMode{_}}: True{}
    case R.RootDecoding{R.RootEditMode{_}}: True{}
    case R.RootEditGating{_}: True{}
    case R.RootEditStarting{_}: True{}
    case R.RootEditStatusRead{_, +poll}: poll
    case R.RootEditChecking{_, _, +poll}: poll
    case R.RootEditCounted{_, +poll}: poll
    case R.RootEditWaiting{_}: True{}
    case _: False{}

def edit_stopped(+valid: Bool, +result: R.RootCollectionResult) -> R.RootStep:
  match valid:
    case True{}: R.RootDone{result}
    case False{}: R.RootRejected{}

def nested_gate(+inv: Nat, +id: Nat, +composed: Bool, +turn_end: Bool,
    +flags: R.RootFlags, +step: H.GStep, +response: H.GResponse) -> R.RootStep:
  match step:
    case H.GAwait{+owner, +request_id, _, _}:
      enter_gate(
        inv,
        id,
        composed,
        turn_end,
        flags,
        gate_resume(step, H.GReply{owner, request_id, response})
      )
    case _: R.RootRejected{}

def nested_collection(+inv: Nat, +id: Nat, +mode: R.RootMode,
    +step: C.FlowStep, +response: C.FlowResponse) -> R.RootStep:
  match step:
    case C.FlowAwait{_, C.FlowRequest{+owner, +request_id, _}}:
      enter_collection(
        inv,
        id,
        mode,
        CollectionSpec.collection_spec_resume(step, C.FlowReply{owner, request_id, response})
      )
    case _: R.RootRejected{}

def nested_reservation(+inv: Nat, +id: Nat, +step: H.RStep, +response: H.RResponse) -> R.RootStep:
  match step:
    case H.RAwait{+owner, +request_id, _, _}:
      enter_reservation(
        inv,
        id,
        FinishSpec.reconcile_spec_resume(step, H.RReply{owner, request_id, response})
      )
    case _: R.RootRejected{}

def response(+inv: Nat, +id: Nat, +phase: R.RootPhase, +reply: R.RootResponse) -> R.RootStep:
  match phase reply:
    case R.RootGating{+step, +composed, +turn_end, +flags} R.RootGated{+result}:
      nested_gate(inv, id, composed, turn_end, flags, step, result)
    case R.RootCollecting{+step, +mode} R.RootCollected{+result}:
      nested_collection(inv, id, mode, step, result)
    case R.RootReserving{+step} R.RootReserved{+result}: nested_reservation(inv, id, step, result)
    case R.RootDecoding{R.RootRequestMode{+flags}} R.RootDecoded{+input, +empty}:
      decoded_request(inv, id, flags, input, empty)
    case R.RootDecoding{R.RootDirectMode{}} R.RootDirectDecoded{}: R.RootDone{R.RootSelected{}}
    case R.RootDecoding{R.RootEditMode{+partition}} R.RootEditDecoded{+advice}:
      edit_result(inv, id, partition, advice)
    case R.RootReporting{} R.RootWorkStateRead{}: R.RootDone{R.RootSelected{}}
    case R.RootEditGating{+partition} R.RootEditGated{+allowed}: edit_allowed(
      inv,
      id,
      partition,
      allowed
    )
    case R.RootEditStarting{+partition} R.RootEditStarted{}:
      enter_collection(
        inv,
        id,
        R.RootEditMode{partition},
        CollectionSpec.collection_spec_initial(inv, True{}, False{})
      )
    case R.RootEditStatusRead{+partition, +poll} R.RootEditAdvice{+advice}:
      scan_status(inv, id, partition, poll, matching_advice(advice, partition))
    case R.RootEditChecking{+remaining, +partition, +poll} R.RootEditExpiry{+expired}:
      edit_expiry(inv, id, partition, poll, remaining, expired)
    case R.RootEditCounted{+partition, +poll} R.RootEditCount{+count}:
      edit_count(inv, id, partition, poll, count)
    case R.RootEditWaiting{+partition} R.RootEditSlept{}:
      request(inv, id, R.RootEditGating{partition}, R.RootEditGate{})
    case +current R.RootEditTimedOut{}: edit_stopped(edit_active(current), R.RootEditPending{})
    case +current R.RootEditLost{}: edit_stopped(edit_active(current), R.RootEditUnavailable{})
    case _ _: R.RootRejected{}

def accepted(
  +valid: Bool,
  +inv: Nat,
  +id: Nat,
  +phase: R.RootPhase,
  +reply: R.RootResponse
) -> R.RootStep:
  match valid:
    case True{}: response(inv, Nat.add(id, 1n), phase, reply)
    case False{}: R.RootRejected{}

def root_spec_resume(+step: R.RootStep, +reply: R.RootReply) -> R.RootStep:
  match step reply:
    case R.RootAwait{+inv, +id, +phase, R.RootRequest{+owner, +request_id, _}} R.RootReply{
      +actual,
      +received,
      +value
    }:
      accepted(
        FinishSpec.correlated(inv, id, owner, request_id, actual, received),
        inv,
        id,
        phase,
        value
      )
    case _ _: R.RootRejected{}

def root_spec_atomic(+step: R.RootStep) -> Bool:
  match step:
    case R.RootAwait{_, _, R.RootGating{+gate, _, _, _}, _}: gate_atomic(gate)
    case R.RootAwait{_, _, R.RootCollecting{+collection, _}, _}:
      CollectionSpec.collection_spec_atomic(collection)
    case _: False{}

def trace_prepend(+event: Trace.RootEvent, +trace: Trace.RootTrace) -> Trace.RootTrace:
  match trace:
    case Trace.RootTrace{+requests, +remaining, +final}: Trace.RootTrace{
      event <> requests,
      remaining,
      final
    }

def run_root(+replies: List<&2, R.RootReply>, +step: R.RootStep) -> Trace.RootTrace:
  match replies step:
    case Nil{} _: Trace.RootTrace{[], [], step}
    case +reply <> +tail R.RootAwait{_, _, _, +held}:
      trace_prepend(
        Trace.RootEvent{held, root_spec_atomic(step)},
        run_root(tail, root_spec_resume(step, reply))
      )
    case _ _: Trace.RootTrace{[], replies, step}
