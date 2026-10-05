# Original generic controls exercise an independent game consumer; no Canonical fixture mutation.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ./DefenseProjection.bend as P

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def valid(observation: T.Observation) -> Bool:
  match observation:
    case T.Observation{_,_,_,_,_,value,_}: value
def initial_observation(observation: T.Observation) -> Bool:
  match observation:
    case T.Observation{time,count,_,_,queued,valid,_}:
      Nat.is_eq(time,0n) && Nat.is_eq(count,0n) && Nat.is_eq(queued,1n) && valid
def same_observation(a: T.Observation,b: T.Observation) -> Bool:
  match a b:
    case T.Observation{at,ac,_,_,aq,_,_} T.Observation{bt,bc,_,_,bq,_,_}:
      Nat.is_eq(at,bt) && Nat.is_eq(ac,bc) && Nat.is_eq(aq,bq)
def observation_count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_,count,_,_,_,_,_}: count
def returned_frames(before: M.World, observed: H.TickObserved) -> Bool:
  match observed:
    case H.TickObserved{world,frames,_}:
      Nat.is_eq(Nat.sub(observation_count(Run.observe(M.engine(world))),
        observation_count(Run.observe(M.engine(before)))),List.length(&2,T.Frame,frames))
def paused_frames(observed: H.TickObserved) -> Bool:
  match observed:
    case H.TickObserved{world,frames,_}:
      Nat.is_eq(List.length(&2,T.Frame,frames),0n) && U32.is_eq(M.time(world),0)
# Private recursive transport keeps both input and result worlds boxed.
# The public helper and every original assertion retain their actual worlds.
def tick_boxed(worlds: List<&2,M.World>, rest: List<&2,M.World> -> List<&2,M.World>) -> List<&2,M.World>:
  match worlds:
    case world <> Nil{}: rest([H.tick(world)])
    case _: []
def run_boxed(fuel: Nat,worlds: List<&2,M.World>) -> List<&2,M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n: tick_boxed(worlds,next => run_boxed(n,next))
def run_result(worlds: List<&2,M.World>,original: M.World) -> M.World:
  match worlds:
    case world <> Nil{}: world
    case _: original
def run(fuel: Nat,+world: M.World) -> M.World:
  run_result(run_boxed(fuel,[world]),world)
def world_value(items: List<&2,M.World>) -> M.World:
  match items:
    case world <> _: world
    case Nil{}: H.initial()
def main() -> IO(Unit):
  +origin: List<&2,M.World> = [H.initial()]
  +dashboard: List<&2,T.State> = [Consumer.initial()]
  +built: List<&2,M.World> = [H.build(world_value(origin),424,232,1)]
  +paused: List<&2,M.World> = [H.key(world_value(origin),32)]
  +burst: List<&2,M.World> = [H.key(world_value(origin),110)]
  +progress: List<&2,M.World> = [run(100n,world_value(burst))]
  +suspended: List<&2,M.World> = [H.key(world_value(progress),97)]
  +resumed: List<&2,M.World> = [H.key(world_value(suspended),97)]
  do IO<Unit>:
    require(initial_observation(Run.observe(Consumer.boxed(dashboard))),"one configured advicee starts with one queued arrival, zero transitions and time0")
    require(same_observation(Run.observe(M.engine(world_value(built))),Run.observe(M.engine(world_value(origin)))),"construction preserves observed engine time, event count and queued work")
    require(U32.is_eq(M.gold(world_value(built)),105) && U32.is_eq(M.number(List.length(&2,M.Tower,M.towers(world_value(built)))),1),"Delivery relay construction charges55 gold and creates one tower")
    require(same_observation(Run.observe(M.engine(H.damage(H.move(world_value(built),160,180)))),Run.observe(M.engine(world_value(built)))),"damage and geometry preserve observed engine counters")
    require(same_observation(Run.observe(M.engine(run(4n,world_value(paused)))),Run.observe(M.engine(world_value(origin)))) && U32.is_eq(M.time(run(4n,world_value(paused))),0),"pause freezes game clock and all engine transitions")
    require(valid(Run.observe(M.engine(world_value(burst)))),"N submits a supported generic Burst control")
    require(U32.is_eq(M.arrival_interval(H.key(world_value(origin),93)),29900),"] speeds up arrivals by reducing the interval")
    require(U32.is_eq(M.arrival_interval(H.key(world_value(origin),91)),30100),"[ slows down arrivals even above the old10000ms cap")
    require(returned_frames(world_value(burst),H.tick_observed(world_value(burst))),"actual tick observer returns every counted engine frame exactly once")
    require(paused_frames(H.tick_observed(world_value(paused))),"actual paused tick observer returns no frames and keeps virtual time0")
    require(U32.is_eq(M.time(world_value(progress)),100) && (M.offered(world_value(progress)) > 0 : U32),"continuous virtual endpoints reach original admitted workload without authored waves")
    require(initial_observation(Run.observe(Consumer.boxed(dashboard))),"game work leaves the independent dashboard at time0 with its single untouched arrival")
    require(Bool.not(M.auto(world_value(suspended))) && valid(Run.observe(M.engine(world_value(suspended)))),"A suspends future recurring arrivals on the existing valid state")
    require(M.auto(world_value(resumed)) && valid(Run.observe(M.engine(world_value(resumed)))),"A resumes the same resident without reset")
    require(U32.is_eq(P.ledger_bytes(H.key(world_value(progress),91)),P.ledger_bytes(world_value(progress))) && U32.is_eq(P.requests(H.key(world_value(progress),91)),P.requests(world_value(progress))),"live Pace preserves existing owned bytes and requests")
    IO.print("CONTINUOUS GAME CONSUMER checks complete")
