# Automatic local interventions; environment availability belongs to the scenario.
import Base
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def valid(+kind: U32) -> Bool: (kind >= 3 : U32) && (kind <= 6 : U32)
def shortcut(kind: U32) -> U32: (kind - 2 : U32)
def cost(kind: U32) -> U32:
  match kind:
    case 3: 50
    case 4: 40
    case 5: 45
    case 6: 50
    case _: 0
def name(kind: U32) -> String:
  match kind:
    case 3: "WORK ACCELERATOR"
    case 4: "RESULT COURIER"
    case 5: "WORK FINISHER"
    case 6: "WORK PULSE"
    case _: "UNKNOWN TOWER"
def detail(kind: U32) -> String:
  match kind:
    case 3: "ONE LONGEST / -50% TIME"
    case 4: "AUTHORIZED OUTPUT / -50%"
    case 5: "ONE SHORTEST / -50% TIME"
    case 6: "THREE -50% / SLOW VOLLEY"
    case _: "NO EFFECT"
def base_radius(kind: U32) -> U32: 60
def range(kind: U32, +level: U32) -> U32: (base_radius(kind) + level * 12 : U32)
def tower_range(+tower: M.Tower) -> U32: (M.radius(tower) + M.level(tower) * 12 : U32)
# Upgrade changes cadence and coverage, never the in-flight cooldown deadline.
def upgraded(tower: M.Tower) -> M.Tower:
  match tower:
    case M.Tower{x, y, k, l, p, r, ready}: M.Tower{x, y, k, (l + 1 : U32), p, r, ready}
def max_level(kind: U32) -> U32: 3

def current_environment(state: T.State) -> T.Environment:
  match state:
    case T.State{_, _, _, _, _, env, _, _, _, _, _}: env
def applied(result: T.Controlled) -> T.State:
  match result:
    case T.Controlled{state, _}: state
def missing_access(env: T.Environment) -> U32:
  match env:
    case T.Environment{_, _, _, _, _, _, _, _, _, ready, _, readable, _, _}:
      (Bool.to_u32(Bool.not(ready)) + Bool.to_u32(Bool.not(readable)) : U32)
