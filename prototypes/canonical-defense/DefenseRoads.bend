# Presentation lane uses the same authoritative synthetic Host path assignment.
import Base
import ./DefenseModel.bend as M
import ./DefenseProjection.bend as P
import ./DefenseHost.bend as H

def branch(world: M.World,token: P.Token) -> U32:
  H.unit_lane(world,token)
