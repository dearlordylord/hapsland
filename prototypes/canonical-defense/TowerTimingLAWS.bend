# Refinements of the requested truthful preview and exact-core intervention contract.
import Base
import ./DefenseLiveMotion.bend as Live
import ./DefenseTowerFire.bend as Fire
import ./DefenseTowerPreview.bend as Preview
import ./DefenseMechanics.bend as Mechanics
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/OutputScenario.bend as Output

# A tower's time is elapsed game time, never earlier than the last business event.
law intervention_time:
  for +world: M.World
  {
    Fire.delivery_at(world)
    == Nat.max(Run.clock(M.engine(world)), (U32.to_nat(M.time(world)) * 20n : Nat))
    : Nat
  }
# Transport replaces only the scheduled order/time; captured facts and payload survive.
law timed_transport:
  for +target: CB.Target
  for +captured: Nat
  for +action: Driver.Action
  for +completion: Maybe<&2, Output.Capture>
  for +old: Nat
  for +fresh: Nat
  for +at: Nat
  {
    CB.reschedule_one(
      True{},
      CB.Original{CB.Fact{target, captured, action, completion}, CB.Queued{}, old},
      at,
      fresh
    )
    == CB.Changed{
      CB.State{[CB.Original{CB.Fact{target, captured, action, completion}, CB.Queued{}, fresh}]},
      CB.Applied{},
      [old],
      [CB.Scheduled{at, fresh, action}]
    }
    : CB.Changed
  }
# An invalid time leaves the original queue untouched and reports refusal.
law invalid_time_no_change:
  for +original: CB.Original
  for at: Nat
  for fresh: Nat
  {
    CB.reschedule_one(False{}, original, at, fresh)
    == CB.Changed{CB.State{[original]}, CB.InvalidTime{}, [], []}
    : CB.Changed
  }
# The public control enforces that the requested time is not in the past.
law reschedule_time_guard:
  for +original: CB.Original
  for +at: Nat
  for +now: Nat
  for +fresh: Nat
  {
    CB.update_one(original, CB.Reschedule{at}, now, fresh)
    == CB.reschedule_one((at >= now : Nat), original, at, fresh)
    : CB.Changed
  }
# Upgrading changes level but preserves position, strength, radius base, and armed deadline.
law upgrade_keeps_armed_deadline:
  for +x: U32
  for +y: U32
  for +kind: U32
  for +level: U32
  for +power: U32
  for +radius: U32
  for +ready: U32
  {
    Mechanics.upgraded(M.Tower{x, y, kind, level, power, radius, ready})
    == M.Tower{x, y, kind, (level + 1 : U32), power, radius, ready}
    : M.Tower
  }
# Numeric feedback measures the chosen callback relative to the actual shot time.
law preview_remaining_time:
  for +target: CB.Target
  for +world: M.World
  {
    Preview.remaining(target, world)
    == Nat.sub(Live.due(world, target), Fire.delivery_at(world))
    : Nat
  }
# Upgrade quotes come from the same radius and cooldown functions used by actual shots.
law quoted_upgrade_range:
  for +tower: M.Tower
  {
    Preview.upgrade_range(tower)
    == U32.show(
      Mechanics.tower_range(tower)
    ) ++ " TO " ++ U32.show(Mechanics.tower_range(Mechanics.upgraded(tower)))
    : String
  }
law quoted_upgrade_cadence:
  for +tower: M.Tower
  {
    Preview.upgrade_cadence(tower)
    == U32.show(
      Fire.cooldown(tower)
    ) ++ " TO " ++ U32.show(Fire.cooldown(Mechanics.upgraded(tower)))
    : String
  }
