# Headless game actions reuse the interactive Host. No business reducer lives here.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMap.bend as Map
import ./DefenseConsumer.bend as Consumer
import ./DefenseMechanics.bend as Mechanics
import ./DefenseRules.bend as Rules
import ./DefenseRuleTypes.bend as R
import ./DefenseTowerFire.bend as Fire
import ./DefenseLiveMotion.bend as Live
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/Workload.bend as Workload
import ../../packages/monkey-business-bend/Session.bend as Session
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

type Action is Data:
  Build{x: U32, y: U32, kind: U32}
  Upgrade{index: U32}
  Fire{index: U32, operation: Nat}
type ActionResult is Data:
  Applied{}
  IllegalPlacement{}
  UnknownTower{}
  Unaffordable{}
  MaxLevel{}
  Dead{}
  InvalidParameters{}
  CoolingDown{}
  NoTarget{}
type Receipt is Data:
  Receipt{world: M.World, result: ActionResult, charged: U32}
type TargetPose is Data:
  TargetPose{target: CB.Target, phase: U32, x: U32, y: U32}
type TowerView is Data:
  TowerView{
    index: U32,
    x: U32,
    y: U32,
    kind: U32,
    level: U32,
    effectiveRadius: U32,
    cooldownTicks: U32,
    readyAt: U32
  }
type VisualState is Data:
  VisualState{towers: List<&2, TowerView>, targets: List<&2, TargetPose>}
def tower_views(items: List<&2, M.Tower>, +index: U32) -> List<&2, TowerView>:
  match items:
    case Nil{}: []
    case +tower <> rest:
      TowerView{
        index,
        M.tx(tower),
        M.ty(tower),
        M.tkind(tower),
        M.level(tower),
        Mechanics.tower_range(tower),
        Fire.cooldown(tower),
        M.ready_at(tower)
      } <> tower_views(rest, (index+1 : U32))
def target_pose(+target: CB.Target, world: M.World) -> TargetPose:
  +point = Fire.target_point(target, world)
  TargetPose{target, Fire.callback_phase(target), Map.px(point), Map.py(point)}
def pose_if(
  allowed: Bool,
  +target: CB.Target,
  +world: M.World,
  rest: List<&2, TargetPose>
) -> List<&2, TargetPose>:
  match allowed:
    case True{}: target_pose(target, world) <> rest
    case False{}: rest
def queued_poses(items: List<&2, CB.Original>, +world: M.World) -> List<&2, TargetPose>:
  match items:
    case Nil{}: []
    case CB.Original{CB.Fact{+target, _, _, _}, CB.Queued{}, _} <> rest:
      +phase = Fire.callback_phase(target)
      pose_if(
        (U32.is_eq(
          phase,
          2
        ) || U32.is_eq(
          phase,
          4
        ) || U32.is_eq(
          phase,
          5
        )) && Fire.current(
          target,
          world
        ) && Live.visible_found(
          Live.find(target, M.mobs(world)),
          (U32.to_nat(M.time(world))*20n : Nat)
        ),
        target,
        world,
        queued_poses(rest, world)
      )
    case _ <> rest: queued_poses(rest, world)
# Read-only drawing facts use the actual tower/callback geometry. The viewer
# never infers range from its decorative movement or selects business targets.
def visual_state(+world: M.World) -> VisualState:
  VisualState{
    tower_views(M.towers(world), 1),
    queued_poses(Fire.originals(Engine.callback_state(Run.core(M.engine(world)))), world)
  }
type GameObservation is Data:
  GameObservation{health: U32, remainingBudget: U32, tick: U32, towerCount: Nat}
def observe(+world: M.World) -> GameObservation:
  GameObservation{
    M.hp(world),
    M.gold(world),
    M.time(world),
    List.length(&2, M.Tower, M.towers(world))
  }

def with_budget(world: M.World, budget: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, _, h, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, l, c, budget, h, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}
def initial(state: T.State, budget: U32, layout: U32) -> M.World:
  H.reset_found(M.with_engine(with_budget(H.initial(), budget), state), layout)
def default_config() -> T.Config: Consumer.config()
def create_world(config: T.Config, seed: Nat, budget: U32, layout: U32) -> M.World:
  H.start(H.reset_found(with_budget(H.initial_config(config, seed), budget), layout))
def engine_observation(world: M.World) -> T.Observation:
  Run.observe(M.engine(world))
def accepted(+before: M.World, +after: M.World) -> Receipt:
  Receipt{after, Applied{}, M.sub(M.gold(before), M.gold(after))}
# Experimental construction prices change investment accounting only. H.build
# still owns placement and the exact simulator intervention; no business state is patched.
def priced(before: M.World, after: M.World, +price: U32) -> Receipt:
  Receipt{with_budget(after, M.sub(M.gold(before), price)), Applied{}, price}
def build_checked(
  dead: Bool,
  unknown: Bool,
  illegal: Bool,
  poor: Bool,
  +world: M.World,
  x: U32,
  y: U32,
  +kind: U32,
  price: U32,
  power: U32,
  radius: U32
) -> Receipt:
  match dead unknown illegal poor:
    case True{} _ _ _: Receipt{world, Dead{}, 0}
    case _ True{} _ _: Receipt{world, UnknownTower{}, 0}
    case _ _ True{} _: Receipt{world, IllegalPlacement{}, 0}
    case _ _ _ True{}: Receipt{world, Unaffordable{}, 0}
    case _ _ _ _: priced(
      world,
      H.build_tuned(with_budget(world, H.tower_cost(kind)), x, y, kind, power, radius),
      price
    )
def build_parameters(
  valid: Bool,
  +world: M.World,
  +x: U32,
  +y: U32,
  +kind: U32,
  +price: U32,
  power: U32,
  radius: U32
) -> Receipt:
  match valid:
    case False{}: Receipt{world, InvalidParameters{}, 0}
    case True{}:
      build_checked(
        M.defeated(world),
        Bool.not(Mechanics.valid(kind)),
        Bool.not(H.placement_valid(world, x, y)),
        (M.gold(world) < price : U32),
        world,
        x,
        y,
        kind,
        price,
        power,
        radius
      )
def build_tuned(
  world: M.World,
  x: U32,
  y: U32,
  +kind: U32,
  price: U32,
  +power: U32,
  +radius: U32
) -> Receipt:
  build_parameters(
    (power >= 1 : U32) && (power <= 16 : U32) && (radius >= 20 : U32) && (radius <= 240 : U32),
    world,
    x,
    y,
    kind,
    price,
    power,
    radius
  )
def build_priced(world: M.World, x: U32, y: U32, +kind: U32, price: U32) -> Receipt:
  build_tuned(world, x, y, kind, price, 1, Mechanics.base_radius(kind))
def build(+world: M.World, x: U32, y: U32, +kind: U32) -> Receipt:
  build_priced(world, x, y, kind, H.tower_cost(kind))
def upgrade_checked(full: Bool, poor: Bool, +world: M.World, index: U32) -> Receipt:
  match full poor:
    case True{} _: Receipt{world, MaxLevel{}, 0}
    case _ True{}: Receipt{world, Unaffordable{}, 0}
    case _ _: accepted(world, H.upgrade(H.select(world, index)))
def upgrade_found(+world: M.World, index: U32, found: Maybe<&2, M.Tower>) -> Receipt:
  match found:
    case None{}: Receipt{world, UnknownTower{}, 0}
    case Some{+tower}: upgrade_checked(
      (M.level(tower) >= Mechanics.max_level(M.tkind(tower)) : U32),
      (M.gold(world) < H.upgrade_cost(M.tkind(tower), M.level(tower)) : U32),
      world,
      index
    )
def upgrade_alive(alive: Bool, +world: M.World, +index: U32) -> Receipt:
  match alive:
    case False{}: Receipt{world, Dead{}, 0}
    case True{}: upgrade_found(world, index, H.selected_tower(M.towers(world), index))
def shot_receipt(shot: Fire.Shot) -> Receipt:
  match shot:
    case Fire.Shot{world, 0}: Receipt{world, Applied{}, 0}
    case Fire.Shot{world, 1}: Receipt{world, CoolingDown{}, 0}
    case Fire.Shot{world, 2}: Receipt{world, NoTarget{}, 0}
    case Fire.Shot{world, 3}: Receipt{world, UnknownTower{}, 0}
    case Fire.Shot{world, 5}: Receipt{world, Dead{}, 0}
    case Fire.Shot{world, _}: Receipt{world, UnknownTower{}, 0}
def shot_target(world: M.World, index: U32, operation: Nat) -> Maybe<&2, CB.Target>:
  H.shot_target(world, index, operation)
def apply(+world: M.World, action: Action) -> Receipt:
  match action:
    case Build{x, y, kind}: build(world, x, y, kind)
    case Upgrade{index}: upgrade_alive(M.playable(world), world, index)
    case Fire{index, operation}: shot_receipt(H.fire(world, index, operation))
# Main and laboratory share the same fixed construction budget.
def tick(+world: M.World) -> H.TickObserved:
  H.tick_when_manual(H.clock_active(world), world)
# A dense tick consumes only the remaining experiment budget, using the actual Host seam.
def consumed_events(state: T.State) -> Nat:
  match state:
    case T.State{_, _, _, count, _, _, _, _, _, _, _}: count
def tick_allowed(allowed: Bool, +world: M.World, +remainingEvents: Nat) -> H.TickObserved:
  match allowed:
    case True{}: H.bounded_observed(world, Nat.min(256n, remainingEvents))
    case False{}: H.tick_observed(world)
def tick_budget(nonzero: Bool, +world: M.World, remainingEvents: Nat) -> H.TickObserved:
  match nonzero:
    case True{}: tick_allowed(H.clock_active(world), world, remainingEvents)
    case False{}: H.TickObserved{world, Nil{}, Nil{}, Nil{}}
def tick_bounded(world: M.World, +remainingEvents: Nat) -> H.TickObserved:
  tick_budget(Bool.not(Nat.is_eq(remainingEvents, 0n)), world, remainingEvents)

# Context owns workload facts; the game's intervention mapping owns tower effects.
type Scenario is Data:
  Scenario{
    jev: Nat,
    delivery: Nat,
    source: Nat,
    ready: Bool,
    readable: Bool,
    result: U32,
    burst: U32,
    interval: U32
  }
def scenario_outcome(result: U32) -> Maybe<&2, C.ReviewServiceRequestOutcome>:
  match result:
    case 1: Some{C.RequestClear{}}
    case 2: Some{C.RequestFinding{}}
    case _: None{}
def scenario_environment(scenario: Scenario, environment: T.Environment) -> T.Environment:
  match scenario environment:
    case Scenario{jev, delivery, source, ready, readable, result, _, _} T.Environment{
      _,
      _,
      weights,
      _,
      tree,
      graph,
      _,
      lease,
      current,
      _,
      generation,
      _,
      lifetime,
      profile
    }:
      T.Environment{
        jev,
        scenario_outcome(result),
        weights,
        source,
        tree,
        graph,
        delivery,
        lease,
        current,
        ready,
        generation,
        readable,
        lifetime,
        profile
      }
def scenario_profile(profile: Workload.Profile, seed: U32, interval: U32) -> Workload.Profile:
  match profile:
    case Workload.Profile{
      Session.Settings{_, variation, edits, pause, response, repairDelay},
      _,
      codes,
      bytes,
      units,
      duration
    }:
      Workload.Profile{
        Session.Settings{interval, variation, edits, pause, response, repairDelay},
        seed,
        codes,
        bytes,
        units,
        duration
      }
def scenario_advicees(
  advicees: List<&2, T.Advicee>,
  +seed: Nat,
  +interval: U32
) -> List<&2, T.Advicee>:
  match advicees:
    case Nil{}: []
    case T.Advicee{p, _, Some{profile}} <> rest:
      T.Advicee{p, seed, Some{scenario_profile(profile, U32.from_nat(seed), interval)}} <> scenario_advicees(
        rest,
        seed,
        interval
      )
    case T.Advicee{p, _, None{}} <> rest:
      T.Advicee{p, seed, None{}} <> scenario_advicees(rest, seed, interval)
def scenario_config(+scenario: Scenario, config: T.Config, seed: Nat) -> T.Config:
  match scenario config:
    case Scenario{_, _, _, _, _, _, _, interval} T.Config{
      limits,
      advicees,
      environment,
      collectors
    }:
      T.Config{
        limits,
        scenario_advicees(advicees, seed, interval),
        scenario_environment(scenario, environment),
        collectors
      }
def scenario_started(+world: M.World, scenario: Scenario) -> M.World:
  match scenario:
    case Scenario{_, _, _, _, _, _, burst, _}:
      H.start(
        M.with_control(
          world,
          M.with_settings(M.control(world), M.with_burst(M.settings(world), burst))
        )
      )
def create_scenario(+scenario: Scenario, +seed: Nat, budget: U32, layout: U32) -> M.World:
  scenario_started(
    H.reset_found(
      with_budget(
        H.initial_config(scenario_config(scenario, Consumer.config(), seed), seed),
        budget
      ),
      layout
    ),
    scenario
  )

# Original caller Stop input: shared NativeRun owns registration, cutoff, waiting,
# selection, cancellation and late-callback fencing. No Canonical events injected.
def schedule_finish(world: M.World, at: Nat) -> M.World:
  H.schedule_finish(world, at)

# Controlled experiments call this same pass explicitly so public replay records
# its exact original callback controls before the ordinary bounded advance.
def automatic(+world: M.World) -> Fire.Automatic:
  Fire.automatic_when(H.clock_active(world), world)

def shot_targets_found(
  found: Maybe<&2, M.Tower>,
  world: M.World,
  operation: Nat
) -> List<&2, CB.Target>:
  match found:
    case None{}: []
    case Some{tower}: Fire.plan(world, tower, operation)
def shot_targets(+world: M.World, index: U32, operation: Nat) -> List<&2, CB.Target>:
  shot_targets_found(H.selected_tower(M.towers(world), index), world, operation)
