import ./DefenseLiveMotionTypes.bend as LiveTypes
# User contract: the visible monster is the target; a hit changes time, not position.
import Base
import ./DefenseMotionTypes.bend as V
import ./DefenseLiveMotion.bend as Live
import ./DefenseTowerFire.bend as Fire
import ./DefenseModel.bend as M
import ./DefenseMap.bend as Map
import ../../packages/monkey-business-bend/Callbacks.bend as CB

law target_uses_visible_body:
  for +target: CB.Target
  for +world: M.World
  {Fire.target_point(target, world) == Live.position(Live.find(target, M.mobs(world))) : Map.Point}
law hit_preserves_body:
  for +target: CB.Target
  for +x: U32
  for +y: U32
  for +path: List<&2, V.Waypoint>
  for oldDue: Nat
  for oldFlash: U32
  for oldX: U32
  for oldY: U32
  for oldBefore: Nat
  for oldAfter: Nat
  for oldHitX: U32
  for oldHitY: U32
  for +beams: List<&2, LiveTypes.Beam>
  for +speed: Nat
  for +at: Nat
  for +due: Nat
  for +fromX: U32
  for +fromY: U32
  for +before: Nat
  for +after: Nat
  {
    Live.hit(
      LiveTypes.Mob{
        target,
        x,
        y,
        path,
        oldDue,
        oldFlash,
        oldX,
        oldY,
        oldBefore,
        oldAfter,
        at,
        oldHitX,
        oldHitY,
        beams,
        speed
      },
      due,
      fromX,
      fromY,
      before,
      after
    )
    == LiveTypes.Mob{
      target,
      x,
      y,
      path,
      due,
      20,
      fromX,
      fromY,
      before,
      after,
      at,
      x,
      y,
      LiveTypes.Beam{fromX, fromY, x, y, before, after, 20} <> beams,
      (speed * 2n : Nat)
    }
    : LiveTypes.Mob
  }
law exact_identity_lookup:
  for +target: CB.Target
  for +head: LiveTypes.Mob
  for +tail: List<&2, LiveTypes.Mob>
  {
    Live.find(target, head <> tail)
    == Bool.pick(
      Maybe<&2, LiveTypes.Mob>,
      CB.target_equal(target, Live.target(head)),
      Some{head},
      Live.find(target, tail)
    )
    : Maybe<&2, LiveTypes.Mob>
  }
law no_body_no_position:
  {Live.position(None{}) == Map.Point{0, 0} : Map.Point}
law positive_visible_acceleration:
  for +remaining: Nat
  {Fire.shortened(remaining) == Nat.min(remaining, Nat.max(100n, (remaining / 2n : Nat))) : Nat}
