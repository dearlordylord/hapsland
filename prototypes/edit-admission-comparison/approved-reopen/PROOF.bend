import Base
import ./LAWS.bend as Laws
import ./spec.bend as D
import ./helpers.bend as H
import ../core.bend as C
import ../approved-closure/spec.bend as O
import ../../../packages/agent-flow-bend/Admission.bend as P

# Only the approved positive reopening of a completed round after actual PRE creation.
def Laws.fresh_registered_post_reopens(state,history,reached,completed_round,closed,tool,start,deadline,issued_at,post_at,unseen,fresh_start,start_before_issue,issue_window,issue_deadline,issue_before_post,start_before_post,timely_post,registered,actual_pre,created_permit):
  match state:
    case C.State{P.AdmissionState{+p,+l,+pr,a,+f,+next,ps},+done,+n,+r,active,+spent}:
      %Equal.sym(C.State,registered,D.created(C.State{P.AdmissionState{p,l,pr,a,f,next,ps},done,n,r,active,spent},tool,start,deadline),created_permit) :
        {O.outcome(C.post(C.Current{},_,p,l,tool,post_at)) == O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}} : O.Outcome}
      +ready = H.registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent)
      +timely = timely_post
      Equal.trans(O.Outcome,
        O.outcome(C.post(C.Current{},ready,p,l,tool,post_at)),
        O.outcome(C.current_post(ready,p,l,tool,post_at,C.seen(tool,C.completed(ready)))),
        O.Outcome{(n + 1n : Nat),(r + 1n : Nat),True{}},
        Equal.cong(C.State,O.Outcome,x => O.outcome(C.current_post(x,p,l,tool,post_at,C.seen(tool,C.completed(x)))),
          C.expire_now(ready,post_at),ready,H.expire_registered(p,l,pr,f,next,tool,start,deadline,done,n,r,spent,post_at,timely)),
        H.live_current_observation(p,l,pr,f,next,tool,start,deadline,done,n,r,spent,post_at,unseen,fresh_start,start_before_post,timely))
