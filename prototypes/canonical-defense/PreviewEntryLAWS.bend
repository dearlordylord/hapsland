# Owner-approved actual scene contract. Quantifying the background builder keeps
# bitmap layout expansion out of the goal; actual base_scene is one instance.
import Base
import ./DefenseHost.bend as H
import ./DefenseRender.bend as R
import ./DefenseTowerPreview.bend as P
import ./DefensePreview.bend as Placement
import ./DefenseModel.bend as M
import ./Font.bend as F
import ./DefenseTowerFire.bend as Fire
import ../../packages/monkey-business-bend/Callbacks.bend as CB

law actual_scene_has_preview:
  for ~base: @+state:M.World -> List<&2, F.Rect>
  for +world: M.World
  {
    R.scene(~base, world)
    == R.preview_layer(world, Placement.calculate(world), base(world))
    : List<&2, F.Rect>
  }
law overlay_dispatch:
  for +world: M.World
  for +preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    P.overlay(world, preview, rest)
    == P.overlay_when((M.selected(world) > 0 : U32), world, preview, rest)
    : List<&2, F.Rect>
  }
law overlay_selected:
  for +world: M.World
  for preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    P.overlay_when(True{}, world, preview, rest)
    == P.selected(H.selected_tower(M.towers(world), M.selected(world)), world, rest)
    : List<&2, F.Rect>
  }
law overlay_placement:
  for +world: M.World
  for +preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    P.overlay_when(False{}, world, preview, rest)
    == P.placed(world, preview, rest)
    : List<&2, F.Rect>
  }
law selected_existing:
  for +tower: M.Tower
  for +world: M.World
  for +rest: List<&2, F.Rect>
  {
    P.selected(Some{tower}, world, rest)
    == P.render(world, P.context(world, M.selected(world)), tower, rest)
    : List<&2, F.Rect>
  }
law selected_missing:
  for world: M.World
  for +rest: List<&2, F.Rect>
  {P.selected(None{}, world, rest) == rest : List<&2, F.Rect>}
law placement_active:
  for +world: M.World
  for +preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    P.placed_when(True{}, world, preview, rest)
    == P.render(
      world,
      world,
      H.preview_tower(Placement.x(preview), Placement.y(preview), Placement.kind(preview)),
      rest
    )
    : List<&2, F.Rect>
  }
law placement_inactive:
  for world: M.World
  for preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {P.placed_when(False{}, world, preview, rest) == rest : List<&2, F.Rect>}
law placement_guard:
  for +world: M.World
  for +preview: Placement.Preview
  for +rest: List<&2, F.Rect>
  {
    P.placed(world, preview, rest)
    == P.placed_when(
      (Placement.x(
        preview
      ) < 792 : U32) && (Placement.y(preview) > 100 : U32) && (Placement.y(preview) < 656 : U32),
      world,
      preview,
      rest
    )
    : List<&2, F.Rect>
  }

# A target gives a green coverage ring, independently of placement validity.
law coverage_palette:
  for +present: Bool
  {R.coverage_color(present) == Bool.pick(U32, present, 6741384, 9148069) : U32}
law coverage_ignores_buildability:
  for +preview: Placement.Preview
  {R.ghost_range_color(preview) == R.coverage_color((Placement.before(preview) > 0 : U32)) : U32}

# All worlds and tower parameters, not a list of named tower examples.
law constructed_range_uses_physics:
  for +world: M.World
  for +tower: M.Tower
  {
    R.tower_range_color(world, tower)
    == R.coverage_color((Fire.remaining(world, tower) > 0 : U32))
    : U32
  }
law prebuild_matches_constructed:
  for +world: M.World
  {
    R.ghost_range_color(Placement.calculate(world))
    == R.tower_range_color(
      world,
      H.preview_tower(H.snap(M.mouse_x(world)), H.snap(M.mouse_y(world)), M.choice(world))
    )
    : U32
  }
law selected_range_is_drawn:
  for +world: M.World
  for +tower: M.Tower
  for +rest: List<&2, F.Rect>
  {
    R.selected_ring(True{}, world, tower, rest)
    == R.ring(
      48n,
      M.tx(tower),
      M.ty(tower),
      H.built_range(tower),
      R.tower_range_color(world, tower),
      rest
    )
    : List<&2, F.Rect>
  }
law pause_preserves_coverage:
  for +world: M.World
  for +tower: M.Tower
  {P.available(H.key(world, 112), tower) == P.available(world, tower) : List<&2, CB.Target>}
