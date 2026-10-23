# Actual Host witnesses for physical result assembly and exact visible recipients.
import Base
import ../../packages/agent-flow-bend/Canonical.bend as C
import ./DefenseProjection.bend as P
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseRules.bend as Rules
import ./DefenseRuleTypes.bend as R
import ./DefenseMotionTypes.bend as V
import ./DefenseLiveMotionTypes.bend as LiveTypes
import ./DefenseTowerFire.bend as Fire
import ./DefenseRender.bend as Render
import ./Font.bend as F

def start(layout: U32) -> M.World:
  Rules.configured(
    Lab.create_scenario(
      Lab.Scenario{400n, 2400n, 0n, True{}, True{}, 2, 1, 60000},
      152n,
      160,
      layout
    ),
    R.Profile{4, 100}
  )
def tick(world: M.World) -> M.World: H.tick_world(Lab.tick(world))
def groups(world: M.World) -> List<&2, R.Group>: Rules.groups(M.rules(world))
def actors(world: M.World) -> List<&2, V.Actor>: M.actors(world)
def mobs(world: M.World) -> List<&2, LiveTypes.Mob>: M.mobs(world)
def build(
  world: M.World,
  x: U32,
  y: U32,
  kind: U32
) -> M.World: H.select(H.build(world, x, y, kind), 1)
def fire(world: M.World, operation: Nat) -> M.World: H.fire_world(world, 1, operation)
def tower(x: U32, y: U32, kind: U32) -> M.Tower: H.preview_tower(x, y, kind)
def available(world: M.World, tower: M.Tower) -> U32: Fire.remaining(world, tower)
def scene(world: M.World) -> List<&2, F.Rect>: Render.scene(~Render.base_scene, world)
def time(world: M.World) -> U32: M.time(world)
def stop(world: M.World) -> M.World: H.key(world, 115)
def schedule_finish(world: M.World, at: Nat) -> M.World: Lab.schedule_finish(world, at)
def individual(world: M.World) -> U32: M.submissions(world)
def delivered(world: M.World) -> U32: M.delivered(world)

# Repeated ordinary user releases, not the two-unit Lab workload.
def repeated_start(layout: U32) -> M.World: H.key(H.key(H.reset_layout(layout), 110), 97)
def release(world: M.World) -> M.World: H.key(world, 110)
def hp(world: M.World) -> U32: M.hp(world)
def ledger_bytes(world: M.World) -> U32: P.ledger_bytes(world)
def outstanding(world: M.World) -> Nat: List.length(&2, C.ReviewWorkRecord, M.work(M.core(world)))

def automatic(world: M.World) -> M.World: H.key(world, 97)
