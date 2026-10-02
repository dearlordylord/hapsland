# Bounded business/UX witnesses use actual Canonical facts, not a copied reducer.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseStop.bend as S
import ./DefenseTeaching.bend as T
import ./DefenseEffects.bend as E
import ./DefenseProjection.bend as P
import ./DefenseOutput.bend as O
import ./DefenseTests.bend as B
import ./DefenseOutputTests.bend as OutputTests
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def at_clock(world: M.World,clock: U32) -> M.World:
  match world:
    case M.World{core,_,p,l,c,g,h,ts,ms,_,_,r,cl,d,out,auto,x,y,selected,work,flash}:
      M.World{core,clock,p,l,c,g,h,ts,ms,True{},8,r,cl,d,out,auto,x,y,selected,work,flash}
def stop_fixture(+world: M.World) -> M.World:
  at_clock(M.with_control(world,M.control_with_budget(M.control(world),2)),100)
def cutoff() -> M.World:
  S.poll(at_clock(S.poll(stop_fixture(B.blocked_world())),102))
def cleanup(fuel: Nat,world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: cleanup(n,S.tick(world))
def controls() -> IO(Unit):
  do IO<Unit>:
    +base : M.World = H.initial()
    +fast : M.World = H.key(base,91)
    +slow : M.World = H.key(base,93)
    require(U32.is_eq(M.wave_interval(fast),210) && U32.is_eq(M.wave_interval(slow),230),"brackets restore independent manual source arrival pacing")
    require(U32.is_eq(M.wave_interval(H.key(fast,110)),210),"manual pace persists into real next wave")
    require(U32.is_eq(M.wave_interval(H.pacing(H.pacing(base,True{}),True{})),200) &&
      U32.is_eq(M.wave_interval(H.pacing(M.with_control(base,M.control_with_pace(M.control(base),20)),True{})),20),"manual pace changes and saturates at twenty ticks")
    require(M.paused(H.key(base,112)) && Bool.not(M.paused(H.key(H.key(base,112),112))),"P toggles the same pause as Space")
    require(U32.is_eq(M.stop_budget(H.key(base,100)),210) &&
      U32.is_eq(M.stop_budget(H.key(H.key(base,110),100)),4000),"D selects short observed Stop window only before active work")
    require(U32.is_eq(M.layout(H.key(H.key(base,100),9)),1) && U32.is_eq(M.stop_budget(H.key(H.key(base,100),9)),210),"Stop scenario and map selection are orthogonal")

def profiles() -> IO(Unit):
  do IO<Unit>:
    +base : M.World = B.backend_world()
    +slow : M.World = M.with_control(base,M.control_with_profile(M.control(base),2))
    require(U32.is_eq(M.profile(slow),2) && U32.is_eq(E.duration(slow,C.Work{1n,1n,1n,4n,3n,C.AtJev{},1n}),480),"large sibling profile changes observed host Jev latency, not its canonical stage")
    +read : M.World = M.with_control(B.prep_world(),M.control_with_profile(M.control(B.prep_world()),1))
    require(U32.is_eq(E.duration(read,C.Work{1n,1n,1n,2n,1n,C.Preparing{},1n}),352),"read/preparation profile exposes host service bottleneck")
    +output : M.World = H.key(H.key(H.key(H.initial(),102),102),102)
    require(U32.is_eq(O.acknowledgement_work(output),200) && U32.is_eq(O.item_work(output),8),"output profile delays ACK independently of item serialization work")
    require(U32.is_eq(M.profile(H.key(H.key(output,9),110)),3) && U32.is_eq(M.layout(H.key(output,9)),1),"same workload profile launches on another authored map")
    require(U32.is_eq(M.profile(H.key(H.key(output,110),102)),3),"active ownership prevents changing workload timings mid-flight")

def stopping() -> IO(Unit):
  do IO<Unit>:
    +waiting : M.World = S.poll(stop_fixture(B.blocked_world()))
    +cut : M.World = cutoff()
    require(U32.is_eq(M.stop_state(waiting),1) && U32.is_eq(P.waiting(waiting),1) && U32.is_eq(P.count(waiting,4),1),"actual StopGroupPolled waits for unfinished sibling before deadline")
    require(U32.is_eq(M.stop_state(cut),3) && U32.is_eq(P.count(cut,4),0) && U32.is_eq(P.count(cut,5),1) &&
      U32.is_eq(P.ledger_bytes(cut),10),"deadline cancels unfinished work while observed finding and its real charge survive")
    require(Collection.contains(4n,M.cancelled(cut)) && U32.is_eq(P.requests(cut),1) && U32.is_eq(M.cleanup_left(cut),10) &&
      Bool.not(H.can_start(cut)),"cancel command interrupts actual request but permit remains until native settlement")
    +done : M.World = cleanup(10n,cut)
    require(U32.is_eq(P.requests(done),0) && U32.is_eq(P.running(done),0) && U32.is_eq(P.count(done,5),1) && U32.is_eq(P.ledger_bytes(done),10),"native cancellation settlement releases dispatch permits without fabricating delivery or freeing finding charge")
    require(U32.is_eq(M.delivered(done),0) && U32.is_eq(M.clear(done),0),"cutoff never credits cancelled work as clear or acknowledged")
    require(U32.is_eq(M.cleanup_left(H.tick(H.key(cut,32))),10),"pause freezes cancellation settlement host clock")
    +ready : C.State = H.event(M.core(done),C.CollectionReady{3n,1n,1n,1n,1n,False{}})
    +delivered : M.World = OutputTests.run(500n,M.with_core(done,ready))
    require(U32.is_eq(M.delivered(delivered),1) && U32.is_eq(P.ledger_bytes(delivered),0),"retained finding can still be actually acknowledged after cutoff")

def projection() -> IO(Unit):
  do IO<Unit>:
    +world : M.World = OutputTests.fixture(8n,16)
    +after : M.World = H.hypothetical(world,120,480,5)
    require(U32.is_eq(T.candidate_count(world),4) && U32.is_eq(T.candidate_count(after),5) &&
      (T.candidate_bytes(after) > T.candidate_bytes(world) : U32) && U32.is_eq(P.ledger_bytes(after),P.ledger_bytes(world)),"Packager ghost derives real candidate IDs/count/bytes without compression or ownership changes")
    +busy : M.World = O.begin(world,T.candidates(world))
    +next : List<&2,Nat> = T.candidates(busy)
    require(U32.is_eq(T.matching_count(next,O.selection_members(busy)),0) &&
      U32.is_eq(M.number(List.length(&2,Nat,O.selection_members(busy))),4),"future ghost excludes leased members and keeps actual committed writer locked")
    require(Bool.not(T.flush_running(B.blocked_world())) && T.flush_running(world),"inactive eligibility wait is distinct from real flush countdown")
    require(U32.is_eq(T.count_family(P.tokens(B.blocked_world()),1n,0),1) &&
      U32.is_eq(T.count_family(P.tokens(B.blocked_world()),1n,1),1) && T.family_blocked(B.blocked_world(),1n),"family summary reads actual unfinished sibling and retained finding")
    require(U32.is_eq(M.number(T.family_bytes(M.work(M.core(B.prep_world())),B.prep_world(),1n,[])),40),"family reservation summary deduplicates shared source/preparation charge")
    +near : M.World = M.with_effects(B.blocked_world(),[],[M.Timer{3n,5,400,1n,100,64,0},M.Timer{4n,4,235,1n,100,11,0}])
    require(T.final_blocker(near,4n,9) && Bool.not(T.final_blocker(B.blocked_world(),4n,9)),"Coordinator predicts final sibling completion only when this shot actually finishes its remaining work")
    require(U32.is_eq(T.preparation_limit(),M.number(Dispatch.max_running())) && U32.is_eq(T.request_limit(),M.number(Dispatch.max_requests())) &&
      U32.is_eq(T.partition_bytes(world),P.ledger_bytes(world)),"rooms project actual shared pools and partition ledger instead of fictional room caps")
    require(U32.is_eq(T.shield_next_spend(H.hypothetical(B.hot_world(),328,376,6)),1) &&
      U32.is_eq(T.shield_next_spend(H.hypothetical(B.overlap_world(),296,376,6)),0),"Shield charge preview uses actual marginal allocation including overlapping cap")

def budget() -> IO(Unit):
  do IO<Unit>:
    +world : M.World = O.finish_refused(OutputTests.fixture(8n,16),True{})
    require(U32.is_eq(M.stop_state(world),4) && Bool.not(M.auto(world)) && Bool.not(H.can_start(world)) &&
      U32.is_eq(P.ledger_bytes(H.tick(world)),P.ledger_bytes(world)),"incomplete Finish refusal holds real findings and disables unsafe new waves")

def main() -> IO(Unit):
  do IO<Unit>:
    controls()
    profiles()
    stopping()
    projection()
    budget()
    IO.print("CANONICAL BUSINESS TEACHING:27 directed checks complete")
