# Universal pure presentation decisions; IO/event wiring needs regression checks.
import Base
import ./PresentationLAWS.bend as Laws
import ./DefenseMotionTypes.bend as V

def Laws.movement_preserves_parent(actor,x,y,phase,steps,shown):
  match actor:
    case V.Actor{k,f,l,ox,oy,op,seen,old,t,parent,at,cause,released}: {==}
def Laws.movement_releases_parent_wait(actor,x,y,phase,steps,shown):
  match actor:
    case V.Actor{k,f,l,ox,oy,op,seen,old,t,parent,at,cause,released}: {==}
def Laws.travelling_not_terminal(actor,x,y,phase,head,tail,shown):
  match actor:
    case V.Actor{k,f,l,ox,oy,op,seen,old,t,parent,at,cause,released}: {==}
def Laws.retain_travel(handed,timer): {==}
def Laws.completed_handoff_has_no_body(timer): {==}
def Laws.parent_wait_reason(space,travel,retained): {==}
def Laws.spatial_wait_reason(travel,retained): {==}
def Laws.retained_record_reason(): {==}
def Laws.playback_reason(retained): {==}

def Laws.movement_preserves_outcome(actor,x,y,phase,steps,shown):
  match actor:
    case V.Actor{k,f,l,ox,oy,op,seen,old,t,parent,at,cause,released}: {==}

def Laws.retirement_preserves_ack(): {==}
def Laws.retirement_preserves_clear(): {==}
def Laws.certain_send_retirement_is_neutral(): {==}
def Laws.uncertain_send_retirement_is_neutral(): {==}
