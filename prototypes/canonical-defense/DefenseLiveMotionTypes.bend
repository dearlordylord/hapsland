import Base
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ./DefenseMotionTypes.bend as V

# Combat metadata for actual Motion actors and Rules fragments.
# Pose is projected from that geometry; a shot changes cadence without moving it.
type Beam is Data:
  Beam{fromX: U32, fromY: U32, toX: U32, toY: U32, before: Nat, after: Nat, ttl: U32}
type Mob is Data:
  Mob{
    target: CB.Target,
    x: U32,
    y: U32,
    path: List<&2, V.Waypoint>,
    due: Nat,
    flash: U32,
    fromX: U32,
    fromY: U32,
    before: Nat,
    after: Nat,
    at: Nat,
    hitX: U32,
    hitY: U32,
    beams: List<&2, Beam>,
    boost: Nat
  }
