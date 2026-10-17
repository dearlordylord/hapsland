import Base
import ../Collection.bend as Collection
import ./Handoff.bend as Handoff

# Compose the complete root Collect; native handles stay in the original owners.
type RootInput is Data:
  RootInput{gate: Handoff.GInput, report: Bool}
type RootFlags is Data:
  RootFlags{finish: Bool, report: Bool}
type RootCommand is Data:
  RootGate{command: Handoff.GCommand}
  RootCollect{command: Collection.FlowCommand}
  RootDecode{result: Collection.FlowStep}
  RootReserve{command: Handoff.RCommand}
  RootWorkState{}
type RootResponse is Data:
  RootGated{response: Handoff.GResponse}
  RootCollected{response: Collection.FlowResponse}
  RootDecoded{input: Handoff.RInput, empty: Bool}
  RootReserved{response: Handoff.RResponse}
  RootWorkStateRead{}
type RootPhase is Data:
  RootGating{step: Handoff.GStep, composed: Bool, turn_end: Bool, flags: RootFlags}
  RootCollecting{step: Collection.FlowStep, flags: RootFlags}
  RootDecoding{flags: RootFlags}
  RootReserving{step: Handoff.RStep}
  RootReporting{}
type RootCollectionResult is Data:
  RootSelected{}
  RootEmpty{}
  RootPending{}
  RootUnsupported{}
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
  +flags: RootFlags,
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
          flags
        },
        RootCollect{command}
      )
    case Collection.FlowEmpty{}: issue(
      invocation,
      next,
      RootDecoding{flags},
      RootDecode{Collection.FlowEmpty{}}
    )
    case Collection.FlowDone{+token, +advice, +findings}:
      issue(
        invocation,
        next,
        RootDecoding{flags},
        RootDecode{Collection.FlowDone{token, advice, findings}}
      )
    case Collection.FlowRejected{}: RootRejected{}

def gate_result(+result: Handoff.GResult, +composed: Bool, +turn_end: Bool,
    +flags: RootFlags, +invocation: Nat, +next: Nat) -> RootStep:
  match result:
    case Handoff.GCollect{}: collect_step(
      Collection.collect_initial(invocation, composed, turn_end),
      flags,
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
    +flags: RootFlags, +invocation: Nat, +next: Nat) -> RootStep:
  match step:
    case Collection.FlowAwait{+state, Collection.FlowRequest{+owner, +id, +command}}:
      collect_step(
        Collection.collect_resume(
          Collection.FlowAwait{state, Collection.FlowRequest{owner, id, command}},
          Collection.FlowReply{owner, id, response}
        ),
        flags,
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
    case RootCollecting{+step, +flags} RootCollected{+value}: collect_reply(
      step,
      value,
      flags,
      invocation,
      next
    )
    case RootDecoding{+flags} RootDecoded{+input, +empty}: decoded(
      flags,
      input,
      empty,
      invocation,
      next
    )
    case RootReserving{+step} RootReserved{+value}: reserve_reply(step, value, invocation, next)
    case RootReporting{} RootWorkStateRead{}: RootDone{RootSelected{}}
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
