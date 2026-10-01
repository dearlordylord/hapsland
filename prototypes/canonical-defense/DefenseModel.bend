import Base
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch

type Tower is Data:
  Tower{x: U32, y: U32, kind: U32}
type Timer is Data:
  Timer{id: Nat, phase: U32, age: U32}
type World is Data:
  World{core: C.State, clock: U32, paused: Bool, layout: U32, choice: U32,
    gold: U32, hp: U32, towers: List<&2, Tower>, timers: List<&2, Timer>,
    active: Bool, offered: U32, rejected: U32, clear: U32, delivered: U32,
    deliveryAge: U32, auto: Bool}

def number(n: Nat) -> U32:
  U32.from_nat(Nat.min(n, 4294967295n))

def core(state: World) -> C.State:
  match state:
    case World{value, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: value

def time(state: World) -> U32:
  match state:
    case World{_, value, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: value

def paused(state: World) -> Bool:
  match state:
    case World{_, _, value, _, _, _, _, _, _, _, _, _, _, _, _, _}: value

def layout(state: World) -> U32:
  match state:
    case World{_, _, _, value, _, _, _, _, _, _, _, _, _, _, _, _}: value

def choice(state: World) -> U32:
  match state:
    case World{_, _, _, _, value, _, _, _, _, _, _, _, _, _, _, _}: value

def gold(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, value, _, _, _, _, _, _, _, _, _, _}: value

def hp(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, value, _, _, _, _, _, _, _, _, _}: value

def towers(state: World) -> List<&2, Tower>:
  match state:
    case World{_, _, _, _, _, _, _, value, _, _, _, _, _, _, _, _}: value

def timers(state: World) -> List<&2, Timer>:
  match state:
    case World{_, _, _, _, _, _, _, _, value, _, _, _, _, _, _, _}: value

def active(state: World) -> Bool:
  match state:
    case World{_, _, _, _, _, _, _, _, _, value, _, _, _, _, _, _}: value

def offered(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, value, _, _, _, _, _}: value

def rejected(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, _, value, _, _, _, _}: value

def clear(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, value, _, _, _}: value

def delivered(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, value, _, _}: value

def delivery_age(state: World) -> U32:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, value, _}: value

def auto(state: World) -> Bool:
  match state:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, value}: value

def tx(tower: Tower) -> U32:
  match tower:
    case Tower{v, _, _}: v

def ty(tower: Tower) -> U32:
  match tower:
    case Tower{_, v, _}: v

def tkind(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, v}: v

def work(state: C.State) -> List<&2, C.Work>:
  match state:
    case C.State{_, _, value, _, _, _, _, _, _}: value
def rounds(state: C.State) -> List<&2, C.Round>:
  match state:
    case C.State{_, value, _, _, _, _, _, _, _}: value
def dispatch(state: C.State) -> Dispatch.State:
  match state:
    case C.State{_, _, _, _, _, _, value, _, _}: value

def with_core(state: World, replacement: C.State) -> World:
  match state:
    case World{_, t, p, l, c, g, h, towers, timers, a, o, r, clear, d, age, auto}:
      World{replacement, t, p, l, c, g, h, towers, timers, a, o, r, clear, d, age, auto}
def phase(kind: C.WorkKind) -> U32:
  match kind:
    case C.AwaitingSourceRead{}: 0
    case C.SourceReading{}: 1
    case C.Preparing{}: 2
    case C.Reviewing{}: 3
    case C.AtJev{}: 4
    case C.PendingFinding{_}: 5
