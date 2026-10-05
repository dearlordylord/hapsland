# Independently expected game investments and shared issuance facts; no universal proof claim.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Callbacks.bend as Callbacks
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ../../packages/agent-flow-bend/Canonical.bend as C

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def world(receipt: Lab.Receipt) -> M.World:
  match receipt:
    case Lab.Receipt{value,_,_}: value
def value(worlds: List<&2,M.World>) -> M.World:
  match worlds:
    case head <> _: head
    case Nil{}: H.initial()
def tick_world(tick: H.TickObserved) -> M.World:
  match tick:
    case H.TickObserved{world,_,_}: world
def count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_,count,_,_,_,_,_}: count
def events(world: M.World) -> Nat: count(Lab.engine_observation(world))
def callbacks(state: T.State) -> List<&2,T.RetainedCallback>:
  match state:
    case T.State{_,_,_,_,_,_,_,_,_,_,T.HostFacts{_,items,_}}: items
def captured(items: List<&2,T.RetainedCallback>,+output: Bool) -> Nat:
  match items:
    case Nil{}: 0n
    case T.RetainedCallback{_,issued,due,_,Callbacks.Fact{Callbacks.Target{_,Callbacks.JevSettled{_},_},_,_,_}} <> rest:
      Bool.pick(Nat,output,captured(rest,output),(due - issued : Nat))
    case T.RetainedCallback{_,issued,due,_,Callbacks.Fact{Callbacks.Target{_,Callbacks.OutputTerminal{_,_},_},_,Driver.Action{C.SubmissionTerminal{_,_,_},_,_,_,_},_}} <> rest:
      Bool.pick(Nat,output,(due - issued : Nat),captured(rest,output))
    case _ <> rest: captured(rest,output)
def captured_lease(items: List<&2,T.RetainedCallback>) -> Nat:
  match items:
    case Nil{}: 0n
    case T.RetainedCallback{_,_,_,_,Callbacks.Fact{Callbacks.Target{_,Callbacks.OutputTerminal{_,_},_},_,Driver.Action{C.SubmissionTerminal{_,_,_},_,_,_,_},Some{Output.Capture{Output.Individual{_,_},_,_,_,lease}}}} <> _: lease
    case _ <> rest: captured_lease(rest)
def next_box(worlds: List<&2,M.World>,rest: List<&2,M.World> -> List<&2,M.World>) -> List<&2,M.World>:
  match worlds:
    case world <> Nil{}: rest([tick_world(Lab.tick_bounded(world,256n))])
    case _: []
def seek_selected(found: Bool,worlds: List<&2,M.World>,rest: List<&2,M.World> -> List<&2,M.World>) -> List<&2,M.World>:
  match found:
    case True{}: worlds
    case False{}: next_box(worlds,rest)
def seek_box(fuel: Nat,+worlds: List<&2,M.World>,+output: Bool) -> List<&2,M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n:
      seek_selected(Nat.is_gt(captured(callbacks(M.engine(value(worlds))),output),0n),worlds,next => seek_box(n,next,output))
def run_box(fuel: Nat,+worlds: List<&2,M.World>) -> List<&2,M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n: seek_selected((M.time(value(worlds)) >= 200 : U32),worlds,next => run_box(n,next))
def scenario(ready: Bool,readable: Bool,result: U32) -> Lab.Scenario:
  Lab.Scenario{3200n,800n,800n,ready,readable,result,1,60000}
def created(ready: Bool,readable: Bool,result: U32,seed: Nat) -> M.World:
  Lab.create_scenario(scenario(ready,readable,result),seed,160,0)
def charged(receipt: Lab.Receipt,price: U32,budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{+world,Lab.Applied{},actual}:
      U32.is_eq(actual,price) && U32.is_eq(M.gold(world),budget) && Nat.is_eq(List.length(&2,M.Tower,M.towers(world)),1n)
    case _: False{}
def illegal(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.IllegalPlacement{},0}: U32.is_eq(M.gold(world),160)
    case _: False{}
def poor(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.Unaffordable{},0}: U32.is_eq(M.gold(world),54)
    case _: False{}
def maximum(receipt: Lab.Receipt,budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.MaxLevel{},0}: U32.is_eq(M.gold(world),budget)
    case _: False{}
def unknown(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world,Lab.UnknownTower{},0}: U32.is_eq(M.gold(world),160)
    case _: False{}
def output_profile(state: T.State) -> Bool:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,_,_,_,_,_,400n,5000n,_,_,_,_,_,_},_,_,_,_,_}: True{}
    case _: False{}
def forced_clear(state: T.State) -> Bool:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,Some{C.RequestClear{}},_,_,_,_,_,_,_,_,_,_,_,_},_,_,_,_,_}: True{}
    case _: False{}
def access(state: T.State) -> Bool:
  match state:
    case T.State{_,_,_,_,_,T.Environment{_,_,_,_,_,_,_,_,_,True{},1n,True{},_,_},_,_,_,_,_}: True{}
    case _: False{}
def empty_work(world: M.World) -> Bool:
  Nat.is_eq(List.length(&2,C.Work,M.work(M.core(world))),0n)
def bounded(+origin: M.World) -> Bool:
  +one: List<&2,M.World> = [tick_world(Lab.tick_bounded(origin,1n))]
  +none: List<&2,M.World> = [tick_world(Lab.tick_bounded(value(one),0n))]
  Nat.is_eq(Nat.sub(events(value(one)),events(origin)),1n) &&
    Nat.is_eq(events(value(none)),events(value(one))) && U32.is_eq(M.time(value(none)),M.time(value(one))) &&
    U32.is_eq(M.gold(value(one)),160) && U32.is_eq(M.gold(value(none)),160)
def prices(+seed: Nat) -> IO(Unit):
  +origin: List<&2,M.World> = [created(True{},True{},1,seed)]
  do IO<Unit>:
    require(charged(Lab.apply(value(origin),Lab.Build{424,392,0}),60,100),"Jev Service construction costs60")
    require(charged(Lab.apply(value(origin),Lab.Build{152,392,1}),55,105),"Delivery Relay construction costs55")
    require(charged(Lab.apply(value(origin),Lab.Build{424,232,2}),45,115),"Access Repair construction costs45")
    require(charged(Lab.build_priced(value(origin),424,392,0,17),17,143),"experimental price17 changes accounting while retaining actual Host build")
def refusals(+seed: Nat) -> IO(Unit):
  +origin: List<&2,M.World> = [created(True{},True{},1,seed)]
  do IO<Unit>:
    require(illegal(Lab.apply(value(origin),Lab.Build{0,0,0})),"illegal placement preserves160 budget")
    require(poor(Lab.apply(Lab.with_budget(value(origin),54),Lab.Build{152,392,1})),"unaffordable placement costs zero")
    require(unknown(Lab.apply(value(origin),Lab.Upgrade{1})),"absent tower upgrade costs zero")
def upgrades(+seed: Nat) -> IO(Unit):
  +origin: List<&2,M.World> = [created(True{},True{},1,seed)]
  +service: List<&2,M.World> = [world(Lab.apply(value(origin),Lab.Build{424,392,0}))]
  +repair: List<&2,M.World> = [world(Lab.apply(created(False{},False{},1,seed),Lab.Build{424,232,2}))]
  +two: List<&2,M.World> = [world(Lab.apply(value(service),Lab.Upgrade{1}))]
  +upgraded: List<&2,M.World> = [world(Lab.apply(value(two),Lab.Upgrade{1}))]
  do IO<Unit>:
    require(U32.is_eq(M.gold(value(upgraded)),0) && maximum(Lab.apply(value(upgraded),Lab.Upgrade{1}),0),"service upgrades cost40 then60; level3 rejects further charge")
    require(maximum(Lab.apply(value(repair),Lab.Upgrade{1}),115),"Access Repair rejects fictional speed upgrades")
def limits(+seed: Nat) -> IO(Unit):
  +origin: List<&2,M.World> = [created(True{},True{},1,seed)]
  do IO<Unit>:
    require(bounded(value(origin)),"hard event budget permits exactly one transition; zero freezes events and game tick without rewards")
def jev_cases(+seed: Nat) -> IO(Unit):
  +origin: List<&2,M.World> = [created(True{},True{},1,seed)]
  +service: List<&2,M.World> = [world(Lab.apply(value(origin),Lab.Build{424,392,0}))]
  +early: List<&2,M.World> = seek_box(250n,[value(service)],False{})
  +late: List<&2,M.World> = seek_box(250n,[value(origin)],False{})
  do IO<Unit>:
    require(forced_clear(M.engine(value(service))) && Nat.is_eq(captured(callbacks(M.engine(value(early))),False{}),1600n),"early service halves future captured request delay without changing forced clear")
    require(Nat.is_eq(captured(callbacks(M.engine(value(late))),False{}),3200n) && Nat.is_eq(captured(callbacks(M.engine(world(Lab.apply(value(late),Lab.Build{424,392,0})))),False{}),3200n),"late service preserves issued3200ms request")
def relay_cases(+seed: Nat) -> IO(Unit):
  +relay: List<&2,M.World> = [world(Lab.apply(created(True{},True{},2,seed),Lab.Build{152,392,1}))]
  +delivered: List<&2,M.World> = seek_box(400n,[value(relay)],True{})
  +late_output: List<&2,M.World> = seek_box(400n,[created(True{},True{},2,seed)],True{})
  do IO<Unit>:
    require(output_profile(M.engine(value(relay))) && Nat.is_eq(captured(callbacks(M.engine(value(delivered))),True{}),400n),"relay halves future captured delivery delay and preserves5000ms lease")
    require(Nat.is_eq(captured_lease(callbacks(M.engine(value(delivered)))),5000n),"relay issued individual output retains its captured5000ms lease")
    require(Nat.is_eq(captured(callbacks(M.engine(value(late_output))),True{}),800n) && Nat.is_eq(captured(callbacks(M.engine(world(Lab.apply(value(late_output),Lab.Build{152,392,1})))),True{}),800n),"late relay preserves already captured800ms output delivery")
def repaired_checks(+failed: List<&2,M.World>,+after: List<&2,M.World>) -> IO(Unit):
  do IO<Unit>:
    require(empty_work(value(failed)),"failed source work has already left the canonical work set")
    require(empty_work(value(after)),"repair does not resurrect failed source work")
    require(access(M.engine(value(after))),"late repair restores access without rotating generation1")
    require(Nat.is_eq(captured(callbacks(M.engine(value(after))),False{}),0n),"late repair does not issue a request for failed source work")
def repaired(+failed: List<&2,M.World>) -> IO(Unit):
  repaired_checks(failed,[world(Lab.apply(value(failed),Lab.Build{424,232,2}))])
def repair_cases(+seed: Nat) -> IO(Unit):
  +repair: List<&2,M.World> = [world(Lab.apply(created(False{},False{},1,seed),Lab.Build{424,232,2}))]
  do IO<Unit>:
    require(access(M.engine(value(repair))),"repair restores source and credentials without rotating generation1")
    repaired(run_box(200n,[created(True{},False{},1,seed)]))
def group_low(kind: U32,seed: Nat) -> IO(Unit):
  match kind:
    case 0: prices(seed)
    case 1: refusals(seed)
    case _: upgrades(seed)
def group_middle(kind: U32,seed: Nat) -> IO(Unit):
  match kind:
    case 3: limits(seed)
    case 4: jev_cases(seed)
    case _: relay_cases(seed)
def group_upper(middle: Bool,kind: U32,seed: Nat) -> IO(Unit):
  match middle:
    case True{}: group_middle(kind,seed)
    case False{}: repair_cases(seed)
def group_choice(low: Bool,+kind: U32,seed: Nat) -> IO(Unit):
  match low:
    case True{}: group_low(kind,seed)
    case False{}: group_upper((kind < 6 : U32),kind,seed)
def group(+kind: U32,seed: Nat) -> IO(Unit):
  group_choice((kind < 3 : U32),kind,seed)
# Runtime fixture group and seed inputs limit closed-main specialization. Values are checked
# against the authored experiment before any assertion executes.
def verified(ok: Bool,mode: U32,seed: Nat) -> IO(Unit):
  match ok:
    case True{}: group(mode,seed)
    case False{}: IO.die(Unit,1,"expected fixture seed152 budget160 layout0")
def verify(+mode: Nat,+seed: Nat,+budget: Nat,+layout: Nat) -> IO(Unit):
  verified(Nat.is_le(mode,6n) && Nat.is_eq(seed,152n) && Nat.is_eq(budget,160n) && Nat.is_eq(layout,0n),U32.from_nat(mode),seed)
def three(text: String) -> Nat:
  match text:
    case SCon{a,SCon{b,SCon{c,SNil{}}}}:
      (U32.to_nat((Char.to_u32(a) - 48 : U32)) * 100n + U32.to_nat((Char.to_u32(b) - 48 : U32)) * 10n + U32.to_nat((Char.to_u32(c) - 48 : U32)) : Nat)
    case _: 0n
def one(text: String) -> Nat:
  match text:
    case SCon{head,SNil{}}: U32.to_nat((Char.to_u32(head) - 48 : U32))
    case _: 100n
def arguments(args: List<String>) -> IO(Unit):
  match args:
    case _ <> mode <> seed <> budget <> layout <> Nil{}: verify(one(mode),three(seed),three(budget),one(layout))
    case _: IO.die(Unit,1,"expected fixture arguments:<group0..6> 152 160 0")
def main() -> IO(Unit):
  IO.bind(List<String>,Unit,IO.args(),args => arguments(args))
