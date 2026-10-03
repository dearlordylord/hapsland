import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./lookup-facts.bend as L
import ./consume-facts.bend as F
import ./math/PROOF.bend as N

def found_present(found: Maybe<&2,P.Permit>) -> Bool:
  match found:
    case None{}: False{}
    case Some{_}: True{}

def presence_pick(+hit: Bool, +permit: P.Permit, +found: Maybe<&2,P.Permit>, +rest_present: Bool,
    h: {found_present(found) == rest_present : Bool}) ->
    {found_present(S.find_pick(hit,permit,found)) == Bool.or(hit,rest_present) : Bool}:
  match hit:
    case True{}: {==}
    case False{}: h

def presence_step(+tool: Nat, +permit: P.Permit, +rest: List<&2,P.Permit>,
    ih: {found_present(S.find_tool(tool,rest)) == P.has_tool(tool,rest) : Bool}) ->
    {found_present(S.find_tool(tool,permit <> rest)) == P.has_tool(tool,permit <> rest) : Bool}:
  match permit:
    case P.Permit{token,native,round,start,deadline}:
      presence_pick(Nat.is_eq(tool,native),P.Permit{token,native,round,start,deadline},
        S.find_tool(tool,rest),P.has_tool(tool,rest),ih)

def presence_equal(+permits: List<&2,P.Permit>, +tool: Nat) ->
    {found_present(S.find_tool(tool,permits)) == P.has_tool(tool,permits) : Bool}:
  match permits:
    case Nil{}: {==}
    case +permit <> +rest: presence_step(tool,permit,rest,presence_equal(rest,tool))

def find_tool_present(+permits: List<&2,P.Permit>, +tool: Nat, permit: P.Permit,
    h: {S.find_tool(tool,permits) == Some{permit} : Maybe<&2,P.Permit>}) ->
    {P.has_tool(tool,permits) == True{} : Bool}:
  Equal.trans(Bool,P.has_tool(tool,permits),found_present(S.find_tool(tool,permits)),True{},
    Equal.sym(Bool,found_present(S.find_tool(tool,permits)),P.has_tool(tool,permits),presence_equal(permits,tool)),
    Equal.cong(Maybe<&2,P.Permit>,Bool,found_present,S.find_tool(tool,permits),Some{permit},h))

# Valid consumed-token lookup supplies a same-tool permit, not a fabricated identity.
def guard_presence_found(+state: P.AdmissionState, +tool: Nat, +now: Nat, +found: Maybe<&2,P.Permit>,
    lookup: {P.find_permit(C.token(state,tool),C.get_pending(state)) == found : Maybe<&2,P.Permit>},
    valid: {F.permit_guards(state,C.token(state,tool),tool,now,found) == True{} : Bool}) ->
    {P.has_tool(tool,C.get_pending(state)) == True{} : Bool}:
  match state found:
    case _ None{}:
      Empty.absurd({P.has_tool(tool,C.get_pending(state)) == True{} : Bool},N.false_true_empty(valid))
    case P.AdmissionState{partition,live,+round,+active,fence,next,+permits}
        Some{P.Permit{token,+native,+candidate,+start,+deadline}}:
      find_tool_present(permits,tool,P.Permit{token,native,candidate,start,deadline},
        L.lookup_bridge(permits,tool,P.Permit{token,native,candidate,start,deadline},lookup,
          N.and_true_left(Nat.is_eq(tool,native),
            Bool.and(Bool.and(Nat.is_gt(start,fence),Bool.and(Nat.is_le(start,now),Nat.is_le(now,deadline))),
              Nat.is_eq(candidate,P.candidate_round(round,active))),valid)))

def guard_presence(+state: P.AdmissionState, +tool: Nat, +now: Nat,
    valid: {F.permit_guards(state,C.token(state,tool),tool,now,P.find_permit(C.token(state,tool),C.get_pending(state))) == True{} : Bool}) ->
    {P.has_tool(tool,C.get_pending(state)) == True{} : Bool}:
  guard_presence_found(state,tool,now,P.find_permit(C.token(state,tool),C.get_pending(state)),{==},valid)
