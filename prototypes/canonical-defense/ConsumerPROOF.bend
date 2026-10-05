# Proposals, exact universal quantifiers in ConsumerLAWS; owner acceptance pending.
import Base
import ./ConsumerLAWS.bend as Laws
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseConsumer.bend as Consumer
import ./WorldPreservation.bend as P
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def Laws.damage_preserves_engine(world):
  Equal.cong(List<&2,T.State>,T.State,Consumer.boxed,
    M.engine_box(H.damage(world)),M.engine_box(world),P.damage_box(world))
def Laws.pointer_preserves_engine(world,x,y):
  Equal.cong(List<&2,T.State>,T.State,Consumer.boxed,
    M.engine_box(H.move(world,x,y)),M.engine_box(world),P.pointer_box(world,x,y))
