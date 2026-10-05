# Prototype balance contracts; game assumptions, not product requirements.
import Base
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
