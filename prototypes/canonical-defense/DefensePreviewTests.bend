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
  +hover = hovered(world,424,392,0)
  +preview = Preview.calculate(hover)
  do IO<Unit>:
    Check.require(Check.same_observation(Run.observe(M.engine(hover)),Run.observe(M.engine(world))),"hover preserves engine time, transitions and queue")
    Check.require(U32.is_eq(Preview.cost(preview),60) && U32.is_eq(Preview.kind(preview),0),"service preview displays the actual60 gold price")
    Check.require(U32.is_eq(Preview.before(preview),3200) && U32.is_eq(Preview.delta(preview),1600) && U32.is_eq(Preview.after(preview),1600),"connected service preview displays3200 to1600ms for future operations")
    Check.require(U32.is_eq(M.gold(H.click(hover,424,392)),100),"legal preview construction charges the displayed60 gold")
    Check.require(U32.is_eq(Preview.status(Preview.calculate(hovered(world,424,232,0))),4),"out-of-range hover explicitly displays no suitable service in range")
