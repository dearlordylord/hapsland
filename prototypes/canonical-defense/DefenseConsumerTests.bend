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
    case H.TickObserved{world,frames}:
      Nat.is_eq(Nat.sub(observation_count(Run.observe(M.engine(world))),
        observation_count(Run.observe(M.engine(before)))),List.length(&2,T.Frame,frames))
def paused_frames(observed: H.TickObserved) -> Bool:
  match observed:
    case H.TickObserved{world,frames}:
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
def main() -> IO(Unit):
  +origin = H.initial()
  +dashboard = Consumer.initial()
  +built = H.build(origin,424,232,1)
  +paused = H.key(origin,32)
  +burst = H.key(origin,110)
  +progress = run(100n,burst)
  +suspended = H.key(progress,97)
  +resumed = H.key(suspended,97)
  do IO<Unit>:
    require(initial_observation(Run.observe(dashboard)),"one configured advicee starts with one queued arrival, zero transitions and time0")
    require(same_observation(Run.observe(M.engine(built)),Run.observe(M.engine(origin))),"construction preserves observed engine time, event count and queued work")
    require(U32.is_eq(M.gold(built),105) && U32.is_eq(M.number(List.length(&2,M.Tower,M.towers(built))),1),"Refiner construction charges55 gold and creates one tower")
    require(same_observation(Run.observe(M.engine(H.damage(H.move(built,160,180)))),Run.observe(M.engine(built))),"damage and geometry preserve observed engine counters")
    require(same_observation(Run.observe(M.engine(run(4n,paused))),Run.observe(M.engine(origin))) && U32.is_eq(M.time(run(4n,paused)),0),"pause freezes game clock and all engine transitions")
    require(valid(Run.observe(M.engine(burst))),"N submits a supported generic Burst control")
    require(returned_frames(burst,H.tick_observed(burst)),"actual tick observer returns every counted engine frame exactly once")
    require(paused_frames(H.tick_observed(paused)),"actual paused tick observer returns no frames and keeps virtual time0")
    require(U32.is_eq(M.time(progress),100) && (M.offered(progress) > 0 : U32),"continuous virtual endpoints reach original admitted workload without authored waves")
    require(initial_observation(Run.observe(dashboard)),"game work leaves the independent dashboard at time0 with its single untouched arrival")
    require(Bool.not(M.auto(suspended)) && valid(Run.observe(M.engine(suspended))),"A suspends future recurring arrivals on the existing valid state")
    require(M.auto(resumed) && valid(Run.observe(M.engine(resumed))),"A resumes the same resident without reset")
    require(U32.is_eq(P.ledger_bytes(H.key(progress,91)),P.ledger_bytes(progress)) && U32.is_eq(P.requests(H.key(progress,91)),P.requests(progress)),"live Pace preserves existing owned bytes and requests")
    IO.print("CONTINUOUS GAME CONSUMER checks complete")
