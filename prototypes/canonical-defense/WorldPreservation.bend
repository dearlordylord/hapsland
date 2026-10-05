# Structural lemmas over every World, including an empty retained-state box.
# Wide engine/canonical projections follow by congruence, without extra premises.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def damage_box(world: M.World) -> {M.engine_box(H.damage(world)) == M.engine_box(world) : List<&2,T.State>}:
  match world:
    case M.World{_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_}: {==}

def pointer_box(world: M.World, x: U32, y: U32) -> {M.engine_box(H.move(world,x,y)) == M.engine_box(world) : List<&2,T.State>}:
  match world:
    case M.World{_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_}: {==}
