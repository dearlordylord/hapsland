# Local tower shots use existing exact callback controls. Presentation history
# never selects work, and the captured outcome is never inspected.
import Base
import ./DefenseLiveMotion.bend as Live
import ./DefenseModel.bend as M
import ./DefenseMechanics.bend as Mechanics
import ./DefenseMap.bend as Map
import ./DefenseEffects.bend as Effects
import ./DefenseCues.bend as Cues
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch
import ../../packages/agent-flow-bend/CollectionState.bend as Collection
import ../../packages/agent-flow-bend/SubmissionState.bend as Submission
import ../../packages/agent-flow-bend/Delivery.bend as Delivery
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunCallbackControls.bend as Controls
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/Scheduler.bend as Scheduler

type Shot is Data:
  Shot{world: M.World, result: U32}
type Candidate is Data:
  Candidate{target: CB.Target, due: Nat}

# Game elapsed time is the intervention time, not the last business transition.
def delivery_at(+world: M.World) -> Nat:
  Nat.max(Run.clock(M.engine(world)), (U32.to_nat(M.time(world)) * 20n : Nat))
def cadence(kind: U32) -> U32:
  match kind:
    case 6: 40
    case _: 20
def cooldown(+tower: M.Tower) -> U32:
  U32.max(2, (cadence(M.tkind(tower)) / U32.max(1, (M.level(tower) * M.power(tower) : U32)) : U32))
def originals(state: CB.State) -> List<&2, CB.Original>:
  match state:
    case CB.State{items}: items
def queued_due(items: List<&2, Scheduler.Entry>, +order: Nat) -> Nat:
  match items:
    case Nil{}: 0n
    case Scheduler.Entry{at, id} <> rest: Bool.pick(
      Nat,
      Nat.is_eq(id, order),
      at,
      queued_due(rest, order)
    )
def due(order: Nat, world: M.World) -> Nat:
  queued_due(Engine.queued(Run.core(M.engine(world))), order)
def operation(target: CB.Target) -> Nat:
  match target:
    case CB.Target{CB.Owner{_, _, _, op}, _, _}: op
def callback_phase(target: CB.Target) -> U32:
  match target:
    case CB.Target{_, CB.PreparationCompleted{}, _}: 2
    case CB.Target{_, CB.ReviewServiceRequestSettled{_}, _}: 4
    case CB.Target{_, CB.OutputTerminal{_, _}, _}: 5
    case CB.Target{_, CB.FinishTerminal{_, _, _, _, _}, _}: 5
    case _: 255
def find_work(
  target: CB.Target,
  work: List<&2, C.ReviewWorkRecord>
) -> Maybe<&2, C.ReviewWorkRecord>:
  match target:
    case CB.Target{CB.Owner{p, l, r, o}, _, _}: C.find_work(p, l, r, o, work)
def work_phase(found: Maybe<&2, C.ReviewWorkRecord>) -> U32:
  match found:
    case Some{work}: Effects.kind(work)
    case None{}: 255
def work_lane(+world: M.World, found: Maybe<&2, C.ReviewWorkRecord>) -> U32:
  match found:
    case Some{work}: Effects.lane(world, work)
    case None{}: 0
def request_started(found: Maybe<&2, Dispatch.ReviewServiceRequestRecord>) -> Bool:
  match found:
    case Some{Dispatch.ReviewServiceRequestRecord{_, _, _, _, _, started, interrupted}}: started && Bool.not(
      interrupted
    )
    case None{}: False{}
def started(target: CB.Target, dispatch: Dispatch.State) -> Bool:
  match target dispatch:
    case CB.Target{CB.Owner{p, l, r, o}, CB.ReviewServiceRequestSettled{request}, _} Dispatch.State{
      _,
      _,
      _,
      _,
      requests
    }:
      request_started(Dispatch.request_phase(requests, p, l, r, o, request))
    case _ _: True{}
def collection(core: C.State) -> Collection.State:
  match core:
    case C.State{_, _, _, _, _, _, _, value, _}: value
def batch_authorized(found: Maybe<&2, Submission.Batch>, owner: CB.Owner) -> Bool:
  match found owner:
    case Some{Submission.Batch{_, group, round, _, _, Delivery.Authorized{}, _, _}} CB.Owner{
      p,
      _,
      r,
      _
    }:
      Nat.is_eq(group, p) && Nat.is_eq(round, r)
    case _ _: False{}
def authorized(target: CB.Target, +world: M.World) -> Bool:
  match target:
    case CB.Target{owner, CB.OutputTerminal{+advice, +token}, _}:
      +state = collection(M.core(world))
      Collection.owns_lease(state, advice, token) && batch_authorized(
        Submission.find_batch(advice, token, CB.output_batches(state)),
        owner
      )
    case CB.Target{owner, CB.FinishTerminal{group, round, attempt, token, selected}, _}:
      CB.finish_owned(collection(M.core(world)), owner, group, round, attempt, token, selected)
    case _: False{}
# Range uses the exact visible moving body; missing bodies are never targets.
def target_point(target: CB.Target, world: M.World) -> Map.Point:
  Live.position(Live.find(target, M.mobs(world)))
def shortened(+remaining: Nat) -> Nat:
  Nat.min(remaining, Nat.max(100n, (remaining / 2n : Nat)))
def saving(+remaining: Nat) -> Nat: Nat.sub(remaining, shortened(remaining))
def found_point(found: Maybe<&2, CB.Target>, world: M.World) -> Map.Point:
  match found:
    case Some{target}: target_point(target, world)
    case None{}: Map.Point{0, 0}
# A live callback is owned current work, independently of any tower or playback.
def current(+target: CB.Target, +world: M.World) -> Bool:
  +phase = callback_phase(target)
  Bool.pick(
    Bool,
    U32.is_eq(phase, 5),
    authorized(target, world),
    (U32.is_eq(
      phase,
      2
    ) || U32.is_eq(
      phase,
      4
    )) && U32.is_eq(work_phase(find_work(target, M.work(M.core(world)))), phase)
  )
def accepts(+kind: U32, +phase: U32) -> Bool:
  Bool.pick(
    Bool,
    (U32.is_eq(kind, 3) || U32.is_eq(kind, 5) || U32.is_eq(kind, 6)),
    U32.is_eq(phase, 2) || U32.is_eq(phase, 4),
    U32.is_eq(kind, 4) && U32.is_eq(phase, 5)
  )
def suitable(+world: M.World, +tower: M.Tower, +target: CB.Target) -> Bool:
  accepts(M.tkind(tower), callback_phase(target)) && current(target, world) &&
    Map.in_range(
      Map.Point{M.tx(tower), M.ty(tower)},
      target_point(target, world),
      (M.radius(tower) + M.level(tower) * 12 : U32)
    )
def live(+target: CB.Target, at: Nat, +world: M.World) -> Bool:
  (at > delivery_at(world) : Nat) && current(target, world) && started(
    target,
    M.dispatch(M.core(world))
  )
def eligible(+target: CB.Target, +at: Nat, +world: M.World, tower: M.Tower, +wanted: Nat) -> Bool:
  (Nat.is_eq(wanted, 0n) || Nat.is_eq(operation(target), wanted)) &&
    live(target, at, world) && Live.visible_found(
      Live.find(target, M.mobs(world)),
      (U32.to_nat(M.time(world)) * 20n : Nat)
    ) && (at > delivery_at(world) + 100n : Nat) && suitable(world, tower, target)
def prefer(kind: U32, +at: Nat, +other: Nat) -> Bool:
  match kind:
    case 5: (at < other : Nat)
    case _: (at > other : Nat)
def choose(
  kind: U32,
  valid: Bool,
  +target: CB.Target,
  +at: Nat,
  rest: Maybe<&2, Candidate>
) -> Maybe<&2, Candidate>:
  match valid rest:
    case False{} value: value
    case True{} None{}: Some{Candidate{target, at}}
    case True{} Some{Candidate{other, +later}}:
      Bool.pick(
        Maybe<&2, Candidate>,
        prefer(kind, at, later),
        Some{Candidate{target, at}},
        Some{Candidate{other, later}}
      )
def select(
  items: List<&2, CB.Original>,
  +world: M.World,
  +tower: M.Tower,
  +wanted: Nat
) -> Maybe<&2, Candidate>:
  match items:
    case Nil{}: None{}
    case CB.Original{CB.Fact{+target, _, _, _}, CB.Queued{}, order} <> rest:
      +at = due(order, world)
      choose(
        M.tkind(tower),
        eligible(target, at, world, tower, wanted),
        target,
        at,
        select(rest, world, tower, wanted)
      )
    case _ <> rest: select(rest, world, tower, wanted)
# Pause gates execution in Host; it must never hide a possible physical action.
# Only engine, elapsed time and layout are physical query inputs.
# This is a read-only projection, never committed to the game world.
def targeting_world(world: M.World) -> M.World:
  match world:
    case M.World{core, t, _, l, _, _, _, _, _, _, _, _, _, control, _, _, _, _, _}:
      M.World{
        core,
        t,
        False{},
        l,
        0,
        0,
        0,
        [],
        False{},
        0,
        0,
        0,
        0,
        [M.control_with_mobs(M.initial_control(), M.control_mobs(M.control_value(control)))],
        0,
        0,
        0,
        0,
        0
      }
# Freeze one volley before applying its shots: no recipient is hit twice.
def original_target(item: CB.Original) -> CB.Target:
  match item:
    case CB.Original{CB.Fact{target, _, _, _}, _, _}: target
def without(items: List<&2, CB.Original>, +target: CB.Target) -> List<&2, CB.Original>:
  match items:
    case Nil{}: []
    case +head <> tail:
      +rest = without(tail, target)
      Bool.pick(
        List<&2, CB.Original>,
        CB.target_equal(original_target(head), target),
        rest,
        head <> rest
      )
def volley_size(kind: U32) -> Nat:
  match kind:
    case 6: 3n
    case _: 1n
def planned_found(
  found: Maybe<&2, Candidate>,
  rest: CB.Target -> List<&2, CB.Target>
) -> List<&2, CB.Target>:
  match found:
    case None{}: []
    case Some{Candidate{+target, _}}: target <> rest(target)
def one_target(found: Maybe<&2, Candidate>) -> List<&2, CB.Target>:
  match found:
    case None{}: []
    case Some{Candidate{target, _}}: [target]
def plan_loop(
  fuel: Nat,
  +items: List<&2, CB.Original>,
  +world: M.World,
  +tower: M.Tower,
  +wanted: Nat
) -> List<&2, CB.Target>:
  match fuel:
    case 0n: []
    case 1n: one_target(select(items, world, tower, wanted))
    case 1n+n:
      rest: CB.Target -> List<&2, CB.Target> = target => plan_loop(
        n,
        without(items, target),
        world,
        tower,
        wanted
      )
      planned_found(select(items, world, tower, wanted), rest)
def plan(+world: M.World, +tower: M.Tower, wanted: Nat) -> List<&2, CB.Target>:
  plan_loop(
    volley_size(M.tkind(tower)),
    originals(Engine.callback_state(Run.core(M.engine(world)))),
    targeting_world(world),
    tower,
    wanted
  )
def first(items: List<&2, CB.Target>) -> Maybe<&2, CB.Target>:
  match items:
    case Nil{}: None{}
    case head <> _: Some{head}
def target(world: M.World, tower: M.Tower, wanted: Nat) -> Maybe<&2, CB.Target>:
  first(plan(world, tower, wanted))
def remaining_found(found: Maybe<&2, Candidate>, world: M.World) -> U32:
  match found:
    case Some{Candidate{_, at}}: M.number(Nat.sub(at, delivery_at(world)))
    case None{}: 0
def remaining(+world: M.World, tower: M.Tower) -> U32:
  remaining_found(
    select(
      originals(Engine.callback_state(Run.core(M.engine(world)))),
      targeting_world(world),
      tower,
      0n
    ),
    world
  )
def target_operation(found: Maybe<&2, CB.Target>) -> Nat:
  match found:
    case Some{item}: operation(item)
    case None{}: 0n
def target_phase(found: Maybe<&2, CB.Target>) -> U32:
  match found:
    case Some{item}: callback_phase(item)
    case None{}: 255
def arm(items: List<&2, M.Tower>, index: U32, +ready: U32) -> List<&2, M.Tower>:
  match items index:
    case M.Tower{x, y, k, l, p, r, _} <> rest 1: M.Tower{x, y, k, l, p, r, ready} <> rest
    case item <> rest _: item <> arm(rest, M.sub(index, 1), ready)
    case Nil{} _: Nil{}
def applied(
  +world: M.World,
  index: U32,
  +tower: M.Tower,
  +target: CB.Target,
  changed: List<&2, Controls.Applied>
) -> Shot:
  match changed:
    case Controls.Applied{state, CB.Applied{}} <> _:
      +before = Nat.sub(Live.due(world, target), delivery_at(world))
      +after = shortened(before)
      +moved = M.with_mobs(
        M.with_engine(world, state),
        Live.hit_list(
          M.mobs(world),
          target,
          (delivery_at(world) + after : Nat),
          M.tx(tower),
          M.ty(tower),
          before,
          after
        )
      )
      Shot{
        Cues.add(
          M.with_towers(
            moved,
            arm(M.towers(world), index, (M.time(world) + cooldown(tower) : U32))
          ),
          M.Cue{M.tkind(tower), operation(target), 0n, M.tx(tower), M.ty(tower), 20}
        ),
        0
      }
    case _: Shot{world, 2}
def fire_target(found: Maybe<&2, CB.Target>, +world: M.World, index: U32, +tower: M.Tower) -> Shot:
  match found:
    case Some{+target}:
      +state = M.engine(world)
      # The exact handler used by public CallbackControl, with its LIVE captured
      # source. Avoid the unrelated control variants in this optional native ABI.
      change = Controls.apply(
        state,
        target,
        CB.Transport{
          (delivery_at(
            world
          ) + shortened(Nat.sub(Live.due(world, target), delivery_at(world))) : Nat)
        },
        Controls.callback_source(Controls.callback_sources(state), target)
      )
      applied(world, index, tower, target, [change])
    case None{}: Shot{world, 2}
def volley_next(shot: Shot, rest: M.World -> Shot) -> Shot:
  match shot:
    case Shot{world, 0}: rest(world)
    case other: other
def fire_plan(items: List<&2, CB.Target>, world: M.World, +index: U32, +tower: M.Tower) -> Shot:
  match items:
    case Nil{}: Shot{world, 0}
    case target <> tail:
      rest: M.World -> Shot = next => fire_plan(tail, next, index, tower)
      volley_next(fire_target(Some{target}, world, index, tower), rest)
def fire_planned(items: List<&2, CB.Target>, world: M.World, index: U32, +tower: M.Tower) -> Shot:
  match items:
    case Nil{}: Shot{world, 2}
    case head <> tail: fire_plan(head <> tail, world, index, tower)
def fire_ready(
  alive: Bool,
  valid: Bool,
  ready: Bool,
  +world: M.World,
  index: U32,
  +tower: M.Tower,
  wanted: Nat
) -> Shot:
  match alive valid ready:
    case False{} _ _: Shot{world, 5}
    case True{} False{} _: Shot{world, 3}
    case True{} True{} False{}: Shot{world, 1}
    case True{} True{} True{}: fire_planned(plan(world, tower, wanted), world, index, tower)
def fire(+world: M.World, index: U32, +tower: M.Tower, wanted: Nat) -> Shot:
  fire_ready(
    M.playable(world),
    Mechanics.valid(M.tkind(tower)),
    (M.time(world) >= M.ready_at(tower) : U32),
    world,
    index,
    tower,
    wanted
  )

# One automatic pass per active game tick, newest tower first. Every next tower
# sees the prior shot's live queue. Stacking shortens the updated deadline; each beam is retained.
type AutomaticShot is Data:
  AutomaticShot{index: U32, target: CB.Target}
type Automatic is Data:
  Automatic{world: M.World, shots: List<&2, AutomaticShot>}
def recorded_targets(items: List<&2, CB.Target>, +index: U32) -> List<&2, AutomaticShot>:
  match items:
    case Nil{}: []
    case target <> tail: AutomaticShot{index, target} <> recorded_targets(tail, index)
def automatic_record(found: List<&2, CB.Target>, shot: Shot, index: U32) -> Automatic:
  match found shot:
    case targets Shot{world, 0}: Automatic{world, recorded_targets(targets, index)}
    case _ Shot{world, _}: Automatic{world, []}
def automatic_one(+world: M.World, +tower: M.Tower, +index: U32) -> Automatic:
  automatic_record(plan(world, tower, 0n), fire(world, index, tower, 0n), index)
def automatic_next(
  result: Automatic,
  history: List<&2, AutomaticShot>,
  rest: M.World -> List<&2, AutomaticShot> -> Automatic
) -> Automatic:
  match result:
    case Automatic{world, shots}: rest(
      world,
      List.append(&2, AutomaticShot, List.reverse(&2, AutomaticShot, shots), history)
    )
def automatic_loop(
  items: List<&2, M.Tower>,
  world: M.World,
  +index: U32,
  history: List<&2, AutomaticShot>
) -> Automatic:
  match items:
    case Nil{}: Automatic{world, List.reverse(&2, AutomaticShot, history)}
    case tower <> tail:
      continue: M.World -> List<&2, AutomaticShot> -> Automatic = next => shots => automatic_loop(
        tail,
        next,
        (index + 1 : U32),
        shots
      )
      automatic_next(automatic_one(world, tower, index), history, continue)
def automatic_when(active: Bool, +world: M.World) -> Automatic:
  match active:
    case False{}: Automatic{world, []}
    case True{}: automatic_loop(M.towers(world), world, 1, [])
def automatic_world(result: Automatic) -> M.World:
  match result:
    case Automatic{world, _}: world


def live_keep(on: Bool, target: CB.Target, tail: List<&2, CB.Target>) -> List<&2, CB.Target>:
  match on:
    case True{}: target <> tail
    case False{}: tail
def live_targets(items: List<&2, CB.Original>, +world: M.World) -> List<&2, CB.Target>:
  match items:
    case Nil{}: []
    case CB.Original{CB.Fact{+target, _, _, _}, CB.Queued{}, order} <> tail:
      live_keep(
        current(target, world) && started(target, M.dispatch(M.core(world))),
        target,
        live_targets(tail, world)
      )
    case _ <> tail: live_targets(tail, world)
def physical_targets(+world: M.World) -> List<&2, CB.Target>:
  live_targets(originals(Engine.callback_state(Run.core(M.engine(world)))), world)
