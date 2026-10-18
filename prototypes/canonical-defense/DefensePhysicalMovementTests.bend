# Actual Lab workflow and actual rendered actors/checks; no replacement physics.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseMotionTypes.bend as V
import ./DefenseMotion.bend as Motion
import ./DefenseRuleTypes.bend as R
import ./DefenseRules.bend as Rules
import ./DefenseRender.bend as Render
import ./DefenseMap.bend as Map
import ./Font.bend as F

def start(layout: U32, +delay: Nat) -> M.World:
  Lab.create_scenario(
    Lab.Scenario{delay, delay, delay, True{}, True{}, 2, 1, 60000},
    152n,
    160,
    layout
  )
def tick(world: M.World) -> M.World:
  H.tick_world(Lab.tick(world))
def actors(world: M.World) -> List<&2, V.Actor>: M.actors(world)
def groups(world: M.World) -> List<&2, R.Group>: Rules.groups(M.rules(world))
def time(world: M.World) -> U32: M.time(world)
def visible(actor: V.Actor, world: M.World) -> Bool: Render.rule_parent_visible(actor, world)
def check_point(actor: V.Actor, group: R.Group, layout: U32, index: U32) -> Map.Point:
  Rules.check_point(actor, group, layout, index)
def scene(world: M.World) -> List<&2, F.Rect>: Render.scene(~Render.base_scene, world)
def main() -> U32: 0
