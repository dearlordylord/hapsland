import Base
import ../Collection.bend as Collection
import ./Handoff.bend as Handoff

# Compose the complete root Collect; native handles stay in the original owners.
type RootInput is Data:
  RootInput{gate: Handoff.GInput, report: Bool}
type RootFlags is Data:
  RootFlags{finish: Bool, report: Bool}
type RootMode is Data:
  RootRequestMode{flags: RootFlags}
  RootDirectMode{}
  RootEditMode{partition: String}
type RootAdvice is Data:
  RootAdvice{handle: Nat, partition: String}
type RootCommand is Data:
  RootGate{command: Handoff.GCommand}
  RootCollect{command: Collection.FlowCommand}
  RootDecode{result: Collection.FlowStep}
  RootReserve{command: Handoff.RCommand}
  RootWorkState{}
  RootEditGate{}
  RootEditStartPass{}
  RootEditStatus{}
  RootEditExpired{advice: Nat}
  RootEditWorkCount{}
  RootEditSleep{}
type RootResponse is Data:
  RootGated{response: Handoff.GResponse}
  RootCollected{response: Collection.FlowResponse}
  RootDecoded{input: Handoff.RInput, empty: Bool}
  RootReserved{response: Handoff.RResponse}
  RootWorkStateRead{}
  RootDirectDecoded{}
  RootEditDecoded{advice: Bool}
  RootEditGated{proceed: Bool}
  RootEditStarted{}
  RootEditAdvice{values: List<&2, RootAdvice>}
  RootEditExpiry{expired: Bool}
  RootEditCount{count: Nat}
  RootEditSlept{}
  RootEditTimedOut{}
  RootEditLost{}
type RootPhase is Data:
  RootGating{step: Handoff.GStep, composed: Bool, turn_end: Bool, flags: RootFlags}
  RootCollecting{step: Collection.FlowStep, mode: RootMode}
  RootDecoding{mode: RootMode}
  RootReserving{step: Handoff.RStep}
  RootReporting{}
  RootEditGating{partition: String}
  RootEditStarting{partition: String}
  RootEditStatusRead{partition: String}
  RootEditChecking{remaining: List<&2, Nat>, partition: String}
  RootEditCounted{partition: String}
  RootEditWaiting{partition: String}
type RootCollectionResult is Data:
  RootSelected{}
  RootEmpty{}
  RootPending{}
  RootUnsupported{}
  RootEditPending{}
  RootEditEmpty{}
  RootEditUnavailable{}
type RootRequest is Data:
  RootRequest{invocation: Nat, id: Nat, command: RootCommand}
type RootReply is Data:
  RootReply{invocation: Nat, id: Nat, response: RootResponse}
type RootStep is Data:
  RootAwait{invocation: Nat, id: Nat, phase: RootPhase, request: RootRequest}
  RootDone{result: RootCollectionResult}
  RootRejected{}

def issue(+invocation: Nat, +id: Nat, +phase: RootPhase, +command: RootCommand) -> RootStep:
  RootAwait{invocation, id, phase, RootRequest{invocation, id, command}}

def collect_step(
  +step: Collection.FlowStep,
  +mode: RootMode,
  +invocation: Nat,
  +next: Nat
) -> RootStep:
  match step:
    case Collection.FlowAwait{+state, Collection.FlowRequest{+owner, +id, +command}}:
      issue(
        invocation,
        next,
        RootCollecting{
          Collection.FlowAwait{state, Collection.FlowRequest{owner, id, command}},
          mode
        },
        RootCollect{command}
      )
    case Collection.FlowEmpty{}: issue(
      invocation,
      next,
      RootDecoding{mode},
      RootDecode{Collection.FlowEmpty{}}
    )
    case Collection.FlowDone{+token, +advice, +findings}:
      issue(
        invocation,
        next,
        RootDecoding{mode},
        RootDecode{Collection.FlowDone{token, advice, findings}}
      )
    case Collection.FlowRejected{}: RootRejected{}

def gate_result(+result: Handoff.GResult, +composed: Bool, +turn_end: Bool,
    +flags: RootFlags, +invocation: Nat, +next: Nat) -> RootStep:
  match result:
    case Handoff.GCollect{}: collect_step(
      Collection.collect_initial(invocation, composed, turn_end),
      RootRequestMode{flags},
      invocation,
      next
    )
    case Handoff.GEmpty{}: RootDone{RootEmpty{}}
    case Handoff.GPending{}: RootDone{RootPending{}}
    case Handoff.GUnsupported{}: RootDone{RootUnsupported{}}

def gate_step(+step: Handoff.GStep, +composed: Bool, +turn_end: Bool,
    +flags: RootFlags, +invocation: Nat, +next: Nat) -> RootStep:
  match step:
    case Handoff.GAwait{
      +owner,
      +id,
      +phase,
      Handoff.GRequest{+request_owner, +request_id, +command}
    }:
      issue(
        invocation,
        next,
        RootGating{
          Handoff.GAwait{owner, id, phase, Handoff.GRequest{request_owner, request_id, command}},
          composed,
          turn_end,
          flags
        },
        RootGate{command}
      )
    case Handoff.GDone{+result}: gate_result(result, composed, turn_end, flags, invocation, next)
    case Handoff.GRejected{}: RootRejected{}

def reserve_step(+step: Handoff.RStep, +invocation: Nat, +next: Nat) -> RootStep:
  match step:
    case Handoff.RAwait{
      +owner,
      +id,
      +phase,
      Handoff.RRequest{+request_owner, +request_id, +command}
    }:
      issue(
        invocation,
        next,
        RootReserving{
          Handoff.RAwait{owner, id, phase, Handoff.RRequest{request_owner, request_id, command}}
        },
        RootReserve{command}
      )
    case Handoff.RFinal{}: RootDone{RootSelected{}}
    case Handoff.REmpty{}: RootDone{RootEmpty{}}
    case Handoff.RRejected{}: RootRejected{}

def report_step(+needed: Bool, +invocation: Nat, +next: Nat) -> RootStep:
  match needed:
    case True{}: issue(invocation, next, RootReporting{}, RootWorkState{})
    case False{}: RootDone{RootSelected{}}

def decoded(
  +flags: RootFlags,
  +input: Handoff.RInput,
  +empty: Bool,
  +invocation: Nat,
  +next: Nat
) -> RootStep:
  match flags:
    case RootFlags{True{}, _}: reserve_step(
      Handoff.reserve_finish_initial(invocation, input),
      invocation,
      next
    )
    case RootFlags{False{}, +report}: report_step(Bool.and(report, empty), invocation, next)

def edit_gate(+partition: String, +invocation: Nat, +next: Nat) -> RootStep:
  issue(invocation, next, RootEditGating{partition}, RootEditGate{})

def edit_wait(+partition: String, +invocation: Nat, +next: Nat) -> RootStep:
  issue(invocation, next, RootEditWaiting{partition}, RootEditSleep{})

def edit_gated(+proceed: Bool, +partition: String, +invocation: Nat, +next: Nat) -> RootStep:
  match proceed:
    case True{}: issue(invocation, next, RootEditStarting{partition}, RootEditStartPass{})
    case False{}: RootDone{RootSelected{}}

def edit_decoded(+advice: Bool, +partition: String, +invocation: Nat, +next: Nat) -> RootStep:
  match advice:
    case True{}: RootDone{RootSelected{}}
    case False{}: issue(invocation, next, RootEditStatusRead{partition}, RootEditStatus{})

def edit_keep(+matches: Bool, +handle: Nat, +rest: List<&2, Nat>) -> List<&2, Nat>:
  match matches:
    case True{}: handle <> rest
    case False{}: rest

def edit_matching(+values: List<&2, RootAdvice>, +partition: String) -> List<&2, Nat>:
  match values:
    case Nil{}: Nil{}
    case RootAdvice{+handle, +actual} <> +rest:
      edit_keep(String.eq(actual, partition), handle, edit_matching(rest, partition))

def edit_status(
  +remaining: List<&2, Nat>,
  +partition: String,
  +invocation: Nat,
  +next: Nat
) -> RootStep:
  match remaining:
    case Nil{}: issue(invocation, next, RootEditCounted{partition}, RootEditWorkCount{})
    case +handle <> +rest:
      issue(invocation, next, RootEditChecking{rest, partition}, RootEditExpired{handle})

def edit_expired(+expired: Bool, +remaining: List<&2, Nat>, +partition: String,
    +invocation: Nat, +next: Nat) -> RootStep:
  match expired:
    case True{}: edit_status(remaining, partition, invocation, next)
    case False{}: edit_wait(partition, invocation, next)

def edit_count(+count: Nat, +partition: String, +invocation: Nat, +next: Nat) -> RootStep:
  match count:
    case 0n: RootDone{RootEditEmpty{}}
    case _: edit_wait(partition, invocation, next)

def edit_phase(+phase: RootPhase) -> Bool:
  match phase:
    case RootCollecting{_, RootEditMode{_}}: True{}
    case RootDecoding{RootEditMode{_}}: True{}
    case RootEditGating{_}: True{}
    case RootEditStarting{_}: True{}
    case RootEditStatusRead{_}: True{}
    case RootEditChecking{_, _}: True{}
    case RootEditCounted{_}: True{}
    case RootEditWaiting{_}: True{}
    case _: False{}

def edit_terminal(+valid: Bool, +result: RootCollectionResult) -> RootStep:
  match valid:
    case True{}: RootDone{result}
    case False{}: RootRejected{}

def initial(+invocation: Nat, +input: RootInput) -> RootStep:
  match input:
    case RootInput{Handoff.GInput{+composed, +turn_end, +finish}, +report}:
      gate_step(
        Handoff.collection_gate_initial(invocation, Handoff.GInput{composed, turn_end, finish}),
        composed,
        turn_end,
        RootFlags{finish, report},
        invocation,
        1n
      )

def direct_initial(+invocation: Nat, +composed: Bool, +turn_end: Bool) -> RootStep:
  collect_step(
    Collection.collect_initial(invocation, composed, turn_end),
    RootDirectMode{},
    invocation,
    1n
  )

def edit_initial(+invocation: Nat, +partition: String) -> RootStep:
  edit_gate(partition, invocation, 1n)

def gate_reply(+step: Handoff.GStep, +response: Handoff.GResponse, +composed: Bool,
    +turn_end: Bool, +flags: RootFlags, +invocation: Nat, +next: Nat) -> RootStep:
  match step:
    case Handoff.GAwait{+owner, +id, +phase, +request}:
      gate_step(
        Handoff.collection_gate_resume(
          Handoff.GAwait{owner, id, phase, request},
          Handoff.GReply{owner, id, response}
        ),
        composed,
        turn_end,
        flags,
        invocation,
        next
      )
    case _: RootRejected{}

def collect_reply(+step: Collection.FlowStep, +response: Collection.FlowResponse,
    +mode: RootMode, +invocation: Nat, +next: Nat) -> RootStep:
  match step:
    case Collection.FlowAwait{+state, Collection.FlowRequest{+owner, +id, +command}}:
      collect_step(
        Collection.collect_resume(
          Collection.FlowAwait{state, Collection.FlowRequest{owner, id, command}},
          Collection.FlowReply{owner, id, response}
        ),
        mode,
        invocation,
        next
      )
    case _: RootRejected{}

def reserve_reply(
  +step: Handoff.RStep,
  +response: Handoff.RResponse,
  +invocation: Nat,
  +next: Nat
) -> RootStep:
  match step:
    case Handoff.RAwait{+owner, +id, +phase, +request}:
      reserve_step(
        Handoff.reconcile_resume(
          Handoff.RAwait{owner, id, phase, request},
          Handoff.RReply{owner, id, response}
        ),
        invocation,
        next
      )
    case _: RootRejected{}

def phase_reply(
  +phase: RootPhase,
  +response: RootResponse,
  +invocation: Nat,
  +next: Nat
) -> RootStep:
  match phase response:
    case RootGating{+step, +composed, +turn_end, +flags} RootGated{+value}: gate_reply(
      step,
      value,
      composed,
      turn_end,
      flags,
      invocation,
      next
    )
    case RootCollecting{+step, +mode} RootCollected{+value}: collect_reply(
      step,
      value,
      mode,
      invocation,
      next
    )
    case RootDecoding{RootRequestMode{+flags}} RootDecoded{+input, +empty}: decoded(
      flags,
      input,
      empty,
      invocation,
      next
    )
    case RootReserving{+step} RootReserved{+value}: reserve_reply(step, value, invocation, next)
    case RootReporting{} RootWorkStateRead{}: RootDone{RootSelected{}}
    case RootDecoding{RootDirectMode{}} RootDirectDecoded{}: RootDone{RootSelected{}}
    case RootDecoding{RootEditMode{+partition}} RootEditDecoded{+advice}:
      edit_decoded(advice, partition, invocation, next)
    case RootEditGating{+partition} RootEditGated{+proceed}:
      edit_gated(proceed, partition, invocation, next)
    case RootEditStarting{+partition} RootEditStarted{}:
      collect_step(
        Collection.collect_initial(invocation, True{}, False{}),
        RootEditMode{partition},
        invocation,
        next
      )
    case RootEditStatusRead{+partition} RootEditAdvice{+values}:
      edit_status(edit_matching(values, partition), partition, invocation, next)
    case RootEditChecking{+remaining, +partition} RootEditExpiry{+expired}:
      edit_expired(expired, remaining, partition, invocation, next)
    case RootEditCounted{+partition} RootEditCount{+count}:
      edit_count(count, partition, invocation, next)
    case RootEditWaiting{+partition} RootEditSlept{}: edit_gate(partition, invocation, next)
    case +phase RootEditTimedOut{}: edit_terminal(edit_phase(phase), RootEditPending{})
    case +phase RootEditLost{}: edit_terminal(edit_phase(phase), RootEditUnavailable{})
    case _ _: RootRejected{}

def accept(
  +valid: Bool,
  +phase: RootPhase,
  +response: RootResponse,
  +invocation: Nat,
  +id: Nat
) -> RootStep:
  match valid:
    case False{}: RootRejected{}
    case True{}: phase_reply(phase, response, invocation, Nat.add(id, 1n))

def resume(+step: RootStep, +reply: RootReply) -> RootStep:
  match step reply:
    case RootAwait{+invocation, +id, +phase, RootRequest{+owner, +request_id, _}} RootReply{
      +other,
      +response_id,
      +response
    }:
      accept(
        Bool.and(
          Nat.is_eq(invocation, other),
          Bool.and(
            Nat.is_eq(owner, other),
            Bool.and(Nat.is_eq(id, response_id), Nat.is_eq(request_id, response_id))
          )
        ),
        phase,
        response,
        invocation,
        id
      )
    case _ _: RootRejected{}

def atomic(+step: RootStep) -> Bool:
  match step:
    case RootAwait{_, _, RootCollecting{+held, _}, _}: Collection.collect_atomic(held)
    case _: False{}
