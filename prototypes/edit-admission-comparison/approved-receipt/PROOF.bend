import Base
import ./LAWS.bend as Laws
import ../core.bend as C
import ../spec.bend as S

# State inspection identifies the independent predicate with the receipt guard.
def receipt_predicate(+state: C.State, +partition: Nat, +live: Nat, +tool: Nat, +now: Nat) ->
    {C.receipt_eligible(state,partition,live,tool,now) == S.eligible(C.Receipt{},state,partition,live,tool,now) : Bool}:
  match state:
    case C.State{_,_,_,_,_,_}: {==}

def accepted_count(+state: C.State, tool: Nat) ->
    {C.count(C.accepted(state,tool)) == (C.count(state) + 1n : Nat) : Nat}:
  match state:
    case C.State{_,_,_,_,_,_}: {==}

# Positive completeness only; no refusal policy or topology proof.
def Laws.receipt_complete(history,partition,live,tool,now,correct):
  %Equal.sym(Bool,C.receipt_eligible(C.run(history,C.Receipt{},C.initial()),partition,live,tool,now),True{},
    Equal.trans(Bool,C.receipt_eligible(C.run(history,C.Receipt{},C.initial()),partition,live,tool,now),S.eligible(C.Receipt{},C.run(history,C.Receipt{},C.initial()),partition,live,tool,now),True{},
      receipt_predicate(C.run(history,C.Receipt{},C.initial()),partition,live,tool,now),correct)) :
    {C.count(C.post_guard(C.run(history,C.Receipt{},C.initial()),tool,_)) == (C.count(C.run(history,C.Receipt{},C.initial())) + 1n : Nat) : Nat}
  accepted_count(C.run(history,C.Receipt{},C.initial()),tool)
