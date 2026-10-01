# Bounded balance safety, queue projection and render-clock regression checks.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseEffects.bend as E
import ./DefenseTeaching.bend as T
import ./DefenseProjection.bend as P
import ./DefenseMap.bend as Map
import ./DefenseMain.bend as Main
import ./DefenseTests.bend as B
import ./DefenseAutoTests.bend as Campaign
import ./DefenseRasterTests.bend as Check
import ../../packages/agent-flow-bend/Canonical.bend as C

def reduce(fuel: Nat,+risk: U32,+power: U32) -> U32:
  match fuel:
    case 0n: risk
    case 1n+n: reduce(n,M.sub(risk,E.risk_reduction(risk,power)),power)
def bounded(fuel: Nat,+risk: U32,+power: U32) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      +after = M.sub(risk,E.risk_reduction(risk,power))
      (after <= risk : U32) && Bool.pick(Bool,(risk >= 60 : U32),(after >= 60 : U32),U32.is_eq(after,risk)) && bounded(n,(risk + 1 : U32),power)
def clock_world(frame: Main.FrameState) -> M.World:
  match frame:
    case Main.Frame{world,_,_,_}: world
def carry(frame: Main.FrameState) -> U32:
  match frame:
    case Main.Frame{_,_,value,_}: value
def queue_world() -> M.World:
  M.with_effects(B.world(B.split()),[],[M.Timer{3n,3,5000,1n,100,47,0},M.Timer{4n,3,5000,1n,100,94,0}])
def case_risk() -> IO(Unit):
  do IO<Unit>:
    Check.check(bounded(101n,0,E.power(1,1)) && bounded(101n,0,E.power(1,2)) && bounded(101n,0,E.power(1,3)),"all303 risk/level inputs preserve the60 floor and never increase risk")
    Check.check(U32.is_eq(reduce(100n,100,E.power(1,1)),60) && U32.is_eq(reduce(100n,100,E.power(1,3)),60),"repeated and stacked prevention cannot eliminate every finding risk")
    Check.check((reduce(2n,100,E.power(1,3)) < reduce(2n,100,E.power(1,1)) : U32),"upgrades reach the same prevention floor faster")
def case_timers() -> IO(Unit):
  +done = Campaign.wave_done(12000n,H.start(H.initial()))
  Check.check(Nat.is_eq(List.length(&2,M.Timer,M.timers(done)),0n) && H.drained(done),"completed wave retains no obsolete synthetic timers")
def case_clock() -> IO(Unit):
  +clock = Main.clock_enabled(1000n,H.start(H.initial()),0,1000,True{})
  Check.check(U32.is_eq(M.time(clock_world(clock)),8) && U32.is_eq(carry(clock),840),"slow frames retain elapsed physics debt instead of dropping deadline time")
def case_seeds() -> IO(Unit):
  +children = E.refresh(M.with_effects(B.world(B.observed()),[],[M.Timer{1n,1,20,1n,85,0,0},M.Timer{2n,2,20,1n,85,0,0}]),B.split(),1)
  Check.check(U32.is_eq(M.timer_seed(E.find_timer(3n,children)),47) && U32.is_eq(M.timer_seed(E.find_timer(4n,children)),94),"new fan-out child draws use new canonical byte charges to distinguish both lanes")
def case_queue() -> IO(Unit):
  +queue = queue_world()
  +a : C.Work = C.Work{1n,1n,1n,3n,3n,C.Reviewing{},1n}
  +b : C.Work = C.Work{1n,1n,1n,4n,4n,C.Reviewing{},1n}
  do IO<Unit>:
    Check.check(U32.is_eq(T.review_count(M.work(M.core(queue)),queue,0,True{}),2) && U32.is_eq(T.review_count(M.work(M.core(queue)),queue,0,False{}),0),"third queue distinguishes permit wait from road travel")
    Check.check(Bool.not(Map.same(E.point_work(queue,a),E.point_work(queue,b))),"waiting review units occupy distinct road positions before the Jev door")
    Check.check(U32.is_eq(P.requests(queue),0) && U32.is_eq(P.count(queue,3),2),"queue positioning cannot manufacture a Jev request or acquire a permit")
def main() -> IO(Unit):
  do IO<Unit>:
    case_risk()
    case_timers()
    case_clock()
    case_seeds()
    case_queue()
