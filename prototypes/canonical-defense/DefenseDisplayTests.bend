# Actual six-Burst presentation regression, not a second business simulator.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseRender.bend as R
import ./DefenseCues.bend as Cues
import ./DefenseProjection.bend as P
import ./DefenseStartupTests.bend as Startup
import ./DefenseConsumerTests.bend as Tests
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def stationary(items: List<&2,P.Token>,+world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +token <> tail:
      (Bool.not(U32.is_eq(H.remaining(world,token),0)) || U32.is_eq(R.actor_step(world,token),0)) && stationary(tail,world)
def queue_pair(items: List<&2,C.Work>,+world: M.World,+work: C.Work) -> Bool:
  match items:
    case Nil{}: True{}
    case +other <> tail:
      Bool.not(E.review_waiting(world,work) && E.review_waiting(world,other) && Map.in_range(E.point_work(world,work),E.point_work(world,other),19)) && queue_pair(tail,world,work)
def queue_clear(items: List<&2,C.Work>,+world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case +work <> +tail: queue_pair(tail,world,work) && queue_clear(tail,world)
def cue_live(items: List<&2,M.Cue>,+kind: U32) -> Bool:
  match items:
    case Nil{}: False{}
    case +cue <> tail: U32.is_eq(M.cue_kind(cue),kind) || cue_live(tail,kind)
def finish_reviews(items: List<&2,M.Timer>) -> List<&2,M.Timer>:
  match items:
    case Nil{}: []
    case M.Timer{id,+phase,age,family,risk,seed,boost,gap,service} <> tail:
      M.Timer{id,phase,Bool.pick(U32,U32.is_eq(phase,3),2000,age),family,risk,seed,boost,gap,service} <> finish_reviews(tail)
def waiting_count(items: List<&2,C.Work>,+world: M.World) -> U32:
  match items:
    case Nil{}: 0
    case work <> tail: (Bool.to_u32(E.review_waiting(world,work)) + waiting_count(tail,world) : U32)
def trail_at(items: List<&2,M.Cue>,+id: Nat,+point: Map.Point) -> Bool:
  match items:
    case Nil{}: False{}
    case +cue <> tail:
      (Nat.is_eq(M.cue_operation(cue),id) && U32.is_eq(M.cue_x(cue),Map.px(point)) && U32.is_eq(M.cue_y(cue),Map.py(point))) || trail_at(tail,id,point)
def main() -> IO(Unit):
  +start = Startup.bursts(6n,H.initial())
  +refused = Tests.run(620n,start)
  +reviews = Tests.run(1000n,start)
  +queued = M.with_effects(reviews,M.towers(reviews),finish_reviews(M.timers(reviews)))
  do IO<Unit>:
    require(cue_live(M.cues(start),0) && U32.is_eq(M.offered(start),0),"N confirms queued Burst before any actual admission")
    require(cue_live(M.cues(Tests.run(10n,start)),1),"actual AdmitObservation gives a separate admission cue")
    require(Cues.refused_id(M.cues(refused),5n) && Cues.refused_id(M.cues(refused),6n),"six Bursts retain explicit E5/E6 refusal cues after source retirement")
    require(Nat.is_eq(E.id_found(5n,M.work(M.core(refused))),0n) && Nat.is_eq(E.id_found(6n,M.work(M.core(refused))),0n),"refusal trail survives removal of the actual operations")
    require(trail_at(M.cues(refused),5n,H.point_found(Tests.run(617n,start),E.find_work(5n,M.work(M.core(Tests.run(617n,start)))))),"refusal trail stays at the actual last live source position")
    require(Cues.refused_id(M.cues(Startup.bursts(20n,refused)),5n),"N spam cannot erase a refusal trail")
    require(Bool.not(Cues.refused_id(M.cues(Tests.run(700n,start)),5n)),"refusal trail expires rather than becoming a ghost work item")
    require((waiting_count(M.work(M.core(queued)),queued) > 1 : U32) && queue_clear(M.work(M.core(queued)),queued),"waiting review bodies do not overlap at Jev")
    require(Startup.route_check(1600n,start),"six-Burst queue transitions remain continuous within16 pixels per tick")
    require(stationary(P.tokens(queued),queued),"actors at the end of their animation hold a stationary pose")
    require((Startup.peak_jev_age(60n,start,0) < 1000 : U32),"six-Burst workload cannot strand AtJev owners for1000 ticks over6000 ticks")
    require((M.number(List.length(&2,M.Cue,M.cues(Startup.bursts(20n,H.initial())))) <= 2 : U32),"rapid N feedback remains bounded to two notifications")
    IO.print("GAME DISPLAY regression checks complete")
