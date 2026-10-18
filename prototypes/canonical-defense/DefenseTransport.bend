# Game transport cannot deliver a callback before its physical actor arrives.
# Controls use the public exact-callback seam; Canonical outcomes are unchanged.
import Base
import ./DefenseModel.bend as M
import ./DefenseMotionTypes.bend as V
import ./DefenseMotion.bend as Motion
import ./DefenseLiveMotion.bend as Live
import ./DefenseRules.bend as Rules
import ./DefenseRuleTypes.bend as R
import ./DefenseMap.bend as Map
import ./DefenseTowerFire.bend as Fire
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/NativeRunCallbackControls.bend as Controls
import ../../packages/monkey-business-bend/Engine.bend as Engine

type Change is Data:
  Change{eventCount: Nat, target: CB.Target, at: Nat}
type Transported is Data:
  Transported{world: M.World, changes: List<&2, Change>}
def event_count(state: T.State) -> Nat:
  match state:
    case T.State{_, _, _, count, _, _, _, _, _, _, _}: count
def ceil(+value: Nat, +step: Nat) -> Nat: ((value + step - 1n) / step : Nat)
def path_ticks(items: List<&2, V.Waypoint>, +start: Map.Point, +speed: Nat) -> Nat:
  match items:
    case Nil{}: 0n
    case V.Waypoint{+x, +y, _, _} <> tail:
      (Nat.max(
        1n,
        (ceil(
          U32.to_nat(Map.distance(Map.px(start), x)),
          speed
        ) + ceil(U32.to_nat(Map.distance(Map.py(start), y)), speed) : Nat)
      ) + path_ticks(tail, Map.Point{x, y}, speed) : Nat)
def parent_id(items: List<&2, V.WorkIdentity>) -> Maybe<&2, V.WorkIdentity>:
  match items:
    case value <> _: Some{value}
    case _: None{}
def parent_actor(value: Maybe<&2, V.WorkIdentity>, all: List<&2, V.Actor>) -> Maybe<&2, V.Actor>:
  match value:
    case Some{id}: Live.actor(id, all)
    case None{}: None{}
def actor_ticks(fuel: Nat, found: Maybe<&2, V.Actor>, +world: M.World) -> Nat:
  match fuel found:
    case 0n _: 0n
    case _ None{}: 0n
    case 1n+n Some{+actor}:
      (ceil(
        path_ticks(Motion.path(actor), Motion.point(actor), 4n),
        Rules.owner_boost(M.mobs(world), Motion.actor_key(actor))
      ) + 
        actor_ticks(n, parent_actor(parent_id(Motion.waiting(actor)), M.actors(world)), world) : Nat)
def fragment_ticks(items: List<&2, R.Fragment>) -> Nat:
  match items:
    case Nil{}: 0n
    case +item <> tail:
      Nat.max(
        Bool.pick(
          Nat,
          Rules.fragment_hit(item),
          path_ticks(
            Rules.fragment_steps(item),
            Rules.fragment_point(item),
            U32.to_nat(Rules.fragment_speed(Rules.fragment_rule(item)))
          ),
          0n
        ),
        fragment_ticks(tail)
      )
def group_ticks(found: Maybe<&2, R.Group>) -> Nat:
  match found:
    case Some{group}: fragment_ticks(Rules.fragments(group))
    case None{}: 0n
def owned_actor_ticks(on: Bool, +head: V.Actor, +world: M.World) -> Nat:
  match on:
    case False{}: 0n
    case True{}:
      Nat.max(
        actor_ticks((List.length(&2, V.Actor, M.actors(world)) + 1n : Nat), Some{head}, world),
        group_ticks(Rules.find(Motion.actor_key(head), Rules.groups(M.rules(world))))
      )
def owned_ticks(items: List<&2, V.Actor>, +target: CB.Target, +world: M.World) -> Nat:
  match items:
    case Nil{}: 0n
    case +head <> tail:
      Nat.max(
        owned_actor_ticks(Rules.target_owns(target, Motion.actor_key(head)), head, world),
        owned_ticks(tail, target, world)
      )
def remaining_ticks(+target: CB.Target, +world: M.World) -> Nat:
  owned_ticks(M.actors(world), target, world)
# Authorization starts the visible final leg; terminal evidence still comes
# exclusively from Canonical after every selected actor/fragment arrives.
def output_target(target: CB.Target) -> Bool:
  match target:
    case CB.Target{_, CB.OutputTerminal{_, _}, _}: True{}
    case CB.Target{_, CB.FinishTerminal{_, _, _, _, _}, _}: True{}
    case _: False{}
# A Finish has one physical carrier, chosen by the same deterministic actor
# lookup as its callback pose. Every captured member must reach the common entry.
def representative_found(found: Maybe<&2, V.Actor>, id: V.WorkIdentity) -> Bool:
  match found:
    case Some{actor}: Motion.same(Motion.actor_key(actor), id)
    case None{}: False{}
def representative(target: CB.Target, id: V.WorkIdentity, world: M.World) -> Bool:
  representative_found(Live.target_actor(target, M.actors(world)), id)
def member_merged(
  items: List<&2, V.Actor>,
  +target: CB.Target,
  +operation: Nat,
  +world: M.World
) -> Bool:
  match items:
    case Nil{}: False{}
    case +actor <> tail:
      Bool.pick(
        Bool,
        Rules.target_owns(
          target,
          Motion.actor_key(actor)
        ) && Nat.is_eq(Motion.operation(Motion.actor_key(actor)), operation),
        Rules.assembled_found(Rules.find(Motion.actor_key(actor), Rules.groups(M.rules(world)))),
        member_merged(tail, target, operation, world)
      )
def members_merged(items: List<&2, Nat>, +target: CB.Target, +world: M.World) -> Bool:
  match items:
    case Nil{}: True{}
    case head <> tail: member_merged(M.actors(world), target, head, world) && members_merged(
      tail,
      target,
      world
    )
def assembled_actor(found: Maybe<&2, V.Actor>, world: M.World) -> Bool:
  match found:
    case Some{actor}: Rules.assembled_found(
      Rules.find(Motion.actor_key(actor), Rules.groups(M.rules(world)))
    )
    case None{}: False{}
def assembled(+target: CB.Target, +world: M.World) -> Bool:
  match target:
    case CB.Target{_, CB.FinishTerminal{_, _, _, _, +selected}, _}:
      (List.length(&2, Nat, selected) > 0n : Nat) && members_merged(selected, target, world)
    case _: assembled_actor(Live.target_actor(target, M.actors(world)), world)
def carrier_candidate(on: Bool, +target: CB.Target, id: V.WorkIdentity, +world: M.World) -> Bool:
  match on:
    case False{}: False{}
    case True{}: assembled(target, world) && representative(target, id, world)
def absorbed_candidate(on: Bool, +target: CB.Target, +id: V.WorkIdentity, +world: M.World) -> Bool:
  match on:
    case False{}: False{}
    case True{}: assembled(target, world) && Rules.target_owns(target, id) && Bool.not(
      representative(target, id, world)
    )
def carrier_target(items: List<&2, CB.Target>, +id: V.WorkIdentity, +world: M.World) -> Bool:
  match items:
    case Nil{}: False{}
    case +target <> tail: carrier_candidate(output_target(target), target, id, world) || carrier_target(
      tail,
      id,
      world
    )
def absorbed_target(items: List<&2, CB.Target>, +id: V.WorkIdentity, +world: M.World) -> Bool:
  match items:
    case Nil{}: False{}
    case +target <> tail: absorbed_candidate(output_target(target), target, id, world) || absorbed_target(
      tail,
      id,
      world
    )
def actor_route(actor: V.Actor, +targets: List<&2, CB.Target>, +world: M.World, at: Nat) -> V.Actor:
  match actor:
    case V.Actor{+k, f, l, x, y, +p, seen, +steps, t, parent, shown, +cause, released}:
      V.Actor{
        k,
        f,
        l,
        x,
        y,
        p,
        seen,
        Bool.pick(
          List<&2, V.Waypoint>,
          absorbed_target(
            targets,
            k,
            world
          ) || (Rules.assembled_found(
            Rules.find(k, Rules.groups(M.rules(world)))
          ) && Bool.not(
            Rules.carrier_found(Rules.find(k, Rules.groups(M.rules(world))))
          ) && (cause > 0 : U32)),
          [],
          List.append(
            &2,
            V.Waypoint,
            steps,
            Bool.pick(
              List<&2, V.Waypoint>,
              carrier_target(
                targets,
                k,
                world
              ) && Bool.not(Motion.has_delivery_path(steps) || U32.is_eq(p, 6)),
              Motion.waypoints(Map.delivery_route(M.layout(world)), 6, at),
              []
            )
          )
        ),
        t,
        parent,
        shown,
        cause,
        released
      }
def actor_routes(
  items: List<&2, V.Actor>,
  +targets: List<&2, CB.Target>,
  +world: M.World,
  +at: Nat
) -> List<&2, V.Actor>:
  match items:
    case Nil{}: []
    case head <> tail: actor_route(head, targets, world, at) <> actor_routes(
      tail,
      targets,
      world,
      at
    )
def group_route(+group: R.Group, +targets: List<&2, CB.Target>, +world: M.World) -> R.Group:
  Rules.with_assembly(
    group,
    Rules.merged(group),
    (Rules.carrier(
      group
    ) || carrier_target(
      targets,
      Rules.owner(group),
      world
    )) && Bool.not(absorbed_target(targets, Rules.owner(group), world))
  )
def group_routes(
  items: List<&2, R.Group>,
  +targets: List<&2, CB.Target>,
  +world: M.World
) -> List<&2, R.Group>:
  match items:
    case Nil{}: []
    case head <> tail: group_route(head, targets, world) <> group_routes(tail, targets, world)
def route_world(+world: M.World, +targets: List<&2, CB.Target>) -> M.World:
  M.with_rules(
    M.with_actors(
      world,
      actor_routes(M.actors(world), targets, world, (U32.to_nat(M.time(world))*20n : Nat))
    ),
    R.State{
      Rules.profile(M.rules(world)),
      group_routes(Rules.groups(M.rules(world)), targets, world)
    }
  )
def accepted(
  result: Controls.Applied,
  +world: M.World,
  +target: CB.Target,
  +at: Nat
) -> Transported:
  match result:
    case Controls.Applied{state, CB.Applied{}}:
      Transported{M.with_engine(world, state), [Change{event_count(M.engine(world)), target, at}]}
    case _: Transported{world, []}
def delay(on: Bool, +world: M.World, +target: CB.Target, +at: Nat) -> Transported:
  match on:
    case False{}: Transported{world, []}
    case True{}:
      +state = M.engine(world)
      accepted(
        Controls.apply(
          state,
          target,
          CB.Transport{at},
          Controls.callback_source(Controls.callback_sources(state), target)
        ),
        world,
        target,
        at
      )
def required(remaining: Nat, world: M.World) -> Nat:
  (U32.to_nat(M.time(world)) * 20n + remaining * 20n + 20n : Nat)
def next(
  result: Transported,
  changes: List<&2, Change>,
  continue: M.World -> List<&2, Change> -> Transported
) -> Transported:
  match result:
    case Transported{world, more}: continue(world, List.append(&2, Change, changes, more))
def sync(items: List<&2, CB.Target>, +world: M.World, changes: List<&2, Change>) -> Transported:
  match items:
    case Nil{}: Transported{world, changes}
    case +target <> tail:
      +remaining = remaining_ticks(target, world)
      +at = required(remaining, world)
      continue: M.World -> List<&2, Change> -> Transported = w => c => sync(tail, w, c)
      next(
        delay((remaining > 0n : Nat) && (Live.due(world, target) < at : Nat), world, target, at),
        changes,
        continue
      )
def output_targets(items: List<&2, CB.Target>) -> List<&2, CB.Target>:
  match items:
    case Nil{}: []
    case +head <> tail:
      List.append(
        &2,
        CB.Target,
        Bool.pick(List<&2, CB.Target>, output_target(head), [head], []),
        output_targets(tail)
      )
def synchronize_targets(+world: M.World, +targets: List<&2, CB.Target>) -> Transported:
  sync(targets, route_world(world, output_targets(targets)), [])
def synchronize(+world: M.World) -> Transported:
  synchronize_targets(world, Fire.physical_targets(world))
