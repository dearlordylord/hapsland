# Finite actual-Lab traces encoded by the existing generated owner codecs.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseConsumerCodec.bend as Codec
import ./DefenseNumericOutput.bend as NumericOutput
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def receipt_world(receipt: Lab.Receipt) -> M.World:
  match receipt:
    case Lab.Receipt{value,_,_}: value
def value(worlds: List<&2,M.World>) -> M.World:
  match worlds:
    case head <> _: head
    case Nil{}: H.initial()
def event_count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_,count,_,_,_,_,_}: count
def count(world: M.World) -> Nat: event_count(Lab.engine_observation(world))
def scenario(id: U32) -> Lab.Scenario:
  Lab.Scenario{400n,80n,40n,True{},Bool.not(U32.is_eq(id,6)),Bool.pick(U32,(id >= 3 : U32) && (id <= 5 : U32),2,1),1,60000}
def change(service: Bool,relay: Bool,repair: Bool,world: M.World) -> M.World:
  match service relay repair:
    case True{} _ _: receipt_world(Lab.apply(world,Lab.Build{424,392,0}))
    case _ True{} _: receipt_world(Lab.apply(world,Lab.Build{152,392,1}))
    case _ _ True{}: receipt_world(Lab.apply(world,Lab.Build{424,232,2}))
    case _ _ _: world
def intervention(+world: M.World,id: U32,tick: U32) -> M.World:
  change((U32.is_eq(id,1) && U32.is_eq(tick,0)) || (U32.is_eq(id,2) && U32.is_eq(tick,10)),
    (U32.is_eq(id,4) && U32.is_eq(tick,0)) || (U32.is_eq(id,5) && U32.is_eq(tick,24)),
    U32.is_eq(id,6) && U32.is_eq(tick,20),world)
def publish_tick(id: U32,tick: U32,+before: List<&2,M.World>,+changed: List<&2,M.World>,observed: H.TickObserved,
    rest: List<&2,M.World> -> IO(Unit)) -> IO(Unit):
  match observed:
    case H.TickObserved{+after,+frames,+physical}:
      IO.bind(Unit,Unit,NumericOutput.write(U32.to_nat(id) <> U32.to_nat(tick) <> 128n <> count(after) <>
        Codec.defensemodel_world([value(before),value(changed),after],Codec.nativeruntypes_frame(frames,Codec.nativeruntypes_physicaldelivery(physical,Nil{})))),
        _ => rest([after]))
def advance_tick(id: U32,tick: U32,+worlds: List<&2,M.World>,+changed: List<&2,M.World>,rest: List<&2,M.World> -> IO(Unit)) -> IO(Unit):
  publish_tick(id,tick,worlds,changed,Lab.tick_bounded(value(changed),Nat.sub(128n,count(value(changed)))),rest)
def trace(fuel: Nat,+id: U32,+tick: U32,+worlds: List<&2,M.World>) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit,Unit{})
    case 1n+n:
      advance_tick(id,tick,worlds,[intervention(value(worlds),id,tick)],next => trace(n,id,(tick + 1 : U32),next))
def cases(ids: List<&2,U32>) -> IO(Unit):
  match ids:
    case Nil{}: IO.pure(Unit,Unit{})
    case +id <> rest:
      IO.bind(Unit,Unit,trace(40n,id,0,[Lab.create_scenario(scenario(id),152n,160,0)]),_ => cases(rest))
def main() -> IO(Unit):
  cases([0,1,2,3,4,5,6])
