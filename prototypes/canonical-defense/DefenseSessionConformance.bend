import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseSession.bend as S
import ./DefenseRender.bend as R
import ./DefenseRecording.bend as Recording
import ./DefenseProjection.bend as P
import ./DefensePreview.bend as Preview
import ./DefenseLab.bend as Lab
import ./Font.bend as F

def initial() -> M.World: H.initial()
def ticks(fuel: Nat, world: M.World) -> M.World: Recording.ticks(fuel, world)
def key(world: M.World, code: U32) -> M.World: H.key(world, code)
def click(world: M.World, x: U32, y: U32) -> M.World: H.click(world, x, y)
def apply(world: M.World, kind: U32, a: U32, b: U32) -> M.World:
  Recording.apply(world, Recording.Entry{kind, a, b})
def health(world: M.World) -> U32: M.hp(world)
def time(world: M.World) -> U32: M.time(world)
def sandbox(world: M.World) -> Bool: M.sandbox(world)
def defeated(world: M.World) -> Bool: M.defeated(world)
def scene(world: M.World) -> List<&2, F.Rect>: R.scene(~R.base_scene, world)
def diagnostics(world: M.World) -> String: R.diagnostics(world)
def damage(world: M.World) -> M.World: H.damage(world)
def placement(world: M.World) -> U32: Preview.status(Preview.calculate(world))
def lab_upgrade(world: M.World) -> Lab.Receipt: Lab.apply(world, Lab.Upgrade{1})
def set_health(world: M.World, health: U32) -> M.World:
  match world:
    case M.World{core, t, p, l, c, g, _, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}:
      M.World{core, t, p, l, c, g, health, ts, a, o, r, cl, d, auto, x, y, selected, work, flash}
def started() -> M.World: H.key(H.initial(), 110)
def built() -> M.World: H.click(H.key(H.initial(), 49), 648, 451)
def dead() -> M.World: set_health(ticks(30n, H.key(built(), 110)), 0)
