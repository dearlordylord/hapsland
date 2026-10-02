import Base
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ../approved/math/PROOF.bend as N
import ../approved-closure/spec.bend as O
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as M

# Local domain fact isolates this slice from unrelated closure POST proof terms.
def self_step(+state: P.AdmissionState, +event: P.AdmissionEvent) ->
    {P.step(state,C.owner(state),C.lifetime(state),event) == P.apply_event(state,event) : P.AdmissionResult}:
  match state:
    case P.AdmissionState{+p,+l,+r,+a,+f,+next,+ps}:
      %Equal.sym(Bool,Nat.is_eq(p,p),True{},N.nat_eq_refl(p)) :
        {P.step.partition(P.AdmissionState{p,l,r,a,f,next,ps},p,l,event,_,Nat.is_eq(l,l)) == P.apply_event(P.AdmissionState{p,l,r,a,f,next,ps},event) : P.AdmissionResult}
      %Equal.sym(Bool,Nat.is_eq(l,l),True{},N.nat_eq_refl(l)) :
        {P.step.partition(P.AdmissionState{p,l,r,a,f,next,ps},p,l,event,True{},_) == P.apply_event(P.AdmissionState{p,l,r,a,f,next,ps},event) : P.AdmissionResult}
      {==}

# Necessary proof facts for an already created, still-live original permit.
def permit_state(p: Nat,l: Nat,+pr: Nat,f: Nat,+next: Nat,tool: Nat,start: Nat,deadline: Nat) -> P.AdmissionState:
  P.AdmissionState{p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{}}

def registered(p: Nat,l: Nat,pr: Nat,f: Nat,next: Nat,tool: Nat,start: Nat,deadline: Nat,done: List<&2,Nat>,n: Nat,r: Nat,spent: Nat) -> C.State:
  C.State{permit_state(p,l,pr,f,next,tool,start,deadline),done,n,r,False{},spent}

def strict_not_due(+now: Nat,+deadline: Nat,h: {Nat.is_lt(now,deadline) == True{} : Bool}) ->
    {Nat.is_ge(now,deadline) == False{} : Bool}:
  Equal.trans(Bool,Nat.is_ge(now,deadline),Nat.is_le(deadline,now),False{},M.is_ge_eq_is_le(now,deadline),M.not_le_of_lt(now,deadline,h))

def expire_registered(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+tool: Nat,+start: Nat,+deadline: Nat,+done: List<&2,Nat>,+n: Nat,+r: Nat,+spent: Nat,+now: Nat,
    timely: {Nat.is_lt(now,deadline) == True{} : Bool}) ->
    {C.expire_now(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),now) == registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent) : C.State}:
  %Equal.sym(Bool,Nat.is_ge(now,deadline),False{},strict_not_due(now,deadline,timely)) :
    {C.expire_one(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),next,tool,_) == registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent) : C.State}
  {==}

def registered_token(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+tool: Nat,+start: Nat,+deadline: Nat) ->
    {C.token(permit_state(p,l,pr,f,next,tool,start,deadline),tool) == next : Nat}:
  %Equal.sym(Bool,Nat.is_eq(tool,tool),True{},N.nat_eq_refl(tool)) : {C.token_pick(_,next,0n) == next : Nat}
  {==}

def remove_single(+next: Nat,+tool: Nat,+pr: Nat,+start: Nat,+deadline: Nat) ->
    {P.remove_permit(next,P.Permit{next,tool,pr,start,deadline} <> Nil{}) == Nil{} : List<&2,P.Permit>}:
  %Equal.sym(Bool,Nat.is_eq(next,next),True{},N.nat_eq_refl(next)) : {P.remove_permit.pick(P.Permit{next,tool,pr,start,deadline},Nil{},_) == Nil{} : List<&2,P.Permit>}
  {==}

def consumed_state(p: Nat,l: Nat,+pr: Nat,f: Nat,next: Nat) -> P.AdmissionState:
  P.AdmissionState{p,l,(pr + 1n : Nat),True{},f,(next + 1n : Nat),Nil{}}

def consume_registered(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+tool: Nat,+start: Nat,+deadline: Nat,+now: Nat,
    fresh: {Nat.is_gt(start,f) == True{} : Bool},
    started: {Nat.is_le(start,now) == True{} : Bool},
    timely: {Nat.is_lt(now,deadline) == True{} : Bool}) ->
    {P.step(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,P.Consume{next,tool,now}) ==
      P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}:
  %Equal.sym(P.AdmissionResult,P.step(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,P.Consume{next,tool,now}),
    P.apply_event(permit_state(p,l,pr,f,next,tool,start,deadline),P.Consume{next,tool,now}),self_step(permit_state(p,l,pr,f,next,tool,start,deadline),P.Consume{next,tool,now})) :
    { _ == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_eq(next,next),True{},N.nat_eq_refl(next)) :
    {P.consume.found(permit_state(p,l,pr,f,next,tool,start,deadline),next,tool,now,P.find_permit.pick(P.Permit{next,tool,(pr + 1n : Nat),start,deadline},None{},_)) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_eq(tool,tool),True{},N.nat_eq_refl(tool)) :
    {P.consume.tool(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{},next,tool,now,(pr + 1n : Nat),start,deadline,_) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_gt(start,f),True{},fresh) :
    {P.consume.time(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{},next,now,(pr + 1n : Nat),Bool.and(_,Bool.and(Nat.is_le(start,now),Nat.is_le(now,deadline)))) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_le(start,now),True{},started) :
    {P.consume.time(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{},next,now,(pr + 1n : Nat),Bool.and(_,Nat.is_le(now,deadline))) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_le(now,deadline),True{},M.le_of_lt(now,deadline,timely)) :
    {P.consume.time(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{},next,now,(pr + 1n : Nat),_) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(Bool,Nat.is_eq((pr + 1n : Nat),(pr + 1n : Nat)),True{},N.nat_eq_refl((pr + 1n : Nat))) :
    {P.consume.round(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,pr,False{},f,(next + 1n : Nat),P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{},next,(pr + 1n : Nat),_) == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  %Equal.sym(List<&2,P.Permit>,P.remove_permit(next,P.Permit{next,tool,(pr + 1n : Nat),start,deadline} <> Nil{}),Nil{},remove_single(next,tool,(pr + 1n : Nat),start,deadline)) :
    {P.Accepted{P.AdmissionState{p,l,(pr + 1n : Nat),True{},f,(next + 1n : Nat),_},Some{next},Some{(pr + 1n : Nat)}} == P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}} : P.AdmissionResult}
  {==}

def live_current_observation(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+tool: Nat,+start: Nat,+deadline: Nat,+done: List<&2,Nat>,+n: Nat,+r: Nat,+spent: Nat,+now: Nat,
    unseen: {C.seen(tool,done) == False{} : Bool},
    fresh: {Nat.is_gt(start,f) == True{} : Bool},
    started: {Nat.is_le(start,now) == True{} : Bool},
    timely: {Nat.is_lt(now,deadline) == True{} : Bool}) ->
    {O.outcome(C.current_post(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),p,l,tool,now,C.seen(tool,done))) ==
      O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}} : O.Outcome}:
  %Equal.sym(Bool,C.seen(tool,done),False{},unseen) :
    {O.outcome(C.current_post(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),p,l,tool,now,_)) == O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}} : O.Outcome}
  %Equal.sym(Nat,C.token(permit_state(p,l,pr,f,next,tool,start,deadline),tool),next,registered_token(p,l,pr,f,next,tool,start,deadline)) :
    {O.outcome(C.current_consume(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),tool,
      P.step(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,P.Consume{_,tool,now}))) == O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}} : O.Outcome}
  %Equal.sym(P.AdmissionResult,P.step(permit_state(p,l,pr,f,next,tool,start,deadline),p,l,P.Consume{next,tool,now}),
    P.Accepted{consumed_state(p,l,pr,f,next),Some{next},Some{(pr + 1n : Nat)}},consume_registered(p,l,pr,f,next,tool,start,deadline,now,fresh,started,timely)) :
    {O.outcome(C.current_consume(registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent),tool,_)) == O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}} : O.Outcome}
  {==}
