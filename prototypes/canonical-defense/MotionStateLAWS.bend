# Owner-approved game-motion laws (2026-10-05 conversation).
# These quantify over actual game functions, not a separate motion model.
# Discrete displacement is bounded; real-time interpolation is outside this scope.
import Base
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefensePresentation.bend as Display
import ../../packages/agent-flow-bend/Canonical.bend as C

# Updating the observed business stage cannot teleport an existing actor.
law observation_preserves_position:
  for +actor: V.Actor
  for item: C.Work
  for layout: U32
  for at: Nat
  {Motion.point(Motion.changed(actor,item,layout,at)) == Motion.point(actor) : Map.Point}

# Stage observation cannot silently replace actor identity.
law observation_preserves_identity:
  for +actor: V.Actor
  for item: C.Work
  for layout: U32
  for at: Nat
  {Motion.actor_key(Motion.changed(actor,item,layout,at)) == Motion.actor_key(actor) : V.WorkIdentity}

# A blocked actor remains exactly unchanged, including its outstanding path.
law blocked_actor_unchanged:
  for +actor: V.Actor
  {Motion.move_when(False{},actor) == actor : V.Actor}

# Consuming a waypoint cannot turn one work into another.
law advance_preserves_identity:
  for +actor: V.Actor
  for path: List<&2,V.Waypoint>
  {Motion.actor_key(Motion.advance(actor,path)) == Motion.actor_key(actor) : V.WorkIdentity}

# Physical travel cannot invent a review or delivery outcome.
law advance_preserves_outcome:
  for +actor: V.Actor
  for path: List<&2,V.Waypoint>
  {Display.outcome(Motion.advance(actor,path)) == Display.outcome(actor) : U32}

