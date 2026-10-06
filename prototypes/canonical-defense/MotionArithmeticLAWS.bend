# Owner-approved game-motion laws (2026-10-05 conversation).
# These quantify over actual game functions, not a separate motion model.
# Discrete displacement is bounded; real-time interpolation is outside this scope.
import Base
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map
import ./DefensePresentation.bend as Display
import ../../packages/agent-flow-bend/Canonical.bend as C

# Each coordinate stays between the start and current target: no overshoot.
law coordinate_no_overshoot:
  for +start: U32
  for +target: U32
  for +pixels: U32
  {((U32.min(start,target) <= Map.travel_coordinate(start,target,pixels) : U32) &&
    (Map.travel_coordinate(start,target,pixels) <= U32.max(start,target) : U32)) == True{} : Bool}

# Remaining coordinate distance never increases for an unchanged target.
law coordinate_distance_nonincreasing:
  for +start: U32
  for +target: U32
  for pixels: U32
  {(Map.distance(Map.travel_coordinate(start,target,pixels),target) <= Map.distance(start,target) : U32) == True{} : Bool}

# A coordinate step cannot exceed the supplied pixel allowance.
law coordinate_step_bounded:
  for +start: U32
  for target: U32
  for +pixels: U32
  {(Map.distance(start,Map.travel_coordinate(start,target,pixels)) <= pixels : U32) == True{} : Bool}

# Zero allowance cannot produce movement.
law zero_allowance_stationary:
  for +start: U32
  for target: U32
  {Map.travel_coordinate(start,target,0) == start : U32}

# Arrival is stable for every allowance, including the maximum U32.
law arrived_coordinate_stationary:
  for +target: U32
  for pixels: U32
  {Map.travel_coordinate(target,target,pixels) == target : U32}

# Actual game movement follows one axis at a time, not a diagonal shortcut.
law travel_one_axis:
  for +start: Map.Point
  for +target: Map.Point
  {(U32.is_eq(Map.px(Motion.travel(start,target)),Map.px(start)) ||
    U32.is_eq(Map.py(Motion.travel(start,target)),Map.py(start))) == True{} : Bool}

# The actual actor step, not just its coordinate helper, is bounded on both axes.
law travel_step_bounded:
  for +start: Map.Point
  for +target: Map.Point
  {(Map.distance(Map.px(start),Map.px(Motion.travel(start,target))) <= 4 : U32) &&
    (Map.distance(Map.py(start),Map.py(Motion.travel(start,target))) <= 4 : U32) == True{} : Bool}

# Every actual step reduces or preserves each remaining target distance.
# This remains meaningful at U32 boundaries without overflowing a summed metric.
law travel_distance_nonincreasing:
  for +start: Map.Point
  for +target: Map.Point
  {((Map.distance(Map.px(Motion.travel(start,target)),Map.px(target)) <= Map.distance(Map.px(start),Map.px(target)) : U32) &&
    (Map.distance(Map.py(Motion.travel(start,target)),Map.py(target)) <= Map.distance(Map.py(start),Map.py(target)) : U32)) == True{} : Bool}

# A close target must actually be reached; stationary implementations are excluded.
law travel_reaches_close_horizontal_target:
  for +x: U32
  for +target: U32
  for +y: U32
  {(Map.distance(x,target) <= 4 : U32) == True{} : Bool} ->
  {Motion.travel(Map.Point{x,y},Map.Point{target,y}) == Map.Point{target,y} : Map.Point}
