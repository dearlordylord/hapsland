import ./DefenseLiveMotionTypes.bend as LiveTypes
# Read-only physical targets, always-visible live entities and tower coverage.
import Base
import ./DefenseLiveMotion.bend as Live
import ./DefensePreviewMarks.bend as Marks
import ./DefenseTowerFire.bend as Fire
import ./DefenseModel.bend as M
import ./DefenseMechanics.bend as Mechanics
import ./DefenseHost.bend as H
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefensePreview.bend as Placement
import ./Font.bend as F
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Engine.bend as Engine

def body(key: V.WorkIdentity, point: Map.Point) -> Marks.Body:
  match point:
    case Map.Point{x, y}: Marks.Body{key, x, y}
def keep_target(on: Bool, target: CB.Target, rest: List<&2, CB.Target>) -> List<&2, CB.Target>:
  match on:
    case True{}: target <> rest
    case False{}: rest
def targets(items: List<&2, CB.Original>, +world: M.World, +tower: M.Tower) -> List<&2, CB.Target>:
  match items:
    case Nil{}: []
    case CB.Original{CB.Fact{+target, _, _, _}, CB.Queued{}, order} <> tail:
      keep_target(
        Fire.eligible(target, Fire.due(order, world), world, tower, 0n),
        target,
        targets(tail, world, tower)
      )
    case _ <> tail: targets(tail, world, tower)
def live_targets(items: List<&2, CB.Original>, +world: M.World) -> List<&2, CB.Target>:
  match items:
    case Nil{}: []
    case CB.Original{CB.Fact{+target, _, _, _}, CB.Queued{}, order} <> tail:
      keep_target(
        Fire.live(target, Fire.due(order, world), world),
        target,
        live_targets(tail, world)
      )
    case _ <> tail: live_targets(tail, world)
def live(+world: M.World) -> List<&2, CB.Target>:
  live_targets(
    Fire.originals(Engine.callback_state(Run.core(M.engine(world)))),
    Fire.targeting_world(world)
  )
def available(+world: M.World, tower: M.Tower) -> List<&2, CB.Target>:
  targets(
    Fire.originals(Engine.callback_state(Run.core(M.engine(world)))),
    Fire.targeting_world(world),
    tower
  )
# Preview the same sequential context the automatic pass gives this tower.
# Pure evaluation of previous towers does not commit any change to the input.
def context_loop(items: List<&2, M.Tower>, world: M.World, +index: U32, wanted: U32) -> M.World:
  match items wanted:
    case _ 1: world
    case tower <> tail _: context_loop(
      tail,
      Fire.automatic_world(Fire.automatic_one(world, tower, index)),
      (index + 1 : U32),
      M.sub(wanted, 1)
    )
    case Nil{} _: world
def context_when(on: Bool, +world: M.World, index: U32) -> M.World:
  match on:
    case True{}: context_loop(M.towers(world), world, 1, index)
    case False{}: world
def context(+world: M.World, index: U32) -> M.World:
  context_when(H.clock_active(world), world, index)
def ready(+world: M.World, tower: M.Tower) -> Bool:
  H.clock_active(world) && (M.time(world) >= M.ready_at(tower) : U32)
def next_when(on: Bool, world: M.World, tower: M.Tower) -> Maybe<&2, CB.Target>:
  match on:
    case True{}: Fire.target(world, tower, 0n)
    case False{}: None{}
def next(+world: M.World, +tower: M.Tower) -> Maybe<&2, CB.Target>:
  next_when(ready(world, tower), world, tower)
def next_plan_when(on: Bool, world: M.World, tower: M.Tower) -> List<&2, CB.Target>:
  match on:
    case True{}: Fire.plan(world, tower, 0n)
    case False{}: []
def next_plan(+world: M.World, +tower: M.Tower) -> List<&2, CB.Target>:
  next_plan_when(ready(world, tower), world, tower)
def chosen_plan(+target: CB.Target, items: List<&2, CB.Target>) -> Bool:
  match items:
    case Nil{}: False{}
    case head <> tail: CB.target_equal(target, head) || chosen_plan(target, tail)
def key(value: CB.Owner) -> V.WorkIdentity:
  match value:
    case CB.Owner{p, l, r, o}: V.WorkIdentity{p, l, r, o}
def live_body(+target: CB.Target, world: M.World) -> Marks.Body:
  match target:
    case CB.Target{owner, _, _}: body(key(owner), Fire.target_point(target, world))
def live_bodies(items: List<&2, CB.Target>, +world: M.World) -> List<&2, Marks.Body>:
  match items:
    case Nil{}: []
    case target <> tail: live_body(target, world) <> live_bodies(tail, world)
def bodies(+world: M.World) -> List<&2, Marks.Body>:
  live_bodies(live(world), world)
def chosen(+target: CB.Target, selected: Maybe<&2, CB.Target>) -> Bool:
  match selected:
    case None{}: False{}
    case Some{other}: CB.target_equal(target, other)
def candidate(+target: CB.Target, selected: Bool) -> Marks.Target:
  match target:
    case CB.Target{owner, CB.FinishTerminal{_, _, _, _, ids}, order}: Marks.Target{
      key(owner),
      Some{ids},
      order,
      selected
    }
    case CB.Target{owner, _, order}: Marks.Target{key(owner), None{}, order, selected}
def candidates(
  items: List<&2, CB.Target>,
  +selected: Maybe<&2, CB.Target>
) -> List<&2, Marks.Target>:
  match items:
    case Nil{}: []
    case +target <> tail: candidate(target, chosen(target, selected)) <> candidates(tail, selected)
# Build each mark from its exact callback body. A Finish packet is one body;
# its captured member list is descriptive, not a join onto sibling bodies.
def exact_marks(
  items: List<&2, CB.Target>,
  +world: M.World,
  +selected: List<&2, CB.Target>,
  +ready: Bool
) -> List<&2, Marks.Mark>:
  match items:
    case Nil{}: []
    case +target <> tail: Marks.Mark{
      candidate(target, chosen_plan(target, selected)),
      live_body(target, world),
      chosen_plan(target, selected),
      ready
    } <> exact_marks(tail, world, selected, ready)
def annotations(+source: M.World, +choice: M.World, +tower: M.Tower) -> List<&2, Marks.Mark>:
  exact_marks(available(source, tower), source, next_plan(choice, tower), ready(choice, tower))
def label(target: CB.Target) -> String:
  match target:
    case CB.Target{_, CB.FinishTerminal{_, _, _, _, ids}, _}: "FINISH " ++ Nat.show(
      List.length(&2, Nat, ids)
    ) ++ " MEMBERS"
    case CB.Target{CB.Owner{_, _, _, operation}, CB.PreparationCompleted{}, _}: "PREP U" ++ Nat.show(
      operation
    )
    case CB.Target{CB.Owner{_, _, _, operation}, CB.ReviewServiceRequestSettled{_}, _}: "CHECK U" ++ Nat.show(
      operation
    )
    case CB.Target{CB.Owner{_, _, _, operation}, _, _}: "OUTPUT U" ++ Nat.show(operation)
def callback_order(target: CB.Target) -> Nat:
  match target:
    case CB.Target{_, _, order}: order
def remaining(+target: CB.Target, +world: M.World) -> Nat:
  Nat.sub(Live.due(world, target), Fire.delivery_at(world))
def effect_text(found: Maybe<&2, CB.Target>, +world: M.World) -> String:
  match found:
    case None{}: "NO SHOT NOW"
    case Some{+target}: Nat.show(remaining(target, world)) ++ " TO " ++ Nat.show(
      Fire.shortened(remaining(target, world))
    ) ++ " MS"
def next_effect(+world: M.World, +tower: M.Tower) -> String:
  effect_text(next(world, tower), world)
# Conditional inspection while paused/cooling; this is not the next committed shot.
def conditional_target(found: Maybe<&2, CB.Target>, +world: M.World) -> String:
  match found:
    case None{}: ""
    case Some{+target}: "IF READY NOW: " ++ Nat.show(remaining(target, world)) ++ " TO " ++ Nat.show(
      Fire.shortened(remaining(target, world))
    ) ++ " MS"
def conditional_effect(+world: M.World, +tower: M.Tower) -> String:
  Bool.pick(
    String,
    ready(world, tower),
    "",
    conditional_target(Fire.target(world, tower, 0n), world)
  )
def upgrade_range(+tower: M.Tower) -> String:
  U32.show(Mechanics.tower_range(tower)) ++ " TO " ++ U32.show(
    Mechanics.tower_range(Mechanics.upgraded(tower))
  )
def upgrade_cadence(+tower: M.Tower) -> String:
  U32.show(Fire.cooldown(tower)) ++ " TO " ++ U32.show(Fire.cooldown(Mechanics.upgraded(tower)))
def upgrade_living_note(+world: M.World, +tower: M.Tower) -> String:
  Bool.pick(
    String,
    (M.level(tower) >= Mechanics.max_level(M.tkind(tower)) : U32),
    "MAX LEVEL / NO UPGRADE",
    Bool.pick(
      String,
      (M.gold(world) >= H.upgrade_cost(M.tkind(tower), M.level(tower)) : U32),
      "U COST " ++ U32.show(H.upgrade_cost(M.tkind(tower), M.level(tower))),
      "NEED " ++ U32.show(H.upgrade_cost(M.tkind(tower), M.level(tower))) ++ " GOLD"
    )
  )
def upgrade_note(+world: M.World, tower: M.Tower) -> String:
  Bool.pick(
    String,
    M.defeated(world),
    "DEFEATED / NO UPGRADE",
    upgrade_living_note(world, tower)
  )
def anchor_caption(+target: CB.Target, +world: M.World, selected: Bool, ready: Bool) -> String:
  label(target) ++ Bool.pick(
    String,
    selected && ready,
    " " ++ Nat.show(
      remaining(target, world)
    ) ++ ">" ++ Nat.show(Fire.shortened(remaining(target, world))) ++ "MS",
    ""
  )
def anchor(point: Map.Point, caption: String, selected: Bool, ready: Bool) -> Marks.Anchor:
  match point:
    case Map.Point{x, y}: Marks.Anchor{x, y, caption, selected, ready}
def anchors(
  items: List<&2, CB.Target>,
  +world: M.World,
  +selected: List<&2, CB.Target>,
  +ready: Bool
) -> List<&2, Marks.Anchor>:
  match items:
    case Nil{}: []
    case +target <> tail: anchor(
      Fire.target_point(target, world),
      anchor_caption(target, world, chosen_plan(target, selected), ready),
      chosen_plan(target, selected),
      ready
    ) <> anchors(tail, world, selected, ready)
def target_note(found: Maybe<&2, CB.Target>) -> String:
  match found:
    case None{}: "NO TARGET IN RANGE"
    case Some{target}: label(target)
def state_note(paused: Bool, active: Bool, cooling: Bool, found: Maybe<&2, CB.Target>) -> String:
  match paused active cooling:
    case True{} _ _: "PAUSED / GREEN TARGETS ON RESUME"
    case _ False{} _: "BUILD MODE / N STARTS WORK"
    case _ _ True{}: "COOLDOWN / GREEN ELIGIBLE TARGETS"
    case _ _ _: target_note(found)
def status(+world: M.World, +tower: M.Tower) -> String:
  state_note(
    M.paused(world),
    M.active(world),
    (M.time(world) < M.ready_at(tower) : U32),
    next(world, tower)
  )
def render(
  +source: M.World,
  +choice: M.World,
  +tower: M.Tower,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  Marks.draw(
    annotations(source, choice, tower),
    Marks.draw_anchors(
      anchors(available(source, tower), source, next_plan(choice, tower), ready(choice, tower)),
      rest
    )
  )
def selected(
  found: Maybe<&2, M.Tower>,
  +world: M.World,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match found:
    case Some{tower}: render(world, context(world, M.selected(world)), tower, rest)
    case None{}: rest
def placed_when(
  on: Bool,
  +world: M.World,
  +preview: Placement.Preview,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match on:
    case True{}: render(
      world,
      world,
      H.preview_tower(Placement.x(preview), Placement.y(preview), Placement.kind(preview)),
      rest
    )
    case False{}: rest
def placed(
  +world: M.World,
  +preview: Placement.Preview,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  placed_when(
    (Placement.x(
      preview
    ) < 792 : U32) && (Placement.y(preview) > 100 : U32) && (Placement.y(preview) < 656 : U32),
    world,
    preview,
    rest
  )

def overlay_when(
  selected_tower: Bool,
  +world: M.World,
  preview: Placement.Preview,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match selected_tower:
    case True{}: selected(H.selected_tower(M.towers(world), M.selected(world)), world, rest)
    case False{}: placed(world, preview, rest)
def overlay(
  +world: M.World,
  preview: Placement.Preview,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  overlay_when((M.selected(world) > 0 : U32), world, preview, rest)

def beam(fuel: Nat, +from: Map.Point, +to: Map.Point, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +p = Map.segment(from, to, (U32.from_nat(n) * 100 / 32 : U32))
      F.put(Map.px(p), Map.py(p), 3, 3, 16768133, beam(n, from, to, rest))
def short_identity_hit(target: CB.Target) -> String:
  match target:
    case CB.Target{CB.Owner{_, _, _, operation}, _, _}: "U" ++ Nat.show(operation)
def beam_layers(
  items: List<&2, LiveTypes.Beam>,
  +point: Map.Point,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match items:
    case Nil{}: rest
    case LiveTypes.Beam{+fx, +fy, hx, hy, b, a, _} <> tail:
      F.text(Nat.show(b) ++ ">" ++ Nat.show(a), M.sub(fx, 20), (fy + 14 : U32), 1, 16768133,
        beam(33n, Map.Point{fx, fy}, point, beam_layers(tail, point, rest)))
def hit_layer(on: Bool, mob: LiveTypes.Mob, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on mob:
    case True{} LiveTypes.Mob{target, +x, +y, _, _, _, fx, fy, b, a, _, hx, hy, beams, boost}:
      F.text(
        "BOOST " ++ short_identity_hit(target) ++ " " ++ Nat.show(b) ++ ">" ++ Nat.show(a) ++ "MS",
        M.sub(x, 20),
        (y + 18 : U32),
        1,
        16768133,
        beam_layers(beams, Map.Point{x, y}, rest)
      )
    case False{} _ : rest
def short_identity(target: CB.Target) -> String:
  match target:
    case CB.Target{_, CB.FinishTerminal{_, _, _, _, ids}, order}: "PACKET F" ++ Nat.show(order) ++ " X" ++ Nat.show(
      List.length(&2, Nat, ids)
    )
    case CB.Target{CB.Owner{_, _, _, operation}, _, _}: "U" ++ Nat.show(operation)
def same_point(+a: Map.Point, +b: Map.Point) -> Bool:
  U32.is_eq(Map.px(a), Map.px(b)) && U32.is_eq(Map.py(a), Map.py(b))
def colocated(items: List<&2, LiveTypes.Mob>, +point: Map.Point) -> List<&2, CB.Target>:
  match items:
    case Nil{}: []
    case +mob <> tail: keep_target(
      same_point(Live.point(mob), point),
      Live.target(mob),
      colocated(tail, point)
    )
def identities(items: List<&2, CB.Target>, fuel: Nat) -> String:
  match items fuel:
    case Nil{} _: ""
    case _ 0n: " ..."
    case target <> tail 1n+n: " " ++ short_identity(target) ++ identities(tail, n)
def caption_for(items: List<&2, CB.Target>, +target: CB.Target, world: M.World) -> String:
  match items:
    case _ <> Nil{}: short_identity(target) ++ " " ++ Nat.show(remaining(target, world)) ++ "MS"
    case +many: "X" ++ Nat.show(List.length(&2, CB.Target, many)) ++ identities(many, 4n)
def live_caption(+target: CB.Target, +world: M.World) -> String:
  caption_for(colocated(M.mobs(world), Fire.target_point(target, world)), target, world)
def visible_mob_layer(
  +mob: LiveTypes.Mob,
  +world: M.World,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match mob:
    case LiveTypes.Mob{_, _, _, _, _, flash, _, _, _, _, _, hx, hy, beams, boost}:
      hit_layer((flash > 0 : U32), mob, rest)
def mob_when(
  on: Bool,
  mob: LiveTypes.Mob,
  world: M.World,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match on:
    case True{}: visible_mob_layer(mob, world, rest)
    case False{}: rest
def mob_layer(+mob: LiveTypes.Mob, +world: M.World, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  mob_when(Live.visible(mob, (U32.to_nat(M.time(world)) * 20n : Nat)), mob, world, rest)
def mob_layers(
  items: List<&2, LiveTypes.Mob>,
  +world: M.World,
  rest: List<&2, F.Rect>
) -> List<&2, F.Rect>:
  match items:
    case Nil{}: rest
    case mob <> tail: mob_layer(mob, world, mob_layers(tail, world, rest))
def live_layer(+world: M.World, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  mob_layers(M.mobs(world), world, rest)
