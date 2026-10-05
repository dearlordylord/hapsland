# Proof scope is exactly LAWS: two concrete pressure boundaries and core preservation.
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
  Equal.cong(List<&2,T.State>,C.State,M.core_box,
    M.engine_box(H.damage(world)),M.engine_box(world),P.damage_box(world))
