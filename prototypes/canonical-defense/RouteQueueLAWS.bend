# Route occupancy decisions accepted in the tower development conversation.
import Base
import ./DefenseRouteQueue.bend as Q
import ./DefenseMotionTypes.bend as V
import ./DefenseMap.bend as Map

law ended_body_not_obstacle:
  for key: V.WorkIdentity
  for phase: U32
  for end: Map.Point
  for remaining: Nat
  for other: Q.Track
  {Q.blocks(other, Q.Track{key, phase, end, remaining, False{}}) == False{} : Bool}
law separated_route_progress_does_not_block:
  for a: V.WorkIdentity
  for b: V.WorkIdentity
  {
    Q.blocks(
      Q.Track{a, 1, Map.Point{100, 100}, 100n, True{}},
      Q.Track{b, 1, Map.Point{100, 100}, 40n, True{}}
    )
    == False{}
    : Bool
  }
law close_follower_waits:
  for a: V.WorkIdentity
  for b: V.WorkIdentity
  {
    Q.blocks(
      Q.Track{a, 1, Map.Point{100, 100}, 100n, True{}},
      Q.Track{b, 1, Map.Point{100, 100}, 80n, True{}}
    )
    == True{}
    : Bool
  }
law body_behind_does_not_block:
  for a: V.WorkIdentity
  for b: V.WorkIdentity
  {
    Q.blocks(
      Q.Track{a, 1, Map.Point{100, 100}, 40n, True{}},
      Q.Track{b, 1, Map.Point{100, 100}, 100n, True{}}
    )
    == False{}
    : Bool
  }
law separate_exits_do_not_block:
  for a: V.WorkIdentity
  for b: V.WorkIdentity
  {
    Q.blocks(
      Q.Track{a, 1, Map.Point{100, 100}, 100n, True{}},
      Q.Track{b, 1, Map.Point{200, 100}, 80n, True{}}
    )
    == False{}
    : Bool
  }
