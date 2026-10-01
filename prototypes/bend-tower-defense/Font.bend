# Small authored bitmap font and screen rectangles, pure Bend.
import Base

type Rect is Data:
  Box{x: U32, y: U32, w: U32, h: U32, color: U32}

def put(x: U32, y: U32, w: U32, h: U32, color: U32, rest: List<&2, Rect>) -> List<&2, Rect>:
  Con{Box{x, y, w, h, color}, rest}

def glyph(c: Char) -> U32:
  match c:
    case 'A':
      23530
    case 'B':
      15083
    case 'C':
      29263
    case 'D':
      15211
    case 'E':
      29391
    case 'F':
      4815
    case 'G':
      31567
    case 'H':
      23533
    case 'I':
      29847
    case 'J':
      31524
    case 'K':
      23277
    case 'L':
      29257
    case 'M':
      23549
    case 'N':
      24573
    case 'O':
      31599
    case 'P':
      5103
    case 'Q':
      20335
    case 'R':
      23275
    case 'S':
      31183
    case 'T':
      9367
    case 'U':
      31597
    case 'V':
      11117
    case 'W':
      24557
    case 'X':
      23213
    case 'Y':
      9389
    case 'Z':
      29351
    case '0':
      31599
    case '1':
      29850
    case '2':
      29671
    case '3':
      31207
    case '4':
      18925
    case '5':
      31183
    case '6':
      31695
    case '7':
      9383
    case '8':
      31727
    case '9':
      31215
    case '/':
      4772
    case '-':
      448
    case _:
      0

def dot(on: Bool, x: U32, y: U32, +scale: U32, color: U32, rest: List<&2, Rect>) -> List<&2, Rect>:
  match on:
    case True{}:
      put(x, y, scale, scale, color, rest)
    case False{}:
      rest

def dots(n: Nat, +bits: U32, +x: U32, +y: U32, +scale: U32, +color: U32, rest: List<&2, Rect>) -> List<&2, Rect>:
  match n:
    case 0n:
      rest
    case 1n++k:
      +i = U32.from_nat(k)
      tail = dots(k, bits, x, y, scale, color, rest)
      dot(U32.is_ne(U32.and(U32.shrn(bits, k), 1), 0), (x + (i % 3 : U32) * scale : U32), (y + (i / 3 : U32) * scale : U32), scale, color, tail)

def text(s: String, +x: U32, +y: U32, +scale: U32, +color: U32, rest: List<&2, Rect>) -> List<&2, Rect>:
  match s:
    case SNil{}:
      rest
    case SCon{c, tail}:
      dots(15n, glyph(c), x, y, scale, color, text(tail, (x + 4 * scale : U32), y, scale, color, rest))
