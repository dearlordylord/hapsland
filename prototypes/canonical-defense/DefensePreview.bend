# Read-only current-state hover. Values come from the same Host effect helpers as actual towers.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H
import ./DefenseMechanics.bend as Mechanics

type Preview is Data:
  Preview{
    status: U32,
    kind: U32,
    x: U32,
    y: U32,
    target: Nat,
    site: U32,
    before: U32,
    delta: U32,
    range: U32,
    cost: U32
  }

def status(preview: Preview) -> U32:
  match preview:
    case Preview{v, _, _, _, _, _, _, _, _, _}: v

def kind(preview: Preview) -> U32:
  match preview:
    case Preview{_, v, _, _, _, _, _, _, _, _}: v

def x(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, v, _, _, _, _, _, _, _}: v

def y(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, v, _, _, _, _, _, _}: v

def target(preview: Preview) -> Nat:
  match preview:
    case Preview{_, _, _, _, v, _, _, _, _, _}: v

def site(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, v, _, _, _, _}: v

def before(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, v, _, _, _}: v

def delta(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, v, _, _}: v

def range(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, v, _}: v

def cost(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, _, v}: v

# Status 4 is structural absence; status 5 is an eligible site with no current marginal effect.
def effective(+preview: Preview) -> Bool:
  U32.is_eq(status(preview), 1)
def legal(+preview: Preview) -> Bool:
  U32.is_eq(status(preview), 1) || U32.is_eq(status(preview), 4) || U32.is_eq(status(preview), 5)
def reason(preview: Preview) -> String:
  match preview:
    case Preview{0, _, _, _, _, _, _, _, _, _}: "TOWER SELECTED / INSPECT OR UPGRADE"
    case Preview{1, 3, _, _, _, _, _, _, _, _}: "ONE CURRENT WORK / AUTO AFTER BUILD"
    case Preview{1, 4, _, _, _, _, _, _, _, _}: "ONE AUTHORIZED OUTPUT / AUTO"
    case Preview{1, 5, _, _, _, _, _, _, _, _}: "SHORTEST WORK / AUTO AFTER BUILD"
    case Preview{1, 6, _, _, _, _, _, _, _, _}: "UP TO THREE WORK / SLOW VOLLEY"
    case Preview{1, _, _, _, _, _, _, _, _, _}: "UNKNOWN TOWER"
    case Preview{2, _, _, _, _, _, _, _, _, _}: "CANNOT BUILD / ROAD BUILDING OR OCCUPIED GROUND"
    case Preview{3, _, _, _, _, _, _, _, _, _}: "CANNOT BUILD / NOT ENOUGH GOLD"
    case Preview{6, _, _, _, _, _, _, _, _, _}: "DEFEATED / R STARTS A NEW GAME"
    case Preview{7, _, _, _, _, _, _, _, _, _}: "CANNOT BUILD / UNKNOWN TOWER"
    case Preview{4, _, _, _, _, _, _, _, _, _}: "NO CURRENT TARGET / BUILD FOR LATER"
    case Preview{_, _, _, _, _, _, _, _, _, _}: "SUITABLE SITE / NO CURRENT EXTRA EFFECT"

def after(+preview: Preview) -> U32:
  (before(preview) - U32.min(before(preview), delta(preview)) : U32)

def classify(selected: U32, valid: Bool, funded: Bool, site: U32, gain: U32) -> U32:
  match selected valid funded site gain:
    case 0 True{} True{} 255 _: 4
    case 0 True{} True{} _ 0: 5
    case 0 True{} True{} _ _: 1
    case 0 True{} False{} _ _: 3
    case 0 False{} _ _ _: 2
    case _ _ _ _ _: 0

def guarded_status(
  selected: U32,
  alive: Bool,
  known: Bool,
  valid: Bool,
  funded: Bool,
  site: U32,
  gain: U32
) -> U32:
  match selected alive known:
    case 0 False{} _: 6
    case 0 True{} False{}: 7
    case 0 True{} True{}: classify(0, valid, funded, site, gain)
    case _ _ _: 0

def calculate(+world: M.World) -> Preview:
  +kind = M.choice(world)
  +x = H.snap(M.mouse_x(world))
  +y = H.snap(M.mouse_y(world))
  +cost = H.tower_cost(kind)
  +site = H.preview_site(world, x, y, kind)
  +gain = H.preview_gain(world, x, y, kind)
  Preview{
    guarded_status(
      M.selected(world),
      (M.hp(world) > 0 : U32),
      Mechanics.valid(kind),
      H.placement_valid(world, x, y),
      (M.gold(world) >= cost : U32),
      site,
      gain
    ),
    kind,
    x,
    y,
    H.preview_target(world, x, y, kind),
    site,
    H.preview_before(world, x, y, kind),
    gain,
    H.tower_range(kind, 1),
    cost
  }
