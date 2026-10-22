# Owner-approved preview laws at the actual world and scene boundary.
import Base
import ./DefenseMotionTypes.bend as V
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

law preview_automatic_target:
  for +world: M.World
  for +tower: M.Tower
  {P.next_when(True{}, world, tower) == Fire.target(world, tower, 0n) : Maybe<&2, CB.Target>}
law cooldown_has_no_instant_target:
  for world: M.World
  for tower: M.Tower
  {P.next_when(False{}, world, tower) == None{} : Maybe<&2, CB.Target>}
law exact_callback_choice:
  for +target: CB.Target
  for +other: CB.Target
  {P.chosen(target, Some{other}) == CB.target_equal(target, other) : Bool}
law no_choice_without_callback:
  for target: CB.Target
  {P.chosen(target, None{}) == False{} : Bool}
law key_scope:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for +o: Nat
  {P.key(CB.Owner{p, l, r, o}) == V.WorkIdentity{p, l, r, o} : V.WorkIdentity}
law finish_capture:
  for +owner: CB.Owner
  for group: Nat
  for round: Nat
  for attempt: Nat
  for token: Nat
  for +ids: List<&2, Nat>
  for +order: Nat
  for +selected: Bool
  {
    P.candidate(
      CB.Target{owner, CB.FinishTerminal{group, round, attempt, token, ids}, order},
      selected
    )
    == Marks.Target{P.key(owner), Some{ids}, order, selected}
    : Marks.Target
  }
law jev_capture:
  for +owner: CB.Owner
  for request: Nat
  for +order: Nat
  for +selected: Bool
  {
    P.candidate(CB.Target{owner, CB.ReviewServiceRequestSettled{request}, order}, selected)
    == Marks.Target{P.key(owner), None{}, order, selected}
    : Marks.Target
  }
law preparation_capture:
  for +owner: CB.Owner
  for +order: Nat
  for +selected: Bool
  {
    P.candidate(CB.Target{owner, CB.PreparationCompleted{}, order}, selected)
    == Marks.Target{P.key(owner), None{}, order, selected}
    : Marks.Target
  }
law output_capture:
  for +owner: CB.Owner
  for advice: Nat
  for token: Nat
  for +order: Nat
  for +selected: Bool
  {
    P.candidate(CB.Target{owner, CB.OutputTerminal{advice, token}, order}, selected)
    == Marks.Target{P.key(owner), None{}, order, selected}
    : Marks.Target
  }
