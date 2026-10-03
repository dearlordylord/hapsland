import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P

type Metadata is Data:
  Metadata{owner: Nat, lifetime: Nat, fence: Nat, count: Nat}

def metadata(+s: C.State) -> Metadata:
  Metadata{C.owner(C.get_permit(s)),C.lifetime(C.get_permit(s)),C.fence(C.get_permit(s)),C.count(s)}

def expire_due_metadata(+s: C.State, token: Nat, tool: Nat) -> {metadata(C.expire_one(s,token,tool,True{})) == metadata(s) : Metadata}:
  match s:
    case C.State{P.AdmissionState{p,l,r,a,f,n,ps},done,c,round,active,budget}: {==}

def expire_one_metadata(+s: C.State, token: Nat, tool: Nat, due: Bool) -> {metadata(C.expire_one(s,token,tool,due)) == metadata(s) : Metadata}:
  match due:
    case False{}: {==}
    case True{}: expire_due_metadata(s,token,tool)

def expire_all_metadata(ps: List<&2,P.Permit>, +s: C.State, +now: Nat) -> {metadata(C.expire_all(ps,s,now)) == metadata(s) : Metadata}:
  match ps:
    case Nil{}: {==}
    case P.Permit{+token,+tool,_,_,+deadline} <> rest:
      Equal.trans(Metadata,metadata(C.expire_all(rest,C.expire_one(s,token,tool,Nat.is_ge(now,deadline)),now)),metadata(C.expire_one(s,token,tool,Nat.is_ge(now,deadline))),metadata(s),expire_all_metadata(rest,C.expire_one(s,token,tool,Nat.is_ge(now,deadline)),now),expire_one_metadata(s,token,tool,Nat.is_ge(now,deadline)))

def expire_now_metadata(+s: C.State, +now: Nat) -> {metadata(C.expire_now(s,now)) == metadata(s) : Metadata}:
  expire_all_metadata(C.get_pending(C.get_permit(s)),s,now)

def metadata_owner(m: Metadata) -> Nat:
  match m:
    case Metadata{p,_,_,_}: p

def metadata_lifetime(m: Metadata) -> Nat:
  match m:
    case Metadata{_,l,_,_}: l

def metadata_fence(m: Metadata) -> Nat:
  match m:
    case Metadata{_,_,f,_}: f

def metadata_count(m: Metadata) -> Nat:
  match m:
    case Metadata{_,_,_,c}: c

def expire_owner(+s: C.State,+now: Nat) -> {C.owner(C.get_permit(C.expire_now(s,now))) == C.owner(C.get_permit(s)) : Nat}:
  Equal.cong(Metadata,Nat,x => metadata_owner(x),metadata(C.expire_now(s,now)),metadata(s),expire_now_metadata(s,now))

def expire_lifetime(+s: C.State,+now: Nat) -> {C.lifetime(C.get_permit(C.expire_now(s,now))) == C.lifetime(C.get_permit(s)) : Nat}:
  Equal.cong(Metadata,Nat,x => metadata_lifetime(x),metadata(C.expire_now(s,now)),metadata(s),expire_now_metadata(s,now))

def expire_fence(+s: C.State,+now: Nat) -> {C.fence(C.get_permit(C.expire_now(s,now))) == C.fence(C.get_permit(s)) : Nat}:
  Equal.cong(Metadata,Nat,x => metadata_fence(x),metadata(C.expire_now(s,now)),metadata(s),expire_now_metadata(s,now))

def expire_count(+s: C.State,+now: Nat) -> {C.count(C.expire_now(s,now)) == C.count(s) : Nat}:
  Equal.cong(Metadata,Nat,x => metadata_count(x),metadata(C.expire_now(s,now)),metadata(s),expire_now_metadata(s,now))

def remove_subset_false(tokenhit: Bool,tail: Bool,+removed: Bool,
    h: {Bool.pick(Bool,tokenhit,removed,removed) == True{} : Bool},
    ih: {removed == True{} : Bool} -> {tail == True{} : Bool}) -> {tail == True{} : Bool}:
  match tokenhit:
    case True{}: ih(h)
    case False{}: ih(h)

def remove_subset_branch(+toolhit: Bool, tokenhit: Bool,+tail: Bool,+removed: Bool,
    h: {Bool.pick(Bool,tokenhit,removed,Bool.or(toolhit,removed)) == True{} : Bool},
    ih: {removed == True{} : Bool} -> {tail == True{} : Bool}) -> {Bool.or(toolhit,tail) == True{} : Bool}:
  match toolhit:
    case True{}: {==}
    case False{}: remove_subset_false(tokenhit,tail,removed,h,ih)

def remove_pick_presence(id: Nat,+native: Nat,r: Nat,st: Nat,dl: Nat,+tail: List<&2,P.Permit>,+tool: Nat,hit: Bool) -> {P.has_tool(tool,P.remove_permit.pick(P.Permit{id,native,r,st,dl},tail,hit)) == Bool.pick(Bool,hit,P.has_tool(tool,tail),Bool.or(Nat.is_eq(tool,native),P.has_tool(tool,tail))) : Bool}:
  match hit:
    case True{}: {==}
    case False{}: {==}

def remove_subset(+ps: List<&2,P.Permit>,+tool: Nat,+token: Nat,
    h: {P.has_tool(tool,P.remove_permit(token,ps)) == True{} : Bool}) -> {P.has_tool(tool,ps) == True{} : Bool}:
  match ps:
    case Nil{}: h
    case P.Permit{id,+native,r,st,dl} <> +rest:
      moved : {Bool.pick(Bool,Nat.is_eq(id,token),P.has_tool(tool,P.remove_permit(token,rest)),Bool.or(Nat.is_eq(tool,native),P.has_tool(tool,P.remove_permit(token,rest)))) == True{} : Bool} =
        Equal.trans(Bool,Bool.pick(Bool,Nat.is_eq(id,token),P.has_tool(tool,P.remove_permit(token,rest)),Bool.or(Nat.is_eq(tool,native),P.has_tool(tool,P.remove_permit(token,rest)))),P.has_tool(tool,P.remove_permit(token,P.Permit{id,native,r,st,dl} <> rest)),True{},Equal.sym(Bool,P.has_tool(tool,P.remove_permit(token,P.Permit{id,native,r,st,dl} <> rest)),Bool.pick(Bool,Nat.is_eq(id,token),P.has_tool(tool,P.remove_permit(token,rest)),Bool.or(Nat.is_eq(tool,native),P.has_tool(tool,P.remove_permit(token,rest)))),remove_pick_presence(id,native,r,st,dl,P.remove_permit(token,rest),tool,Nat.is_eq(id,token))),h)
      remove_subset_branch(Nat.is_eq(tool,native),Nat.is_eq(id,token),P.has_tool(tool,rest),P.has_tool(tool,P.remove_permit(token,rest)),moved,p => remove_subset(rest,tool,token,p))

def has(+s: C.State,tool: Nat) -> Bool:
  P.has_tool(tool,C.get_pending(C.get_permit(s)))

def expire_due_subset(+s: C.State,+token: Nat,native: Nat,+tool: Nat,
    h: {has(C.expire_one(s,token,native,True{}),tool) == True{} : Bool}) -> {has(s,tool) == True{} : Bool}:
  match s:
    case C.State{P.AdmissionState{p,l,r,a,f,n,+ps},done,c,round,active,budget}:
      remove_subset(ps,tool,token,h)

def expire_one_subset(+s: C.State,token: Nat,native: Nat,+tool: Nat,due: Bool,
    h: {has(C.expire_one(s,token,native,due),tool) == True{} : Bool}) -> {has(s,tool) == True{} : Bool}:
  match due:
    case False{}: h
    case True{}: expire_due_subset(s,token,native,tool,h)

def expire_all_subset(ps: List<&2,P.Permit>,+s: C.State,+now: Nat,+tool: Nat,
    h: {has(C.expire_all(ps,s,now),tool) == True{} : Bool}) -> {has(s,tool) == True{} : Bool}:
  match ps:
    case Nil{}: h
    case P.Permit{+token,+native,_,_,+deadline} <> rest:
      expire_one_subset(s,token,native,tool,Nat.is_ge(now,deadline),expire_all_subset(rest,C.expire_one(s,token,native,Nat.is_ge(now,deadline)),now,tool,h))

def expire_subset(+s: C.State,+now: Nat,+tool: Nat,
    h: {has(C.expire_now(s,now),tool) == True{} : Bool}) -> {has(s,tool) == True{} : Bool}:
  expire_all_subset(C.get_pending(C.get_permit(s)),s,now,tool,h)
