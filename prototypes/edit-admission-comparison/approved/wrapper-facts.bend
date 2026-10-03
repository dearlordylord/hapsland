import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./consume-facts.bend as F
import ./math/PROOF.bend as N

def count_replace(+state: C.State, permit: P.AdmissionState) ->
    {C.count(C.replace_permit(state,permit)) == C.count(state) : Nat}:
  match state:
    case C.State{_,_,_,_,_,_}: {==}

def reject_count(+state: C.State, tool: Nat, permit: P.AdmissionState, reason: P.AdmissionRejection) ->
    {C.count(C.current_consume(state,tool,P.Rejected{permit,reason})) == C.count(state) : Nat}:
  count_replace(state,permit)

def step_guard_true(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    h: {C.result_ok(P.step(state,partition,live,P.Consume{token,tool,now})) == True{} : Bool}) ->
    {F.consume_guards(state,partition,live,token,tool,now) == True{} : Bool}:
  Equal.trans(Bool,F.consume_guards(state,partition,live,token,tool,now),
    C.result_ok(P.step(state,partition,live,P.Consume{token,tool,now})),True{},
    Equal.sym(Bool,C.result_ok(P.step(state,partition,live,P.Consume{token,tool,now})),F.consume_guards(state,partition,live,token,tool,now),F.step_ok(state,partition,live,token,tool,now)),h)

def accepted_result_ok(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    permit: P.AdmissionState, ticket: Maybe<&2,Nat>, round: Maybe<&2,Nat>,
    h: {P.Accepted{permit,ticket,round} == P.step(state,partition,live,P.Consume{token,tool,now}) : P.AdmissionResult}) ->
    {C.result_ok(P.step(state,partition,live,P.Consume{token,tool,now})) == True{} : Bool}:
  %h : {C.result_ok(_) == True{} : Bool}
  {==}

def conclude_fresh(+before: C.State, +after: C.State, +partition: Nat, +live: Nat, +tool: Nat,
    +count_equal: Bool,
    hcount: {Nat.is_eq(C.count(after),C.count(before)) == count_equal : Bool},
    fresh: {S.fresh_witness(before,partition,live,tool) == True{} : Bool}) ->
    {Bool.or(Nat.is_eq(C.count(after),C.count(before)),S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  match count_equal:
    case True{}:
      %Equal.sym(Bool,Nat.is_eq(C.count(after),C.count(before)),True{},hcount) : {Bool.or(_,S.fresh_witness(before,partition,live,tool)) == True{} : Bool}
      {==}
    case False{}:
      %Equal.sym(Bool,Nat.is_eq(C.count(after),C.count(before)),False{},hcount) : {Bool.or(_,S.fresh_witness(before,partition,live,tool)) == True{} : Bool}
      fresh

def conclude_noaccept(+before: C.State, +after: C.State, partition: Nat, live: Nat, tool: Nat,
    same: {C.count(after) == C.count(before) : Nat}) ->
    {Bool.or(Nat.is_eq(C.count(after),C.count(before)),S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  %Equal.sym(Nat,C.count(after),C.count(before),same) : {Bool.or(Nat.is_eq(_,C.count(before)),S.fresh_witness(before,partition,live,tool)) == True{} : Bool}
  %Equal.sym(Bool,Nat.is_eq(C.count(before),C.count(before)),True{},N.nat_eq_refl(C.count(before))) : {Bool.or(_,S.fresh_witness(before,partition,live,tool)) == True{} : Bool}
  {==}
