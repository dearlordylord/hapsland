# Automatic local interventions; environment availability belongs to the scenario.
import Base
import ./DefenseModel.bend as M
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def valid(+kind: U32) -> Bool: U32.is_eq(kind, 3) || U32.is_eq(kind, 4)
def shortcut(kind: U32) -> U32: Bool.pick(U32, U32.is_eq(kind, 3), 1, 2)
def cost(kind: U32) -> U32: Bool.pick(U32, U32.is_eq(kind, 3), 50, 40)
def name(kind: U32) -> String:
  Bool.pick(String, U32.is_eq(kind, 3), "WORK ACCELERATOR", "RESULT COURIER")
def detail(kind: U32) -> String:
  Bool.pick(
    String,
    U32.is_eq(kind, 3),
    "AUTO / PREPARE OR CHECK ONE WORK",
    "AUTO / DELIVER AUTHORIZED RESULT"
  )
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
