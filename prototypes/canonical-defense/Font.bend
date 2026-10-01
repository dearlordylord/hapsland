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
    case '+':
      9682
    case '%':
      22669
    case '=':
      3640
    case ':':
      1040
    case _:
      0

# Merge adjacent lit glyph cells; exact pixels, fewer raster rectangles.
def glyph_row(mask: U32,+x: U32,+y: U32,+scale: U32,+color: U32,rest: List<&2,Rect>) -> List<&2,Rect>:
  match mask:
    case 0: rest
    case 1: put(x,y,scale,scale,color,rest)
    case 2: put((x + scale : U32),y,scale,scale,color,rest)
    case 3: put(x,y,(2 * scale : U32),scale,color,rest)
    case 4: put((x + 2 * scale : U32),y,scale,scale,color,rest)
    case 5: put(x,y,scale,scale,color,put((x + 2 * scale : U32),y,scale,scale,color,rest))
    case 6: put((x + scale : U32),y,(2 * scale : U32),scale,color,rest)
    case _: put(x,y,(3 * scale : U32),scale,color,rest)
def glyph_rows(fuel: Nat,+bits: U32,+x: U32,+y: U32,+scale: U32,+color: U32,rest: List<&2,Rect>) -> List<&2,Rect>:
  match fuel:
    case 0n: rest
    case 1n++n:
      +row = U32.from_nat(n)
      glyph_row(((bits >> Nat.mul(n,3n)) .&. 7 : U32),x,(y + row * scale : U32),scale,color,glyph_rows(n,bits,x,y,scale,color,rest))

def text(s: String, +x: U32, +y: U32, +scale: U32, +color: U32, rest: List<&2, Rect>) -> List<&2, Rect>:
  match s:
    case SNil{}:
      rest
    case SCon{c, tail}:
      glyph_rows(5n, glyph(c), x, y, scale, color, text(tail, (x + 4 * scale : U32), y, scale, color, rest))
