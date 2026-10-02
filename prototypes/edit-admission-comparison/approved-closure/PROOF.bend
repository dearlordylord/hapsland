import Base
import ./LAWS.bend as Laws
import ./spec.bend as D
import ./helpers.bend as H
import ../core.bend as C
import ../../../packages/agent-flow-bend/Admission.bend as P
import ../approved/math/PROOF.bend as N

# Only the approved pending-PRE → successful closure → delayed POST law.
def Laws.delayed_post_after_close(state,history,reached,tool,closed_at,post_at,round_active,admission_active,pending_pre,valid_close,pre_before_close,post_after_close):
  match state:
    case C.State{P.AdmissionState{+p,+l,+pr,False{},+f,+next,+ps},+done,+n,+r,+a,+spent}:
      Empty.absurd({D.outcome(C.post(C.Current{},C.close(C.State{P.AdmissionState{p,l,pr,False{},f,next,ps},done,n,r,a,spent},closed_at),p,l,tool,post_at)) == D.Outcome{n,r,False{}} : D.Outcome},N.false_true_empty(admission_active))
    case C.State{P.AdmissionState{+p,+l,+pr,True{},+f,+next,+ps},+done,+n,+r,+a,+spent}:
      %Equal.sym(P.AdmissionResult,P.step(P.AdmissionState{p,l,pr,True{},f,next,ps},p,l,P.CloseRound{closed_at}),
        P.apply_event(P.AdmissionState{p,l,pr,True{},f,next,ps},P.CloseRound{closed_at}),H.self_step(P.AdmissionState{p,l,pr,True{},f,next,ps},P.CloseRound{closed_at})) :
        {D.outcome(C.post(C.Current{},C.close_result(C.State{P.AdmissionState{p,l,pr,True{},f,next,ps},done,n,r,a,spent},_),p,l,tool,post_at)) == D.Outcome{n,r,False{}} : D.Outcome}
      %Equal.sym(Bool,Nat.is_ge(closed_at,f),True{},valid_close) :
        {D.outcome(C.post(C.Current{},C.close_result(C.State{P.AdmissionState{p,l,pr,True{},f,next,ps},done,n,r,a,spent},
          P.close_round.time(P.AdmissionState{p,l,pr,True{},f,next,ps},p,l,pr,next,closed_at,_)),p,l,tool,post_at)) == D.Outcome{n,r,False{}} : D.Outcome}
      +before = {C.State{P.AdmissionState{p,l,pr,True{},f,next,ps},done,n,r,a,spent} : C.State}
      +remembered = C.remember_permits(ps,before)
      Equal.trans(D.Outcome,
        D.outcome(C.post(C.Current{},H.closed_state(p,l,pr,closed_at,next,C.completed(remembered),C.count(remembered),C.round(remembered),C.spent(remembered)),p,l,tool,post_at)),
        H.closed_outcome(remembered),D.Outcome{n,r,False{}},
        H.empty_post(p,l,pr,closed_at,next,C.completed(remembered),C.count(remembered),C.round(remembered),C.spent(remembered),tool,post_at),
        H.remember_permits_outcome(ps,before))
