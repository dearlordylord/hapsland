import Base
import ./core.bend as C
import ../../packages/agent-flow-bend/Admission.bend as P

# Independent readable post predicates; do not invoke either post reducer.
def current_permit_ok(permit: P.Permit, +state: C.State, partition: Nat, live: Nat, +now: Nat) -> Bool:
  match permit:
    case P.Permit{_, tool, permitted_round, +start, deadline}:
      Bool.and(Nat.is_eq(partition, C.owner(C.get_permit(state))),
        Bool.and(Nat.is_eq(live, C.lifetime(C.get_permit(state))),
          Bool.and(Bool.not(C.seen(tool, C.completed(state))),
            Bool.and(Nat.is_eq(permitted_round, P.candidate_round(C.round(state), C.active(state))),
              Bool.and(Nat.is_gt(start, C.fence(C.get_permit(state))),
                Bool.and(Nat.is_le(start, now), Nat.is_lt(now, deadline)))))))

def permit_tool(permit: P.Permit) -> Nat:
  match permit:
    case P.Permit{_, tool, _, _, _}: tool

def find_pick(hit: Bool, permit: P.Permit, rest: Maybe<&2, P.Permit>) -> Maybe<&2, P.Permit>:
  match hit:
    case True{}: Some{permit}
    case False{}: rest

def find_tool(+tool: Nat, permits: List<&2, P.Permit>) -> Maybe<&2, P.Permit>:
  match permits:
    case Nil{}: None{}
    case +permit <> rest:
      find_pick(Nat.is_eq(tool, permit_tool(permit)), permit, find_tool(tool, rest))

def permits(state: P.AdmissionState) -> List<&2, P.Permit>:
  match state:
    case P.AdmissionState{_, _, _, _, _, _, ps}: ps

def current_found(found: Maybe<&2, P.Permit>, state: C.State, partition: Nat, live: Nat, now: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{permit}: current_permit_ok(permit, state, partition, live, now)

def eligible(model: C.Model, +state: C.State, partition: Nat, live: Nat, tool: Nat, now: Nat) -> Bool:
  match model:
    case C.Current{}:
      current_found(find_tool(tool, permits(C.get_permit(state))), state, partition, live, now)
    case C.Receipt{}:
      Bool.and(Nat.is_eq(partition, C.owner(C.get_permit(state))),
        Bool.and(Nat.is_eq(live, C.lifetime(C.get_permit(state))),
          Bool.and(Nat.is_gt(now, C.fence(C.get_permit(state))), Bool.not(C.seen(tool, C.completed(state))))))

def increment(allowed: Bool) -> Nat:
  match allowed:
    case False{}: 0n
    case True{}: 1n

def expected_round(+state: C.State, accepted: Bool) -> Nat:
  match accepted:
    case False{}: C.round(state)
    case True{}: P.candidate_round(C.round(state), C.active(state))

def budget_delta(event: C.TraceEvent) -> Nat:
  match event:
    case C.Continue{}: 1n
    case _: 0n

# Narrow witness of what current admission adds; native chronology is not inspected.
def fresh_found(found: Maybe<&2, P.Permit>, +state: C.State, partition: Nat, live: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{P.Permit{_, _, _, start, _}}:
      Bool.and(Nat.is_gt(start, C.fence(C.get_permit(state))),
        Bool.and(Nat.is_eq(partition, C.owner(C.get_permit(state))), Nat.is_eq(live, C.lifetime(C.get_permit(state)))))

def fresh_witness(+state: C.State, partition: Nat, live: Nat, tool: Nat) -> Bool:
  fresh_found(find_tool(tool, permits(C.get_permit(state))), state, partition, live)
