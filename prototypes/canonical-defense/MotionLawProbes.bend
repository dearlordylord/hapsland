# Executable candidate-law probes and counterexamples, not universal proofs.
import Base
import ./DefenseMap.bend as Map
import ./DefenseMotion.bend as Motion
import ./DefenseMotionTypes.bend as V

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def actor() -> V.Actor:
  V.Actor{V.WorkIdentity{1n,1n,1n,1n},1n,0,0,0,0,0,[],0,[],0n,0,False{}}
def main() -> IO(Unit):
  do IO<Unit>:
    require(U32.is_eq(Map.travel_coordinate(4294967294,4294967295,4),4294967295),"upper U32 boundary does not wrap")
    require(U32.is_eq(Map.travel_coordinate(1,0,4),0),"lower U32 boundary does not wrap")
    require(U32.is_eq(Map.travel_coordinate(10,11,4),11),"short final segment does not overshoot")
    require(U32.is_eq(Map.travel_coordinate(10,2,4),6),"reverse-coordinate road travels toward target")
    require(Map.same(Motion.travel(Map.Point{0,0},Map.Point{8,8}),Map.Point{4,0}),"actual movement follows one axis")
    require(Map.same(Motion.point(Motion.move_when(False{},actor())),Map.Point{0,0}),"blocked movement is stationary")
    require(U32.is_eq(Map.travel_coordinate(10,2,4),6),"counterexample: screen X is not globally nondecreasing")
    require(Map.same(Motion.point(Motion.move_to(actor(),V.Waypoint{0,0,1,100n},[])),Map.Point{0,0}) && U32.is_eq(Motion.visible_phase(Motion.move_to(actor(),V.Waypoint{0,0,1,100n},[])),1),"counterexample: a discrete step may change phase at zero displacement")
