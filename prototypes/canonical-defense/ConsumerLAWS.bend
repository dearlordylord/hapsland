# Candidate proposals for owner review under #176, not accepted product laws.
# Quantifiers: every game World and every U32 pointer coordinate; no premises.
# Excludes combat or pointer movement mutating any retained shared-engine state.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
law damage_preserves_engine:
  for world: M.World
  {M.engine(H.damage(world)) == M.engine(world) : T.State}
law pointer_preserves_engine:
  for world: M.World
  for x: U32
  for y: U32
  {M.engine(H.move(world,x,y)) == M.engine(world) : T.State}
