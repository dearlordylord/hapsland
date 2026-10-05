# Owner-approved game presentation laws; not simulator/product laws.
import Base
import ./DefensePresentation.bend as P
import ./DefenseMotionTypes.bend as V

# Movement cannot erase causal history.
law movement_preserves_parent:
  for +actor: V.Actor
  for x: U32
  for y: U32
  for phase: U32
  for steps: List<&2,V.Waypoint>
  for shown: Nat
  {P.parent(P.repose(actor,x,y,phase,steps,shown)) == P.parent(actor) : List<&2,V.WorkIdentity>}
# Released movement does not wait on a historical parent again.
law movement_releases_parent_wait:
  for actor: V.Actor
  for x: U32
  for y: U32
  for phase: U32
  for steps: List<&2,V.Waypoint>
  for shown: Nat
  {P.pending_parent(P.repose(actor,x,y,phase,steps,shown)) == [] : List<&2,V.WorkIdentity>}
# A body with any remaining waypoint cannot receive a terminal appearance.
law travelling_not_terminal:
  for actor: V.Actor
  for x: U32
  for y: U32
  for phase: U32
  for head: V.Waypoint
  for tail: List<&2,V.Waypoint>
  for shown: Nat
  {P.terminal_display(P.repose(actor,x,y,phase,head <> tail,shown)) == False{} : Bool}
# Completion cannot remove unfinished travel.
law retain_travel:
  for handed: Bool
  for timer: Bool
  {P.keep(True{},handed,timer) == True{} : Bool}
# A completed handoff has no lingering body regardless of the timer.
law completed_handoff_has_no_body:
  for timer: Bool
  {P.keep(False{},True{},timer) == False{} : Bool}
# Every failed movement eligibility has a specific reason, including queues.
law parent_wait_reason:
  for space: Bool
  for travel: Bool
  for retained: Bool
  {P.wait_kind(False{},space,travel,retained) == 1 : U32}
law spatial_wait_reason:
  for travel: Bool
  for retained: Bool
  {P.wait_kind(True{},False{},travel,retained) == 2 : U32}
law retained_record_reason:
  {P.wait_kind(True{},True{},False{},True{}) == 3 : U32}
law playback_reason:
  for retained: Bool
  {P.wait_kind(True{},True{},True{},retained) == 0 : U32}

# Movement cannot fabricate Clear or delivery, or alter any other witnessed result.
law movement_preserves_outcome:
  for +actor: V.Actor
  for x: U32
  for y: U32
  for phase: U32
  for steps: List<&2,V.Waypoint>
  for shown: Nat
  {P.outcome(P.repose(actor,x,y,phase,steps,shown)) == P.outcome(actor) : U32}

# Retirement cannot erase witnessed success or mistake an individual send for it.
law retirement_preserves_ack:
  {P.retirement_outcome(3) == 3 : U32}
law retirement_preserves_clear:
  {P.retirement_outcome(2) == 2 : U32}
law certain_send_retirement_is_neutral:
  {P.retirement_outcome(10) == 0 : U32}
law uncertain_send_retirement_is_neutral:
  {P.retirement_outcome(11) == 0 : U32}
