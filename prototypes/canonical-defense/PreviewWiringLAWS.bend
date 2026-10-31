import ./DefenseLiveMotionTypes.bend as LiveTypes
# Owner-approved preview laws at the actual world and scene boundary.
import Base
import ./DefenseMap.bend as Map
import ./DefenseMotionTypes.bend as V
import ./DefenseMotion.bend as Motion
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/OutputScenario.bend as Output
import ./DefenseTowerPreview.bend as P
import ./DefensePreviewMarks.bend as Marks
import ./DefenseTowerFire.bend as Fire
import ./DefensePreview.bend as Placement
import ./DefenseRender.bend as Render
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./Font.bend as F
import ../../packages/monkey-business-bend/Callbacks.bend as CB

law render_annotations:
  for +world: M.World
  for +choice: M.World
  for +tower: M.Tower
  for +rest: List<&2, F.Rect>
  {
    P.render(world, choice, tower, rest)
    == Marks.draw(
      P.annotations(world, choice, tower),
      Marks.draw_anchors(
        P.anchors(
          P.available(world, tower),
          world,
          P.next_plan(choice, tower),
          P.ready(choice, tower)
        ),
        rest
      )
    )
    : List<&2, F.Rect>
  }
law scene_consumes_preview:
  for +world: M.World
  for +preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    Render.preview_layer(world, preview, rest)
    == Render.defeat_layer(
      M.defeated(world),
      world,
      P.overlay(world, preview, P.live_layer(world, rest))
    )
    : List<&2, F.Rect>
  }
law body_position:
  for +key: V.WorkIdentity
  for +x: U32
  for +y: U32
  {P.body(key, Map.Point{x, y}) == Marks.Body{key, x, y} : Marks.Body}

# Coverage uses the untouched physical world; sequential prediction only selects yellow.
law coverage_uses_source_world:
  for +world: M.World
  for +choice: M.World
  for +tower: M.Tower
  {
    P.annotations(world, choice, tower)
    == P.exact_marks(
      P.available(world, tower),
      world,
      P.next_plan(choice, tower),
      P.ready(choice, tower)
    )
    : List<&2, Marks.Mark>
  }
# The drawn actor uses the same Motion position whose step bounds are proved.
law live_entity_position:
  for +actor: V.Actor
  for +world: M.World
  for +rest: List<&2, F.Rect>
  {
    Render.history_actor(actor, world, rest)
    == Render.actor_at(Motion.point(actor), actor, world, rest)
    : List<&2, F.Rect>
  }

law every_live_entity_drawn:
  for +actor: V.Actor
  for +tail: List<&2, V.Actor>
  for +world: M.World
  for +rest: List<&2, F.Rect>
  {
    Render.history_actors(actor <> tail, world, rest)
    == Render.history_visible(
      Render.rule_parent_visible(actor, world),
      actor,
      world,
      Render.history_actors(tail, world, rest)
    )
    : List<&2, F.Rect>
  }

law beam_tracks_current_body:
  for +fx: U32
  for +fy: U32
  for oldX: U32
  for oldY: U32
  for +before: Nat
  for +after: Nat
  for ttl: U32
  for +point: Map.Point
  for +tail: List<&2, LiveTypes.Beam>
  for +rest: List<&2, F.Rect>
  {
    P.beam_layers(LiveTypes.Beam{fx, fy, oldX, oldY, before, after, ttl} <> tail, point, rest)
    == F.text(
      Nat.show(before) ++ ">" ++ Nat.show(after),
      M.sub(fx, 20),
      (fy + 14 : U32),
      1,
      16768133,
      P.beam(33n, Map.Point{fx, fy}, point, P.beam_layers(tail, point, rest))
    )
    : List<&2, F.Rect>
  }
