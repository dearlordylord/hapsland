import ./DefenseLiveMotionTypes.bend as LiveTypes
# Callback ownership and combat metadata refer to the single Motion actor geometry.
import Base
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefenseModel.bend as M
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/Scheduler.bend as Scheduler

import ./DefenseMotion.bend as Motion
import ./DefenseRules.bend as Rules
import ./DefenseRuleTypes.bend as R

def target(mob: LiveTypes.Mob) -> CB.Target:
  match mob:
    case LiveTypes.Mob{t, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: t
def point(mob: LiveTypes.Mob) -> Map.Point:
  match mob:
    case LiveTypes.Mob{_, x, y, _, _, _, _, _, _, _, _, _, _, _, _}: Map.Point{x, y}
def deadline(mob: LiveTypes.Mob) -> Nat:
  match mob:
    case LiveTypes.Mob{_, _, _, _, d, _, _, _, _, _, _, _, _, _, _}: d
def boost(mob: LiveTypes.Mob) -> Nat:
  match mob:
    case LiveTypes.Mob{_, _, _, _, _, _, _, _, _, _, _, _, _, _, b}: b
def find(+wanted: CB.Target, items: List<&2, LiveTypes.Mob>) -> Maybe<&2, LiveTypes.Mob>:
  match items:
    case Nil{}: None{}
    case +head <> tail: Bool.pick(
      Maybe<&2, LiveTypes.Mob>,
      CB.target_equal(wanted, target(head)),
      Some{head},
      find(wanted, tail)
    )
def exists(found: Maybe<&2, LiveTypes.Mob>) -> Bool:
  match found:
    case Some{_}: True{}
    case None{}: False{}
def position(found: Maybe<&2, LiveTypes.Mob>) -> Map.Point:
  match found:
    case Some{mob}: point(mob)
    case None{}: Map.Point{0, 0}
def owner(t: CB.Target) -> V.WorkIdentity:
  match t:
    case CB.Target{CB.Owner{p, l, r, o}, _, _}: V.WorkIdentity{p, l, r, o}
def actor(+wanted: V.WorkIdentity, items: List<&2, V.Actor>) -> Maybe<&2, V.Actor>:
  match items:
    case Nil{}: None{}
    case +head <> tail: Bool.pick(
      Maybe<&2, V.Actor>,
      Motion.same(wanted, Motion.actor_key(head)),
      Some{head},
      actor(wanted, tail)
    )
def target_actor(+wanted: CB.Target, items: List<&2, V.Actor>) -> Maybe<&2, V.Actor>:
  match items:
    case Nil{}: None{}
    case +head <> tail:
      Bool.pick(
        Maybe<&2, V.Actor>,
        Rules.target_owns(wanted, Motion.actor_key(head)),
        Some{head},
        target_actor(wanted, tail)
      )
def queued_due(items: List<&2, Scheduler.Entry>, +order: Nat) -> Nat:
  match items:
    case Nil{}: 0n
    case Scheduler.Entry{at, id} <> tail: Bool.pick(
      Nat,
      Nat.is_eq(id, order),
      at,
      queued_due(tail, order)
    )
def original_due(
  items: List<&2, CB.Original>,
  +wanted: CB.Target,
  +queue: List<&2, Scheduler.Entry>
) -> Nat:
  match items:
    case Nil{}: 0n
    case CB.Original{CB.Fact{t, _, _, _}, CB.Queued{}, order} <> tail:
      Bool.pick(
        Nat,
        CB.target_equal(t, wanted),
        queued_due(queue, order),
        original_due(tail, wanted, queue)
      )
    case _ <> tail: original_due(tail, wanted, queue)
def callback_items(state: CB.State) -> List<&2, CB.Original>:
  match state:
    case CB.State{items}: items
def due(+world: M.World, wanted: CB.Target) -> Nat:
  original_due(
    callback_items(Engine.callback_state(Run.core(M.engine(world)))),
    wanted,
    Engine.queued(Run.core(M.engine(world)))
  )

def fade_beams(items: List<&2, LiveTypes.Beam>) -> List<&2, LiveTypes.Beam>:
  match items:
    case Nil{}: []
    case LiveTypes.Beam{x, y, a, b, before, after, +ttl} <> +tail:
      Bool.pick(
        List<&2, LiveTypes.Beam>,
        (ttl > 1 : U32),
        LiveTypes.Beam{x, y, a, b, before, after, M.sub(ttl, 1)} <> fade_beams(tail),
        fade_beams(tail)
      )
def group_visible(found: Maybe<&2, R.Group>) -> Bool:
  match found:
    case Some{+group}: Bool.not(Rules.split(group)) || Rules.carrier(group)
    case None{}: True{}
def body_pose(
  mob: LiveTypes.Mob,
  found: Maybe<&2, V.Actor>,
  +world: M.World,
  +advanced: Bool
) -> LiveTypes.Mob:
  match mob found:
    case LiveTypes.Mob{+t, _, _, _, _, +flash, fx, fy, b, a, _, hx, hy, +beams, speed} Some{+value}:
      +p = Motion.point(value)
      LiveTypes.Mob{
        t,
        Map.px(p),
        Map.py(p),
        Motion.path(value),
        due(world, t),
        Bool.pick(U32, advanced, M.sub(flash, 1), flash),
        fx,
        fy,
        b,
        a,
        Bool.pick(
          Nat,
          Motion.drawable(
            value,
            M.actors(world)
          ) && group_visible(Rules.find(Motion.actor_key(value), Rules.groups(M.rules(world)))),
          (U32.to_nat(M.time(world)) * 20n : Nat),
          4294967295n
        ),
        hx,
        hy,
        Bool.pick(List<&2, LiveTypes.Beam>, advanced, fade_beams(beams), beams),
        speed
      }
    case value None{}: value
def present(found: Maybe<&2, LiveTypes.Mob>, +t: CB.Target) -> LiveTypes.Mob:
  match found:
    case Some{value}: value
    case None{}: LiveTypes.Mob{t, 0, 0, [], 0n, 0, 0, 0, 0n, 0n, 4294967295n, 0, 0, [], 1n}
def reconcile(
  items: List<&2, CB.Target>,
  +before: M.World,
  +after: M.World,
  frames: List<&2, T.Frame>
) -> List<&2, LiveTypes.Mob>:
  match items:
    case Nil{}: []
    case +t <> tail:
      body_pose(
        present(find(t, M.mobs(before)), t),
        target_actor(t, M.actors(after)),
        after,
        (M.time(after) > M.time(before) : U32)
      ) <> reconcile(tail, before, after, [])
# The actor and every existing fragment keep their pose when the shot changes cadence.
def hit(mob: LiveTypes.Mob, d: Nat, +fx: U32, +fy: U32, +b: Nat, +a: Nat) -> LiveTypes.Mob:
  match mob:
    case LiveTypes.Mob{t, +x, +y, path, _, _, _, _, _, _, at, hx, hy, beams, speed}:
      LiveTypes.Mob{
        t,
        x,
        y,
        path,
        d,
        20,
        fx,
        fy,
        b,
        a,
        at,
        x,
        y,
        LiveTypes.Beam{fx, fy, x, y, b, a, 20} <> beams,
        (speed * 2n : Nat)
      }
def hit_list(
  items: List<&2, LiveTypes.Mob>,
  +wanted: CB.Target,
  +d: Nat,
  +fx: U32,
  +fy: U32,
  +b: Nat,
  +a: Nat
) -> List<&2, LiveTypes.Mob>:
  match items:
    case Nil{}: []
    case +mob <> tail:
      Bool.pick(LiveTypes.Mob, CB.target_equal(target(mob), wanted), hit(mob, d, fx, fy, b, a), mob) <> hit_list(
        tail,
        wanted,
        d,
        fx,
        fy,
        b,
        a
      )
def visible(mob: LiveTypes.Mob, now: Nat) -> Bool:
  match mob:
    case LiveTypes.Mob{_, _, _, _, _, _, _, _, _, _, at, _, _, _, _}: (at <= now : Nat)
def visible_found(found: Maybe<&2, LiveTypes.Mob>, now: Nat) -> Bool:
  match found:
    case Some{mob}: visible(mob, now)
    case None{}: False{}

# Only accepted facts may produce a successful end marker.
def outcome(outputs: List<&2, C.Output>) -> U32:
  match outputs:
    case Nil{}: 0
    case C.EventEstablished{C.ReviewServiceRequestOutcomeRecorded{C.RequestClear{}}} <> _: 10
    case C.EventEstablished{C.ReviewServiceRequestOutcomeRecorded{C.RequestFinding{}}} <> _: 11
    case C.EventEstablished{C.SubmissionRecorded{}} <> _: 12
    case C.EventEstablished{C.FinishRecorded{C.Acknowledged{}}} <> _: 12
    case C.EventEstablished{C.PreparationReleased{_, _}} <> _: 14
    case _ <> tail: outcome(tail)
def matching(found: Maybe<&2, CB.Target>, wanted: CB.Target) -> Bool:
  match found:
    case Some{value}: CB.target_equal(value, wanted)
    case None{}: False{}
def certain_outcome(event: C.CanonicalEvent, +code: U32) -> U32:
  match event:
    case C.SubmissionTerminal{_, _, False{}}: Bool.pick(U32, U32.is_eq(code, 12), 15, code)
    case _: code
def frame_outcome(value: T.Frame, +wanted: CB.Target) -> U32:
  match value wanted:
    case T.ProductFrame{_, _, +event, _, _, outputs, None{}, _} CB.Target{+owner, _, +order}:
      Bool.pick(
        U32,
        matching(CB.fact_target(owner, order, event), wanted),
        certain_outcome(event, outcome(outputs)),
        0
      )
    case _ _: 0
def result(frames: List<&2, T.Frame>, +wanted: CB.Target) -> U32:
  match frames:
    case Nil{}: 0
    case frame <> tail: U32.max(frame_outcome(frame, wanted), result(tail, wanted))
def operation(t: CB.Target) -> Nat:
  match t:
    case CB.Target{CB.Owner{_, _, _, op}, _, _}: op
def end_cue(+mob: LiveTypes.Mob, +before: M.World, +after: M.World, +kind: U32) -> M.Cue:
  +p = point(mob)
  M.Cue{kind, operation(target(mob)), 0n, Map.px(p), Map.py(p), 40}
def end_keep(on: Bool, cue: M.Cue, tail: List<&2, M.Cue>) -> List<&2, M.Cue>:
  match on:
    case True{}: cue <> tail
    case False{}: tail
def endings(
  items: List<&2, LiveTypes.Mob>,
  +before: M.World,
  +after: M.World,
  +frames: List<&2, T.Frame>
) -> List<&2, M.Cue>:
  match items:
    case Nil{}: []
    case +mob <> tail:
      +kind = result(frames, target(mob))
      end_keep(
        Bool.not(exists(find(target(mob), M.mobs(after)))),
        end_cue(mob, before, after, Bool.pick(U32, U32.is_eq(kind, 0), 13, kind)),
        endings(tail, before, after, frames)
      )

# Accepted instantaneous stages still need an outcome, even when no tick ever
# contained their body. Recover identity from captured callbacks, not advice IDs.
def receipt_target(found: Maybe<&2, CB.Fact>) -> Maybe<&2, CB.Target>:
  match found:
    case Some{CB.Fact{target, _, _, _}}: Some{target}
    case None{}: None{}
def frame_target(details: T.FrameDetails) -> Maybe<&2, CB.Target>:
  match details:
    case T.FrameDetails{_, _, _, _, _, receipt, _, _, _, _, _}: receipt_target(receipt)
def instant_cue(
  found: Maybe<&2, CB.Target>,
  +code: U32,
  +before: M.World,
  +after: M.World,
  rest: List<&2, M.Cue>
) -> List<&2, M.Cue>:
  match found:
    case None{}: rest
    case Some{+target}:
      +p = position(find(target, M.mobs(before)))
      end_keep(
        (code > 0 : U32) && Bool.not(exists(find(target, M.mobs(before)))),
        M.Cue{code, operation(target), 0n, Map.px(p), Map.py(p), 40},
        rest
      )
def instant_frames(frames: List<&2, T.Frame>, +before: M.World, +after: M.World) -> List<&2, M.Cue>:
  match frames:
    case Nil{}: []
    case T.ProductFrame{_, _, +event, _, _, outputs, None{}, details} <> tail:
      instant_cue(
        frame_target(details),
        certain_outcome(event, outcome(outputs)),
        before,
        after,
        instant_frames(tail, before, after)
      )
    case _ <> tail: instant_frames(tail, before, after)
