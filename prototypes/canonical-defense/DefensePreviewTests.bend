# Read-only hover and game ownership checks using original generic controls.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefensePreview.bend as Preview
import ./DefenseConsumerTests.bend as Check
import ../../packages/monkey-business-bend/NativeRun.bend as Run

def hovered(world: M.World,x: U32,y: U32,kind: U32) -> M.World:
  match world:
    case M.World{core,t,p,l,_,g,h,ts,ms,a,o,r,cl,d,auto,_,_,_,damage,flash}:
      M.World{core,t,p,l,kind,g,h,ts,ms,a,o,r,cl,d,auto,x,y,0,damage,flash}
def main() -> IO(Unit):
  +world = H.initial()
  +hover = hovered(world,424,232,1)
  +preview = Preview.calculate(hover)
  do IO<Unit>:
    Check.require(Check.same_observation(Run.observe(M.engine(hover)),Run.observe(M.engine(world))),"hover preserves engine time, transitions and queue")
    Check.require(U32.is_eq(Preview.cost(preview),55) && U32.is_eq(Preview.kind(preview),1),"Refiner preview retains game cost and tower kind")
    Check.require(U32.is_eq(M.gold(H.click(hover,424,232)),105),"legal preview construction charges the displayed55 gold")
