# Read-only current-state hover. Values come from the same Host effect helpers as actual towers.
import Base
import ./DefenseModel.bend as M
import ./DefenseHost.bend as H

type Preview is Data:
  Preview{status: U32, kind: U32, x: U32, y: U32, target: Nat, site: U32, before: U32, delta: U32, range: U32, cost: U32, secondaryBefore: U32, secondaryDelta: U32}

def status(preview: Preview) -> U32:
  match preview:
    case Preview{v, _, _, _, _, _, _, _, _, _, _, _}: v

def kind(preview: Preview) -> U32:
  match preview:
    case Preview{_, v, _, _, _, _, _, _, _, _, _, _}: v

def x(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, v, _, _, _, _, _, _, _, _, _}: v

def y(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, v, _, _, _, _, _, _, _, _}: v

def target(preview: Preview) -> Nat:
  match preview:
    case Preview{_, _, _, _, v, _, _, _, _, _, _, _}: v

def site(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, v, _, _, _, _, _, _}: v

def before(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, v, _, _, _, _, _}: v

def delta(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, v, _, _, _, _}: v

def range(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, v, _, _, _}: v

def cost(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, _, v, _, _}: v

def secondary_before(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, _, _, v, _}: v
def secondary_delta(preview: Preview) -> U32:
  match preview:
    case Preview{_, _, _, _, _, _, _, _, _, _, _, v}: v
def secondary_after(+preview: Preview) -> U32:
  (secondary_before(preview) - U32.min(secondary_before(preview), secondary_delta(preview)) : U32)

# Status 4 is structural absence; status 5 is an eligible site with no current marginal effect.
def effective(+preview: Preview) -> Bool:
  U32.is_eq(status(preview), 1)
def legal(+preview: Preview) -> Bool:
  U32.is_eq(status(preview), 1) || U32.is_eq(status(preview), 4) || U32.is_eq(status(preview), 5)
def reason(preview: Preview) -> String:
  match preview:
    case Preview{0, _, _, _, _, _, _, _, _, _, _, _}: "TOWER SELECTED / INSPECT OR UPGRADE"
    case Preview{1, 2, _, _, _, _, _, _, _, _, _, _}: "RESTORE ACCESS NOW / ONE-TIME EFFECT"
    case Preview{1, _, _, _, _, _, _, _, _, _, _, _}: "FUTURE PROFILE / ISSUED WORK UNCHANGED"
    case Preview{2, _, _, _, _, _, _, _, _, _, _, _}: "CANNOT BUILD / ROAD BUILDING OR OCCUPIED GROUND"
    case Preview{3, _, _, _, _, _, _, _, _, _, _, _}: "CANNOT BUILD / NOT ENOUGH GOLD"
    case Preview{4, _, _, _, _, _, _, _, _, _, _, _}: "NO EFFECT / NO SUITABLE SITE IN RANGE"
    case Preview{_, _, _, _, _, _, _, _, _, _, _, _}: "SUITABLE SITE / NO CURRENT EXTRA EFFECT"

def reduction(+kind: U32) -> Bool:
  True{}
def after_direction(+before: U32, delta: U32, decreases: Bool) -> U32:
  match decreases:
    case True{}: (before - U32.min(before, delta) : U32)
    case False{}: (before + delta : U32)
def after(+preview: Preview) -> U32:
  after_direction(before(preview), delta(preview), reduction(kind(preview)))

def classify(selected: U32, valid: Bool, funded: Bool, site: U32, gain: U32) -> U32:
  match selected valid funded site gain:
    case 0 True{} True{} 255 _: 4
    case 0 True{} True{} _ 0: 5
    case 0 True{} True{} _ _: 1
    case 0 True{} False{} _ _: 3
    case 0 False{} _ _ _: 2
    case _ _ _ _ _: 0

def calculate(+world: M.World) -> Preview:
  +kind = M.choice(world)
  +x = H.snap(M.mouse_x(world))
  +y = H.snap(M.mouse_y(world))
  +cost = H.tower_cost(kind)
  +site = H.preview_site(world, x, y, kind)
  +gain = H.preview_gain(world, x, y, kind)
  +secondary = H.preview_secondary_delta(world, x, y, kind)
  Preview{classify(M.selected(world), H.placement_valid(world, x, y), (M.gold(world) >= cost : U32), site, U32.max(gain, secondary)),
    kind, x, y, H.preview_target(world, x, y, kind), site,
    H.preview_before(world, x, y, kind), gain, H.tower_range(kind, 1), cost,
    H.preview_secondary_before(world, x, y, kind), secondary}
