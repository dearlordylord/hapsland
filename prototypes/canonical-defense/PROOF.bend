# Proof scope is exactly LAWS: pressure boundaries, core preservation and fixed investment.
import Base
import ./LAWS.bend as Laws
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./WorldPreservation.bend as P
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/agent-flow-bend/Canonical.bend as C

def Laws.pressure_boundary(): {==}
def Laws.pressure_scales(): {==}
def Laws.damage_preserves_core(world):
  Equal.cong(List<&2, T.State>, C.State, M.core_box,
    M.engine_box(H.damage(world)), M.engine_box(world), P.damage_box(world))

def Laws.consumed_preserves_gold(world, advanced):
  match world advanced:
    case M.World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _} T.Advanced{_, _, _}: {==}
def Laws.certain_submission_counted(sequence, time, advice, token, before, after, details): {==}
def Laws.uncertain_submission_not_counted(
  sequence,
  time,
  advice,
  token,
  before,
  after,
  outputs,
  details
): {==}
def Laws.ignored_submission_not_counted(sequence, time, advice, token, before, after, details): {==}
def Laws.ignored_clear_not_counted(
  sequence,
  time,
  partition,
  lifetime,
  round,
  operation,
  request,
  before,
  after,
  details
): {==}
def Laws.disabled_stop_preserves_world(world): {==}
def Laws.absent_stop_activity_preserves_world(world, at): {==}
def Laws.defeated_upgrade_preserves_world(world): {==}
def Laws.upgrade_checks_life(world): {==}
def Laws.defeated_lab_upgrade_preserves_world(world, index): {==}
def Laws.defeated_placement_refused(known, valid, funded, site, gain): {==}
def Laws.unknown_placement_refused(valid, funded, site, gain): {==}
