# Actual owner fields; the generated transport does not import legacy campaigns.
import Base
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

type Envelope is Data:
  Envelope{before: M.World,intervention: M.World,after: M.World,frames: List<&2,T.Frame>,physical: List<&2,T.PhysicalDelivery>}
