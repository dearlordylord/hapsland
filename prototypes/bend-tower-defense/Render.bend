# Pure native 512-square quadtree renderer; no foreign code or shader escape.
import Base
import ./Model.bend as M
import ./Font.bend as F
import ./Game.bend as G

def overlap(r: F.Rect, +x: U32, +y: U32, +size: U32) -> Bool:
  match r:
    case F.Box{+rx, +ry, w, h, _}:
      (rx < x + size : U32) && (ry < y + size : U32) && (rx + w > x : U32) && (ry + h > y : U32)

def keep(on: Bool, r: F.Rect, tail: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case True{}:
      Con{r, tail}
    case False{}:
      tail

def filter(rs: List<&2, F.Rect>, +x: U32, +y: U32, +size: U32) -> List<&2, F.Rect>:
  match rs:
    case Nil{}:
      Nil{}
    case Con{+r, tail}:
      keep(overlap(r, x, y, size), r, filter(tail, x, y, size))

def covers(r: F.Rect, +x: U32, +y: U32, +size: U32) -> Bool:
  match r:
    case F.Box{+rx, +ry, w, h, _}:
      (rx <= x : U32) && (ry <= y : U32) && (rx + w >= x + size : U32) && (ry + h >= y + size : U32)

def full(rs: List<&2, F.Rect>, x: U32, y: U32, size: U32) -> Bool:
  match rs:
    case Nil{}:
      False{}
    case Con{r, _}:
      covers(r, x, y, size)

def paint(k: Nat, +x: U32, +y: U32, +size: U32, rs: List<&2, F.Rect>, solid: Bool) -> Image:
  match k rs solid:
    case _ Nil{} _:
      Pix{1058076}
    case 0n Con{F.Box{_, _, _, _, color}, _} _:
      Pix{color}
    case 1n+q Con{F.Box{_, _, _, _, color}, _} True{}:
      Pix{color}
    case 1n++q Con{r, tail} False{}:
      +half = (size / 2 : U32)
      +all = {Con{r, tail} : List<&2, F.Rect>}
      +ra = filter(all, x, y, half)
      +rb = filter(all, (x + half : U32), y, half)
      +rc = filter(all, x, (y + half : U32), half)
      +rd = filter(all, (x + half : U32), (y + half : U32), half)
      a b c d = paint(q, x, y, half, ra, full(ra, x, y, half)) paint(q, (x + half : U32), y, half, rb, full(rb, (x + half : U32), y, half)) paint(q, x, (y + half : U32), half, rc, full(rc, x, (y + half : U32), half)) paint(q, (x + half : U32), (y + half : U32), half, rd, full(rd, (x + half : U32), (y + half : U32), half))
      Qua{a, b, c, d}

def kind_color(kind: U32) -> U32:
  match kind:
    case 0:
      4842955
    case 1:
      7449343
    case _:
      16755794

def enemy_color(kind: U32) -> U32:
  match kind:
    case 0:
      15891328
    case 1:
      16769434
    case _:
      12165365

def enemy_sprite(position: U32 & U32, +hp: U32, +maxHp: U32, slow: U32, kind: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  (+x, +y) = position
  color = M.choose_word(9756671, enemy_color(kind), (slow > 0 : U32))
  background = F.put(M.sub(x, 8), M.sub(y, 8), 16, 16, 1518380, rest)
  body = F.put(M.sub(x, 6), M.sub(y, 6), 12, 12, color, background)
  bar = F.put(M.sub(x, 8), M.sub(y, 13), 16, 3, 3746610, body)
  F.put(M.sub(x, 8), M.sub(y, 13), (16 * hp / U32.max(1, maxHp) : U32), 3, 9170322, bar)

def enemies(es: List<&2, M.Enemy>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match es:
    case Nil{}:
      rest
    case Con{M.Creep{_, progress, hp, maxHp, _, slow, kind}, tail}:
      enemy_sprite(M.path(progress), hp, maxHp, slow, kind, enemies(tail, rest))

def flash(on: Bool, +x: U32, +y: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}:
      rest
    case True{}:
      F.put(M.sub(x, 8), M.sub(y, 1), 17, 3, color, F.put(M.sub(x, 1), M.sub(y, 8), 3, 17, color, rest))

def beam(fuel: Nat, +x: U32, +y: U32, +tx: U32, +ty: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match fuel:
    case 0n:
      rest
    case 1n++n:
      +i = U32.from_nat(n)
      px = ((x * (16 - i) + tx * i) / 16 : U32)
      py = ((y * (16 - i) + ty * i) / 16 : U32)
      F.put(px, py, 3, 3, color, beam(n, x, y, tx, ty, color, rest))

def shot_line(on: Bool, x: U32, y: U32, tx: U32, ty: U32, color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match on:
    case False{}:
      rest
    case True{}:
      beam(16n, x, y, tx, ty, color, rest)

def towers(ts: List<&2, M.Tower>, +index: U32, +selected: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match ts:
    case Nil{}:
      rest
    case Con{M.Turret{+x, +y, kind, level, _, +shot, +ax, +ay}, tail}:
      +color = kind_color(kind)
      border = M.choose_word(16773548, 2901312, U32.is_eq(index, selected))
      base = F.put(M.sub(x, 13), M.sub(y, 13), 26, 26, border, towers(tail, (index + 1 : U32), selected, rest))
      body = F.put(M.sub(x, 10), M.sub(y, 10), 20, 20, color, base)
      center = F.put(M.sub(x, 4), M.sub(y, 4), 8, 8, 1585209, body)
      labeled = F.text(U32.show(level), M.sub(x, 2), M.sub(y, 2), 1, 16777215, center)
      shot_line((shot > 0 : U32), x, y, ax, ay, color,
        flash((shot > 0 : U32), ax, ay, color, flash((shot > 0 : U32), x, y, 16777215, labeled)))

def road_coords(a: U32 & U32, b: U32 & U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  (+x1, +y1) = a
  (+x2, +y2) = b
  F.put(M.sub(U32.min(x1, x2), 14), M.sub(U32.min(y1, y2), 14), (M.absdiff(x1, x2) + 28 : U32), (M.absdiff(y1, y2) + 28 : U32), 11901545, rest)

def road_segment(a: U32, b: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  road_coords(M.path(a), M.path(b), rest)

def border(+x: U32, +y: U32, +color: U32, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  F.put(M.sub(x, 12), M.sub(y, 12), 25, 2, color, F.put(M.sub(x, 12), (y + 11 : U32), 25, 2, color, F.put(M.sub(x, 12), M.sub(y, 12), 2, 25, color, F.put((x + 11 : U32), M.sub(y, 12), 2, 25, color, rest))))

def board() -> List<&2, F.Rect>:
  ground = F.put(24, 104, 464, 368, 1914923, Nil{})
  F.text("IN", 34, 112, 2, 13039846, F.text("GATE", 442, 452, 2, 13039846, road_segment(0, 368, road_segment(368, 528, road_segment(528, 816, road_segment(816, 944, road_segment(944, 1312, ground)))))))

def panel(title: String, subtitle: String, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  box = F.put(56, 200, 400, 92, 925221, rest)
  F.text(title, 80, 219, 3, 16115383, F.text(subtitle, 80, 255, 2, 13031636, box))

def overlay(phase: U32, paused: Bool, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  match phase paused:
    case _ True{}:
      panel("PAUSED", "SPACE TO RESUME", rest)
    case 2 False{}:
      panel("VICTORY", "SIX WAVES HELD - R RESET", rest)
    case 3 False{}:
      panel("GATE LOST", "R TO TRY AGAIN", rest)
    case _ False{}:
      rest

def phase_text(phase: U32) -> String:
  match phase:
    case 0:
      "BUILD - N SEND WAVE"
    case 1:
      "WAVE IN PROGRESS"
    case 2:
      "VICTORY"
    case _:
      "DEFEAT"

def kind_name(kind: U32) -> String:
  match kind:
    case 0: "GUN"
    case 1: "FROST"
    case _: "SPLASH"

def upgrade_label(price: U32) -> String:
  match price:
    case 0: "SELECT TOWER / MAX LEVEL"
    case p: String.append("U UPGRADE COST ", U32.show(p))

def preview(+x: U32, +y: U32, gold: U32, choice: U32, phase: U32, +ts: List<&2, M.Tower>, rest: List<&2, F.Rect>) -> List<&2, F.Rect>:
  +sx = ((x / 32) * 32 + 16 : U32)
  +sy = ((y / 32) * 32 + 16 : U32)
  valid = G.placement_valid(ts, sx, sy) && (gold >= G.cost(choice) : U32) && (phase < 2 : U32)
  color = M.choose_word(7528354, 15758447, valid)
  border(sx, sy, color, rest)

def scene(s: M.State) -> List<&2, F.Rect>:
  match s:
    case M.World{_, +wave, +phase, lives, +gold, _, remaining, _, paused, +choice, +selected, mx, my, +ts, es}:
      world = preview(mx, my, gold, choice, phase, ts, enemies(es, towers(ts, 1, selected, board())))
      hud = F.put(0, 0, 512, 96, 925221, F.put(0, 476, 512, 36, 925221, world))
      labels = F.text("BEND / GATEKEEPERS", 20, 13, 3, 16050112, hud)
      values = F.text(String.append("LIVES ", U32.show(lives)), 20, 41, 2, 15641256, F.text(String.append("GOLD ", U32.show(gold)), 172, 41, 2, 16768133, F.text(String.append("WAVE ", String.append(U32.show(wave), "/6")), 324, 41, 2, 12900846, labels)))
      status = F.text(phase_text(phase), 20, 69, 2, 11913663, F.text(String.append("LEFT ", U32.show(remaining)), 340, 69, 2, 11913663, values))
      choices = F.text("1 GUN 30  2 FROST 40  3 SPLASH 55", 20, 482, 2, kind_color(choice), F.text("CLICK BUILD/SELECT  U UP  SPACE PAUSE  R RESET  ESC QUIT", 20, 498, 1, 12439239, status))
      details = F.text(upgrade_label(G.upgrade_price(ts, selected)), 28, 166, 1, 14345930, F.text(String.append("BUILD ", kind_name(choice)), 28, 181, 1, kind_color(choice), choices))
      overlay(phase, paused, details)

def view(+s: M.State) -> M.State & Image:
  (s, paint(9n, 0, 0, 512, scene(s), False{}))
