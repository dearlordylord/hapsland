# Actual render functions with explicit display inputs; no alternate renderer.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotionTypes.bend as V
import ./DefenseRender.bend as R
import ./DefenseRuleTypes.bend as Rules
import ./DefenseRules.bend as Rule
import ./Font.bend as F

def start() -> M.World: Lab.create_scenario(
  Lab.Scenario{400n, 2400n, 0n, True{}, True{}, 2, 1, 60000},
  152n,
  160,
  0
)
def tick(world: M.World) -> M.World: H.tick_world(Lab.tick(world))
def flash(world: M.World, value: U32) -> M.World:
  match world:
    case M.World{a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, _}: M.World{
      a,
      b,
      c,
      d,
      e,
      f,
      g,
      h,
      i,
      j,
      k,
      l,
      m,
      n,
      o,
      p,
      q,
      r,
      value
    }
def room(world: M.World, phase: U32) -> List<&2, F.Rect>: R.processing_building(world, phase, 0, [])
def ledger(world: M.World) -> List<&2, F.Rect>: R.output_hud(world, [])
def cue() -> List<&2, F.Rect>: R.cue_draw(M.Cue{11, 3n, 1n, 200, 200, 60}, 0, [])
def cue_text() -> List<&2, F.Rect>: F.text("FINDING U3", 212, 172, 1, 65483, [])
def groups(world: M.World) -> List<&2, Rules.Group>: Rule.groups(M.rules(world))
def fragments(
  +group: Rules.Group,
  world: M.World
) -> List<&2, F.Rect>: R.fragment_bodies(Rule.fragments(group), group, world, [])
def text(
  value: String,
  x: U32,
  y: U32,
  color: U32
) -> List<&2, F.Rect>: F.text(value, x, y, 1, color, [])

def flashed(world: M.World) -> M.World: flash(world, 30)
def quiet(world: M.World) -> M.World: flash(world, 0)
def packet_count(
  group: Rules.Group,
  world: M.World
) -> U32: R.packet_count(Rule.owner(group), world)
def packet_scene(
  +group: Rules.Group,
  +world: M.World
) -> List<&2, F.Rect>: R.group_bodies(
  group,
  Rule.find_actor(Rule.owner(group), M.actors(world)),
  world,
  []
)
def finish_start() -> M.World: Lab.schedule_finish(start(), 10060n)

def actors(world: M.World) -> List<&2, V.Actor>: M.actors(world)
def scene(world: M.World) -> List<&2, F.Rect>: R.scene(~R.base_scene, world)

def health(world: M.World, value: U32) -> M.World:
  match world:
    case M.World{a, b, c, d, e, f, _, h, i, j, k, l, m, n, o, p, q, r, s}: M.World{
      a,
      b,
      c,
      d,
      e,
      f,
      value,
      h,
      i,
      j,
      k,
      l,
      m,
      n,
      o,
      p,
      q,
      r,
      s
    }

# Explicit historical body input exercises the actual Render entrypoint.
def earlier_refusal() -> List<&2, F.Rect>:
  R.history_actor(
    V.Actor{V.WorkIdentity{1n, 1n, 1n, 3n}, 1n, 0, 200, 200, 1, 1, [], 30, [], 0n, 5, True{}},
    start(),
    []
  )
