# Prototype balance contracts; game assumptions, not product requirements.
import Base
import ./DefenseLab.bend as Lab
import ./DefensePreview.bend as Placement
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ./DefenseEffects.bend as E
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C

law pressure_boundary:
  {H.damage_work(80) == 0 : U32}
law pressure_scales:
  {H.damage_work(240) == 400 : U32}
law damage_preserves_core:
  for world: M.World
  {M.core(H.damage(world)) == M.core(world) : C.State}

# Teaching investment is fixed; output channel must not create a reward incentive.
law consumed_preserves_gold:
  for +world: M.World
  for advanced: T.Advanced
  {M.gold(H.consumed(world, advanced)) == M.gold(world) : U32}

law certain_submission_counted:
  for sequence: Nat
  for time: Nat
  for advice: Nat
  for token: Nat
  for before: List<&2, C.State>
  for after: List<&2, C.State>
  for details: T.FrameDetails
  {
    H.individual_deliveries(
      [
        T.ProductFrame{
          sequence,
          time,
          C.SubmissionTerminal{advice, token, True{}},
          before,
          after,
          [C.EventEstablished{C.SubmissionRecorded{}}],
          None{},
          details
        }
      ]
    )
    == 1
    : U32
  }
law uncertain_submission_not_counted:
  for sequence: Nat
  for time: Nat
  for advice: Nat
  for token: Nat
  for before: List<&2, C.State>
  for after: List<&2, C.State>
  for outputs: List<&2, C.Output>
  for details: T.FrameDetails
  {
    H.individual_deliveries(
      [
        T.ProductFrame{
          sequence,
          time,
          C.SubmissionTerminal{advice, token, False{}},
          before,
          after,
          outputs,
          None{},
          details
        }
      ]
    )
    == 0
    : U32
  }
law ignored_submission_not_counted:
  for sequence: Nat
  for time: Nat
  for advice: Nat
  for token: Nat
  for before: List<&2, C.State>
  for after: List<&2, C.State>
  for details: T.FrameDetails
  {
    H.individual_deliveries(
      [
        T.ProductFrame{
          sequence,
          time,
          C.SubmissionTerminal{advice, token, True{}},
          before,
          after,
          [],
          None{},
          details
        }
      ]
    )
    == 0
    : U32
  }
law ignored_clear_not_counted:
  for sequence: Nat
  for time: Nat
  for partition: Nat
  for lifetime: Nat
  for round: Nat
  for operation: Nat
  for request: Nat
  for before: List<&2, C.State>
  for after: List<&2, C.State>
  for details: T.FrameDetails
  {
    H.observed_count(
      T.ProductFrame{
        sequence,
        time,
        C.ReviewServiceRequestSettled{
          partition,
          lifetime,
          round,
          operation,
          request,
          C.RequestClear{},
          True{}
        },
        before,
        after,
        [],
        None{},
        details
      },
      2
    )
    == 0
    : U32
  }

# A disabled caller input cannot mutate the game; absent activity cannot be invented.
law disabled_stop_preserves_world:
  for +world: M.World
  {H.request_finish_when(False{}, world) == world : M.World}
law absent_stop_activity_preserves_world:
  for +world: M.World
  for at: Nat
  {H.finish_activity(world, at, None{}) == world : M.World}

law defeated_upgrade_preserves_world:
  for +world: M.World
  {H.upgrade_when(False{}, world) == world : M.World}
law upgrade_checks_life:
  for +world: M.World
  {H.upgrade(world) == H.upgrade_when((M.hp(world) > 0 : U32), world) : M.World}
law defeated_lab_upgrade_preserves_world:
  for +world: M.World
  for index: U32
  {Lab.upgrade_alive(False{}, world, index) == Lab.Receipt{world, Lab.Dead{}, 0} : Lab.Receipt}
law defeated_placement_refused:
  for known: Bool
  for valid: Bool
  for funded: Bool
  for site: U32
  for gain: U32
  {Placement.guarded_status(0, False{}, known, valid, funded, site, gain) == 6 : U32}
law unknown_placement_refused:
  for valid: Bool
  for funded: Bool
  for site: U32
  for gain: U32
  {Placement.guarded_status(0, True{}, False{}, valid, funded, site, gain) == 7 : U32}
