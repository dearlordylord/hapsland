import Base

type Mode is Data:
  Normal{}
  Sandbox{}

def sandbox(mode: Mode) -> Bool:
  match mode:
    case Normal{}: False{}
    case Sandbox{}: True{}
def playable(mode: Mode, hp: U32) -> Bool:
  sandbox(mode) || (hp > 0 : U32)
def defeated(mode: Mode, hp: U32) -> Bool:
  Bool.not(playable(mode, hp))
def continue_mode(mode: Mode, hp: U32) -> Mode:
  match mode hp:
    case Normal{} 0: Sandbox{}
    case other _: other

def damage_total(mode: Mode, total: U32) -> U32:
  Bool.pick(U32, sandbox(mode), 0, total)

def button_top() -> U32: 410
def button_height() -> U32: 56
def restart_left() -> U32: 240
def restart_width() -> U32: 220
def continue_left() -> U32: 484
def continue_width() -> U32: 300
def inside(+x: U32, +y: U32, +left: U32, width: U32) -> Bool:
  (x >= left : U32) && (x < left + width : U32) &&
    (y >= button_top() : U32) && (y < button_top() + button_height() : U32)
def click_code(+x: U32, +y: U32) -> U32:
  Bool.pick(U32, inside(x, y, restart_left(), restart_width()), 114,
    Bool.pick(U32, inside(x, y, continue_left(), continue_width()), 99, 0))
