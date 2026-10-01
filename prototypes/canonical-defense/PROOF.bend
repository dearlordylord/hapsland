# Proof scope is exactly LAWS: five concrete balance boundaries and core preservation.
import Base
import ./LAWS.bend as Laws
import ./DefenseModel.bend as M

def Laws.risk_saturates(): {==}
def Laws.risk_diminishes(): {==}
def Laws.risk_never_crosses_floor(): {==}
def Laws.pressure_boundary(): {==}
def Laws.pressure_scales(): {==}
def Laws.damage_preserves_core(world):
  match world:
    case M.World{_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_}: {==}
