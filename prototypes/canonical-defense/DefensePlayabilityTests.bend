import ./DefenseLab.bend as Lab
import ../../packages/agent-flow-bend/Canonical.bend as C
import ./DefenseLiveMotionTypes.bend as LiveTypes
# Actual Host, actual scene and independent observable game facts.
import Base
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotionTypes.bend as V
import ./DefenseLiveMotion.bend as Live
import ./DefenseTowerFire.bend as Fire
import ./DefenseTowerPreview.bend as P
import ./DefenseRender.bend as R
import ./DefenseMap.bend as Map
import ./DefensePreview.bend as Preview
import ./Font.bend as F
import ../../packages/monkey-business-bend/Callbacks.bend as CB

def start(layout: U32) -> M.World: H.start(H.reset_layout(layout))
def tick(world: M.World) -> M.World: H.tick(world)
def pause(world: M.World) -> M.World: H.key(world, 112)
def visible_mobs(items: List<&2, LiveTypes.Mob>, +now: Nat) -> List<&2, LiveTypes.Mob>:
  match items:
    case Nil{}: []
    case +head <> +tail: Bool.pick(
      List<&2, LiveTypes.Mob>,
      Live.visible(head, now),
      head <> visible_mobs(tail, now),
      visible_mobs(tail, now)
    )
def mobs(
  +world: M.World
) -> List<&2, LiveTypes.Mob>: visible_mobs(M.mobs(world), (U32.to_nat(M.time(world))*20n : Nat))
def time(world: M.World) -> U32: M.time(world)
def body_point(target: CB.Target, world: M.World) -> Map.Point: Fire.target_point(target, world)
def scene(world: M.World) -> List<&2, F.Rect>: R.scene(~R.base_scene, world)
def targets(world: M.World, tower: M.Tower) -> List<&2, CB.Target>: P.available(world, tower)
def tower(x: U32, y: U32, kind: U32) -> M.Tower: H.preview_tower(x, y, kind)
def build(world: M.World, x: U32, y: U32, kind: U32) -> M.World: H.build(world, x, y, kind)
def legal(world: M.World, x: U32, y: U32) -> Bool: H.placement_valid(world, x, y)
def aim(
  world: M.World,
  x: U32,
  y: U32,
  kind: U32
) -> M.World: H.move(H.key(world, (46 + kind : U32)), x, y)
def preview(world: M.World) -> Preview.Preview: Preview.calculate(world)
def selected(world: M.World) -> M.World: H.select(world, 1)
def select_target(
  world: M.World,
  tower: M.Tower
) -> Maybe<&2, CB.Target>: Fire.target(world, tower, 0n)
def shot(
  world: M.World,
  tower: M.Tower,
  wanted: Nat
) -> M.World: H.fired_world(Fire.fire(world, 1, tower, wanted))
def due(world: M.World, target: CB.Target) -> Nat: Live.due(world, target)
def remaining(world: M.World, tower: M.Tower) -> U32: Fire.remaining(world, tower)
def shortened(value: Nat) -> Nat: Fire.shortened(value)
def upgrade(world: M.World) -> M.World: H.upgrade(world)
def main() -> U32: 0

def cues(world: M.World) -> List<&2, M.Cue>: M.cues(world)

def uncertain_marker() -> U32: Live.certain_outcome(C.SubmissionTerminal{1n, 1n, False{}}, 12)
def certain_marker() -> U32: Live.certain_outcome(C.SubmissionTerminal{1n, 1n, True{}}, 12)

def short_world(delay: Nat) -> M.World:
  Lab.create_scenario(Lab.Scenario{delay, 0n, 0n, True{}, True{}, 1, 1, 60000}, 152n, 160, 0)
def tick_result(value: H.TickObserved) -> M.World:
  match value:
    case H.TickObserved{world, _, _, _}: world
def bounded(world: M.World) -> M.World: tick_result(Lab.tick_bounded(world, 1n))
def outcome_pixels(+world: M.World) -> List<&2, F.Rect>: R.cue_trails(M.cues(world), world, 0, [])

def outcome_hud(world: M.World) -> List<&2, F.Rect>: R.published_hud(world, [])
