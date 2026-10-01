import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseProjection.bend as P
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger

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

def case_1() -> IO(Unit):
  require(U32.is_eq(P.count(world(observed()), 2), 1), "actual observed preparation parent admitted")

def case_2() -> IO(Unit):
  require(U32.is_eq(P.count(world(split()), 3), 2), "actual preparation splits two reducer children")

def case_3() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(world(split())), 30), "actual replacement releases40 reserves10+20")

def case_4() -> IO(Unit):
  require(U32.is_eq(P.waiting(world(stopped_fixture())), 1), "actual Stop waits for unfinished sibling")

def case_5() -> IO(Unit):
  require(U32.is_eq(P.ready(world(waiting_fixture())), 0), "finding blocked by unfinished sibling")

def case_6() -> IO(Unit):
  require(U32.is_eq(P.ready(world(eligible())), 1), "completed sibling permits real collection")

def case_7() -> IO(Unit):
  require(U32.is_eq(P.leases(world(H.delivery(eligible(), 1))), 1), "real collection lease reserved")

def case_8() -> IO(Unit):
  require(U32.is_eq(P.writes(world(H.delivery(H.delivery(eligible(), 1), 20))), 1), "real authorized delivery slot visible")

def case_9() -> IO(Unit):
  require(U32.is_eq(P.count(world(H.delivery(H.delivery(H.delivery(eligible(), 1), 20), 90)), 5), 0), "authorized acknowledged submission retires real finding")

def case_10() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(world(H.delivery(H.delivery(H.delivery(eligible(), 1), 20), 90))), 0), "acknowledged retirement releases actual ledger")

def case_11() -> IO(Unit):
  require(U32.is_eq(P.count(world(H.delivery(eligible(), 90)), 5), 1), "terminal without authorization retains finding")

def case_12() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(world(H.delivery(eligible(), 90))), 10), "denied terminal retains byte reservation")

def case_13() -> IO(Unit):
  require(refusal(C.step(H.apply(C.step(C.initial(Ledger.Limits{18n, 20n, 18n, 20n}), C.OpenRound{1n, 1n})), C.BeginPreparation{1n, 1n, 1n, 40n})), "real capacity refusal command")

def case_14() -> IO(Unit):
  require(U32.is_eq(M.time(run(20n, H.key(H.key(H.initial(), 110), 32))), 0), "paused simulation freezes clock")

def case_15() -> IO(Unit):
  require(U32.is_eq(M.gold(H.key(H.key(H.key(H.key(H.initial(), 110), 9), 9), 9)), 120), "layout changes preserve gold")

def case_16() -> IO(Unit):
  require(U32.is_eq(P.count(H.key(world(held()), 9), 5), 1), "layout changes preserve canonical retained finding")

def case_17() -> IO(Unit):
  require(U32.is_eq(M.number(List.length(&2, M.Tower, M.towers(run(200n, H.key(H.initial(), 97))))), 0), "auto wave never constructs towers")

def case_18() -> IO(Unit):
  require(U32.is_eq(M.gold(H.click(H.key(H.initial(), 110), 908, 170)), 120), "button gaps never buy")

def case_19() -> IO(Unit):
  require(U32.is_eq(M.gold(H.buy(H.buy(H.key(H.initial(), 110), 0), 0)), 70), "owned tower cannot charge twice")

def case_20() -> IO(Unit):
  require(U32.is_eq(P.requests(run(1400n, H.key(H.initial(), 110))), 0), "finite host workload settles request permits")

def case_21() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(run(1400n, H.key(H.initial(), 110))), 0), "finite host workload drains actual ledger")

def case_22() -> IO(Unit):
  require(U32.is_eq(M.delivered(run(1400n, H.key(H.initial(), 110))), 8), "eight authored finding units acknowledged")

def case_23() -> IO(Unit):
  require(U32.is_eq(M.delivered(run(1400n, H.buy(H.buy(H.key(H.initial(), 110), 0), 1))), M.delivered(run(1400n, H.key(H.initial(), 110)))), "host accelerators preserve authored outcomes")

def case_24() -> IO(Unit):
  +rejected = H.preparation_finished(observed(), 1n, 1n, 1n, 999n, 1n)
  require(U32.is_eq(P.prep_running(world(rejected)), 1) && U32.is_eq(P.count(world(rejected), 2), 1), "rejected preparation completion retains work and dispatcher permit")
def case_25() -> IO(Unit):
  require(U32.is_eq(M.time(H.key(run(1500n, H.initial()), 110)), 0), "late manual wave resets scenario deadline clock")
def case_26() -> IO(Unit):
  require(U32.is_eq(M.clear(run(1400n, H.key(H.initial(), 110))), 8), "actual clear settlements counted independently of scheduling IDs")
def case_27() -> IO(Unit):
  require(U32.is_eq(M.offered(run(149n, H.key(H.initial(), 97))), 0) && (M.offered(run(200n, H.key(H.initial(), 97))) > 0 : U32), "auto starts only finite wave after grace")

def case_28() -> IO(Unit):
  require((M.delivered(run(800n, H.buy(H.key(H.initial(), 110), 2))) > M.delivered(run(800n, H.key(H.initial(), 110))) : U32), "coordinator advances actual sibling-gated acknowledged delivery")
def case_29() -> IO(Unit):
  require(U32.is_eq(M.delivered(run(1400n, H.buy(H.key(H.initial(), 110), 2))), 8), "coordinator preserves eight authored findings")

def case_30() -> IO(Unit):
  require(U32.is_eq(P.leases(run(1400n, H.key(H.initial(), 110))), 0) && U32.is_eq(P.writes(run(1400n, H.key(H.initial(), 110))), 0), "completed workload releases real leases and delivery slot")
def request_many(n: Nat, +id: Nat, state: C.State) -> C.State:
  match n:
    case Zero{}: state
    case Succ{rest}:
      request_many(rest, (id + 1n : Nat), H.apply(C.step(state, C.JevRequestReady{1n, 1n, 1n, id, True{}, True{}, True{}, True{}, True{}, True{}})))
def nine_reviews() -> C.State:
  +state = H.apply(C.step(observed(), C.PreparationCompleted{1n, 1n, 1n, 2n,
    10n <> 10n <> 10n <> 10n <> 10n <> 10n <> 10n <> 10n <> 10n <> Nil{}}))
  request_many(9n, 3n, state)
def case_31() -> IO(Unit):
  require(U32.is_eq(P.requests(world(nine_reviews())), 8) && U32.is_eq(P.count(world(nine_reviews()), 4), 8), "real Jev pool admits eight requests and refuses ninth")

def nine_road_units() -> C.State:
  H.apply(C.step(observed(), C.PreparationCompleted{1n, 1n, 1n, 2n,
    20n <> 20n <> 20n <> 20n <> 20n <> 20n <> 20n <> 20n <> 20n <> Nil{}}))
def start_requests(n: Nat, +id: Nat, +state: C.State) -> C.State:
  match n:
    case Zero{}: state
    case Succ{rest}:
      +request = H.request_for(id, H.requests(M.dispatch(state)))
      start_requests(rest, (id + 1n : Nat), H.apply(C.step(state, C.JevRequestStarted{1n, 1n, 1n, id, request})))
def inside_fixture() -> C.State:
  start_requests(8n, 3n, request_many(8n, 3n, nine_road_units()))
def admit_many(n: Nat, state: C.State) -> C.State:
  match n:
    case Zero{}: state
    case Succ{rest}: admit_many(rest, H.apply(C.step(state, C.AdmitObservation{1n, 1n, 1n})))
def queue_many(n: Nat, +id: Nat, state: C.State) -> C.State:
  match n:
    case Zero{}: state
    case Succ{rest}: queue_many(rest, (id + 1n : Nat), H.apply(C.step(state, C.QueueDispatch{1n, 1n, 1n, id})))
def queued_charge() -> C.State:
  +initial = H.apply(C.step(C.initial(Ledger.Limits{18n, 240n, 18n, 240n}), C.OpenRound{1n, 1n}))
  +queued = queue_many(9n, 1n, admit_many(9n, initial))
  +read = H.apply(C.step(queued, C.StartObservation{1n, 1n, 1n, 9n}))
  H.apply(C.step(read, C.BeginObservedPreparation{1n, 1n, 1n, 9n, 180n}))
def case_32() -> IO(Unit):
  require(U32.is_eq(P.ledger_bytes(world(nine_road_units())), 180) && U32.is_eq(H.building_pressure_bytes(world(nine_road_units())), 0), "charged Reviewing road units retain ledger but cause no building pressure")
def case_33() -> IO(Unit):
  require(U32.is_eq(M.hp(H.tick(world(nine_road_units()))), 100) && U32.is_eq(P.ledger_bytes(H.tick(world(nine_road_units()))), 180), "road-only occupancy never damages HP or releases ledger")
def case_34() -> IO(Unit):
  require(U32.is_eq(H.building_pressure_bytes(world(inside_fixture())), 160) && U32.is_eq(P.ledger_bytes(world(inside_fixture())), 180), "started backend occupants count inside while waiting unit stays safe")
def case_35() -> IO(Unit):
  require(U32.is_eq(M.hp(H.tick(world(inside_fixture()))), 99) && U32.is_eq(P.ledger_bytes(H.tick(world(inside_fixture()))), 180), "inside threshold damages overlay HP without changing reservations")
def case_36() -> IO(Unit):
  require(U32.is_eq(P.queued(world(queued_charge())), 1) && U32.is_eq(P.ledger_bytes(world(queued_charge())), 180) && U32.is_eq(H.building_pressure_bytes(world(queued_charge())), 0), "actual queued parent excludes its charged preparation from building pressure")
def case_37() -> IO(Unit):
  require(U32.is_eq(H.building_pressure_bytes(world(request_many(8n, 3n, nine_road_units()))), 0), "issued but unstarted requests remain outside buildings")
def case_38() -> IO(Unit):
  require(U32.is_eq(M.hp(H.tick(H.key(world(inside_fixture()), 32))), 100) && U32.is_eq(H.building_pressure_bytes(H.key(world(inside_fixture()), 9)), 160), "pause freezes damage and layout preserves inside classification")

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
    IO.print("CANONICAL DEFENSE:38 directed checks complete")
