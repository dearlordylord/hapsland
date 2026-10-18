# Owner-approved preview laws at the actual world and scene boundary.
import Base
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ./DefenseTowerPreview.bend as P
import ./DefensePreviewMarks.bend as Marks
import ./DefenseTowerFire.bend as Fire
import ./DefensePreview.bend as Placement
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./Font.bend as F
import ../../packages/monkey-business-bend/Callbacks.bend as CB

law eligible_callback_step:
  for +target: CB.Target
  for at: Nat
  for action: Driver.Action
  for completion: Maybe<&2, Output.Capture>
  for +order: Nat
  for +tail: List<&2, CB.Original>
  for +world: M.World
  for +tower: M.Tower
  {
    P.targets(
      CB.Original{CB.Fact{target, at, action, completion}, CB.Queued{}, order} <> tail,
      world,
      tower
    )
    == P.keep_target(
      Fire.eligible(target, Fire.due(order, world), world, tower, 0n),
      target,
      P.targets(tail, world, tower)
    )
    : List<&2, CB.Target>
  }
law include_eligible_target:
  for target: CB.Target
  for tail: List<&2, CB.Target>
  {P.keep_target(True{}, target, tail) == target <> tail : List<&2, CB.Target>}
law exclude_ineligible_target:
  for target: CB.Target
  for +tail: List<&2, CB.Target>
  {P.keep_target(False{}, target, tail) == tail : List<&2, CB.Target>}
law no_originals_no_targets:
  for world: M.World
  for tower: M.Tower
  {P.targets([], world, tower) == [] : List<&2, CB.Target>}
law held_not_previewed:
  for fact: CB.Fact
  for order: Nat
  for +tail: List<&2, CB.Original>
  for +world: M.World
  for +tower: M.Tower
  {
    P.targets(CB.Original{fact, CB.Held{}, order} <> tail, world, tower)
    == P.targets(tail, world, tower)
    : List<&2, CB.Target>
  }
law dropped_not_previewed:
  for fact: CB.Fact
  for order: Nat
  for +tail: List<&2, CB.Original>
  for +world: M.World
  for +tower: M.Tower
  {
    P.targets(CB.Original{fact, CB.Dropped{}, order} <> tail, world, tower)
    == P.targets(tail, world, tower)
    : List<&2, CB.Target>
  }
