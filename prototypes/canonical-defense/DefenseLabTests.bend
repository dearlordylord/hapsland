# Independently expected game investments and shared issuance facts; no universal proof claim.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseConsumer.bend as Consumer
import ./DefenseModel.bend as M
import ./DefenseTowerFire.bend as Fire
import ./DefenseRules.bend as Rules
import ./DefenseMotionTypes.bend as MotionTypes
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Callbacks.bend as Callbacks
import ../../packages/monkey-business-bend/NativeRunCallbackControls.bend as Controls
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
    case H.TickObserved{world, _, _, _}: world
# NativeRun.observe exposes this exact stored count; do not build its other projections.
def events(world: M.World) -> Nat: Lab.consumed_events(M.engine(world))
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
      Callbacks.Fact{Callbacks.Target{_, Callbacks.ReviewServiceRequestSettled{_}, _}, _, _, _}
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
    case 1n+n:
      continue: List<&2, M.World> -> List<&2, M.World> = next => run_box(n, next)
      seek_selected((M.time(value(worlds)) >= 1000 : U32), worlds, continue)
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
    case Lab.Receipt{world, Lab.Unaffordable{}, 0}: U32.is_eq(M.gold(world), 39)
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
    }: Nat.is_eq(delay, 800n) && Nat.is_eq(lease, 12000n)
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
  Nat.is_eq(List.length(&2, C.ReviewWorkRecord, M.work(M.core(world))), 0n)
def bounded(+origin: M.World) -> Bool:
  +one: List<&2, M.World> = [tick_world(Lab.tick_bounded(origin, 1n))]
  +none: List<&2, M.World> = [tick_world(Lab.tick_bounded(value(one), 0n))]
  Nat.is_eq(Nat.sub(events(value(one)), events(origin)), 1n) &&
    Nat.is_eq(events(value(none)), events(value(one))) && U32.is_eq(
      M.time(value(none)),
      M.time(value(one))
    ) &&
    U32.is_eq(M.gold(value(one)), 160) && U32.is_eq(M.gold(value(none)), 160)
# These purchase-only predicates exercise the actual initial construction phase.
# Active workload remains in predicates9 onward; no purchase assertion needs it.
def investment(seed: Nat, budget: U32) -> M.World:
  Lab.with_budget(H.initial_config(Consumer.config(), seed), budget)
def test_0(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  charged(Lab.apply(value(origin), Lab.Build{424, 392, 3}), 50, 110)
def test_1(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  charged(Lab.apply(value(origin), Lab.Build{152, 392, 4}), 40, 120)
def test_2(seed: Nat, budget: U32) -> Bool:
  unknown(Lab.apply(investment(seed, budget), Lab.Build{424, 232, 2}))
def test_3(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  charged(Lab.build_priced(value(origin), 424, 392, 3, 17), 17, 143)
def test_4(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  illegal(Lab.apply(value(origin), Lab.Build{0, 0, 3}))
def test_5(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  poor(Lab.apply(Lab.with_budget(value(origin), 39), Lab.Build{152, 392, 4}))
def test_6(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  unknown(Lab.apply(value(origin), Lab.Upgrade{1}))
def test_7(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [investment(seed, budget)]
  +service: List<&2, M.World> = [world(Lab.apply(value(origin), Lab.Build{424, 392, 3}))]
  +two: List<&2, M.World> = [world(Lab.apply(value(service), Lab.Upgrade{1}))]
  +upgraded: List<&2, M.World> = [world(Lab.apply(value(two), Lab.Upgrade{1}))]
  U32.is_eq(M.gold(value(upgraded)), 10) && maximum(Lab.apply(value(upgraded), Lab.Upgrade{1}), 10)
def test_8(seed: Nat, budget: U32) -> Bool:
  +one = world(Lab.apply(investment(seed, budget), Lab.Build{152, 392, 4}))
  +two = world(Lab.apply(one, Lab.Upgrade{1}))
  +three = world(Lab.apply(two, Lab.Upgrade{1}))
  maximum(Lab.apply(three, Lab.Upgrade{1}), 40)
def test_9(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  bounded(value(origin))
def test_10(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  +service: List<&2, M.World> = [world(Lab.apply(value(origin), Lab.Build{424, 392, 3}))]
  +early: List<&2, M.World> = seek_box(600n, [value(service)], False{})
  forced_clear(M.engine(value(service))) && Nat.is_eq(
    captured(callbacks(M.engine(value(early))), False{}),
    3200n
  )
def test_11(+seed: Nat, +budget: U32) -> Bool:
  +origin: List<&2, M.World> = [created(True{}, True{}, 1, seed, budget)]
  +late: List<&2, M.World> = seek_box(600n, [value(origin)], False{})
  Nat.is_eq(captured(callbacks(M.engine(value(late))), False{}), 3200n) && Nat.is_eq(
    captured(callbacks(M.engine(world(Lab.apply(value(late), Lab.Build{424, 392, 3})))), False{}),
    3200n
  )
def test_12_profile(seed: Nat, budget: U32) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 4}))
  ]
  output_profile(M.engine(value(relay)))
def test_12_capture(seed: Nat, budget: U32, fuel: Nat) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 4}))
  ]
  +delivered: List<&2, M.World> = seek_box((fuel + 600n : Nat), [value(relay)], True{})
  Nat.is_eq(captured(callbacks(M.engine(value(delivered))), True{}), 800n)
def test_12(+seed: Nat, +budget: U32, fuel: Nat) -> Bool:
  test_12_profile(seed, budget) && test_12_capture(seed, budget, fuel)
def test_13(+seed: Nat, +budget: U32, +fuel: Nat) -> Bool:
  +relay: List<&2, M.World> = [
    world(Lab.apply(created(True{}, True{}, 2, seed, budget), Lab.Build{152, 392, 4}))
  ]
  +delivered: List<&2, M.World> = seek_box((fuel + 600n : Nat), [value(relay)], True{})
  Nat.is_eq(captured_lease(callbacks(M.engine(value(delivered)))), 12000n)
def test_14(+seed: Nat, +budget: U32, +fuel: Nat) -> Bool:
  +late_output: List<&2, M.World> = seek_box(
    (fuel + 600n : Nat),
    [created(True{}, True{}, 2, seed, budget)],
    True{}
  )
  Nat.is_eq(captured(callbacks(M.engine(value(late_output))), True{}), 800n) && Nat.is_eq(
    captured(
      callbacks(M.engine(world(Lab.apply(value(late_output), Lab.Build{152, 392, 4})))),
      True{}
    ),
    800n
  )
def test_15(seed: Nat, budget: U32) -> Bool:
  +repair: List<&2, M.World> = [
    world(Lab.apply(created(False{}, False{}, 1, seed, budget), Lab.Build{424, 232, 3}))
  ]
  Bool.not(access(M.engine(value(repair))))
def test_16(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(1000n, [created(True{}, False{}, 1, seed, budget)])
  empty_work(value(failed))
def test_17(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(1000n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 3}))]
  empty_work(value(after))
def test_18(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(1000n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 3}))]
  Bool.not(access(M.engine(value(after))))
def test_19(seed: Nat, budget: U32) -> Bool:
  +failed: List<&2, M.World> = run_box(1000n, [created(True{}, False{}, 1, seed, budget)])
  +after: List<&2, M.World> = [world(Lab.apply(value(failed), Lab.Build{424, 232, 3}))]
  Nat.is_eq(captured(callbacks(M.engine(value(after))), False{}), 0n)

# Active abilities: independently expected actual Host cases, not universal laws.
def active_created(seed: Nat, budget: U32, result: U32) -> M.World:
  Lab.create_scenario(
    Lab.Scenario{800n, 400n, 0n, True{}, True{}, result, 1, 60000},
    seed,
    budget,
    0
  )
def live_ticks(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: live_ticks(n, tick_world(Lab.tick_bounded(world, 256n)))
def active_ready(seed: Nat, budget: U32, kind: U32) -> M.World:
  live_ticks(290n, world(Lab.apply(active_created(seed, budget, 2), Lab.Build{652, 215, kind})))
def applied_free(receipt: Lab.Receipt, budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.Applied{}, 0}: U32.is_eq(M.gold(world), budget)
    case _: False{}
def ready_is(found: Maybe<&2, M.Tower>, ready: U32) -> Bool:
  match found:
    case Some{tower}: U32.is_eq(M.ready_at(tower), ready)
    case None{}: False{}
def cooldown_refused(receipt: Lab.Receipt) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.CoolingDown{}, 0}: ready_is(
      H.selected_tower(M.towers(world), 1),
      310
    )
    case _: False{}
def no_target(receipt: Lab.Receipt, budget: U32) -> Bool:
  match receipt:
    case Lab.Receipt{world, Lab.NoTarget{}, 0}: U32.is_eq(M.gold(world), budget)
    case _: False{}
def has_phase(found: Maybe<&2, C.ReviewWorkRecord>, phase: U32) -> Bool:
  match found:
    case Some{C.ReviewWorkRecord{_, _, _, _, _, kind, _}}: U32.is_eq(M.phase(kind), phase)
    case None{}: False{}
def test_20(+seed: Nat, +budget: U32) -> Bool:
  charged(Lab.apply(active_created(seed, budget, 2), Lab.Build{424, 392, 3}), 50, M.sub(budget, 50)) &&
    charged(
      Lab.apply(active_created(seed, budget, 2), Lab.Build{152, 392, 4}),
      40,
      M.sub(budget, 40)
    )
def test_21(seed: Nat, +budget: U32) -> Bool:
  +ready: List<&2, M.World> = [active_ready(seed, budget, 3)]
  +shot: List<&2, M.World> = [world(Lab.apply(value(ready), Lab.Fire{1, 3n}))]
  applied_free(Lab.apply(value(ready), Lab.Fire{1, 3n}), M.sub(budget, 50)) &&
    cooldown_refused(Lab.apply(value(shot), Lab.Fire{1, 4n}))
def test_22(seed: Nat, budget: U32) -> Bool:
  +after: List<&2, M.World> = [
    live_ticks(150n, world(Lab.apply(active_ready(seed, budget, 3), Lab.Fire{1, 3n})))
  ]
  has_phase(C.find_work(1n, 1n, 1n, 3n, M.work(M.core(value(after)))), 5) &&
    has_phase(C.find_work(1n, 1n, 1n, 4n, M.work(M.core(value(after)))), 4)
def test_23(+seed: Nat, +budget: U32) -> Bool:
  no_target(
    Lab.apply(
      world(Lab.apply(active_created(seed, budget, 2), Lab.Build{152, 392, 3})),
      Lab.Fire{1, 0n}
    ),
    M.sub(budget, 50)
  ) &&
    no_target(
      Lab.apply(
        world(Lab.apply(active_created(seed, budget, 1), Lab.Build{152, 392, 4})),
        Lab.Fire{1, 0n}
      ),
      M.sub(budget, 40)
    )
def test_24(seed: Nat, +budget: U32) -> Bool:
  +ready: List<&2, M.World> = [
    world(Lab.apply(active_ready(seed, budget, 3), Lab.Build{700, 215, 3}))
  ]
  +first: List<&2, M.World> = [world(Lab.apply(value(ready), Lab.Fire{1, 3n}))]
  applied_free(Lab.apply(value(first), Lab.Fire{2, 3n}), M.sub(budget, 100)) &&
    applied_free(Lab.apply(value(first), Lab.Fire{2, 4n}), M.sub(budget, 100))
def advance_active(+world: M.World, until: Nat) -> M.World:
  live_ticks((Nat.sub(until, (U32.to_nat(M.time(world)) * 20n : Nat)) / 20n : Nat), world)
# An actually eligible original is delayed through the public callback seam.
# The wide fixture range includes its destination, so leaving range cannot
# explain the later refusal; its captured output lease has expired.
def expired_control(result: Controls.Applied, +world: M.World, +budget: U32) -> Bool:
  match result:
    case Controls.Applied{state, Callbacks.Applied{}}:
      +expired = advance_active(M.with_engine(world, state), 26000n)
      no_target(Lab.apply(expired, Lab.Fire{1, 3n}), M.sub(budget, 40)) &&
        ready_is(H.selected_tower(M.towers(expired), 1), 0)
    case _: False{}
def expiry_target(found: Maybe<&2, Callbacks.Target>, +world: M.World, budget: U32) -> Bool:
  match found:
    case Some{+target}:
      +state = M.engine(world)
      expired_control(Controls.apply(state, target, Callbacks.Reschedule{30000n},
        Controls.callback_source(Controls.callback_sources(state), target)), world, budget)
    case None{}: False{}
# Seek a physically assembled packet; absence at the bounded horizon fails.
def packet_seek_result(
  found: Maybe<&2, Callbacks.Target>,
  world: M.World,
  rest: M.World -> M.World
) -> M.World:
  match found:
    case Some{_}: world
    case None{}: rest(world)
def packet_seek(fuel: Nat, +world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n:
      packet_seek_result(H.shot_target(world, 1, 3n), world,
        next => packet_seek(n, tick_world(Lab.tick_bounded(next, 256n))))
def test_25(seed: Nat, +budget: U32) -> Bool:
  +early = live_ticks(
    590n,
    world(Lab.build_tuned(active_created(seed, budget, 2), 152, 456, 4, 40, 1, 240))
  )
  +ready = packet_seek(600n, early)
  no_target(Lab.apply(early, Lab.Fire{1, 3n}), M.sub(budget, 40)) &&
    Rules.carrier_found(
      Rules.find(MotionTypes.WorkIdentity{1n, 1n, 1n, 3n}, Rules.groups(M.rules(ready)))
    ) &&
    expiry_target(H.shot_target(ready, 1, 3n), ready, budget)
