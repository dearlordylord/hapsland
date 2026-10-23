import Base
import ./RouteQueueLAWS.bend as Laws
import ./DefenseRouteQueue.bend as Q

def Laws.ended_body_not_obstacle(key, phase, end, remaining, other):
  match other:
    case Q.Track{_, _, _, _, True{}}: {==}
    case Q.Track{_, _, _, _, False{}}: {==}
def Laws.separated_route_progress_does_not_block(a, b): {==}
def Laws.close_follower_waits(a, b): {==}
def Laws.body_behind_does_not_block(a, b): {==}
def Laws.separate_exits_do_not_block(a, b): {==}
