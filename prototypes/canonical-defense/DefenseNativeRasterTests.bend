import Base
import ./DefenseRaster.bend as Native
import ./DefenseRender.bend as R
import ./Font.bend as F

def oracle(items: List<&2, F.Rect>, +x: U32, +y: U32) -> U32:
  match items:
    case Nil{}: 1058076
    case F.Box{+rx, +ry, w, h, color} <> tail:
      Bool.pick(
        U32,
        (rx <= x : U32) && (ry <= y : U32) && (x < rx + w : U32) && (y < ry + h : U32),
        color,
        oracle(tail, x, y)
      )
def pixel(fuel: Nat, image: Image, +x: U32, +y: U32, +size: U32) -> U32:
  match fuel image:
    case _ Pix{color}: color
    case 0n _: 0
    case 1n+n Qua{a, b, c, d}:
      +half = (size / 2 : U32)
      child = Bool.pick(
        Image,
        (y < half : U32),
        Bool.pick(Image, (x < half : U32), a, b),
        Bool.pick(Image, (x < half : U32), c, d)
      )
      pixel(n, child, (x % half : U32), (y % half : U32), half)
def same(fuel: Nat, +index: U32, +items: List<&2, F.Rect>, +image: Image, +pure: Image) -> Bool:
  match fuel:
    case 0n: True{}
    case 1n+n:
      +x = (index % 64 : U32)
      +y = (index / 64 : U32)
      U32.is_eq(pixel(10n, image, x, y, 1024), oracle(items, x, y)) && U32.is_eq(
        pixel(10n, image, x, y, 1024),
        pixel(10n, pure, x, y, 1024)
      ) && same(n, (index + 1 : U32), items, image, pure)
def same_image(a: Image, b: Image) -> Bool:
  match a b:
    case Pix{x} Pix{y}: U32.is_eq(x, y)
    case Qua{a, b, c, d} Qua{w, x, y, z}: same_image(a, w) && same_image(b, x) && same_image(c, y) && same_image(
      d,
      z
    )
    case _ _: False{}
def check(on: Bool) -> IO(Unit):
  match on:
    case True{}: IO.print("PASS native raster pixels")
    case False{}: IO.die(Unit, 1, "FAIL native raster pixels")
def sample(+items: List<&2, F.Rect>) -> IO(Unit):
  do IO<Unit>:
    +image : Image <- Native.rasterize(items)
    check(
      same_image(
        image,
        R.paint(10n, 0, 0, 1024, items, False{})
      ) && same(
        256n,
        0,
        items,
        image,
        R.paint(10n, 0, 0, 1024, items, False{})
      ) && U32.is_eq(pixel(10n, image, 1023, 1023, 1024), oracle(items, 1023, 1023))
    )
    return Image.free(4n, image)
def main() -> IO(Unit):
  do IO<Unit>:
    sample([])
    sample([F.Box{0, 0, 1024, 1024, 1}, F.Box{0, 0, 1024, 1024, 2}])
    sample([F.Box{5, 7, 9, 13, 1}, F.Box{8, 4, 15, 17, 2}, F.Box{0, 0, 64, 64, 3}])
    sample([F.Box{32, 32, 32, 32, 7}, F.Box{1020, 1020, 8, 8, 9}])
    sample([F.Box{4, 4, 0, 9, 1}, F.Box{4, 4, 9, 0, 2}, F.Box{0, 0, 64, 64, 3}])
    sample([F.Box{4294967294, 0, 8, 8, 1}, F.Box{0, 4294967294, 8, 8, 2}, F.Box{2048, 0, 8, 8, 3}])

