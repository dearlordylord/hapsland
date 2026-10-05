# Pure game presentation policy; no simulator controls or business state.
import Base
import ./DefenseMotionTypes.bend as V

def parent(actor: V.Actor) -> List<&2,V.WorkIdentity>:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,owner,_,_,_}: owner
def outcome(actor: V.Actor) -> U32:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,_,_,cause,_}: cause
def pending_parent(actor: V.Actor) -> List<&2,V.WorkIdentity>:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,_,_,owner,_,_,released}:
      Bool.pick(List<&2,V.WorkIdentity>,released,[],owner)
def repose(actor: V.Actor,x: U32,y: U32,phase: U32,steps: List<&2,V.Waypoint>,shown: Nat) -> V.Actor:
  match actor:
    case V.Actor{k,f,l,_,_,_,seen,_,t,owner,_,cause,_}:
      V.Actor{k,f,l,x,y,phase,seen,steps,t,owner,shown,cause,True{}}
def terminal_display(actor: V.Actor) -> Bool:
  match actor:
    case V.Actor{_,_,_,_,_,_,_,Nil{},t,_,_,_,_}: (t > 0 : U32)
    case _: False{}
def keep(travelling: Bool,handed_off: Bool,timer_live: Bool) -> Bool:
  match travelling handed_off:
    case True{} _: True{}
    case False{} True{}: False{}
    case False{} False{}: timer_live
# Exhaustive priority: causal wait, spatial queue, travel, retained record, end cue.
def wait_kind(parent_ready: Bool,space_ready: Bool,travelling: Bool,retained: Bool) -> U32:
  match parent_ready space_ready travelling retained:
    case False{} _ _ _: 1
    case True{} False{} _ _: 2
    case True{} True{} True{} _: 0
    case True{} True{} False{} True{}: 3
    case _ _ _ _: 4

# Record retirement removes submission status, never an acknowledged exit.
def retirement_outcome(cause: U32) -> U32:
  match cause:
    case 10: 0
    case 11: 0
    case other: other
