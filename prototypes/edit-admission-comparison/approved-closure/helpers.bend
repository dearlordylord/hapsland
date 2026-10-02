import Base
import ../core.bend as C
import ./spec.bend as D
import ../../../packages/agent-flow-bend/Admission.bend as P
import ../approved/math/PROOF.bend as N

# These are necessary closure bookkeeping and empty-authority facts only.
def self_step(+state: P.AdmissionState, +event: P.AdmissionEvent) ->
    {P.step(state,C.owner(state),C.lifetime(state),event) == P.apply_event(state,event) : P.AdmissionResult}:
  match state:
    case P.AdmissionState{+p,+l,+r,+a,+f,+next,+ps}:
      %Equal.sym(Bool,Nat.is_eq(p,p),True{},N.nat_eq_refl(p)) :
        {P.step.partition(P.AdmissionState{p,l,r,a,f,next,ps},p,l,event,_,Nat.is_eq(l,l)) == P.apply_event(P.AdmissionState{p,l,r,a,f,next,ps},event) : P.AdmissionResult}
      %Equal.sym(Bool,Nat.is_eq(l,l),True{},N.nat_eq_refl(l)) :
        {P.step.partition(P.AdmissionState{p,l,r,a,f,next,ps},p,l,event,True{},_) == P.apply_event(P.AdmissionState{p,l,r,a,f,next,ps},event) : P.AdmissionResult}
      {==}

def closed_state(p: Nat,l: Nat,pr: Nat,f: Nat,next: Nat,done: List<&2,Nat>,n: Nat,r: Nat,spent: Nat) -> C.State:
  C.State{P.AdmissionState{p,l,pr,False{},f,next,Nil{}},done,n,r,False{},spent}

def empty_post_duplicate(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+done: List<&2,Nat>,+n: Nat,+r: Nat,+spent: Nat,+tool: Nat,+now: Nat,duplicate: Bool) ->
    {D.outcome(C.current_post(closed_state(p,l,pr,f,next,done,n,r,spent),p,l,tool,now,duplicate)) == D.Outcome{n,r,False{}} : D.Outcome}:
  match duplicate:
    case True{}: {==}
    case False{}:
      %Equal.sym(P.AdmissionResult,P.step(P.AdmissionState{p,l,pr,False{},f,next,Nil{}},p,l,P.Consume{0n,tool,now}),
        P.apply_event(P.AdmissionState{p,l,pr,False{},f,next,Nil{}},P.Consume{0n,tool,now}),
        self_step(P.AdmissionState{p,l,pr,False{},f,next,Nil{}},P.Consume{0n,tool,now})) :
        {D.outcome(C.current_consume(closed_state(p,l,pr,f,next,done,n,r,spent),tool,_)) == D.Outcome{n,r,False{}} : D.Outcome}
      {==}

def empty_post(+p: Nat,+l: Nat,+pr: Nat,+f: Nat,+next: Nat,+done: List<&2,Nat>,+n: Nat,+r: Nat,+spent: Nat,+tool: Nat,+now: Nat) ->
    {D.outcome(C.post(C.Current{},closed_state(p,l,pr,f,next,done,n,r,spent),p,l,tool,now)) == D.Outcome{n,r,False{}} : D.Outcome}:
  empty_post_duplicate(p,l,pr,f,next,done,n,r,spent,tool,now,C.seen(tool,done))

def closed_outcome(+state: C.State) -> D.Outcome:
  D.Outcome{C.count(state),C.round(state),False{}}

def remember_outcome(+state: C.State,tool: Nat) ->
    {closed_outcome(C.remember(state,tool)) == closed_outcome(state) : D.Outcome}:
  match state:
    case C.State{_,_,_,_,_,_}: {==}

def remember_permits_outcome(ps: List<&2,P.Permit>,+state: C.State) ->
    {closed_outcome(C.remember_permits(ps,state)) == closed_outcome(state) : D.Outcome}:
  match ps:
    case Nil{}: {==}
    case P.Permit{_,+tool,_,_,_} <> rest:
      Equal.trans(D.Outcome,closed_outcome(C.remember_permits(rest,C.remember(state,tool))),closed_outcome(C.remember(state,tool)),closed_outcome(state),
        remember_permits_outcome(rest,C.remember(state,tool)),remember_outcome(state,tool))
