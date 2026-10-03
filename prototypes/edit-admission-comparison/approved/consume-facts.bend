import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P

# This module is proof-owned inversion of the imported consume guards.
# It makes no claim about completeness of the prototype's admission policy.
def permit_guards(+state: P.AdmissionState, token: Nat, +tool: Nat, +now: Nat,
    found: Maybe<&2, P.Permit>) -> Bool:
  match state found:
    case _ None{}: False{}
    case P.AdmissionState{_, _, +r, +active, fence, _, _}
        Some{P.Permit{_, native, candidate, +start, deadline}}:
      Bool.and(Nat.is_eq(tool, native),
        Bool.and(Bool.and(Nat.is_gt(start, fence), Bool.and(Nat.is_le(start, now), Nat.is_le(now, deadline))),
          Nat.is_eq(candidate, P.candidate_round(r, active))))

def consume_guards(+state: P.AdmissionState, partition: Nat, live: Nat, +token: Nat, tool: Nat, now: Nat) -> Bool:
  Bool.and(Nat.is_eq(C.owner(state),partition),
    Bool.and(Nat.is_eq(C.lifetime(state),live),
      permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state)))))

def round_ok(state: P.AdmissionState, partition: Nat, live: Nat, round: Nat, active: Bool, fence: Nat,
    next: Nat, permits: List<&2,P.Permit>, token: Nat, candidate: Nat, +correct: Bool) ->
    {C.result_ok(P.consume.round(state,partition,live,round,active,fence,next,permits,token,candidate,correct)) == correct : Bool}:
  match correct:
    case False{}: {==}
    case True{}: {==}

def time_ok(state: P.AdmissionState, partition: Nat, live: Nat, +round: Nat, +active: Bool, fence: Nat,
    next: Nat, permits: List<&2,P.Permit>, token: Nat, +candidate: Nat, now: Nat, +valid: Bool) ->
    {C.result_ok(P.consume.time(state,partition,live,round,active,fence,next,permits,token,now,candidate,valid)) ==
      Bool.and(valid,Nat.is_eq(candidate,P.candidate_round(round,active))) : Bool}:
  match valid:
    case False{}: {==}
    case True{}:
      round_ok(state,partition,live,round,active,fence,next,permits,token,candidate,Nat.is_eq(candidate,P.candidate_round(round,active)))

def tool_ok(state: P.AdmissionState, partition: Nat, live: Nat, +round: Nat, +active: Bool, +fence: Nat,
    next: Nat, permits: List<&2,P.Permit>, token: Nat, tool: Nat, +now: Nat, +candidate: Nat, +start: Nat, +deadline: Nat, +correct: Bool) ->
    {C.result_ok(P.consume.tool(state,partition,live,round,active,fence,next,permits,token,tool,now,candidate,start,deadline,correct)) ==
      Bool.and(correct,Bool.and(Bool.and(Nat.is_gt(start,fence),Bool.and(Nat.is_le(start,now),Nat.is_le(now,deadline))),
        Nat.is_eq(candidate,P.candidate_round(round,active)))) : Bool}:
  match correct:
    case False{}: {==}
    case True{}:
      time_ok(state,partition,live,round,active,fence,next,permits,token,candidate,now,
        Bool.and(Nat.is_gt(start,fence),Bool.and(Nat.is_le(start,now),Nat.is_le(now,deadline))))

def found_ok(+state: P.AdmissionState, +token: Nat, +tool: Nat, +now: Nat, +found: Maybe<&2,P.Permit>) ->
    {C.result_ok(P.consume.found(state,token,tool,now,found)) == permit_guards(state,token,tool,now,found) : Bool}:
  match state found:
    case _ None{}: {==}
    case P.AdmissionState{partition,live,round,active,fence,next,permits}
        Some{P.Permit{_, native,candidate,start,deadline}}:
      tool_ok(P.AdmissionState{partition,live,round,active,fence,next,permits},partition,live,round,active,fence,next,permits,token,tool,now,candidate,start,deadline,Nat.is_eq(tool,native))

def consume_ok(+state: P.AdmissionState, +token: Nat, +tool: Nat, +now: Nat) ->
    {C.result_ok(P.consume(state,token,tool,now)) == permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state))) : Bool}:
  match state:
    case P.AdmissionState{partition,live,round,active,fence,next,permits}:
      found_ok(P.AdmissionState{partition,live,round,active,fence,next,permits},token,tool,now,P.find_permit(token,permits))

def scope_ok(+state: P.AdmissionState, partition: Nat, live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    +part_ok: Bool, +live_ok: Bool) ->
    {C.result_ok(P.step.partition(state,partition,live,P.Consume{token,tool,now},part_ok,live_ok)) ==
      Bool.and(part_ok,Bool.and(live_ok,permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state))))) : Bool}:
  match part_ok live_ok:
    case False{} _: {==}
    case True{} False{}: {==}
    case True{} True{}:
      consume_ok(state,token,tool,now)

def step_ok(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat) ->
    {C.result_ok(P.step(state,partition,live,P.Consume{token,tool,now})) == consume_guards(state,partition,live,token,tool,now) : Bool}:
  match state:
    case P.AdmissionState{owner, lifetime, round, active, fence, next, permits}:
      scope_ok(P.AdmissionState{owner,lifetime,round,active,fence,next,permits},partition,live,token,tool,now,Nat.is_eq(owner,partition),Nat.is_eq(lifetime,live))
