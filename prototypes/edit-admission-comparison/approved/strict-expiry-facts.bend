import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ./math/PROOF.bend as N
import ./lookup-facts.bend as H
import ./removal-facts.bend as R

# Domain proof: deleting one token cannot change another token's lookup.
def collision_empty(+id: Nat,+target: Nat,+removed: Nat,
    ht: {Nat.is_eq(id,target) == True{} : Bool},
    hr: {Nat.is_eq(id,removed) == True{} : Bool},
    hd: {Nat.is_eq(target,removed) == False{} : Bool}) -> Empty:
  eq : {target == removed : Nat} = Equal.trans(Nat,target,id,removed,Equal.sym(Nat,id,target,N.nat_eq_true(id,target,ht)),N.nat_eq_true(id,removed,hr))
  refl : {Nat.is_eq(target,removed) == True{} : Bool} = Equal.trans(Bool,Nat.is_eq(target,removed),Nat.is_eq(removed,removed),True{},Equal.cong(Nat,Bool,x => Nat.is_eq(x,removed),target,removed,eq),N.nat_eq_refl(removed))
  N.false_true_empty(Equal.trans(Bool,False{},Nat.is_eq(target,removed),True{},Equal.sym(Bool,Nat.is_eq(target,removed),False{},hd),refl))

def lookup_retained(+id: Nat,native: Nat,r: Nat,st: Nat,dl: Nat,+tail: List<&2,P.Permit>,+target: Nat,+hit: Bool,
    eh: {Nat.is_eq(id,target) == hit : Bool}) -> {P.find_permit(target,P.Permit{id,native,r,st,dl} <> tail) == P.find_permit.pick(P.Permit{id,native,r,st,dl},P.find_permit(target,tail),hit) : Maybe<&2,P.Permit>}:
  Equal.cong(Bool,Maybe<&2,P.Permit>,x => P.find_permit.pick(P.Permit{id,native,r,st,dl},P.find_permit(target,tail),x),Nat.is_eq(id,target),hit,eh)

def remove_lookup_branch(+id: Nat,+native: Nat,+r: Nat,+st: Nat,+dl: Nat,+rest: List<&2,P.Permit>,+target: Nat,+removed: Nat,
    +th: Bool,+rh: Bool,et: {Nat.is_eq(id,target) == th : Bool},er: {Nat.is_eq(id,removed) == rh : Bool},
    hd: {Nat.is_eq(target,removed) == False{} : Bool},
    ih: {P.find_permit(target,P.remove_permit(removed,rest)) == P.find_permit(target,rest) : Maybe<&2,P.Permit>}) ->
    {P.find_permit(target,P.remove_permit.pick(P.Permit{id,native,r,st,dl},P.remove_permit(removed,rest),rh)) == P.find_permit.pick(P.Permit{id,native,r,st,dl},P.find_permit(target,rest),th) : Maybe<&2,P.Permit>}:
  match th rh:
    case True{} True{}:
      Empty.absurd({P.find_permit(target,P.remove_permit(removed,rest)) == Some{P.Permit{id,native,r,st,dl}} : Maybe<&2,P.Permit>},collision_empty(id,target,removed,et,er,hd))
    case False{} True{}: ih
    case True{} False{}: lookup_retained(id,native,r,st,dl,P.remove_permit(removed,rest),target,True{},et)
    case False{} False{}:
      Equal.trans(Maybe<&2,P.Permit>,P.find_permit(target,P.Permit{id,native,r,st,dl} <> P.remove_permit(removed,rest)),P.find_permit(target,P.remove_permit(removed,rest)),P.find_permit(target,rest),lookup_retained(id,native,r,st,dl,P.remove_permit(removed,rest),target,False{},et),ih)

def remove_lookup(+ps: List<&2,P.Permit>,+target: Nat,+removed: Nat,+hd: {Nat.is_eq(target,removed) == False{} : Bool}) -> {P.find_permit(target,P.remove_permit(removed,ps)) == P.find_permit(target,ps) : Maybe<&2,P.Permit>}:
  match ps:
    case Nil{}: {==}
    case P.Permit{+id,+native,+r,+st,+dl} <> +rest:
      remove_lookup_branch(id,native,r,st,dl,rest,target,removed,Nat.is_eq(id,target),Nat.is_eq(id,removed),{==},{==},hd,remove_lookup(rest,target,removed,hd))

def remove_survivor_case(+ps: List<&2,P.Permit>,+target: Nat,+removed: Nat,+permit: P.Permit,hit: Bool,
    eq: {Nat.is_eq(target,removed) == hit : Bool},
    h: {P.find_permit(target,P.remove_permit(removed,ps)) == Some{permit} : Maybe<&2,P.Permit>}) -> {P.find_permit(target,ps) == Some{permit} : Maybe<&2,P.Permit>}:
  match hit:
    case False{}:
      Equal.trans(Maybe<&2,P.Permit>,P.find_permit(target,ps),P.find_permit(target,P.remove_permit(removed,ps)),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(target,P.remove_permit(removed,ps)),P.find_permit(target,ps),remove_lookup(ps,target,removed,eq)),h)
    case True{}:
      e : {target == removed : Nat} = N.nat_eq_true(target,removed,eq)
      changed : {P.find_permit(target,P.remove_permit(removed,ps)) == P.find_permit(removed,P.remove_permit(removed,ps)) : Maybe<&2,P.Permit>} = Equal.cong(Nat,Maybe<&2,P.Permit>,x => P.find_permit(x,P.remove_permit(removed,ps)),target,removed,e)
      gone : {P.find_permit(target,P.remove_permit(removed,ps)) == None{} : Maybe<&2,P.Permit>} = Equal.trans(Maybe<&2,P.Permit>,P.find_permit(target,P.remove_permit(removed,ps)),P.find_permit(removed,P.remove_permit(removed,ps)),None{},changed,R.remove_lookup_none(removed,ps))
      Empty.absurd({P.find_permit(target,ps) == Some{permit} : Maybe<&2,P.Permit>},H.none_some_empty(permit,Equal.trans(Maybe<&2,P.Permit>,None{},P.find_permit(target,P.remove_permit(removed,ps)),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(target,P.remove_permit(removed,ps)),None{},gone),h)))

def deadline(permit: P.Permit) -> Nat:
  match permit:
    case P.Permit{_,_,_,_,d}: d

def lookup(s: C.State,target: Nat) -> Maybe<&2,P.Permit>:
  P.find_permit(target,C.get_pending(C.get_permit(s)))

def remove_survivor(+ps: List<&2,P.Permit>,+target: Nat,+removed: Nat,+permit: P.Permit,
    h: {P.find_permit(target,P.remove_permit(removed,ps)) == Some{permit} : Maybe<&2,P.Permit>}) -> {P.find_permit(target,ps) == Some{permit} : Maybe<&2,P.Permit>}:
  remove_survivor_case(ps,target,removed,permit,Nat.is_eq(target,removed),{==},h)

def expire_due_survivor(+s: C.State,+token: Nat,native: Nat,+target: Nat,+permit: P.Permit,
    h: {lookup(C.expire_one(s,token,native,True{}),target) == Some{permit} : Maybe<&2,P.Permit>}) -> {lookup(s,target) == Some{permit} : Maybe<&2,P.Permit>}:
  match s:
    case C.State{P.AdmissionState{p,l,r,a,f,n,+ps},done,c,round,active,budget}:
      remove_survivor(ps,target,token,permit,h)

def expire_one_survivor(+s: C.State,token: Nat,native: Nat,+target: Nat,+permit: P.Permit,due: Bool,
    h: {lookup(C.expire_one(s,token,native,due),target) == Some{permit} : Maybe<&2,P.Permit>}) -> {lookup(s,target) == Some{permit} : Maybe<&2,P.Permit>}:
  match due:
    case False{}: h
    case True{}: expire_due_survivor(s,token,native,target,permit,h)

def expire_all_survivor(ps: List<&2,P.Permit>,+s: C.State,+now: Nat,+target: Nat,+permit: P.Permit,
    h: {lookup(C.expire_all(ps,s,now),target) == Some{permit} : Maybe<&2,P.Permit>}) -> {lookup(s,target) == Some{permit} : Maybe<&2,P.Permit>}:
  match ps:
    case Nil{}: h
    case P.Permit{+token,+native,_,_,+d} <> rest:
      expire_one_survivor(s,token,native,target,permit,Nat.is_ge(now,d),expire_all_survivor(rest,C.expire_one(s,token,native,Nat.is_ge(now,d)),now,target,permit,h))

def expire_due_gone(+s: C.State,+token: Nat,native: Nat) -> {lookup(C.expire_one(s,token,native,True{}),token) == None{} : Maybe<&2,P.Permit>}:
  match s:
    case C.State{P.AdmissionState{p,l,r,a,f,n,+ps},done,c,round,active,budget}: R.remove_lookup_none(token,ps)

def scheduled_head_due(+id: Nat,+native: Nat,+r: Nat,+st: Nat,+dl: Nat,+rest: List<&2,P.Permit>,+target: Nat,+permit: P.Permit,+now: Nat,
    ht: {Nat.is_eq(id,target) == True{} : Bool},
    hp: {P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    hd: {Nat.is_ge(now,deadline(permit)) == True{} : Bool}) -> {Nat.is_ge(now,dl) == True{} : Bool}:
  same : {Some{P.Permit{id,native,r,st,dl}} == Some{permit} : Maybe<&2,P.Permit>} = Equal.trans(Maybe<&2,P.Permit>,Some{P.Permit{id,native,r,st,dl}},P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest),Some{P.Permit{id,native,r,st,dl}},lookup_retained(id,native,r,st,dl,rest,target,True{},ht)),hp)
  Equal.trans(Bool,Nat.is_ge(now,dl),Nat.is_ge(now,deadline(permit)),True{},Equal.cong(P.Permit,Bool,x => Nat.is_ge(now,deadline(x)),P.Permit{id,native,r,st,dl},permit,H.some_injective(P.Permit{id,native,r,st,dl},permit,same)),hd)

def scheduled_head_clear(+id: Nat,+native: Nat,+r: Nat,+st: Nat,+dl: Nat,+rest: List<&2,P.Permit>,+s: C.State,+target: Nat,+permit: P.Permit,+now: Nat,
    +ht: {Nat.is_eq(id,target) == True{} : Bool},
    hp: {P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    hd: {Nat.is_ge(now,deadline(permit)) == True{} : Bool}) -> {lookup(C.expire_all(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),now),target) == None{} : Maybe<&2,P.Permit>}:
  due : {Nat.is_ge(now,dl) == True{} : Bool} = scheduled_head_due(id,native,r,st,dl,rest,target,permit,now,ht,hp,hd)
  switched : {lookup(C.expire_all(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),now),target) == lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),target) : Maybe<&2,P.Permit>} = Equal.cong(Bool,Maybe<&2,P.Permit>,x => lookup(C.expire_all(rest,C.expire_one(s,id,native,x),now),target),Nat.is_ge(now,dl),True{},due)
  moved : {lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),target) == lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),id) : Maybe<&2,P.Permit>} = Equal.cong(Nat,Maybe<&2,P.Permit>,x => lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),x),target,id,Equal.sym(Nat,id,target,N.nat_eq_true(id,target,ht)))
  Equal.trans(Maybe<&2,P.Permit>,lookup(C.expire_all(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),now),target),lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),target),None{},switched,
    Equal.trans(Maybe<&2,P.Permit>,lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),target),lookup(C.expire_all(rest,C.expire_one(s,id,native,True{}),now),id),None{},moved,R.expire_all_preserves_absent(id,rest,C.expire_one(s,id,native,True{}),now,expire_due_gone(s,id,native))))

def scheduled_clear_case(+id: Nat,+native: Nat,+r: Nat,+st: Nat,+dl: Nat,+rest: List<&2,P.Permit>,+s: C.State,+target: Nat,+permit: P.Permit,+now: Nat,
    hit: Bool, eh: {Nat.is_eq(id,target) == hit : Bool},
    hp: {P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest) == Some{permit} : Maybe<&2,P.Permit>},
    hd: {Nat.is_ge(now,deadline(permit)) == True{} : Bool},
    ih: {P.find_permit(target,rest) == Some{permit} : Maybe<&2,P.Permit>} -> {Nat.is_ge(now,deadline(permit)) == True{} : Bool} -> {lookup(C.expire_all(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),now),target) == None{} : Maybe<&2,P.Permit>}) -> {lookup(C.expire_all(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),now),target) == None{} : Maybe<&2,P.Permit>}:
  match hit:
    case True{}: scheduled_head_clear(id,native,r,st,dl,rest,s,target,permit,now,eh,hp,hd)
    case False{}:
      tail : {P.find_permit(target,rest) == Some{permit} : Maybe<&2,P.Permit>} = Equal.trans(Maybe<&2,P.Permit>,P.find_permit(target,rest),P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest),Some{permit},Equal.sym(Maybe<&2,P.Permit>,P.find_permit(target,P.Permit{id,native,r,st,dl} <> rest),P.find_permit(target,rest),lookup_retained(id,native,r,st,dl,rest,target,False{},eh)),hp)
      ih(tail)(hd)

def scheduled_clear(+ps: List<&2,P.Permit>,+s: C.State,+target: Nat,+permit: P.Permit,+now: Nat,
    hp: {P.find_permit(target,ps) == Some{permit} : Maybe<&2,P.Permit>},
    hd: {Nat.is_ge(now,deadline(permit)) == True{} : Bool}) -> {lookup(C.expire_all(ps,s,now),target) == None{} : Maybe<&2,P.Permit>}:
  match ps:
    case Nil{}: Empty.absurd({lookup(s,target) == None{} : Maybe<&2,P.Permit>},H.none_some_empty(permit,hp))
    case P.Permit{+id,+native,+r,+st,+dl} <> +rest:
      scheduled_clear_case(id,native,r,st,dl,rest,s,target,permit,now,Nat.is_eq(id,target),{==},hp,hd,
        p => h => scheduled_clear(rest,C.expire_one(s,id,native,Nat.is_ge(now,dl)),target,permit,now,p,h))

def expire_deadline_case(+s: C.State,+now: Nat,+target: Nat,+permit: P.Permit,ge: Bool,
    ege: {Nat.is_ge(now,deadline(permit)) == ge : Bool},
    +hp: {lookup(C.expire_now(s,now),target) == Some{permit} : Maybe<&2,P.Permit>}) -> {Nat.is_lt(now,deadline(permit)) == True{} : Bool}:
  match ge:
    case False{}: N.nat_ge_false_lt(now,deadline(permit),ege)
    case True{}:
      original : {lookup(s,target) == Some{permit} : Maybe<&2,P.Permit>} = expire_all_survivor(C.get_pending(C.get_permit(s)),s,now,target,permit,hp)
      absent : {lookup(C.expire_now(s,now),target) == None{} : Maybe<&2,P.Permit>} = scheduled_clear(C.get_pending(C.get_permit(s)),s,target,permit,now,original,ege)
      Empty.absurd({Nat.is_lt(now,deadline(permit)) == True{} : Bool},H.none_some_empty(permit,Equal.trans(Maybe<&2,P.Permit>,None{},lookup(C.expire_now(s,now),target),Some{permit},Equal.sym(Maybe<&2,P.Permit>,lookup(C.expire_now(s,now),target),None{},absent),hp)))

def expire_now_deadline(+s: C.State,+now: Nat,+target: Nat,+permit: P.Permit,
    hp: {P.find_permit(target,C.get_pending(C.get_permit(C.expire_now(s,now)))) == Some{permit} : Maybe<&2,P.Permit>}) -> {Nat.is_lt(now,deadline(permit)) == True{} : Bool}:
  expire_deadline_case(s,now,target,permit,Nat.is_ge(now,deadline(permit)),{==},hp)
