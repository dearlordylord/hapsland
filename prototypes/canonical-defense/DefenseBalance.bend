# Bounded paired workload simulations over actual Host.tick and Canonical.
# Offsets rotate the authored review draw only when a new review child appears.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseEffects.bend as E
import ./DefenseProjection.bend as P
import ./DefenseMap.bend as Map

type Sample is Data:
  Sample{world: M.World, ticks: U32, peakBytes: U32, peakPressure: U32, hotTicks: U32, peakPending: U32}
def rotate(items: List<&2,M.Timer>,+old: List<&2,M.Timer>,+offset: U32) -> List<&2,M.Timer>:
  match items:
    case Nil{}: []
    case M.Timer{+id,+phase,age,family,risk,+seed,boost} <> rest:
      M.Timer{id,phase,age,family,risk,Bool.pick(U32,U32.is_eq(phase,3) && Bool.not(E.has_timer(id,old)),((seed + offset) % 100 : U32),seed),boost} <> rotate(rest,old,offset)
def step(+world: M.World,offset: U32) -> M.World:
  +next = H.tick(world)
  M.with_effects(next,M.towers(next),rotate(M.timers(next),M.timers(world),offset))
def sample_state(fuel: Nat,+world: M.World,+ticks: U32,+bytes: U32,+pressure: U32,+hot: U32,+pending: U32,+offset: U32,active: Bool) -> Sample:
  match fuel active:
    case 0n _: Sample{world,ticks,bytes,pressure,hot,pending}
    case _ False{}: Sample{world,ticks,bytes,pressure,hot,pending}
    case 1n+n True{}:
      +next = step(world,offset)
      +load = H.building_pressure_bytes(next)
      sample_state(n,next,(ticks + 1 : U32),U32.max(bytes,P.ledger_bytes(next)),U32.max(pressure,load),(hot + Bool.to_u32((H.residual_damage(next) > 0 : U32)) : U32),U32.max(pending,P.count(next,5)),offset,M.active(next))
def sample(fuel: Nat,+world: M.World,ticks: U32,bytes: U32,pressure: U32,hot: U32,pending: U32,offset: U32) -> Sample:
  sample_state(fuel,world,ticks,bytes,pressure,hot,pending,offset,M.active(world))
def refiner(+world: M.World,layout: U32) -> M.World:
  match layout:
    case 0: H.build(world,424,232,1)
    case 1: H.build(world,296,232,1)
    case _: H.build(world,456,232,1)
def packager(+world: M.World,layout: U32) -> M.World:
  match layout:
    case 0: H.build(world,120,488,5)
    case 1: H.build(world,184,616,5)
    case _: H.build(world,184,416,5)
def rapid(+world: M.World,layout: U32) -> M.World:
  match layout:
    case 0: H.build(world,640,240,0)
    case 1: H.build(world,472,232,0)
    case _: H.build(world,456,232,0)
def paired_rapid(+world: M.World,+layout: U32) -> M.World:
  match layout:
    case 2: H.build(world,376,232,0)
    case _: rapid(world,layout)
def jev_support(+world: M.World,layout: U32,+kind: U32) -> M.World:
  match layout:
    case 0: H.build(world,328,376,kind)
    case 1: H.build(world,456,424,kind)
    case _: H.build(world,328,472,kind)
def shield(+world: M.World,layout: U32) -> M.World:
  match layout:
    case 0: H.build(world,160,500,6)
    case 1: H.build(world,216,600,6)
    case _: H.build(world,216,432,6)
def plan(+world: M.World,+layout: U32,kind: U32) -> M.World:
  match kind:
    case 0: world
    case 1: refiner(world,layout)
    case 2: H.key(H.select(refiner(world,layout),1),117)
    case 3: packager(world,layout)
    case 4: rapid(world,layout)
    case 5: packager(refiner(world,layout),layout)
    case 6: H.key(H.select(packager(world,layout),1),117)
    case 7: paired_rapid(refiner(world,layout),layout)
    case 8: jev_support(world,layout,3)
    case 9: jev_support(world,layout,4)
    case 10: shield(world,layout)
    case 11: jev_support(world,layout,2)
    case _: rapid(packager(refiner(world,layout),layout),layout)
def emit_result(result: Sample,+built: M.World,layout: U32,profile: U32,kind: U32,offset: U32) -> IO(Unit):
  match result:
    case Sample{+done,ticks,bytes,pressure,hot,pending}:
      IO.print("BALANCE map=" ++ U32.show(layout) ++ " profile=" ++ U32.show(profile) ++ " plan=" ++ U32.show(kind) ++ " offset=" ++ U32.show(offset) ++ " towers=" ++ U32.show(M.number(List.length(&2,M.Tower,M.towers(built)))) ++ " cost=" ++ U32.show(M.sub(160,M.gold(built))) ++ " hp=" ++ U32.show(M.hp(done)) ++ " clear=" ++ U32.show(M.clear(done)) ++ " delivered=" ++ U32.show(M.delivered(done)) ++ " ticks=" ++ U32.show(ticks) ++ " peakBytes=" ++ U32.show(bytes) ++ " peakPressure=" ++ U32.show(pressure) ++ " hotTicks=" ++ U32.show(hot) ++ " peakPending=" ++ U32.show(pending) ++ " active=" ++ Bool.pick(String,M.active(done),"1","0") ++ " owned=" ++ U32.show(P.ledger_bytes(done)))
def run_case(+layout: U32,+profile: U32,+kind: U32,+offset: U32) -> IO(Unit):
  +base = H.reset_layout(layout)
  +base = M.with_control(base,M.control_with_profile(M.control(base),profile))
  +built = plan(base,layout,kind)
  +start = H.start(built)
  emit_result(sample(12000n,start,0,0,0,0,0,offset),built,layout,profile,kind,offset)
def offsets(fuel: Nat,+layout: U32,+profile: U32,+kind: U32,+offset: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit,Unit{})
    case 1n+n:
      do IO<Unit>:
        run_case(layout,profile,kind,offset)
        offsets(n,layout,profile,kind,((offset + 25) % 100 : U32))
def plans(fuel: Nat,+layout: U32,+profile: U32,+kind: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit,Unit{})
    case 1n+n:
      do IO<Unit>:
        offsets(4n,layout,profile,kind,0)
        plans(n,layout,profile,(kind + 1 : U32))
def maps(fuel: Nat,+layout: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit,Unit{})
    case 1n+n:
      do IO<Unit>:
        plans(6n,layout,0,0)
        maps(n,(layout + 1 : U32))
def main() -> IO(Unit):
  maps(3n,0)
