# Native continuous consumer. All business transitions are owned by shared NativeRun.
import Base
import ./DefenseSession.bend as Session
import ./DefenseTransport.bend as Transport
import ./DefenseLiveMotion.bend as Live
import ./DefenseMotionTypes.bend as V
import ./DefenseMechanics.bend as Mechanics
import ./DefenseTowerFire.bend as Fire
import ./DefenseMotion.bend as Motion
import ./DefenseRules.bend as Rules
import ./DefenseRulePolicy.bend as RulePolicy
import ./DefenseAuto.bend as A
import ./DefenseCues.bend as Cues
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseEffects.bend as E
import ./DefenseMap.bend as Map
import ./DefenseOutput.bend as O
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Numeric.bend as Numeric
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Ledger.bend as Ledger
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/CollectionState.bend as Collection

def initial_config(+config: T.Config, seed: Nat) -> M.World:
  M.World{[Run.create(config, seed)], 0, False{}, 0, 3, 160, 100, [], False{}, 0, 0, 0, 0,
    [M.with_settings(M.initial_control(), M.config_settings(config))], 0, 0, 0, 0, 0}
def initial() -> M.World: initial_config(Consumer.config(), Consumer.seed())
def tower_cost(kind: U32) -> U32:
  Mechanics.cost(kind)
def tower_name(kind: U32) -> String:
  Mechanics.name(kind)
def tower_detail(kind: U32) -> String:
  Mechanics.detail(kind)
def tower_range(kind: U32, level: U32) -> U32:
  Mechanics.range(kind, level)
def built_range(tower: M.Tower) -> U32:
  Mechanics.tower_range(tower)
def upgrade_cost(kind: U32, level: U32) -> U32:
  ((Mechanics.cost(kind) * (level + 1) * 2) / 5 : U32)
def damage_flash(world: M.World) -> Bool:
  (M.damage_flash(world) > 0 : U32)

# Health measures actual occupied ledger pressure, independently of geometry and playback.
def pressure_buffer() -> U32: 80
def pressure_hot(raw: U32) -> Bool: (raw > pressure_buffer() : U32)
def damage_work(raw: U32) -> U32: ((200 * M.sub(raw, pressure_buffer())) / 80 : U32)
def residual_damage(world: M.World) -> U32: damage_work(P.ledger_bytes(world))
def damage(+world: M.World) -> M.World:
  match world:
    case M.World{
      core,
      t,
      p,
      l,
      c,
      g,
      +h,
      towers,
      a,
      o,
      r,
      cl,
      d,
      auto,
      x,
      y,
      selected,
      +work,
      +flash
    }:
      +total = Session.damage_total(M.mode(world), (work + residual_damage(world) : U32))
      +hit = (total >= 10000 : U32) && (h > 0 : U32)
      remainder: U32 = (total % 10000 : U32)
      M.World{
        core,
        t,
        p,
        l,
        c,
        g,
        M.sub(h, Bool.to_u32(hit)),
        towers,
        a,
        o,
        r,
        cl,
        d,
        auto,
        x,
        y,
        selected,
        remainder,
        Bool.pick(U32, hit, 10, M.sub(flash, 1))
      }

def drained(+world: M.World) -> Bool:
  Nat.is_eq(List.length(&2, C.ReviewWorkRecord, M.work(M.core(world))), 0n) &&
    U32.is_eq(P.requests(world), 0) && U32.is_eq(P.writes(world), 0) && U32.is_eq(
      P.leases(world),
      0
    )
def run_status(+world: M.World) -> U32:
  Bool.pick(U32, M.defeated(world), 3, Bool.pick(U32, M.auto(world), 1, 0))
def clock_active(
  +world: M.World
) -> Bool: M.active(world) && Bool.not(M.paused(world)) && M.playable(world)
def controlled(world: M.World, result: T.Controlled) -> M.World:
  match result:
    case T.Controlled{state, _}: M.with_engine(world, state)
def action(+world: M.World, control: T.Control) -> M.World:
  controlled(world, Run.control(M.engine(world), control))
def pick_world(selected: Bool, yes: M.World, no: M.World) -> M.World:
  match selected:
    case True{}: yes
    case False{}: no
def started(world: M.World) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, _, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, True{}, o, r, cl, d, auto, x, y, selected, work, flash}
def burst_controlled(world: M.World, result: T.Controlled) -> M.World:
  match result:
    case T.Controlled{state, True{}}: Cues.burst(M.with_engine(started(world), state))
    case T.Controlled{_, False{}}: world
def burst(+world: M.World, count: U32) -> M.World:
  burst_controlled(
    world,
    Run.control(M.engine(world), T.WorkloadControl{Some{1n}, Workload.Burst{U32.to_nat(count)}})
  )
def start(+world: M.World) -> M.World: burst(world, M.burst_size(M.settings(world)))
def next_burst(size: U32) -> U32:
  match size:
    case 1: 5
    case 5: 10
    case 10: 20
    case _: 1
def cycle_burst(+world: M.World) -> M.World:
  M.with_control(
    world,
    M.with_settings(
      M.control(world),
      M.with_burst(M.settings(world), next_burst(M.burst_size(M.settings(world))))
    )
  )
# Exact release sizes remain independent of recurring arrival pacing.
def adjust_burst(+world: M.World, increase: Bool) -> M.World:
  +size = M.burst_size(M.settings(world))
  M.with_control(world, M.with_settings(M.control(world), M.with_burst(M.settings(world),
    Bool.pick(U32, increase, U32.min(1024, (size + 1 : U32)), U32.max(1, M.sub(size, 1))))))
# An explicit pre-start outage scenario exposes unavailable access; towers do not repair it.
def outage_environment(world: M.World, env: T.Environment) -> M.World:
  match env:
    case T.Environment{_, _, _, _, _, _, _, _, current, _, generation, _, _, _}:
      action(world, T.EnvironmentControl{current, False{}, generation, False{}})
def outage_allowed(allowed: Bool, +world: M.World) -> M.World:
  match allowed:
    case True{}: outage_environment(world, Mechanics.current_environment(M.engine(world)))
    case False{}: world
def outage(+world: M.World) -> M.World: outage_allowed(Bool.not(M.active(world)), world)
def frame_counts(outputs: List<&2, C.Output>, +kind: U32) -> U32:
  match outputs:
    case Nil{}: 0
    case C.EventEstablished{C.FinishRecorded{C.Acknowledged{}}} <> rest: (Bool.to_u32(
      U32.is_eq(kind, 0)
    ) + frame_counts(rest, kind) : U32)
    case C.EventEstablished{C.ReviewServiceRequestOutcomeRecorded{C.RequestClear{}}} <> rest:
      (Bool.to_u32(U32.is_eq(kind, 2)) + frame_counts(rest, kind) : U32)
    case C.PolicyDecided{C.CapacityRefused{_, _}} <> rest: (Bool.to_u32(U32.is_eq(kind, 3)) + frame_counts(
      rest,
      kind
    ) : U32)
    case C.PolicyDecided{C.PreparedCapacityRefused{}} <> rest: (Bool.to_u32(U32.is_eq(kind, 3)) + frame_counts(
      rest,
      kind
    ) : U32)
    case C.PolicyDecided{C.PreparationRefused{}} <> rest: (Bool.to_u32(U32.is_eq(kind, 3)) + frame_counts(
      rest,
      kind
    ) : U32)
    case _ <> rest: frame_counts(rest, kind)
def observed_event(event: C.CanonicalEvent, kind: U32) -> U32:
  match event:
    case C.AdmitObservation{_, _, _}: Bool.to_u32(U32.is_eq(kind, 1))
    case _: 0
def observed_count(frame: T.Frame, +kind: U32) -> U32:
  match frame:
    case T.ProductFrame{_, _, event, _, _, outputs, None{}, _}: (observed_event(event, kind) + frame_counts(
      outputs,
      kind
    ) : U32)
    case _: 0
def count_frames(frames: List<&2, T.Frame>, +kind: U32) -> U32:
  match frames:
    case Nil{}: 0
    case frame <> rest: (observed_count(frame, kind) + count_frames(rest, kind) : U32)
def recorded_submission(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.EventEstablished{C.SubmissionRecorded{}} <> _: True{}
    case _ <> tail: recorded_submission(tail)
def individual_deliveries(frames: List<&2, T.Frame>) -> U32:
  match frames:
    case Nil{}: 0
    case T.ProductFrame{_, _, C.SubmissionTerminal{_, _, True{}}, _, _, outputs, None{}, _} <> tail:
      (Bool.to_u32(recorded_submission(outputs)) + individual_deliveries(tail) : U32)
    case _ <> tail: individual_deliveries(tail)
# A frame budget can stop inside a tick. Do not publish a future visual horizon.
def horizon_complete(status: T.AdvanceStatus) -> Bool:
  match status:
    case T.ContinueAdvance{}: False{}
    case _: True{}
def step_complete(state: T.State, until: Nat) -> Bool:
  horizon_complete(Run.advance_status(state, 1n, until))
def consumed(+world: M.World, advanced: T.Advanced) -> M.World:
  match world advanced:
    case M.World{_, +t, p, l, c, +g, h, ts, a, +o, +r, +cl, +d, auto, x, y, selected, work, flash} T.Advanced{
      +state,
      +frames,
      _
    }:
      +delivered = count_frames(frames, 0)
      M.with_submissions(Cues.tick(
        world,
        M.World{
          [state],
          (t + Bool.to_u32(step_complete(state, (U32.to_nat(t) * 20n + 20n : Nat))) : U32),
          p,
          l,
          c,
          g,
          h,
          ts,
          a,
          (o + count_frames(frames, 1) : U32),
          (r + count_frames(frames, 3) : U32),
          (cl + count_frames(frames, 2) : U32),
          (d + delivered : U32),
          auto,
          x,
          y,
          selected,
          work,
          flash
        },
        frames
      ), (M.submissions(world) + individual_deliveries(frames) : U32))
type TickObserved is Data:
  TickObserved{
    world: M.World,
    frames: List<&2, T.Frame>,
    physical: List<&2, T.PhysicalDelivery>,
    transport: List<&2, Transport.Change>
  }
def with_endings(+before: M.World, +after: M.World, +frames: List<&2, T.Frame>) -> M.World:
  M.with_cues(
    after,
    List.append(
      &2,
      M.Cue,
      Live.endings(M.mobs(before), before, after, frames),
      List.append(&2, M.Cue, Live.instant_frames(frames, before, after), M.cues(after))
    )
  )
def damage_when(advanced: Bool, world: M.World) -> M.World:
  match advanced:
    case True{}: damage(world)
    case False{}: world
def completed_tick(+before: M.World, +after: M.World) -> M.World:
  damage_when((M.time(after) > M.time(before) : U32), after)
# One original event at a time: newly issued callbacks acquire physical transport
# before a zero-time completion can be consumed. The journal is replay input.
def micro(+world: M.World, +advanced: T.Advanced) -> Transport.Transported:
  match advanced:
    case T.Advanced{state, +frames, _}:
      +rules = Rules.ingest(frames, M.rules(world))
      +next = M.with_rules(
        M.with_actors(
          M.with_engine(world, Rules.enqueue_counts(Rules.count_frames(frames, rules), state)),
          Motion.ingest(frames, M.actors(world), M.layout(world))
        ),
        rules
      )
      Transport.synchronize(
        M.with_mobs(next, Live.reconcile(Fire.physical_targets(next), world, next, frames))
      )
def event_result(
  result: Transport.Transported,
  frames: List<&2, T.Frame>,
  physical: List<&2, T.PhysicalDelivery>,
  changes: List<&2, Transport.Change>
) -> TickObserved:
  match result:
    case Transport.Transported{world, more}: TickObserved{
      world,
      frames,
      physical,
      List.append(&2, Transport.Change, changes, more)
    }
def micro_result(
  +world: M.World,
  +advanced: T.Advanced,
  frames: List<&2, T.Frame>,
  physical: List<&2, T.PhysicalDelivery>,
  changes: List<&2, Transport.Change>
) -> TickObserved:
  match advanced:
    case T.Advanced{_, more, deliveries}:
      event_result(
        micro(world, advanced),
        List.append(&2, T.Frame, frames, more),
        List.append(&2, T.PhysicalDelivery, physical, deliveries),
        changes
      )
def advance_event(
  active: Bool,
  +world: M.World,
  frames: List<&2, T.Frame>,
  physical: List<&2, T.PhysicalDelivery>,
  changes: List<&2, Transport.Change>,
  +until: Nat,
  continue: TickObserved -> TickObserved
) -> TickObserved:
  match active:
    case False{}: TickObserved{world, frames, physical, changes}
    case True{}: continue(
      micro_result(world, Run.advance(M.engine(world), 1n, until), frames, physical, changes)
    )
def event_loop(fuel: Nat, value: TickObserved, +until: Nat) -> TickObserved:
  match fuel value:
    case 0n result: result
    case 1n+n TickObserved{+world, frames, physical, changes}:
      continue: TickObserved -> TickObserved = value => event_loop(n, value, until)
      advance_event(
        Bool.not(step_complete(M.engine(world), until)),
        world,
        frames,
        physical,
        changes,
        until,
        continue
      )
def physics_step(active: Bool, world: M.World) -> M.World:
  match active:
    case True{}: Rules.step_actors(Rules.tick(world))
    case False{}: world
def finish_transport(+before: M.World, value: TickObserved) -> TickObserved:
  match value:
    case TickObserved{+world, +frames, +physical, changes}:
      +counted = consumed(before, T.Advanced{M.engine(world), frames, physical})
      +combined = M.with_mobs(
        M.with_rules(M.with_actors(counted, M.actors(world)), M.rules(world)),
        M.mobs(world)
      )
      +moved = physics_step((M.time(combined) > M.time(before) : U32), combined)
      +live = M.with_mobs(moved, Live.reconcile(Fire.physical_targets(moved), world, moved, []))
      TickObserved{
        completed_tick(before, with_endings(before, live, frames)),
        frames,
        physical,
        changes
      }
def begin_transport(
  result: Transport.Transported,
  before: M.World,
  budget: Nat,
  until: Nat
) -> TickObserved:
  match result:
    case Transport.Transported{world, changes}: finish_transport(
      before,
      event_loop(budget, TickObserved{world, [], [], changes}, until)
    )
def bounded_observed(+world: M.World, budget: Nat) -> TickObserved:
  begin_transport(
    Transport.synchronize(world),
    world,
    budget,
    (U32.to_nat(M.time(world)) * 20n + 20n : Nat)
  )
def ticking_observed(world: M.World) -> TickObserved: bounded_observed(world, 256n)
def playback_when(active: Bool, +world: M.World) -> M.World:
  match active:
    case True{}:
      +ruled = Rules.tick(world)
      Rules.step_actors(ruled)
    case False{}: world
def tick_when_manual(active: Bool, +world: M.World) -> TickObserved:
  match active:
    case True{}: ticking_observed(world)
    case False{}: TickObserved{
      playback_when(clock_active(world), world),
      Nil{},
      Nil{}, []
    }
def tick_when(+active: Bool, +world: M.World) -> TickObserved:
  tick_when_manual(
    active,
    Fire.automatic_world(
      Fire.automatic_when(
        active && step_complete(M.engine(world), (U32.to_nat(M.time(world)) * 20n : Nat)),
        world
      )
    )
  )
def tick_observed(+world: M.World) -> TickObserved:
  tick_when(clock_active(world), world)
def tick_world(observed: TickObserved) -> M.World:
  match observed:
    case TickObserved{world, _, _, _}: world
def ticking(world: M.World) -> M.World:
  tick_world(ticking_observed(world))
def tick(world: M.World) -> M.World:
  tick_world(tick_observed(world))
def move(world: M.World, x: U32, y: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, auto, _, _, selected, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}
def map_free(+world: M.World) -> Bool:
  Bool.and(
    Nat.is_eq(List.length(&2, V.Actor, M.actors(world)), 0n),
    Bool.and(
      Nat.is_eq(List.length(&2, M.Tower, M.towers(world)), 0n),
      Bool.and(
        Nat.is_eq(List.length(&2, C.ReviewWorkRecord, M.work(M.core(world))), 0n),
        U32.is_eq(P.writes(world), 0)
      )
    )
  )
def selected_tower(items: List<&2, M.Tower>, index: U32) -> Maybe<&2, M.Tower>:
  match items index:
    case Nil{} _: None{}
    case tower <> _ 1: Some{tower}
    case _ <> rest _: selected_tower(rest, M.sub(index, 1))
def shot_target_found(
  found: Maybe<&2, M.Tower>,
  world: M.World,
  wanted: Nat
) -> Maybe<&2, CB.Target>:
  match found:
    case Some{tower}: Fire.target(world, tower, wanted)
    case None{}: None{}
def shot_target(+world: M.World, index: U32, wanted: Nat) -> Maybe<&2, CB.Target>:
  shot_target_found(selected_tower(M.towers(world), index), world, wanted)
def fire_found(found: Maybe<&2, M.Tower>, world: M.World, index: U32, wanted: Nat) -> Fire.Shot:
  match found:
    case Some{tower}: Fire.fire(world, index, tower, wanted)
    case None{}: Fire.Shot{world, 4}
def fire(+world: M.World, +index: U32, wanted: Nat) -> Fire.Shot:
  fire_found(selected_tower(M.towers(world), index), world, index, wanted)
def fired_world(shot: Fire.Shot) -> M.World:
  match shot:
    case Fire.Shot{world, _}: world
def fire_world(world: M.World, index: U32, wanted: Nat) -> M.World:
  fired_world(fire(world, index, wanted))
def upgrade_items(items: List<&2, M.Tower>, index: U32) -> List<&2, M.Tower>:
  match items index:
    case Nil{} _: Nil{}
    case tower <> rest 1: Mechanics.upgraded(tower) <> rest
    case tower <> rest _: tower <> upgrade_items(rest, M.sub(index, 1))
def upgrade_found(+world: M.World, found: Maybe<&2, M.Tower>) -> M.World:
  match world found:
    case M.World{core, t, p, l, c, +g, h, +ts, a, o, r, cl, d, auto, x, y, +selected, work, flash} Some{
      +tower
    }:
      pick_world(
        Bool.and(
          (M.level(tower) < Mechanics.max_level(M.tkind(tower)) : U32),
          (g >= upgrade_cost(M.tkind(tower), M.level(tower)) : U32)
        ),
        (
          M.World{
            core,
            t,
            p,
            l,
            c,
            M.sub(g, upgrade_cost(M.tkind(tower), M.level(tower))),
            h,
            upgrade_items(ts, selected),
            a,
            o,
            r,
            cl,
            d,
            auto,
            x,
            y,
            selected,
            work,
            flash
          }
        ),
        world
      )
    case _ _: world
def upgrade_when(alive: Bool, +world: M.World) -> M.World:
  match alive:
    case True{}: upgrade_found(world, selected_tower(M.towers(world), M.selected(world)))
    case False{}: world
def upgrade(+world: M.World) -> M.World:
  upgrade_when(M.playable(world), world)
def reset_found(world: M.World, layout: U32) -> M.World:
  match world:
    case M.World{core, t, p, _, c, g, h, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, layout, c, g, h, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}

def reset_layout(layout: U32) -> M.World:
  match layout:
    case +l:
      world: M.World = initial()
      reset_found(world, l)
def pacing(+world: M.World, faster: Bool) -> M.World:
  +pace = Bool.pick(
    U32,
    faster,
    U32.max(20, M.sub(M.arrival_interval(world), 100)),
    U32.min(60000, (M.arrival_interval(world) + 100 : U32))
  )
  action(
    M.with_control(world, M.control_with_pace(M.control(world), pace)),
    T.WorkloadControl{Some{1n}, Workload.Pace{pace}}
  )
# Future issuance captures the selected profile; started requests keep theirs.
def configure_rules(world: M.World, checks: U32, percent: U32) -> M.World:
  Rules.configured(world, RulePolicy.profile(checks, percent))
def change_rule_count(+world: M.World, increase: Bool) -> M.World:
  +value = Rules.profile(M.rules(world))
  configure_rules(
    world,
    Bool.pick(
      U32,
      increase,
      (RulePolicy.checks(value) + 1 : U32),
      M.sub(RulePolicy.checks(value), 1)
    ),
    RulePolicy.percent(value)
  )
def change_rule_chance(+world: M.World, increase: Bool) -> M.World:
  +value = Rules.profile(M.rules(world))
  configure_rules(
    world,
    RulePolicy.checks(value),
    Bool.pick(
      U32,
      increase,
      (RulePolicy.percent(value) + 10 : U32),
      M.sub(RulePolicy.percent(value), 10)
    )
  )
# Caller input only. NativeRun resolves the captured activity and owns Stop.
def finish_activity(+world: M.World, at: Nat, activity: Maybe<&2, Nat>) -> M.World:
  match activity:
    case Some{value}: M.with_engine(
      world,
      Run.enqueue(M.engine(world), at, T.StartFinish{1n, value, False{}})
    )
    case None{}: world
def schedule_finish(+world: M.World, at: Nat) -> M.World:
  finish_activity(
    world,
    Nat.max(at, Run.clock(M.engine(world))),
    Engine.activity_scope(Run.core(M.engine(world)), 1n)
  )
def request_finish_when(allowed: Bool, +world: M.World) -> M.World:
  match allowed:
    case True{}: schedule_finish(world, Fire.delivery_at(world))
    case False{}: world
def request_finish(+world: M.World) -> M.World:
  request_finish_when(
    clock_active(world) && Bool.not(Run.active_finish(M.engine(world), 1n)),
    world
  )

def key_result(+world: M.World, code: U32) -> M.World:
  match code:
    case 114: reset_layout(M.layout(world))
    case 117: upgrade(world)
    case 98: cycle_burst(world)
    case 43: adjust_burst(world, True{})
    case 61: adjust_burst(world, True{})
    case 45: adjust_burst(world, False{})
    case 102: outage(world)
    case 106: change_rule_chance(world, False{})
    case 107: change_rule_chance(world, True{})
    case 44: change_rule_count(world, False{})
    case 46: change_rule_count(world, True{})
    case 91: pacing(world, False{})
    case 93: pacing(world, True{})
    case 115: request_finish(world)
    case 110: start(world)
    case 13: start(world)
    case _: world

def key_schedule(+world: M.World, code: U32) -> A.State:
  match code:
    case 97: A.toggle(M.schedule(world))
    case _: M.schedule(world)
def key_map(+world: M.World, code: U32) -> U32:
  following: U32 = ((M.layout(world) + 1) % 3 : U32)
  Bool.pick(U32, U32.is_eq(code, 9) && map_free(world), following, M.layout(world))
def key_fields(world: M.World, +code: U32, layout: U32, schedule: A.State) -> M.World:
  match world:
    case M.World{core, t, +p, _, +c, g, h, ts, a, o, r, cl, d, auto, x, y, +selected, work, flash}:
      +choose = (code >= 49 : U32) && (code <= 52 : U32)
      M.World{
        core,
        t,
        Bool.pick(Bool, (U32.is_eq(code, 32) || U32.is_eq(code, 112)), Bool.not(p), p),
        layout,
        Bool.pick(U32, choose, (code - 46 : U32), c),
        g,
        h,
        ts,
        a,
        o,
        r,
        cl,
        d,
        [M.control_with_schedule(M.control_value(auto), schedule)],
        x,
        y,
        Bool.pick(U32, choose, 0, selected),
        work,
        flash
      }
def key_workload(+world: M.World, code: U32) -> M.World:
  match code:
    case 97: action(world, T.WorkloadControl{Some{1n}, Workload.Suspend{Bool.not(M.auto(world))}})
    case _: world
def ordinary_key(+world: M.World, +code: U32) -> M.World:
  key_result(
    key_workload(key_fields(world, code, key_map(world, code), key_schedule(world, code)), code),
    code
  )

def continue_sandbox(+world: M.World) -> M.World:
  key_fields(
    M.with_mode(world, Session.continue_mode(M.mode(world), M.hp(world))),
    Bool.pick(U32, M.paused(world), 112, 0),
    M.layout(world), M.schedule(world))
def defeated_key(world: M.World, code: U32) -> M.World:
  match code:
    case 114: reset_layout(M.layout(world))
    case 99: continue_sandbox(world)
    case _: world
def key_when(defeated: Bool, world: M.World, code: U32) -> M.World:
  match defeated:
    case True{}: defeated_key(world, code)
    case False{}: ordinary_key(world, code)
def key(+world: M.World, code: U32) -> M.World:
  key_when(M.defeated(world), world, code)

def snap(value: U32) -> U32:
  ((value / 16) * 16 + 8 : U32)
def tower_hit(items: List<&2, M.Tower>, +x: U32, +y: U32, +index: U32) -> U32:
  match items:
    case Nil{}: 0
    case +tower <> rest:
      Bool.pick(U32, Map.in_range(Map.Point{x, y}, Map.Point{M.tx(tower), M.ty(tower)}, 14), index,
        tower_hit(rest, x, y, (index + 1 : U32)))
def tower_clear(items: List<&2, M.Tower>, +x: U32, +y: U32) -> Bool:
  match items:
    case Nil{}: True{}
    case +tower <> rest:
      Bool.and(
        Bool.not(Map.in_range(Map.Point{x, y}, Map.Point{M.tx(tower), M.ty(tower)}, 28)),
        tower_clear(rest, x, y)
      )
def placement_valid(+world: M.World, +x: U32, +y: U32) -> Bool:
  Bool.and(
    Bool.and(
      Bool.and((snap(x) >= 24 : U32), (snap(x) <= 776 : U32)),
      Bool.and((snap(y) >= 116 : U32), (snap(y) <= 644 : U32))
    ),
    Bool.and(
      Map.placement_ground(M.layout(world), Map.Point{snap(x), snap(y)}),
      tower_clear(M.towers(world), snap(x), snap(y))
    )
  )
def select(world: M.World, index: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, auto, x, y, _, work, flash}:
      M.World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, auto, x, y, index, work, flash}
def build_tuned(
  +world: M.World,
  +x: U32,
  +y: U32,
  +kind: U32,
  +power: U32,
  +radius: U32
) -> M.World:
  match world:
    case M.World{core, t, p, l, c, +g, +h, ts, a, o, r, cl, d, auto, mx, my, _, work, flash}:
      pick_world(
        Bool.and(
          (power >= 1 : U32) && (power <= 16 : U32) && (radius >= 20 : U32) && (radius <= 240 : U32),
          Bool.and(
            placement_valid(world, x, y),
            Bool.and((g >= tower_cost(kind) : U32), Bool.and(Mechanics.valid(kind), M.playable(world)))
          )
        ),
        (
          M.World{
            core,
            t,
            p,
            l,
            c,
            M.sub(g, tower_cost(kind)),
            h,
            M.Tower{snap(x), snap(y), kind, 1, power, radius, 0} <> ts,
            a,
            o,
            r,
            cl,
            d,
            auto,
            mx,
            my,
            0,
            work,
            flash
          }
        ),
        world
      )
def build(world: M.World, x: U32, y: U32, +kind: U32) -> M.World:
  build_tuned(world, x, y, kind, 1, Mechanics.base_radius(kind))
def ordinary_click(+world: M.World, +x: U32, +y: U32) -> M.World:
  +index = tower_hit(M.towers(world), x, y, 1)
  pick_world(
    (index > 0 : U32),
    select(move(world, x, y), index),
    build(move(world, x, y), x, y, M.choice(world))
  )
def click_when(defeated: Bool, world: M.World, x: U32, y: U32) -> M.World:
  match defeated:
    case True{}: defeated_key(world, Session.click_code(x, y))
    case False{}: ordinary_click(world, x, y)
def click(+world: M.World, x: U32, y: U32) -> M.World:
  click_when(M.defeated(world), world, x, y)

def preview_tower(x: U32, y: U32, +kind: U32) -> M.Tower:
  M.Tower{snap(x), snap(y), kind, 1, 1, Mechanics.base_radius(kind), 0}
def preview_site(world: M.World, x: U32, y: U32, kind: U32) -> U32:
  Fire.target_phase(Fire.target(world, preview_tower(x, y, kind), 0n))
def preview_target(world: M.World, x: U32, y: U32, kind: U32) -> Nat:
  Fire.target_operation(Fire.target(world, preview_tower(x, y, kind), 0n))
def preview_point(+world: M.World, x: U32, y: U32, kind: U32) -> Map.Point:
  Fire.found_point(Fire.target(world, preview_tower(x, y, kind), 0n), world)
def preview_before(world: M.World, x: U32, y: U32, kind: U32) -> U32:
  Fire.remaining(world, preview_tower(x, y, kind))
def preview_gain(world: M.World, x: U32, y: U32, +kind: U32) -> U32:
  +before = U32.to_nat(preview_before(world, x, y, kind))
  M.number(Nat.sub(before, Fire.shortened(before)))
