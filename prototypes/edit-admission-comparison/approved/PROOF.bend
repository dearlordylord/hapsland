import Base
import ./LAWS.bend as Laws
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./consume-facts.bend as F
import ./scope-facts.bend as G
import ./presence-facts.bend as H
import ./fence-facts.bend as B
import ./wrapper-facts.bend as W
import ./invariants.bend as I
import ./strict-expiry-facts.bend as T
import ./validity.bend as V
import ./math/PROOF.bend as N
import ../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolMath
import ./expiry-facts.bend as E

# This entire file is the approved current_fence_witness section only.
# These helpers support its necessary valid-PRE implication, not other design laws.
def pending_getters(+state: P.AdmissionState) -> {C.get_pending(state) == S.permits(state) : List<&2,P.Permit>}:
  match state:
    case P.AdmissionState{_,_,_,_,_,_,_}: {==}

def fresh_getter(+state: P.AdmissionState, clean: I.Fresh(S.permits(state),C.fence(state))) ->
    I.Fresh(C.get_pending(state),C.fence(state)):
  %Equal.sym(List<&2,P.Permit>,C.get_pending(state),S.permits(state),pending_getters(state)) : I.Fresh(_,C.fence(state))
  clean

def original_fresh(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    clean: I.FreshCurrent(before),
    +guard: {F.consume_guards(C.get_permit(C.expire_now(before,now)),partition,live,
      C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now) == True{} : Bool}) ->
    {S.fresh_witness(before,partition,live,tool) == True{} : Bool}:
  %pending_getters(C.get_permit(before)) : {S.fresh_found(S.find_tool(tool,_),before,partition,live) == True{} : Bool}
  B.find_fresh(C.get_pending(C.get_permit(before)),tool,before,partition,live,fresh_getter(C.get_permit(before),clean),
    G.partition_original(C.get_permit(before),C.get_permit(C.expire_now(before,now)),partition,
      Equal.sym(Nat,C.owner(C.get_permit(C.expire_now(before,now))),C.owner(C.get_permit(before)),E.expire_owner(before,now)),
      G.partition_guard(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,guard)),
    G.lifetime_original(C.get_permit(before),C.get_permit(C.expire_now(before,now)),live,
      Equal.sym(Nat,C.lifetime(C.get_permit(C.expire_now(before,now))),C.lifetime(C.get_permit(before)),E.expire_lifetime(before,now)),
      G.lifetime_guard(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,guard)),
    E.expire_subset(before,now,tool,
      H.guard_presence(C.get_permit(C.expire_now(before,now)),tool,now,
        G.permit_guard(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,guard))))

def consume_body_fence_result(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    clean: I.FreshCurrent(before), +result: P.AdmissionResult,
    known: {result == P.step(C.get_permit(C.expire_now(before,now)),partition,live,
      P.Consume{C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now}) : P.AdmissionResult}) ->
    {Bool.or(Nat.is_eq(C.count(C.current_consume(C.expire_now(before,now),tool,result)),C.count(before)),
      S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  match result:
    case P.Rejected{permit,reason}:
      W.conclude_noaccept(before,C.current_consume(C.expire_now(before,now),tool,P.Rejected{permit,reason}),partition,live,tool,
        Equal.trans(Nat,C.count(C.current_consume(C.expire_now(before,now),tool,P.Rejected{permit,reason})),C.count(C.expire_now(before,now)),C.count(before),
          W.reject_count(C.expire_now(before,now),tool,permit,reason),E.expire_count(before,now)))
    case P.Accepted{permit,ticket,round}:
      W.conclude_fresh(before,C.current_consume(C.expire_now(before,now),tool,P.Accepted{permit,ticket,round}),partition,live,tool,
        Nat.is_eq(C.count(C.current_consume(C.expire_now(before,now),tool,P.Accepted{permit,ticket,round})),C.count(before)),{==},
        original_fresh(before,partition,live,tool,now,clean,
          W.step_guard_true(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,
            W.accepted_result_ok(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,permit,ticket,round,known))))

def consume_body_fence(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    clean: I.FreshCurrent(before)) ->
    {Bool.or(Nat.is_eq(C.count(C.current_post(C.expire_now(before,now),partition,live,tool,now,False{})),C.count(before)),
      S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  consume_body_fence_result(before,partition,live,tool,now,clean,
    P.step(C.get_permit(C.expire_now(before,now)),partition,live,P.Consume{C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now}),{==})

def duplicate_body_fence(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    +duplicate: Bool, clean: I.FreshCurrent(before)) ->
    {Bool.or(Nat.is_eq(C.count(C.current_post(C.expire_now(before,now),partition,live,tool,now,duplicate)),C.count(before)),
      S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  match duplicate:
    case True{}:
      W.conclude_noaccept(before,C.expire_now(before,now),partition,live,tool,E.expire_count(before,now))
    case False{}:
      consume_body_fence(before,partition,live,tool,now,clean)

def current_body_fence(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    clean: I.FreshCurrent(before)) ->
    {Bool.or(Nat.is_eq(C.count(C.current_post(C.expire_now(before,now),partition,live,tool,now,C.seen(tool,C.completed(C.expire_now(before,now))))),C.count(before)),
      S.fresh_witness(before,partition,live,tool)) == True{} : Bool}:
  duplicate_body_fence(before,partition,live,tool,now,C.seen(tool,C.completed(C.expire_now(before,now))),clean)

def Laws.current_fence_witness(history,partition,live,tool,now):
  current_body_fence(C.run(history,C.Current{},C.initial()),partition,live,tool,now,I.reachable_fresh(history))


# Necessary validity strengthening for the owner's approved phrase "valid PRE".
# These proofs do NOT prove the remaining exact_post completeness law.
def none_guard_false(+state: P.AdmissionState, token: Nat, tool: Nat, now: Nat) ->
    {F.permit_guards(state,token,tool,now,None{}) == False{} : Bool}:
  match state:
    case P.AdmissionState{_,_,_,_,_,_,_}: {==}

def strict_record_found(+before: C.State, +tool: Nat, +now: Nat, +found: Maybe<&2,P.Permit>,
    lookup: {P.find_permit(C.token(C.get_permit(C.expire_now(before,now)),tool),C.get_pending(C.get_permit(C.expire_now(before,now)))) == found : Maybe<&2,P.Permit>},
    guard: {F.permit_guards(C.get_permit(C.expire_now(before,now)),C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,found) == True{} : Bool}) ->
    {V.strict_deadline(found,now) == True{} : Bool}:
  match found:
    case None{}:
      Empty.absurd({False{} == True{} : Bool},N.false_true_empty(Equal.trans(Bool,False{},F.permit_guards(C.get_permit(C.expire_now(before,now)),C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,None{}),True{},
        Equal.sym(Bool,F.permit_guards(C.get_permit(C.expire_now(before,now)),C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,None{}),False{},
          none_guard_false(C.get_permit(C.expire_now(before,now)),C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now)),guard)))
    case Some{P.Permit{token,native,candidate,start,deadline}}:
      T.expire_now_deadline(before,now,C.token(C.get_permit(C.expire_now(before,now)),tool),P.Permit{token,native,candidate,start,deadline},lookup)

def guard_valid_pre(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    +guard: {F.consume_guards(C.get_permit(C.expire_now(before,now)),partition,live,
      C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now) == True{} : Bool}) ->
    {V.valid_pre(before,partition,live,tool,now) == True{} : Bool}:
  %Equal.sym(Bool,F.consume_guards(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now),True{},guard) :
    {Bool.and(_,V.strict_deadline(P.find_permit(C.token(C.get_permit(C.expire_now(before,now)),tool),C.get_pending(C.get_permit(C.expire_now(before,now)))),now)) == True{} : Bool}
  strict_record_found(before,tool,now,P.find_permit(C.token(C.get_permit(C.expire_now(before,now)),tool),C.get_pending(C.get_permit(C.expire_now(before,now)))),{==},
    G.permit_guard(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,guard))

def valid_conclude_reject(+before: C.State, +after: C.State, partition: Nat, live: Nat, tool: Nat, now: Nat,
    same: {C.count(after) == C.count(before) : Nat}) ->
    {Bool.or(Nat.is_eq(C.count(after),C.count(before)),V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}:
  %Equal.sym(Nat,C.count(after),C.count(before),same) : {Bool.or(Nat.is_eq(_,C.count(before)),V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}
  %Equal.sym(Bool,Nat.is_eq(C.count(before),C.count(before)),True{},N.nat_eq_refl(C.count(before))) : {Bool.or(_,V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}
  {==}

def valid_conclude_accept(+before: C.State, +after: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat,
    valid: {V.valid_pre(before,partition,live,tool,now) == True{} : Bool}) ->
    {Bool.or(Nat.is_eq(C.count(after),C.count(before)),V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}:
  %Equal.sym(Bool,V.valid_pre(before,partition,live,tool,now),True{},valid) : {Bool.or(Nat.is_eq(C.count(after),C.count(before)),_) == True{} : Bool}
  BoolMath.or_true(Nat.is_eq(C.count(after),C.count(before)))

def valid_consume_result(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat, +result: P.AdmissionResult,
    known: {result == P.step(C.get_permit(C.expire_now(before,now)),partition,live,
      P.Consume{C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now}) : P.AdmissionResult}) ->
    {Bool.or(Nat.is_eq(C.count(C.current_consume(C.expire_now(before,now),tool,result)),C.count(before)),V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}:
  match result:
    case P.Rejected{permit,reason}:
      valid_conclude_reject(before,C.current_consume(C.expire_now(before,now),tool,P.Rejected{permit,reason}),partition,live,tool,now,
        Equal.trans(Nat,C.count(C.current_consume(C.expire_now(before,now),tool,P.Rejected{permit,reason})),C.count(C.expire_now(before,now)),C.count(before),
          W.reject_count(C.expire_now(before,now),tool,permit,reason),E.expire_count(before,now)))
    case P.Accepted{permit,ticket,round}:
      valid_conclude_accept(before,C.current_consume(C.expire_now(before,now),tool,P.Accepted{permit,ticket,round}),partition,live,tool,now,
        guard_valid_pre(before,partition,live,tool,now,
          W.step_guard_true(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,
            W.accepted_result_ok(C.get_permit(C.expire_now(before,now)),partition,live,C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now,permit,ticket,round,known))))

def valid_duplicate_body(+before: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat, +duplicate: Bool) ->
    {Bool.or(Nat.is_eq(C.count(C.current_post(C.expire_now(before,now),partition,live,tool,now,duplicate)),C.count(before)),V.valid_pre(before,partition,live,tool,now)) == True{} : Bool}:
  match duplicate:
    case True{}: valid_conclude_reject(before,C.expire_now(before,now),partition,live,tool,now,E.expire_count(before,now))
    case False{}:
      valid_consume_result(before,partition,live,tool,now,
        P.step(C.get_permit(C.expire_now(before,now)),partition,live,P.Consume{C.token(C.get_permit(C.expire_now(before,now)),tool),tool,now}),{==})

# The sole approved soundness strengthening: never claims all valid posts accepted.
def current_valid_pre(+history: List<&2,C.TraceEvent>, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat) ->
    {Bool.or(Nat.is_eq(C.count(C.post(C.Current{},C.run(history,C.Current{},C.initial()),partition,live,tool,now)),C.count(C.run(history,C.Current{},C.initial()))),
      V.valid_pre(C.run(history,C.Current{},C.initial()),partition,live,tool,now)) == True{} : Bool}:
  valid_duplicate_body(C.run(history,C.Current{},C.initial()),partition,live,tool,now,
    C.seen(tool,C.completed(C.expire_now(C.run(history,C.Current{},C.initial()),now))))
