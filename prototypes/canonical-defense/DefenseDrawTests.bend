# Independent original-cell oracle for merged glyph/sprite raster rectangles.
import Base
import ./Font.bend as F
import ./DefenseRender.bend as R
import ./DefenseMap.bend as Map
import ./DefenseRasterTests.bend as Pixel

def sprite_cell(on: Bool,+x: U32,+y: U32,+size: U32,color: U32,+outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match on:
    case False{}: rest
    case True{}: F.put(Bool.pick(U32,outline,U32.sub(x,1),x),Bool.pick(U32,outline,U32.sub(y,1),y),
      Bool.pick(U32,outline,(size + 2 : U32),size),Bool.pick(U32,outline,(size + 2 : U32),size),color,rest)

def original_cells(fuel: Nat,+mask: U32,+column: U32,+scale: U32,+outline: Bool,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n:
      sprite_cell(Bool.not(U32.is_eq(((mask >> U32.to_nat(column)) .&. 1 : U32),0)),(5 + column * scale : U32),5,scale,7,outline,original_cells(n,mask,(column + 1 : U32),scale,outline,rest))
def same_pixels(fuel: Nat,+index: U32,+a: List<&2,F.Rect>,+b: List<&2,F.Rect>) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n: U32.is_eq(Pixel.oracle(a,(index % 28 : U32),(index / 28 : U32)),Pixel.oracle(b,(index % 28 : U32),(index / 28 : U32))) && same_pixels(n,(index + 1 : U32),a,b)
def mask_check(+mask: U32) -> Bool:
  same_pixels(252n,0,original_cells(9n,mask,0,1,False{},[]),R.sprite_row(9n,mask,0,5,5,1,7,False{},[])) &&
  same_pixels(252n,0,original_cells(9n,mask,0,2,True{},[]),R.sprite_row(9n,mask,0,5,5,2,7,True{},[]))
def masks(fuel: Nat,+mask: U32) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n: mask_check(mask) && masks(n,(mask + 1 : U32))
def glyphs(fuel: Nat,+mask: U32) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      same_pixels(252n,0,original_cells(3n,mask,0,2,False{},[]),F.glyph_row(mask,5,5,2,7,[])) && glyphs(n,(mask + 1 : U32))
def original_row_at(fuel: Nat,+mask: U32,+column: U32,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match fuel:
    case 0n: rest
    case 1n+n: sprite_cell(Bool.not(U32.is_eq(((mask >> U32.to_nat(column)) .&. 1 : U32),0)),(5 + column * 2 : U32),y,2,7,True{},original_row_at(n,mask,(column + 1 : U32),y,rest))
def original_rows(rows: List<&2,U32>,+y: U32,rest: List<&2,F.Rect>) -> List<&2,F.Rect>:
  match rows:
    case Nil{}: rest
    case +mask <> tail: original_row_at(9n,mask,0,y,original_rows(tail,(y + 2 : U32),rest))
def road_pixels(fuel: Nat,+index: U32,+a: List<&2,F.Rect>,+b: List<&2,F.Rect>) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n: U32.is_eq(Pixel.oracle(a,(index % 128 : U32),(index / 128 : U32)),Pixel.oracle(b,(index % 128 : U32),(index / 128 : U32))) && road_pixels(n,(index + 1 : U32),a,b)
def road_check(+a: Map.Point,+b: Map.Point,+width: U32) -> Bool:
  road_pixels(16384n,0,R.road_dots(51n,a,b,0,width,7,[]),R.road([a,b],width,7,[]))
def main() -> IO(Unit):
  do IO<Unit>:
    Pixel.check(road_check(Map.Point{20,20},Map.Point{100,20},14) && road_check(Map.Point{20,100},Map.Point{20,20},22) && road_check(Map.Point{20,20},Map.Point{68,20},3) && road_check(Map.Point{100,20},Map.Point{20,20},8),"65536 road pixels match old sampling across horizontal vertical reverse and room segments")
    Pixel.check(same_pixels(896n,0,original_rows([68,198,124,254,254,254,254,511,254,124,108,238],5,[]),R.sprite_rows([68,198,124,254,254,254,254,511,254,124,108,238],9n,5,5,2,7,True{},[])),"merged vertical sprite blocks match original road silhouette pixels")
    Pixel.check(masks(512n,0),"all512 sprite row masks match original cells at scale1 and expanded scale2 outline")
    Pixel.check(glyphs(8n,0),"all8 glyph row masks match original cells")
    Pixel.check(Nat.is_eq(List.length(&2,F.Rect,F.glyph_row(7,5,5,2,7,[])),1n),"solid glyph row uses one rectangle instead of three")
