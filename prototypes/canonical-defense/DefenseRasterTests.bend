# Independent pixel oracle: first covering rectangle wins, background otherwise.
import Base
import ./DefenseRender.bend as R
import ./Font.bend as F

def oracle(rects: List<&2,F.Rect>,+x: U32,+y: U32) -> U32:
  match rects:
    case Nil{}: 1058076
    case F.Box{+rx,+ry,w,h,color} <> tail:
      Bool.pick(U32,(rx <= x : U32) && (ry <= y : U32) && (x < rx + w : U32) && (y < ry + h : U32),color,oracle(tail,x,y))
def quadrant(+x: U32,+y: U32,+size: U32) -> U32:
  (Bool.to_u32((x >= size / 2 : U32)) + 2 * Bool.to_u32((y >= size / 2 : U32)) : U32)
def at(image: Image,+x: U32,+y: U32,+size: U32,q: U32) -> U32:
  match image q:
    case Pix{color} _: color
    case Qua{a,_,_,_} 0: at(a,(x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32),quadrant((x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32)))
    case Qua{_,a,_,_} 1: at(a,(x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32),quadrant((x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32)))
    case Qua{_,_,a,_} 2: at(a,(x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32),quadrant((x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32)))
    case Qua{_,_,_,a} _: at(a,(x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32),quadrant((x % (size / 2) : U32),(y % (size / 2) : U32),(size / 2 : U32)))
def pixels(fuel: Nat,+index: U32,+rects: List<&2,F.Rect>,+image: Image) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      U32.is_eq(oracle(rects,(index % 32 : U32),(index / 32 : U32)),at(image,(index % 32 : U32),(index / 32 : U32),32,quadrant((index % 32 : U32),(index / 32 : U32),32))) && pixels(n,(index + 1 : U32),rects,image)
def check(ok: Bool,message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit,1,"FAIL " ++ message)
def sample(+rects: List<&2,F.Rect>,message: String) -> IO(Unit):
  check(pixels(1024n,0,rects,R.paint(5n,0,0,32,rects,False{})),message)
def main() -> IO(Unit):
  do IO<Unit>:
    sample([],"empty scene background")
    sample([F.Box{0,0,32,32,1},F.Box{0,0,32,32,2}],"opaque front tile hides all later layers")
    sample([F.Box{5,7,9,13,1},F.Box{8,4,15,17,2},F.Box{0,0,32,32,3}],"overlap priority and quadrant boundaries")
    sample([F.Box{16,16,16,16,1},F.Box{0,0,32,32,2}],"half-open rectangle edges")
    sample([F.Box{30,30,8,8,1},F.Box{40,0,3,3,2}],"clipping outside canvas")
    sample([F.Box{4,4,0,9,1},F.Box{0,0,32,32,2}],"zero-width foreground has no pixels")
    IO.print("RASTER: 6144 pixels match independent oracle")
