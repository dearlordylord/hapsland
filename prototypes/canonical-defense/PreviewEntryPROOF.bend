import Base
import ./PreviewEntryLAWS.bend as Laws
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseTowerPreview.bend as P
import ../../packages/monkey-business-bend/Callbacks.bend as CB

def Laws.actual_scene_has_preview(base, world): {==}
def Laws.overlay_dispatch(world, preview, rest): {==}
def Laws.overlay_selected(world, preview, rest): {==}
def Laws.overlay_placement(world, preview, rest): {==}
def Laws.selected_existing(tower, world, rest): {==}
def Laws.selected_missing(world, rest): {==}
def Laws.placement_active(world, preview, rest): {==}
def Laws.placement_inactive(world, preview, rest): {==}
def Laws.placement_guard(world, preview, rest): {==}
def Laws.coverage_palette(present):
  match present:
    case True{}: {==}
    case False{}: {==}
def Laws.coverage_ignores_buildability(preview): {==}

def Laws.constructed_range_uses_physics(world, tower): {==}
def Laws.prebuild_matches_constructed(world): {==}
def Laws.selected_range_is_drawn(world, tower, rest): {==}
def pause_coverage(defeated: Bool, world: M.World, tower: M.Tower) ->
  {P.available(H.key_when(defeated, world, 112), tower) == P.available(world, tower) : List<&2, CB.Target>}:
  match defeated world:
    case True{} _: {==}
    case False{} M.World{core, t, p, l, c, g, h, ts, a, o, r, cl, d, Nil{}, x, y, selected, work, flash}: {==}
    case False{} M.World{
      core,
      t,
      p,
      l,
      c,
      g,
      h,
      ts,
      a,
      o,
      r,
      cl,
      d,
      M.Control{schedule, pace, cues, actors, settings, rules, submissions, mobs, mode} <> tail,
      x,
      y,
      selected,
      work,
      flash
    }: {==}

def Laws.pause_preserves_coverage(world, tower):
  pause_coverage(M.defeated(world), world, tower)
