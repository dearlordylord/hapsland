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

def world(receipt: Lab.Receipt) -> M.World:
  match receipt:
    case Lab.Receipt{value, _, _}: value
def value(worlds: List<&2, M.World>) -> M.World:
  match worlds:
    case head <> _: head
    case Nil{}: H.initial()
def tick_world(tick: H.TickObserved) -> M.World:
  match tick:
    case H.TickObserved{world, _, _}: world
def count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_, count, _, _, _, _, _}: count
def events(world: M.World) -> Nat: count(Lab.engine_observation(world))
def callbacks(state: T.State) -> List<&2, T.RetainedCallback>:
  match state:
    case T.State{_, _, _, _, _, _, _, _, _, _, T.HostFacts{_, items, _, _, _, _}}: items
def captured(items: List<&2, T.RetainedCallback>, +output: Bool) -> Nat:
  match items:
    case Nil{}: 0n
    case T.RetainedCallback{
      _,
      issued,
      due,
      _,
      Callbacks.Fact{Callbacks.Target{_, Callbacks.JevSettled{_}, _}, _, _, _}
    } <> rest:
      Bool.pick(Nat, output, captured(rest, output), (due - issued : Nat))
    case T.RetainedCallback{
      _,
      issued,
      due,
      _,
      Callbacks.Fact{
        Callbacks.Target{_, Callbacks.OutputTerminal{_, _}, _},
        _,
        Driver.Action{C.SubmissionTerminal{_, _, _}, _, _, _, _},
        _
      }
    } <> rest:
      Bool.pick(Nat, output, (due - issued : Nat), captured(rest, output))
    case _ <> rest: captured(rest, output)
def captured_lease(items: List<&2, T.RetainedCallback>) -> Nat:
  match items:
    case Nil{}: 0n
    case T.RetainedCallback{
      _,
      _,
      _,
      _,
      Callbacks.Fact{
        Callbacks.Target{_, Callbacks.OutputTerminal{_, _}, _},
        _,
        Driver.Action{C.SubmissionTerminal{_, _, _}, _, _, _, _},
        Some{Output.Capture{Output.Individual{_, _}, _, _, _, lease}}
      }
    } <> _: lease
    case _ <> rest: captured_lease(rest)
def next_box(
  worlds: List<&2, M.World>,
  rest: List<&2, M.World> -> List<&2, M.World>
) -> List<&2, M.World>:
  match worlds:
    case world <> Nil{}: rest([tick_world(Lab.tick_bounded(world, 256n))])
    case _: []
def seek_selected(
  found: Bool,
  worlds: List<&2, M.World>,
  rest: List<&2, M.World> -> List<&2, M.World>
) -> List<&2, M.World>:
  match found:
    case True{}: worlds
    case False{}: next_box(worlds, rest)
def seek_box(fuel: Nat, +worlds: List<&2, M.World>, +output: Bool) -> List<&2, M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n:
      continuation: List<&2, M.World> -> List<&2, M.World> = next => seek_box(n, next, output)
      seek_selected(
        Nat.is_gt(captured(callbacks(M.engine(value(worlds))), output), 0n),
        worlds,
        continuation
      )
def run_box(fuel: Nat, +worlds: List<&2, M.World>) -> List<&2, M.World>:
  match fuel:
    case 0n: worlds
    case 1n+n: seek_selected((M.time(value(worlds)) >= 200 : U32), worlds, next => run_box(n, next))
def scenario(ready: Bool, readable: Bool, result: U32) -> Lab.Scenario:
  Lab.Scenario{3200n, 800n, 800n, ready, readable, result, 1, 60000}
def created(ready: Bool, readable: Bool, result: U32, +seed: Nat, budget: U32) -> M.World:
  Lab.create_scenario(
    scenario(ready, readable, Bool.pick(U32, Nat.is_eq(seed, 152n), result, 0)),
    seed,
    budget,
    0
  )
def charged(receipt: Lab.Receipt, price: U32, budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{+world, Lab.Applied{}, actual}:
      U32.is_eq(actual, price) && U32.is_eq(M.gold(world), budget) && Nat.is_eq(
        List.length(&2, M.Tower, M.towers(world)),
        1n
      )
    case _: False{}
def illegal(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.IllegalPlacement{}, 0}: U32.is_eq(M.gold(world), 160)
    case _: False{}
def poor(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.Unaffordable{}, 0}: U32.is_eq(M.gold(world), 54)
    case _: False{}
def maximum(receipt: Lab.Receipt, budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.MaxLevel{}, 0}: U32.is_eq(M.gold(world), budget)
    case _: False{}
def unknown(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.UnknownTower{}, 0}: U32.is_eq(M.gold(world), 160)
    case _: False{}
def output_profile(state: T.State) -> Bool:
  match state:
    case T.State{
      _,
      _,
      _,
      _,
      _,
      T.Environment{_, _, _, _, _, _, delay, lease, _, _, _, _, _, _},
      _,
      _,
      _,
      _,
      _
    }: Nat.is_eq(delay, 400n) && Nat.is_eq(lease, 5000n)
    case _: False{}
def forced_clear(state: T.State) -> Bool:
  match state:
    case T.State{
      _,
      _,
      _,
      _,
      _,
      T.Environment{_, Some{C.RequestClear{}}, _, _, _, _, _, _, _, _, _, _, _, _},
      _,
      _,
      _,
      _,
      _
    }: True{}
    case _: False{}
def access(state: T.State) -> Bool:
  match state:
    case T.State{
      _,
      _,
      _,
      _,
      _,
      T.Environment{_, _, _, _, _, _, _, _, _, True{}, 1n, True{}, _, _},
      _,
      _,
      _,
      _,
      _
    }: True{}
    case _: False{}
def empty_work(world: M.World) -> Bool:
  Nat.is_eq(List.length(&2, C.Work, M.work(M.core(world))), 0n)
def bounded(+origin: M.World) -> Bool:
  +one: List<&2, M.World> = [tick_world(Lab.tick_bounded(origin, 1n))]
  +none: List<&2, M.World> = [tick_world(Lab.tick_bounded(value(one), 0n))]
  Nat.is_eq(Nat.sub(events(value(one)), events(origin)), 1n) &&
    Nat.is_eq(events(value(none)), events(value(one))) && U32.is_eq(
      M.time(value(none)),
      M.time(value(one))
    ) &&
    U32.is_eq(M.gold(value(one)), 160) && U32.is_eq(M.gold(value(none)), 160)
def test_0(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  charged(Lab.apply(value(origin), Lab.Build{424, 392, 0}), 60, 100)
def test_1(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  charged(Lab.apply(value(origin), Lab.Build{152, 392, 1}), 55, 105)
def test_2(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  charged(Lab.apply(value(origin), Lab.Build{424, 232, 2}), 45, 115)
def test_3(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  charged(Lab.build_priced(value(origin), 424, 392, 0, 17), 17, 143)
def test_4(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  illegal(Lab.apply(value(origin), Lab.Build{0, 0, 0}))
def test_5(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  poor(Lab.apply(Lab.with_budget(value(origin), 54), Lab.Build{152, 392, 1}))
def test_6(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  unknown(Lab.apply(value(origin), Lab.Upgrade{1}))
def test_7(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  +service: List<&2, M.World> = [world(Lab.apply(value(origin), Lab.Build{424, 392, 0}))]
  +two: List<&2, M.World> = [world(Lab.apply(value(service), Lab.Upgrade{1}))]
  +upgraded: List<&2, M.World> = [world(Lab.apply(value(two), Lab.Upgrade{1}))]
  U32.is_eq(M.gold(value(upgraded)), 0) && maximum(Lab.apply(value(upgraded), Lab.Upgrade{1}), 0)
def test_8(+seed: Nat, +budget: U32) -> Bool:
  +repair: List<&2, M.World> = [
    world(Lab.apply(created(False{}, False{}, 1, seed, budget), Lab.Build{424, 232, 2}))
  ]
  maximum(Lab.apply(value(repair), Lab.Upgrade{1}), 115)
def test_9(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  bounded(value(origin))
def test_10(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  +service: List<&2, M.World> = [world(Lab.apply(value(origin), Lab.Build{424, 392, 0}))]
  +early: List<&2, M.World> = seek_box(250n, [value(service)], False{})
  forced_clear(M.engine(value(service))) && Nat.is_eq(
    captured(callbacks(M.engine(value(early))), False{}),
    1600n
  )
def test_11(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  +late: List<&2, M.World> = seek_box(250n, [value(origin)], False{})
  Nat.is_eq(captured(callbacks(M.engine(value(late))), False{}), 3200n) && Nat.is_eq(
    captured(callbacks(M.engine(world(Lab.apply(value(late), Lab.Build{424, 392, 0})))), False{}),
    3200n
  )
def test_12_profile(seed: Nat, budget: U32) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 1}))
  ]
  output_profile(M.engine(value(relay)))
def test_12_capture(seed: Nat, budget: U32, fuel: Nat) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 1}))
  ]
  +delivered: List<&2, M.World> = seek_box(fuel, [value(relay)], True{})
  Nat.is_eq(captured(callbacks(M.engine(value(delivered))), True{}), 400n)
def test_12(+seed: Nat, +budget: U32, fuel: Nat) -> Bool:
  test_12_profile(seed, budget) && test_12_capture(seed, budget, fuel)
def test_13(+seed: Nat, +budget: U32, +fuel: Nat) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 1}))
  ]
  +delivered: List<&2, M.World> = seek_box(fuel, [value(relay)], True{})
  Nat.is_eq(captured_lease(callbacks(M.engine(value(delivered)))), 5000n)
def test_14(+seed: Nat, +budget: U32, +fuel: Nat) -> Bool:
  +late_output: List<&2, M.World> = seek_box(
    fuel,
    [created(True{}, True{}, 2, seed, budget)],
    True{}
  )
  Nat.is_eq(captured(callbacks(M.engine(value(late_output))), True{}), 800n) && Nat.is_eq(
    captured(
      callbacks(M.engine(world(Lab.apply(value(late_output), Lab.Build{152, 392, 1})))),
      True{}
    ),
    800n
  )
def test_15(seed: Nat, budget: U32) -> Bool:
  +repair: List<&2, M.World> = [
    world(Lab.apply(created(False{}, False{}, 1, seed, budget), Lab.Build{424, 232, 2}))
  ]
  access(M.engine(value(repair)))
def test_16(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(200n, [created(True{}, False{}, 1, seed, budget)])
  empty_work(value(failed))
def test_17(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(200n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 2}))]
  empty_work(value(after))
def test_18(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(200n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 2}))]
  access(M.engine(value(after)))
def test_19(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(200n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 2}))]
  Nat.is_eq(captured(callbacks(M.engine(value(after))), False{}), 0n)
