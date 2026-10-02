import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./consume-facts.bend as F
import ./math/PROOF.bend as N

# Flip actual owner comparison and carry it back across expiry's unchanged scope.
def partition_original(+before: P.AdmissionState, +after: P.AdmissionState, +requested: Nat,
    same: {C.owner(before) == C.owner(after) : Nat},
    correct: {Nat.is_eq(C.owner(after),requested) == True{} : Bool}) ->
    {Nat.is_eq(requested,C.owner(before)) == True{} : Bool}:
  %Equal.sym(Nat,C.owner(before),C.owner(after),same) : {Nat.is_eq(requested,_) == True{} : Bool}
  %Equal.sym(Nat,C.owner(after),requested,N.nat_eq_true(C.owner(after),requested,correct)) : {Nat.is_eq(requested,_) == True{} : Bool}
  N.nat_eq_refl(requested)

def lifetime_original(+before: P.AdmissionState, +after: P.AdmissionState, +requested: Nat,
    same: {C.lifetime(before) == C.lifetime(after) : Nat},
    correct: {Nat.is_eq(C.lifetime(after),requested) == True{} : Bool}) ->
    {Nat.is_eq(requested,C.lifetime(before)) == True{} : Bool}:
  %Equal.sym(Nat,C.lifetime(before),C.lifetime(after),same) : {Nat.is_eq(requested,_) == True{} : Bool}
  %Equal.sym(Nat,C.lifetime(after),requested,N.nat_eq_true(C.lifetime(after),requested,correct)) : {Nat.is_eq(requested,_) == True{} : Bool}
  N.nat_eq_refl(requested)

def partition_guard(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    h: {F.consume_guards(state,partition,live,token,tool,now) == True{} : Bool}) ->
    {Nat.is_eq(C.owner(state),partition) == True{} : Bool}:
  N.and_true_left(Nat.is_eq(C.owner(state),partition),
    Bool.and(Nat.is_eq(C.lifetime(state),live),F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state)))),h)

def lifetime_guard(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    h: {F.consume_guards(state,partition,live,token,tool,now) == True{} : Bool}) ->
    {Nat.is_eq(C.lifetime(state),live) == True{} : Bool}:
  N.and_true_left(Nat.is_eq(C.lifetime(state),live),F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state))),
    N.and_true_right(Nat.is_eq(C.owner(state),partition),
      Bool.and(Nat.is_eq(C.lifetime(state),live),F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state)))),h))

def permit_guard(+state: P.AdmissionState, +partition: Nat, +live: Nat, +token: Nat, +tool: Nat, +now: Nat,
    h: {F.consume_guards(state,partition,live,token,tool,now) == True{} : Bool}) ->
    {F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state))) == True{} : Bool}:
  N.and_true_right(Nat.is_eq(C.lifetime(state),live),F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state))),
    N.and_true_right(Nat.is_eq(C.owner(state),partition),
      Bool.and(Nat.is_eq(C.lifetime(state),live),F.permit_guards(state,token,tool,now,P.find_permit(token,C.get_pending(state)))),h))
