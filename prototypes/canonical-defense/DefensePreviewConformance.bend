import ./DefenseLiveMotionTypes.bend as LiveTypes
import Base
import ../../packages/agent-flow-bend/Canonical.bend as C
import ./DefenseTowerFire.bend as Fire
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/Callbacks.bend as CB
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseRender.bend as R
import ./DefenseTowerPreview.bend as P
import ./DefensePreviewMarks.bend as Marks
import ./DefensePreview.bend as Placement
import ./Font.bend as F

def ticks(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: ticks(n, H.tick(world))
def initial() -> M.World:
  Lab.create_scenario(Lab.Scenario{3200n, 2400n, 0n, True{}, True{}, 2, 1, 60000}, 152n, 160, 0)
def tower(kind: U32) -> M.Tower:
  match kind:
    case 4: M.Tower{56, 424, 4, 1, 1, 60, 0}
    case _: M.Tower{328, 424, 3, 1, 1, 60, 0}
def prepare(+world: M.World, +kind: U32) -> M.World:
  H.move(H.key(world, (46 + kind : U32)), M.tx(tower(kind)), M.ty(tower(kind)))
def build(+world: M.World, +kind: U32) -> M.World:
  H.click(
    H.build(world, M.tx(tower(kind)), M.ty(tower(kind)), kind),
    M.tx(tower(kind)),
    M.ty(tower(kind))
  )
def selected(choose: Bool, +world: M.World, kind: U32) -> M.World:
  match choose:
    case True{}: build(world, kind)
    case False{}: prepare(world, kind)
def world(at: Nat, kind: U32, choose: Bool) -> M.World:
  selected(choose, ticks(at, initial()), kind)
def current_tower_found(found: Maybe<&2, M.Tower>, +world: M.World, kind: U32) -> M.Tower:
  match found:
    case Some{tower}: tower
    case None{}: H.preview_tower(M.mouse_x(world), M.mouse_y(world), kind)
def current_tower(+world: M.World, kind: U32) -> M.Tower:
  current_tower_found(H.selected_tower(M.towers(world), M.selected(world)), world, kind)
def marks(+world: M.World, +kind: U32) -> List<&2, Marks.Mark>:
  P.annotations(world, world, current_tower(world, kind))
def targets(+world: M.World, +kind: U32) -> Nat:
  List.length(
    &2,
    Marks.Target,
    P.candidates(
      P.available(world, current_tower(world, kind)),
      P.next(world, current_tower(world, kind))
    )
  )
def count(+world: M.World, kind: U32) -> Nat:
  List.length(&2, Marks.Mark, marks(world, kind))
def take(fuel: Nat, items: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel items:
    case 0n _: []
    case _ Nil{}: []
    case 1n+n head <> tail: head <> take(n, tail)
def scene(world: M.World) -> List<&2, F.Rect>: R.scene(~R.base_scene, world)
def prefix(world: M.World) -> List<&2, F.Rect>: take(8n, R.scene(~R.base_scene, world))

def pause(world: M.World) -> M.World: H.key(world, 112)
def cool(world: M.World) -> M.World: H.fire_world(world, 1, 0n)
def long_initial() -> M.World:
  Lab.create_scenario(Lab.Scenario{20000n, 20000n, 0n, True{}, True{}, 2, 1, 60000}, 152n, 160, 0)
def long_world(at: Nat, kind: U32, choose: Bool) -> M.World:
  selected(choose, ticks(at, long_initial()), kind)
def event_count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_, count, _, _, _, _, _}: count
def bounded_ticks(fuel: Nat, +world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: bounded_ticks(
      n,
      H.tick_world(
        Lab.tick_bounded(world, Nat.sub(512n, event_count(Lab.engine_observation(world))))
      )
    )
def finish_world() -> M.World:
  build(
    ticks(
      660n,
      Lab.schedule_finish(
        Lab.create_scenario(
          Lab.Scenario{400n, 1200n, 40n, True{}, True{}, 2, 1, 60000},
          152n,
          160,
          0
        ),
        9900n
      )
    ),
    4
  )
def next_found(found: Maybe<&2, M.Tower>, +world: M.World, kind: U32) -> Maybe<&2, CB.Target>:
  match found:
    case Some{tower}: P.next(world, tower)
    case None{}: P.next(world, current_tower(world, kind))
def next_target(+world: M.World, kind: U32) -> Maybe<&2, CB.Target>:
  next_found(H.selected_tower(M.towers(world), M.selected(world)), world, kind)
def annotate(+world: M.World, kind: U32) -> List<&2, Marks.Mark>:
  P.annotations(world, world, current_tower(world, kind))
def logical(+world: M.World, +kind: U32) -> List<&2, Marks.Anchor>:
  P.anchors(
    P.available(world, current_tower(world, kind)),
    world,
    P.next(world, current_tower(world, kind)),
    P.ready(world, current_tower(world, kind))
  )
def observe(world: M.World) -> T.Observation: Lab.engine_observation(world)
def crowded() -> M.World:
  build(
    ticks(
      800n,
      Lab.create_scenario(
        Lab.Scenario{20000n, 20000n, 0n, True{}, True{}, 2, 4, 60000},
        152n,
        160,
        0
      )
    ),
    3
  )
def two_world() -> M.World:
  H.click(H.build(world(2n, 3, True{}), 328, 472, 3), 328, 424)
def selected_next(+world: M.World) -> Maybe<&2, CB.Target>:
  H.shot_target(P.context(world, M.selected(world)), M.selected(world), 0n)

def cancelled_world() -> M.World:
  build(ticks(501n, Lab.schedule_finish(initial(), 9800n)), 3)
def original_callbacks(world: M.World) -> List<&2, CB.Original>:
  Fire.originals(Engine.callback_state(Run.core(M.engine(world))))

# The real selected-card path, exposed only for scene conformance.
def selected_value(found: Maybe<&2, M.Tower>) -> M.Tower:
  match found:
    case Some{tower}: tower
    case None{}: tower(3)
def chosen_tower(+world: M.World) -> M.Tower:
  selected_value(H.selected_tower(M.towers(world), M.selected(world)))
def upgraded(world: M.World) -> M.World: H.upgrade(world)
def ready_at(world: M.World) -> U32: M.ready_at(chosen_tower(world))
def selected_effect(
  +world: M.World
) -> String: P.next_effect(P.context(world, M.selected(world)), chosen_tower(world))
def range_quote(world: M.World) -> String: P.upgrade_range(chosen_tower(world))
def cadence_quote(world: M.World) -> String: P.upgrade_cadence(chosen_tower(world))
def selected_card(+world: M.World) -> List<&2, F.Rect>:
  R.inspection(M.towers(world), world, 1, [])
def text_pixels(label: String, x: U32, y: U32, scale: U32, color: U32) -> List<&2, F.Rect>:
  F.text(label, x, y, scale, color, [])

def conditional_effect(+world: M.World) -> String:
  P.conditional_effect(world, chosen_tower(world))

def budget(world: M.World) -> U32: M.gold(world)
def individual_count(world: M.World) -> U32: M.submissions(world)
def finish_count(world: M.World) -> U32: M.delivered(world)
def control_counters_preserved(+world: M.World) -> Bool:
  +control = M.control_with_submissions(M.control(world), 37)
  U32.is_eq(
    M.control_submissions(M.control_with_schedule(control, M.control_schedule(control))),
    37
  ) &&
  U32.is_eq(M.control_submissions(M.control_with_pace(control, 200)), 37) &&
  U32.is_eq(M.control_submissions(M.control_with_cues(control, [])), 37) &&
  U32.is_eq(M.control_submissions(M.control_with_actors(control, [])), 37) &&
  U32.is_eq(M.control_submissions(M.with_settings(control, M.settings(world))), 37) &&
  U32.is_eq(M.control_submissions(M.control_with_rules(control, M.rules(world))), 37)

def range_edge_world() -> M.World:
  H.select(H.build(ticks(2n, initial()), 312, 392, 3), 1)
def upgrade_note(+world: M.World) -> String:
  P.upgrade_note(world, chosen_tower(world))

# Manual caller input shares the scheduled experiment path and Stop owner.
def stop_build(kind: U32, +world: M.World) -> M.World:
  match kind:
    case 1: H.build(world, 328, 424, 3)
    case 2: H.build(H.build(world, 328, 424, 3), 328, 472, 3)
    case _: world
def stop_initial(kind: U32) -> M.World:
  stop_build(
    kind,
    Lab.create_scenario(Lab.Scenario{1200n, 80n, 0n, True{}, True{}, 2, 1, 60000}, 152n, 160, 0)
  )
def stop_at_input(kind: U32) -> M.World: ticks(490n, stop_initial(kind))
def stop_key(world: M.World) -> M.World: H.key(world, 115)
def stop_text(world: M.World) -> String: R.stop_line(world)
def stop_run(kind: U32, repeat: Bool) -> M.World:
  +world = ticks(1n, stop_key(stop_at_input(kind)))
  ticks(509n, Bool.pick(M.World, repeat, stop_key(world), world))
# Capture the same current activity scope as the interactive S input. Scheduling
# at initial() would capture an earlier scope before automatic towers progress.
def stop_scheduled(kind: U32) -> M.World:
  ticks(510n, Lab.schedule_finish(stop_at_input(kind), 9800n))
def stop_closed(world: M.World) -> M.World: ticks(5n, stop_key(world))
def business_core(world: M.World) -> C.State: M.core(world)
def before_start() -> M.World: H.initial()
def focused(+world: M.World) -> Nat:
  R.focused_operation(H.selected_tower(M.towers(world), M.selected(world)), world, 0n)
def range_edge_three() -> M.World:
  H.select(H.build(ticks(2n, initial()), 296, 392, 3), 1)
def defeated(world: M.World) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, _, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, l, c, g, 0, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}
def lab_upgrade(world: M.World) -> Lab.Receipt: Lab.apply(world, Lab.Upgrade{1})
def placement_legal(world: M.World) -> Bool: Placement.legal(Placement.calculate(world))
def placement_reason(world: M.World) -> String: Placement.reason(Placement.calculate(world))
def click_here(+world: M.World) -> M.World: H.click(world, M.mouse_x(world), M.mouse_y(world))

def hover_at(world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  H.move(H.key(world, (46 + kind : U32)), x, y)
def range_color(world: M.World) -> U32: R.ghost_range_color(Placement.calculate(world))
def build_color(world: M.World) -> U32: R.cue_color(Placement.status(Placement.calculate(world)))

# Ordinary interactive start: no laboratory scenario or injected callbacks.
def ordinary_start() -> M.World: H.key(H.initial(), 110)
def ordinary_tick(world: M.World) -> M.World: H.tick(world)
def ordinary_build(+world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  H.select(H.build(world, x, y, kind), 1)
def ordinary_time(world: M.World) -> U32: M.time(world)
def placement_before(world: M.World) -> U32: Placement.before(Placement.calculate(world))
def placement_target(world: M.World) -> Nat: Placement.target(Placement.calculate(world))
def selected_remaining(+world: M.World) -> U32: Fire.remaining(world, chosen_tower(world))
def selected_anchors(+world: M.World) -> List<&2, Marks.Anchor>:
  P.anchors(
    P.available(world, chosen_tower(world)),
    world,
    P.next(world, chosen_tower(world)),
    P.ready(world, chosen_tower(world))
  )

def live_targets(world: M.World) -> List<&2, CB.Target>: P.live(world)
def physics_targets(
  world: M.World,
  tower: M.Tower
) -> List<&2, CB.Target>: P.available(world, tower)
def physics_color(world: M.World, tower: M.Tower) -> U32: R.tower_range_color(world, tower)
def physics_preview(
  +world: M.World,
  tower: M.Tower
) -> List<&2, F.Rect>: P.render(world, world, tower, [])
def physics_body(target: CB.Target, world: M.World) -> Marks.Body: P.live_body(target, world)
def ordinary_layout(layout: U32) -> M.World: H.key(H.reset_found(H.initial(), layout), 110)
def menu_kind(slot: U32) -> U32: M.choice(H.key(H.initial(), (48 + slot : U32)))
def live_caption(target: CB.Target, world: M.World) -> String: P.live_caption(target, world)

def hit_animation(x: U32, y: U32, on: Bool) -> List<&2, F.Rect>:
  P.hit_layer(
    on,
    LiveTypes.Mob{
      CB.Target{CB.Owner{1n, 1n, 1n, 7n}, CB.PreparationCompleted{}, 1n},
      x,
      y,
      [],
      1000n,
      20,
      160,
      120,
      1000n,
      500n,
      0n,
      280,
      120,
      [
        LiveTypes.Beam{160, 120, 280, 120, 1000n, 500n, 20},
        LiveTypes.Beam{160, 220, 280, 220, 500n, 250n, 10}
      ],
      4n
    },
    []
  )
def mobs(world: M.World) -> List<&2, LiveTypes.Mob>: M.mobs(world)

def activity_note(world: M.World) -> String: R.activity_line(world)
