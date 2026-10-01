# Geometry constraints execute over all authored maps and both review branches.
import Base
import ./DefenseMap.bend as D

def require(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)

def main() -> IO(Unit):
  do IO<Unit>:
    require(D.layout_valid(0),"District: every road enters/exits wall normally; finite simple room paths")
    require(D.layout_valid(1),"Campus: both review branches enter normally and merge into shared serpent")
    require(D.layout_valid(2),"Junction: corrected preparation and review entrances are perpendicular")
    require(Bool.not(D.normal_port(D.Point{100,100},0,D.Point{68,100},D.Point{68,130})),"tangent road along a wall is rejected")
    require(Bool.not(D.normal_port(D.Point{100,100},0,D.Point{68,76},D.Point{40,76})),"corner attachment is rejected")
    require(Bool.not(D.normal_port(D.Point{100,100},0,D.Point{68,100},D.Point{40,90})),"diagonal wall approach is rejected")
    require(Bool.not(D.orthogonal([D.Point{20,20},D.Point{30,30}])),"diagonal interior segment is rejected")
    require(Bool.not(D.no_crossings([D.Point{20,20},D.Point{60,20},D.Point{60,60},D.Point{40,60},D.Point{40,10}])),"crossing interior path is rejected")
    require(Bool.not(D.unique_points([D.Point{20,20},D.Point{60,20},D.Point{20,20}])),"returning to an earlier vertex is rejected")
    require(U32.is_eq(U32.from_nat(List.length(&2,D.Point,D.snake(D.Point{100,100}))),10),"five horizontal passes and four turns are authored")
    require(D.same(D.path_position([D.Point{20,20},D.Point{520,20}],1),D.Point{21,20}),"long horizontal road advances exactly one pixel without percentage rounding")
    require(D.same(D.path_position([D.Point{20,20},D.Point{40,20},D.Point{40,80}],21),D.Point{40,21}),"elbow continues exact distance without a teleport")
    IO.print("CANONICAL GEOMETRY:12 directed checks complete")
