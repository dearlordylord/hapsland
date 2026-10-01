import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseProjection.bend as P
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ./DefenseEffects.bend as E
import ./DefenseOutput.bend as O
import ./DefenseMap.bend as Map

def run(n: Nat, world: M.World) -> M.World:
  match n:
    case Zero{}: world
    case Succ{p}: run(p, H.tick(world))

def show(+world: M.World) -> String:
  String.append(" t=", String.append(U32.show(M.time(world)), String.append(" observed=", String.append(U32.show(M.offered(world)), String.append(" request=", String.append(U32.show(P.requests(world)), String.append(" ready=", String.append(U32.show(P.ready(world)), String.append(" leases=", String.append(U32.show(P.leases(world)), String.append(" deciding=", String.append(U32.show(P.deciding(world)), String.append(" bytes=", String.append(U32.show(P.ledger_bytes(world)), String.append(" delivered=", String.append(U32.show(M.delivered(world)), ""))))))))))))))))

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)

# This fixture uses the imported product reducer directly, independent of host timing.
def observed() -> C.State:
  +state = H.apply(C.step(C.initial(Ledger.Limits{18n, 240n, 18n, 240n}), C.OpenRound{1n, 1n}))
  +state = H.apply(C.step(state, C.AdmitObservation{1n, 1n, 1n}))
  +state = H.apply(C.step(state, C.QueueDispatch{1n, 1n, 1n, 1n}))
  +state = H.apply(C.step(state, C.StartObservation{1n, 1n, 1n, 1n}))
  H.apply(C.step(state, C.BeginObservedPreparation{1n, 1n, 1n, 1n, 40n}))
def split() -> C.State:
  +state = H.apply(C.step(observed(), C.PreparationCompleted{1n, 1n, 1n, 2n, 10n <> 20n <> Nil{}}))
  +state = H.apply(C.step(state, C.CompleteObservation{1n, 1n, 1n, 1n}))
  H.apply(C.step(state, C.DispatchSettled{1n, 1n, 1n, 1n}))
def held() -> C.State:
  H.apply(C.step(split(), C.ReviewCompleted{1n, 1n, 1n, 3n, C.Finding{}}))
def eligible() -> C.State:
  +state = H.apply(C.step(held(), C.ReviewCompleted{1n, 1n, 1n, 4n, C.Clear{}}))
  +state = H.apply(C.step(state, C.StopPolled{1n, 1n, 1n, False{}}))
  H.apply(C.step(state, C.CollectionReady{3n, 1n, 1n, 1n, 1n, False{}}))
def world(state: C.State) -> M.World:
  M.with_core(H.initial(), state)
def refusal(result: C.Step) -> Bool:
  match result:
    case C.Advanced{_, C.PreparationRefused{} <> _}: True{}
    case _: False{}

def stopped_fixture() -> C.State:
  H.apply(C.step(held(), C.StopPolled{1n, 1n, 1n, False{}}))
def waiting_fixture() -> C.State:
  H.apply(C.step(stopped_fixture(), C.CollectionReady{3n, 1n, 1n, 1n, 1n, False{}}))


def prep_world() -> M.World:
  +base = world(observed())
  M.with_effects(base, Nil{}, M.Timer{1n, 1, 1000, 1n, 100, 1, 0} <>
    M.Timer{2n, 2, (Map.path_length(Map.preparation_route(0)) + 10 : U32), 1n, 100, 1, 0} <> Nil{})
def request_start(+core: C.State, +id: Nat) -> C.State:
  +ready = H.event(core, C.JevRequestReady{1n,1n,1n,id,True{},True{},True{},True{},True{},True{}})
  H.event(ready, C.JevRequestStarted{1n,1n,1n,id,H.request_for(id,H.requests(M.dispatch(ready)))})
def backend_world() -> M.World:
  +core = request_start(H.event(split(), C.QueueDispatch{1n,1n,1n,3n}), 3n)
  M.with_effects(world(core), Nil{}, M.Timer{3n,4,20,1n,100,64,0} <> M.Timer{4n,3,0,1n,100,11,0} <> Nil{})
def blocked_world() -> M.World:
  +core = request_start(H.event(held(), C.QueueDispatch{1n,1n,1n,4n}), 4n)
  M.with_effects(world(core), Nil{}, M.Timer{3n,5,400,1n,100,64,0} <> M.Timer{4n,4,20,1n,100,11,0} <> Nil{})
def processor(kind: U32) -> M.Tower:
  M.Tower{648,248,kind,1,0,0,0n,240}
def backend_tower(kind: U32) -> M.Tower:
  M.Tower{376,376,kind,1,0,0,0n,240}
def tower_count(world: M.World) -> U32:
  M.number(List.length(&2,M.Tower,M.towers(world)))
def timer_risk(world: M.World, id: Nat) -> U32:
  M.timer_risk(E.find_timer(id,M.timers(world)))
def timer_boost(world: M.World, id: Nat) -> U32:
  M.timer_boost(E.find_timer(id,M.timers(world)))
def shot_world(+world: M.World, tower: M.Tower) -> M.World:
  M.with_effects(world, tower <> Nil{}, M.timers(world))
def damages(n: Nat, world: M.World) -> M.World:
  match n:
    case Zero{}: world
    case Succ{rest}: damages(rest,H.damage(world))
def reviews8() -> C.State:
  +core = H.event(observed(), C.PreparationCompleted{1n,1n,1n,2n,20n<>20n<>20n<>20n<>20n<>20n<>20n<>20n<>Nil{}})
  +core = H.event(core,C.CompleteObservation{1n,1n,1n,1n})
  H.event(core,C.DispatchSettled{1n,1n,1n,1n})
def request_many(n: Nat, +id: Nat, core: C.State) -> C.State:
  match n:
    case Zero{}: core
    case Succ{rest}: request_many(rest,(id + 1n : Nat),request_start(H.event(core,C.QueueDispatch{1n,1n,1n,id}),id))
def hot_world() -> M.World:
  world(request_many(8n,3n,reviews8()))
def backend_owners(items: List<&2,C.Work>, +core:C.State) -> Bool:
  match items:
    case Nil{}: True{}
    case C.Work{p,l,r,+id,_,C.AtJev{},_} <> rest:
      H.preparation_running(core,p,l,r,id) && backend_owners(rest,core)
    case _ <> rest: backend_owners(rest,core)

def case_1() -> IO(Unit):
  require(U32.is_eq(P.count(world(observed()),2),1),"direct reducer admits observed preparation")

def case_2() -> IO(Unit):
  require(U32.is_eq(P.count(world(split()),3),2) && U32.is_eq(P.ledger_bytes(world(split())),30),"direct reducer splits and replaces byte reservations")

def case_3() -> IO(Unit):
  require(U32.is_eq(P.waiting(world(stopped_fixture())),1) && U32.is_eq(P.ready(world(waiting_fixture())),0),"real sibling dependency blocks collection and Stop")

def case_4() -> IO(Unit):
  require(U32.is_eq(P.ready(world(eligible())),1),"completed sibling permits actual collection")

def case_5() -> IO(Unit):
  require(U32.is_eq(tower_count(H.build(H.initial(),900,300,0)),0),"cannot construct on sidebar")

def case_6() -> IO(Unit):
  require(U32.is_eq(tower_count(H.build(H.initial(),640,240,0)),1) && U32.is_eq(M.gold(H.build(H.initial(),640,240,0)),125),"manual spatial construction spends original Rapid35")

def case_7() -> IO(Unit):
  require(U32.is_eq(tower_count(H.build(H.initial(),644,174,0)),0),"cannot construct in building footprint")

def case_8() -> IO(Unit):
  require(U32.is_eq(tower_count(H.build(H.initial(),100,174,0)),0),"cannot construct on road")

def case_9() -> IO(Unit):
  require(U32.is_eq(tower_count(H.build(H.build(H.initial(),640,240,0),640,240,0)),1),"overlapping tower construction rejected")

def case_10() -> IO(Unit):
  require(U32.is_eq(M.gold(H.upgrade(H.select(H.build(H.initial(),640,240,0),1))),85),"selected upgrade spends40")

def case_11() -> IO(Unit):
  require(U32.is_eq(M.level(E.shot_tower(E.shoot(prep_world(),processor(0)))),1) && U32.is_eq(M.timer_boost(E.find_timer(2n,E.shot_timers(E.shoot(prep_world(),processor(0))))),12),"Rapid actual active work shot12")

def case_12() -> IO(Unit):
  require(Nat.is_eq(E.target(prep_world(),M.Tower{40,600,0,1,0,0,0n,240}),0n),"out-of-range processor cannot affect active work")

def case_13() -> IO(Unit):
  require(U32.is_eq(M.timer_risk(E.find_timer(2n,E.shot_timers(E.shoot(prep_world(),processor(1))))),80),"Refiner shot permanently removes20 percentage points")

def case_14() -> IO(Unit):
  require(U32.is_eq(M.timer_risk(E.find_timer(1n,E.shot_timers(E.shoot(prep_world(),processor(1))))),80),"preparation prevention carries to future child source metadata")

def case_15() -> IO(Unit):
  require(U32.is_eq(M.timer_boost(E.find_timer(2n,E.shot_timers(E.shoot(prep_world(),processor(1))))),0),"Refiner never accelerates service work")

def case_16() -> IO(Unit):
  require(U32.is_eq(M.timer_boost(E.find_timer(3n,E.shot_timers(E.shoot(backend_world(),backend_tower(2))))),6),"Relay has original lower power6")

def case_17() -> IO(Unit):
  require(Nat.is_eq(E.target(blocked_world(),backend_tower(4)),4n),"Coordinator targets actual unfinished sibling holding findings")

def case_18() -> IO(Unit):
  require(Nat.is_eq(E.target(backend_world(),backend_tower(4)),0n),"Coordinator has no effect without held sibling findings")

def case_19() -> IO(Unit):
  require(U32.is_eq(H.source_permits(H.build(H.initial(),376,248,3)),3) && U32.is_eq(E.permits(H.build(H.initial(),376,248,3),4),2),"Parallelizer changes covered host source permits only")

def case_20() -> IO(Unit):
  require(U32.is_eq(P.pool_limit(),8) && U32.is_eq(P.preparation_pool_limit(),8),"canonical limits remain original eight")

def case_21() -> IO(Unit):
  require(U32.is_eq(O.batch_target(H.build(H.initial(),144,368,5)),5) && U32.is_eq(O.item_work(H.build(H.initial(),144,368,5)),4),"Packager changes actual next batch target and host item work")

def case_22() -> IO(Unit):
  require(U32.is_eq(H.preview_secondary_before(H.initial(),144,368,5),8) && U32.is_eq(H.preview_secondary_delta(H.initial(),144,368,5),4),"Packager preview exact serialization reduction")

def case_23() -> IO(Unit):
  require(U32.is_eq(H.preview_gain(prep_world(),640,240,0),12) && U32.is_eq(H.preview_before(prep_world(),640,240,0),166),"Rapid preview matches exact remaining-work marginal shot")

def case_24() -> IO(Unit):
  require(U32.is_eq(H.preview_gain(H.initial(),40,600,0),0),"empty range explicitly has zero effect")

def case_25() -> IO(Unit):
  require(U32.is_eq(M.hp(damages(50n,hot_world())),99),"inside hot pressure generates actual damage cadence")

def case_26() -> IO(Unit):
  require(U32.is_eq(M.hp(damages(50n,shot_world(hot_world(),backend_tower(6)))),100),"local finite Shield reduces damage work")

def case_27() -> IO(Unit):
  require(U32.is_eq(M.charges(E.shot_tower(E.shoot(hot_world(),backend_tower(6)))),240),"shield charging happens only protection not work firing")

def case_28() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(damages(50n,shot_world(hot_world(),backend_tower(6)))),160),"Shield never changes real ledger occupancy")

def case_29() -> IO(Unit):
  require(U32.is_eq(M.hp(H.tick(H.key(hot_world(),32))),100),"pause freezes pressure damage")

def case_30() -> IO(Unit):
  require(U32.is_eq(M.layout(H.key(H.build(H.initial(),640,240,0),9)),0),"map cannot relocate constructed towers")

def case_31() -> IO(Unit):
  require(U32.is_eq(M.layout(H.key(H.key(H.initial(),110),9)),0),"map cannot relocate an active wave")

def case_32() -> IO(Unit):
  require(U32.is_eq(tower_count(run(500n,H.key(H.initial(),97))),0),"automatic wave mode never constructs towers")

def case_33() -> IO(Unit):
  require(U32.is_eq(P.count(run(100n,H.key(H.initial(),110)),1),0),"source road distance gates actual source-start fact")

def case_34() -> IO(Unit):
  require(U32.is_eq(P.requests(run(700n,H.key(H.initial(),110))),0),"review road distance gates actual backend request fact")

def case_35() -> IO(Unit):
  require(backend_owners(M.work(M.core(run(2200n,H.key(H.build(H.initial(),376,376,3),110)))),M.core(run(2200n,H.key(H.build(H.initial(),376,376,3),110)))),"every real backend request retains actual dispatch ownership")

def case_36() -> IO(Unit):
  require(U32.is_eq(M.clear(run(5500n,H.key(H.initial(),110))),0),"baseline future findings chance100 never authored clear")

def case_37() -> IO(Unit):
  require(U32.is_eq(M.delivered(run(5500n,H.key(H.initial(),110))),16) && U32.is_eq(P.ledger_bytes(run(5500n,H.key(H.initial(),110))),0),"finite baseline drains sixteen real acknowledged findings")

def case_38() -> IO(Unit):
  require(U32.is_eq(P.requests(run(5500n,H.key(H.initial(),110))),0) && U32.is_eq(P.writes(run(5500n,H.key(H.initial(),110))),0),"completed wave releases request and delivery ownership")

def case_39() -> IO(Unit):
  require((M.clear(run(200n,shot_world(backend_world(),backend_tower(1)))) > 0 : U32) && U32.is_eq(P.count(run(200n,shot_world(backend_world(),backend_tower(1))),5),0),"zero future risk resolves clear only at actual backend completion")
def case_40() -> IO(Unit):
  require(Nat.is_ne(E.target(blocked_world(),backend_tower(1)),3n),"Refiner never targets already observed PendingFinding")
def first(items:List<&2,M.Tower>)->M.Tower:
  match items:
    case tower <> _:tower
    case Nil{}:M.Tower{0,0,0,1,0,0,0n,0}
def first_tower(world:M.World)->M.Tower:
  first(M.towers(world))
def case_41() -> IO(Unit):
  require(U32.is_eq(M.charges(E.shot_tower(E.shoot(hot_world(),backend_tower(6)))),240) &&
    U32.is_eq(M.charges(first_tower(damages(50n,shot_world(hot_world(),backend_tower(6))))),190),"Shield spends one finite charge per useful hot tick")
def overlap_world()->M.World:
  +base=hot_world()
  M.with_effects(base,M.Tower{328,376,6,1,0,0,0n,240} <> M.Tower{376,376,6,3,0,0,0n,240} <> Nil{},M.timers(base))
def case_42()->IO(Unit):
  require(U32.is_eq(M.charges(first_tower(H.damage(overlap_world()))),240) && U32.is_eq(H.preview_gain(overlap_world(),296,376,6),0),"zero-marginal new Shield remains idle behind existing capped protection")

def main() -> IO(Unit):
  do IO<Unit>:
    case_1()
    case_2()
    case_3()
    case_4()
    case_5()
    case_6()
    case_7()
    case_8()
    case_9()
    case_10()
    case_11()
    case_12()
    case_13()
    case_14()
    case_15()
    case_16()
    case_17()
    case_18()
    case_19()
    case_20()
    case_21()
    case_22()
    case_23()
    case_24()
    case_25()
    case_26()
    case_27()
    case_28()
    case_29()
    case_30()
    case_31()
    case_32()
    case_33()
    case_34()
    case_35()
    case_36()
    case_37()
    case_38()
    case_39()
    case_40()
    case_41()
    case_42()
    IO.print("CANONICAL SPATIAL DEFENSE:42 directed checks complete")
