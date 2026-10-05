# Read-only game history descriptions, shared by the renderer and Host regressions.
import Base
import ./DefensePresentation.bend as Display
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V

def phase_color(phase: U32) -> U32:
  match phase:
    case 0: 15124059
    case 1: 65483
    case 2: 7449343
    case 3: 9756671
    case 4: 16754253
    case _: 15758447

def terminal_name(cause: U32) -> String:
  match cause:
    case 2: "CLEAR"
    case 3: "DELIVERED"
    case 4: "UNAVAILABLE"
    case 5: "PREP REFUSED"
    case 6: "HANDED OFF"
    case 7: "TIMEOUT"
    case 8: "INTERRUPTED"
    case 9: "NOT SENT"
    case _: "RETIRED"
def identity_text(identity: V.WorkIdentity) -> String:
  match identity:
    case V.WorkIdentity{p,l,r,o}: Nat.show(p) ++ "/" ++ Nat.show(l) ++ "/" ++ Nat.show(r) ++ "/" ++ Nat.show(o)
def terminal_short(cause: U32) -> String:
  match cause:
    case 2: "CL"
    case 3: "DL"
    case 4: "UN"
    case 5: "PR"
    case 6: "HO"
    case 7: "TO"
    case 8: "IN"
    case 9: "NS"
    case _: "RT"
def predecessor_text(items: List<&2,V.WorkIdentity>) -> String:
  match items:
    case Nil{}: "NONE"
    case first <> _: identity_text(first)
def submission_text(cause: U32) -> String:
  match cause:
    case 10: "SENT"
    case 11: "SEND UNCERTAIN"
    case _: "NO CONFIRMED SEND"
def wait_text(kind: U32,+actor: V.Actor,all: List<&2,V.Actor>) -> String:
  match kind:
    case 0: "HISTORY PLAYBACK"
    case 1: "WAIT PARENT " ++ predecessor_text(Display.parent(actor))
    case 2: "VISUAL QUEUE " ++ predecessor_text(Motion.spatial_blocker(actor,all))
    case 3: "RETAINED RECORD / " ++ submission_text(Motion.outcome(actor))
    case _: "END CUE / " ++ terminal_name(Motion.outcome(actor))
def body_wait(kind: U32) -> String:
  match kind:
    case 1: "WAIT"
    case 2: "Q"
    case 3: "STORED"
    case _: ""
def body_color(+actor: V.Actor) -> U32:
  Bool.pick(U32,Display.terminal_display(actor),10066329,phase_color(Motion.visible_phase(actor)))
def result_text(+actor: V.Actor) -> String:
  Bool.pick(String,(Motion.terminal(actor) > 0 : U32),"RESULT " ++ terminal_name(Motion.outcome(actor)),
    Bool.pick(String,U32.is_eq(Motion.outcome(actor),10),"ADVICE SENT / RECORD RETAINED",
      Bool.pick(String,U32.is_eq(Motion.outcome(actor),11),"SEND UNCERTAIN / RECORD RETAINED","BODY HISTORY / ENGINE ABOVE")))
def same_parent(owner: V.WorkIdentity,parents: List<&2,V.WorkIdentity>) -> Bool:
  match parents:
    case parent <> _: Motion.same(owner,parent)
    case _: False{}
def fork_units(+owner: V.WorkIdentity,actors: List<&2,V.Actor>) -> U32:
  match actors:
    case Nil{}: 0
    case +actor <> rest:
      (Bool.to_u32(same_parent(owner,Display.parent(actor)) && (Motion.observed_phase(actor) >= 3 : U32)) + fork_units(owner,rest) : U32)
def fork_text(parents: List<&2,V.WorkIdentity>,actors: List<&2,V.Actor>) -> String:
  match parents:
    case owner <> _: "PREP UNITS IN PLAYBACK " ++ U32.show(fork_units(owner,actors))
    case _: "EDIT STARTS SOURCE PREPARATION"

# Preparation owns the fork; review children point back to that preparation.
def fork_phase(phase: U32,+actor: V.Actor,actors: List<&2,V.Actor>) -> String:
  match phase:
    case 0: "SOURCE -> PREPARATION"
    case 1: "SOURCE -> PREPARATION"
    case 2: fork_text([Motion.actor_key(actor)],actors)
    case _: fork_text(Display.parent(actor),actors)
def fork_text_for(+actor: V.Actor,actors: List<&2,V.Actor>) -> String:
  fork_phase(Motion.observed_phase(actor),actor,actors)
