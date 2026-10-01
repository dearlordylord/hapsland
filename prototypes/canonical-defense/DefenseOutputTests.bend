import Base
import ./DefenseAuto.bend as A
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseOutput.bend as O
import ./DefenseMap.bend as Map
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)

def next_operation(core: C.State) -> Nat:
  match core:
    case C.State{_,_,_,_,id,_,_,_,_}: id

def reviews(items: List<&2,C.Work>, +core: C.State, +limit: U32) -> C.State:
  match items:
    case Nil{}: core
    case C.Work{part,life,round,id,_,C.Reviewing{},_} <> rest:
      +finding = (M.number(List.length(&2,Nat,O.pending_ids(M.work(core)))) < limit : U32)
      reviews(rest,O.event(core,C.ReviewCompleted{part,life,round,id,
        Bool.pick(C.Outcome,finding,C.Finding{},C.Clear{})}),limit)
    case _ <> rest: reviews(rest,core,limit)

def source(+core: C.State, limit: U32) -> C.State:
  +parent = next_operation(core)
  +admitted = O.event(core,C.AdmitObservation{1n,1n,1n})
  +started = O.event(O.event(admitted,C.QueueDispatch{1n,1n,1n,parent}),C.StartObservation{1n,1n,1n,parent})
  +operation = next_operation(started)
  +prepared = O.event(O.event(started,C.BeginObservedPreparation{1n,1n,1n,parent,40n}),
    C.PreparationCompleted{1n,1n,1n,operation,[10n,20n]})
  +complete = O.event(O.event(prepared,C.CompleteObservation{1n,1n,1n,parent}),C.DispatchSettled{1n,1n,1n,parent})
  reviews(M.work(complete),complete,limit)

def sources(fuel: Nat, core: C.State, +limit: U32) -> C.State:
  match fuel:
    case 0n: core
    case 1n+n: sources(n,source(core,limit),limit)

def mark_ready(items: List<&2,C.Work>, core: C.State) -> C.State:
  match items:
    case Nil{}: core
    case C.Work{part,life,round,id,_,C.PendingFinding{_},parent} <> rest:
      mark_ready(rest,O.event(core,C.CollectionReady{id,part,life,round,parent,False{}}))
    case _ <> rest: mark_ready(rest,core)

def fixture_core(sources_count: Nat, findings: U32) -> C.State:
  +initial = O.event(C.initial(Ledger.Limits{32n,480n,32n,480n}),C.OpenRound{1n,1n})
  +core = sources(sources_count,initial,findings)
  +core = O.event(core,C.StopPolled{1n,1n,1n,False{}})
  mark_ready(M.work(core),core)

def fixture(+sources_count: Nat, findings: U32) -> M.World:
  M.World{fixture_core(sources_count,findings),0,False{},0,0,120,100,[],[],True{},
    M.number(sources_count),0,0,0,M.Output{0,0n,0n,[],0,0},A.initial(),0,0,0,0,0}

def run(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: run(n,O.tick(world))

def packager(world: M.World, +level: U32) -> M.World:
  match world:
    case M.World{core,t,p,+l,c,g,h,_,ms,a,o,r,cl,d,out,auto,x,y,selected,damage,flash}:
      +point : Map.Point = Map.center(l,5,0)
      M.World{core,t,p,l,c,g,h,[M.Tower{(Map.px(point) + 80 : U32),Map.py(point),5,level,0,0,0n,240}],
        ms,a,o,r,cl,d,out,auto,x,y,selected,damage,flash}

def empty_case() -> IO(Unit):
  +world = run(100n,fixture(8n,0))
  require(U32.is_eq(P.writes(world),0) && Nat.is_eq(O.attempt(M.output(world)),0n),
    "all-clear workload never reserves an empty writer")

def count_case(fuel: Nat, +findings: U32) -> IO(Unit):
  match fuel:
    case 0n: IO.print("PASS all 17 retained-count cases drain within four actual reservations")
    case 1n+n:
      +world = run(700n,fixture(8n,findings))
      do IO<Unit>:
        require(U32.is_eq(M.delivered(world),findings) && U32.is_eq(P.ledger_bytes(world),0) &&
          Nat.is_le(O.attempt(M.output(world)),4n) && U32.is_eq(P.leases(world),0) && U32.is_eq(P.writes(world),0),
          "acknowledged partial batches drain findings=" ++ U32.show(findings))
        count_case(n,(findings + 1 : U32))

def baseline_case() -> IO(Unit):
  +world = run(700n,fixture(8n,16))
  require(U32.is_eq(M.delivered(world),16) && Nat.is_eq(O.attempt(M.output(world)),4n),
    "sixteen retained findings use four real baseline batches")

def upgrade_case() -> IO(Unit):
  +world = run(700n,packager(fixture(8n,16),2))
  require(U32.is_eq(M.delivered(world),16) && Nat.is_eq(O.attempt(M.output(world)),3n) &&
    U32.is_eq(P.ledger_bytes(world),0),"Packager level two drains same findings with three real batches")

def no_ack_case() -> IO(Unit):
  +world = O.begin(fixture(8n,2),O.ready_ids(M.core(fixture(8n,2))))
  +core = O.terminal(M.core(world),M.output(world))
  +retained = M.with_core(world,core)
  require(U32.is_eq(P.count(retained,5),2) && U32.is_eq(P.ledger_bytes(retained),30) &&
    U32.is_eq(P.leases(retained),2) && U32.is_eq(M.delivered(retained),0),
    "terminal before authorization retains work, bytes, leases and delivery credit")

def bad_authorization_case() -> IO(Unit):
  +initial = fixture(8n,2)
  +world = O.begin(initial,O.ready_ids(M.core(initial)))
  +wrong : M.Output = M.Output{0,O.attempt(M.output(world)),999n,O.selection_members(world),0,56}
  +core = O.terminal(O.authorize(M.core(world),wrong),M.output(world))
  +retained = M.with_core(world,core)
  require(U32.is_eq(P.count(retained,5),2) && U32.is_eq(P.ledger_bytes(retained),30) &&
    U32.is_eq(P.leases(retained),2),"wrong authorization owner cannot retire the committed selection")

def same_ids(left: List<&2,Nat>, right: List<&2,Nat>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case a <> rest b <> tail: Nat.is_eq(a,b) && same_ids(rest,tail)
    case _ _: False{}

def frozen_case() -> IO(Unit):
  +before = O.tick(fixture(8n,16))
  +after = packager(before,3)
  require(same_ids(O.selection_members(before),O.selection_members(after)) &&
    U32.is_eq(O.span(M.output(before)),O.span(M.output(after))) &&
    U32.is_eq(O.selection_bytes(before),O.selection_bytes(after)) &&
    U32.is_eq(O.batch_target(after),7),
    "upgrade changes next target while committed membership, bytes and timing stay fixed")

def budget_case() -> IO(Unit):
  +world = run(700n,fixture(10n,20))
  require(U32.is_eq(M.delivered(world),16) && Nat.is_eq(O.attempt(M.output(world)),4n) &&
    U32.is_eq(P.count(world,5),4) && (P.ledger_bytes(world) > 0 : U32),
    "actual fifth reservation refusal retains remaining findings without delivery credit")

def main() -> IO(Unit):
  do IO<Unit>:
    empty_case()
    count_case(17n,0)
    baseline_case()
    upgrade_case()
    no_ack_case()
    bad_authorization_case()
    frozen_case()
    budget_case()
    IO.print("CANONICAL OUTPUT:24 directed checks complete")
