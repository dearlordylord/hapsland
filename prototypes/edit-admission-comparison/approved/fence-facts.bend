import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./invariants.bend as I
import ./math/PROOF.bend as N

# A matching original tool has a fresh original pre-start under the reachable invariant.
def find_fresh.head(+permit: P.Permit, +rest: List<&2,P.Permit>, +state: C.State,
    +partition: Nat, +live: Nat, clean: I.Fresh(permit <> rest,C.fence(C.get_permit(state))),
    +hp: {Nat.is_eq(partition,C.owner(C.get_permit(state))) == True{} : Bool},
    +hl: {Nat.is_eq(live,C.lifetime(C.get_permit(state))) == True{} : Bool}) ->
    {S.fresh_found(Some{permit},state,partition,live) == True{} : Bool}:
  match permit:
    case P.Permit{_,_,_,start,_}:
      (fresh, _) = clean
      %Equal.sym(Bool,Nat.is_gt(start,C.fence(C.get_permit(state))),True{},fresh) : {Bool.and(_,Bool.and(Nat.is_eq(partition,C.owner(C.get_permit(state))),Nat.is_eq(live,C.lifetime(C.get_permit(state))))) == True{} : Bool}
      %Equal.sym(Bool,Nat.is_eq(partition,C.owner(C.get_permit(state))),True{},hp) : {Bool.and(_,Nat.is_eq(live,C.lifetime(C.get_permit(state)))) == True{} : Bool}
      hl

def fresh_tail(+permit: P.Permit, +rest: List<&2,P.Permit>, +fence: Nat,
    clean: I.Fresh(permit <> rest,fence)) -> I.Fresh(rest,fence):
  match permit:
    case P.Permit{_,_,_,start,_}:
      (head, tail) = clean
      tail

def find_fresh.pick(+tool: Nat, +permit: P.Permit, +rest: List<&2,P.Permit>, +state: C.State,
    +partition: Nat, +live: Nat, +hit: Bool,
    clean: I.Fresh(permit <> rest,C.fence(C.get_permit(state))),
    +hp: {Nat.is_eq(partition,C.owner(C.get_permit(state))) == True{} : Bool},
    +hl: {Nat.is_eq(live,C.lifetime(C.get_permit(state))) == True{} : Bool},
    present: {Bool.or(hit,P.has_tool(tool,rest)) == True{} : Bool},
    ih: I.Fresh(rest,C.fence(C.get_permit(state))) -> {P.has_tool(tool,rest) == True{} : Bool} ->
      {S.fresh_found(S.find_tool(tool,rest),state,partition,live) == True{} : Bool}) ->
    {S.fresh_found(S.find_pick(hit,permit,S.find_tool(tool,rest)),state,partition,live) == True{} : Bool}:
  match hit:
    case True{}: find_fresh.head(permit,rest,state,partition,live,clean,hp,hl)
    case False{}: ih(fresh_tail(permit,rest,C.fence(C.get_permit(state)),clean),present)

def find_fresh.step(+tool: Nat, +permit: P.Permit, +rest: List<&2,P.Permit>, +state: C.State,
    +partition: Nat, +live: Nat,
    clean: I.Fresh(permit <> rest,C.fence(C.get_permit(state))),
    +hp: {Nat.is_eq(partition,C.owner(C.get_permit(state))) == True{} : Bool},
    +hl: {Nat.is_eq(live,C.lifetime(C.get_permit(state))) == True{} : Bool},
    present: {P.has_tool(tool,permit <> rest) == True{} : Bool},
    ih: I.Fresh(rest,C.fence(C.get_permit(state))) -> {P.has_tool(tool,rest) == True{} : Bool} ->
      {S.fresh_found(S.find_tool(tool,rest),state,partition,live) == True{} : Bool}) ->
    {S.fresh_found(S.find_tool(tool,permit <> rest),state,partition,live) == True{} : Bool}:
  match permit:
    case P.Permit{token,native,round,start,deadline}:
      find_fresh.pick(tool,P.Permit{token,native,round,start,deadline},rest,state,partition,live,Nat.is_eq(tool,native),clean,hp,hl,present,
        ih)

def find_fresh(+permits: List<&2,P.Permit>, +tool: Nat, +state: C.State, +partition: Nat, +live: Nat,
    clean: I.Fresh(permits,C.fence(C.get_permit(state))),
    +hp: {Nat.is_eq(partition,C.owner(C.get_permit(state))) == True{} : Bool},
    +hl: {Nat.is_eq(live,C.lifetime(C.get_permit(state))) == True{} : Bool},
    present: {P.has_tool(tool,permits) == True{} : Bool}) ->
    {S.fresh_found(S.find_tool(tool,permits),state,partition,live) == True{} : Bool}:
  match permits:
    case Nil{}:
      Empty.absurd({S.fresh_found(None{},state,partition,live) == True{} : Bool},N.false_true_empty(present))
    case +permit <> +rest:
      find_fresh.step(tool,permit,rest,state,partition,live,clean,hp,hl,present,
        c => h => find_fresh(rest,tool,state,partition,live,c,hp,hl,h))
