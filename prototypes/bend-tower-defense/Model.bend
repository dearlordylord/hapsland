# Throwaway standalone tower-defense model. All authored gameplay is Bend.
import Base

type Enemy is Data:
  Creep{id: U32, progress: U32, hp: U32, maxHp: U32, speed: U32, slow: U32, kind: U32}

type Tower is Data:
  Turret{x: U32, y: U32, kind: U32, level: U32, cooldown: U32, flash: U32, aimX: U32, aimY: U32}

# phase: 0 preparation/intermission, 1 wave, 2 won, 3 lost.
# selected: one-based tower index; zero means no selected tower.
type State is Data:
  World{clock: U32, wave: U32, phase: U32, lives: U32, gold: U32, kills: U32,
    remaining: U32, spawnIn: U32, paused: Bool, choice: U32, selected: U32,
    mouseX: U32, mouseY: U32, towers: List<&2, Tower>, enemies: List<&2, Enemy>}

def sub_if(a: U32, b: U32, less: Bool) -> U32:
  match less:
    case True{}:
      0
    case False{}:
      (a - b : U32)

def sub(+a: U32, +b: U32) -> U32:
  sub_if(a, b, (a < b : U32))

def absdiff(+a: U32, +b: U32) -> U32:
  (sub(a, b) + sub(b, a) : U32)

def square(+x: U32) -> U32:
  (x * x : U32)

def distance(+x: U32, +y: U32, tx: U32, ty: U32) -> U32:
  (square(absdiff(x, tx)) + square(absdiff(y, ty)) : U32)

def choose_word(a: U32, b: U32, takeA: Bool) -> U32:
  match takeA:
    case True{}:
      a
    case False{}:
      b

def path_5(+p: U32, first: Bool) -> U32 & U32:
  match first:
    case True{}:
      (112, (304 + sub(p, 816) : U32))
    case False{}:
      ((112 + sub(p, 944) : U32), 432)

def path_4(+p: U32, first: Bool) -> U32 & U32:
  match first:
    case True{}:
      (sub(400, sub(p, 528)), 304)
    case False{}:
      path_5(p, (p < 944 : U32))

def path_3(+p: U32, first: Bool) -> U32 & U32:
  match first:
    case True{}:
      (400, (144 + sub(p, 368) : U32))
    case False{}:
      path_4(p, (p < 816 : U32))

def path_2(+p: U32, first: Bool) -> U32 & U32:
  match first:
    case True{}:
      ((32 + p : U32), 144)
    case False{}:
      path_3(p, (p < 528 : U32))

def path(+p: U32) -> U32 & U32:
  path_2(U32.min(p, 1312), (p < 368 : U32))

def road(+x: U32, +y: U32) -> Bool:
  ((x >= 20 : U32) && (x <= 412 : U32) && (y >= 130 : U32) && (y <= 158 : U32)) ||
    ((x >= 386 : U32) && (x <= 414 : U32) && (y >= 130 : U32) && (y <= 318 : U32)) ||
    ((x >= 98 : U32) && (x <= 414 : U32) && (y >= 290 : U32) && (y <= 318 : U32)) ||
    ((x >= 98 : U32) && (x <= 126 : U32) && (y >= 290 : U32) && (y <= 446 : U32)) ||
    ((x >= 98 : U32) && (x <= 492 : U32) && (y >= 418 : U32) && (y <= 446 : U32))

def initial() -> State:
  World{0, 0, 0, 15, 120, 0, 0, 0, False{}, 0, 0, 256, 224, Nil{}, Nil{}}
