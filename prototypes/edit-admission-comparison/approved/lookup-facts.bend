import Base
import ../core.bend as C
import ../spec.bend as S
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./math/PROOF.bend as N

def unwrap(found: Maybe<&2, P.Permit>) -> P.Permit:
  match found:
    case Some{p}: p
    case None{}: P.Permit{0n,0n,0n,0n,0n}

def some_injective(+a: P.Permit, +b: P.Permit, h: {Some{a} == Some{b} : Maybe<&2, P.Permit>}) -> {a == b : P.Permit}:
  Equal.cong(Maybe<&2, P.Permit>, P.Permit, x => unwrap(x), Some{a}, Some{b}, h)

def none_some_tag(found: Maybe<&2, P.Permit>) -> Type:
  match found:
    case None{}: Unit
    case Some{_}: Empty

def none_some_empty(p: P.Permit, h: {None{} == Some{p} : Maybe<&2, P.Permit>}) -> Empty:
  %h : none_some_tag(_)
  Unit{}

def lookup_head(+id: Nat, native: Nat, r: Nat, st: Nat, dl: Nat, rest: List<&2,P.Permit>) -> {P.find_permit(id, P.Permit{id,native,r,st,dl} <> rest) == Some{P.Permit{id,native,r,st,dl}} : Maybe<&2,P.Permit>}:
  %Equal.sym(Bool, Nat.is_eq(id,id), True{}, N.nat_eq_refl(id)) : {P.find_permit.pick(P.Permit{id,native,r,st,dl}, P.find_permit(id,rest), _) == Some{P.Permit{id,native,r,st,dl}} : Maybe<&2,P.Permit>}
  {==}

def bridge_hit(+head: P.Permit, +permit: P.Permit, +rest: List<&2,P.Permit>, +tool: Nat, +token: Nat,
    +ht: {Nat.is_eq(tool, S.permit_tool(head)) == True{} : Bool},
    hp: {P.find_permit(token, head <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    hk: {token == C.tool_token(tool, head <> rest) : Nat}) -> {S.find_tool(tool, head <> rest) == Some{permit} : Maybe<&2,P.Permit>}:
  match head:
    case P.Permit{+id, +native, +r, +st, +dl}:
      +kid : {token == id : Nat} = Equal.trans(Nat, token, C.tool_token(tool, P.Permit{id,native,r,st,dl} <> rest), id, hk,
        Equal.cong(Bool,Nat,x => C.token_pick(x,id,C.tool_token(tool,rest)), Nat.is_eq(tool,native),True{},ht))
      lookup_id : {P.find_permit(id,P.Permit{id,native,r,st,dl} <> rest) == Some{permit} : Maybe<&2,P.Permit>} =
        Equal.trans(Maybe<&2,P.Permit>, P.find_permit(id,P.Permit{id,native,r,st,dl} <> rest), P.find_permit(token,P.Permit{id,native,r,st,dl} <> rest),Some{permit},
          Equal.sym(Maybe<&2,P.Permit>,P.find_permit(token,P.Permit{id,native,r,st,dl} <> rest),P.find_permit(id,P.Permit{id,native,r,st,dl} <> rest),Equal.cong(Nat,Maybe<&2,P.Permit>,x => P.find_permit(x,P.Permit{id,native,r,st,dl} <> rest),token,id,kid)),hp)
      eq : {Some{P.Permit{id,native,r,st,dl}} == Some{permit} : Maybe<&2,P.Permit>} =
        Equal.trans(Maybe<&2,P.Permit>,Some{P.Permit{id,native,r,st,dl}},P.find_permit(id,P.Permit{id,native,r,st,dl} <> rest),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(id,P.Permit{id,native,r,st,dl} <> rest),Some{P.Permit{id,native,r,st,dl}},lookup_head(id,native,r,st,dl,rest)),lookup_id)
      %Equal.sym(Bool,Nat.is_eq(tool,native),True{},ht) : {S.find_pick(_, P.Permit{id,native,r,st,dl}, S.find_tool(tool,rest)) == Some{permit} : Maybe<&2,P.Permit>}
      eq

def miss_case(+head: P.Permit, +permit: P.Permit, +rest: List<&2,P.Permit>, +tool: Nat, +token: Nat,
    +hit: Bool,
    hm: {Nat.is_eq(tool,S.permit_tool(head)) == False{} : Bool},
    hp: {P.find_permit.pick(head,P.find_permit(token,rest),hit) == Some{permit} : Maybe<&2,P.Permit>},
    ht: {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool},
    hk: {token == C.tool_token(tool,rest) : Nat},
    ih: {P.find_permit(C.tool_token(tool,rest),rest) == Some{permit} : Maybe<&2,P.Permit>} -> {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool} -> {S.find_tool(tool,rest) == Some{permit} : Maybe<&2,P.Permit>}) -> {S.find_tool(tool,head <> rest) == Some{permit} : Maybe<&2,P.Permit>}:
  match hit:
    case True{}:
      e : {head == permit : P.Permit} = some_injective(head,permit,hp)
      et : {Nat.is_eq(tool,S.permit_tool(head)) == Nat.is_eq(tool,S.permit_tool(permit)) : Bool} = Equal.cong(P.Permit,Bool,x => Nat.is_eq(tool,S.permit_tool(x)),head,permit,e)
      contradiction : {False{} == True{} : Bool} = Equal.trans(Bool,False{},Nat.is_eq(tool,S.permit_tool(head)),True{},Equal.sym(Bool,Nat.is_eq(tool,S.permit_tool(head)),False{},hm),Equal.trans(Bool,Nat.is_eq(tool,S.permit_tool(head)),Nat.is_eq(tool,S.permit_tool(permit)),True{},et,ht))
      Empty.absurd({S.find_tool(tool,head <> rest) == Some{permit} : Maybe<&2,P.Permit>},N.false_true_empty(contradiction))
    case False{}:
      original : {P.find_permit(C.tool_token(tool,rest),rest) == Some{permit} : Maybe<&2,P.Permit>} = Equal.trans(Maybe<&2,P.Permit>,P.find_permit(C.tool_token(tool,rest),rest),P.find_permit(token,rest),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(token,rest),P.find_permit(C.tool_token(tool,rest),rest),Equal.cong(Nat,Maybe<&2,P.Permit>,x => P.find_permit(x,rest),token,C.tool_token(tool,rest),hk)),hp)
      %Equal.sym(Bool,Nat.is_eq(tool,S.permit_tool(head)),False{},hm) : {S.find_pick(_,head,S.find_tool(tool,rest)) == Some{permit} : Maybe<&2,P.Permit>}
      ih(original)(ht)

def bridge_miss(+head: P.Permit, +permit: P.Permit, +rest: List<&2,P.Permit>, +tool: Nat,
    +eh: {Nat.is_eq(tool,S.permit_tool(head)) == False{} : Bool},
    hp: {P.find_permit(C.tool_token(tool,head <> rest),head <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    ht: {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool},
    ih: {P.find_permit(C.tool_token(tool,rest),rest) == Some{permit} : Maybe<&2,P.Permit>} -> {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool} -> {S.find_tool(tool,rest) == Some{permit} : Maybe<&2,P.Permit>}) -> {S.find_tool(tool,head <> rest) == Some{permit} : Maybe<&2,P.Permit>}:
  match head:
    case P.Permit{+id,+native,+r,+st,+dl}:
      miss_case(P.Permit{id,native,r,st,dl},permit,rest,tool,C.tool_token(tool,P.Permit{id,native,r,st,dl} <> rest),Nat.is_eq(id,C.tool_token(tool,P.Permit{id,native,r,st,dl} <> rest)),eh,hp,ht,
        Equal.cong(Bool,Nat,x => C.token_pick(x,id,C.tool_token(tool,rest)),Nat.is_eq(tool,native),False{},eh),ih)

def bridge_case(+head: P.Permit, +permit: P.Permit, +rest: List<&2,P.Permit>, +tool: Nat,
    +hit: Bool, eh: {Nat.is_eq(tool,S.permit_tool(head)) == hit : Bool},
    hp: {P.find_permit(C.tool_token(tool,head <> rest),head <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    ht: {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool},
    ih: {P.find_permit(C.tool_token(tool,rest),rest) == Some{permit} : Maybe<&2,P.Permit>} -> {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool} -> {S.find_tool(tool,rest) == Some{permit} : Maybe<&2,P.Permit>}) -> {S.find_tool(tool,head <> rest) == Some{permit} : Maybe<&2,P.Permit>}:
  match hit:
    case True{}:
      bridge_hit(head,permit,rest,tool,C.tool_token(tool,head <> rest),eh,hp,{==})
    case False{}:
      bridge_miss(head,permit,rest,tool,eh,hp,ht,ih)

def lookup_bridge(+ps: List<&2,P.Permit>, +tool: Nat, +permit: P.Permit,
    hp: {P.find_permit(C.tool_token(tool,ps),ps) == Some{permit} : Maybe<&2,P.Permit>},
    ht: {Nat.is_eq(tool,S.permit_tool(permit)) == True{} : Bool}) -> {S.find_tool(tool,ps) == Some{permit} : Maybe<&2,P.Permit>}:
  match ps:
    case Nil{}:
      Empty.absurd({None{} == Some{permit} : Maybe<&2,P.Permit>},none_some_empty(permit,hp))
    case +head <> +rest:
      bridge_case(head,permit,rest,tool,Nat.is_eq(tool,S.permit_tool(head)),{==},hp,ht,
        p => h => lookup_bridge(rest,tool,permit,p,h))
