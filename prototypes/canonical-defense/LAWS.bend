# Prototype balance contracts; game assumptions, not product requirements.
import Base
import ./DefenseEffects.bend as E
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C

law risk_saturates:
  {E.risk_reduction(60,40) == 0 : U32}
law risk_diminishes:
  {E.risk_reduction(80,20) == 16 : U32}
law risk_never_crosses_floor:
  {E.risk_reduction(64,20) == 4 : U32}
law pressure_boundary:
  {H.damage_work(80) == 0 : U32}
law pressure_scales:
  {H.damage_work(240) == 400 : U32}
law damage_preserves_core:
  for world: M.World
  {M.core(H.damage(world)) == M.core(world) : C.State}
