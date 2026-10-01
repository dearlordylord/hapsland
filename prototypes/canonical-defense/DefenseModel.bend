import Base
import ./DefenseAuto.bend as A
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Dispatch.bend as Dispatch

type Tower is Data:
  Tower{x: U32, y: U32, kind: U32, level: U32, cooldown: U32, flash: U32, aim: Nat, charges: U32}
# Synthetic workload metadata, not a product queue. Historical quality survives stage changes.
type Timer is Data:
  Timer{id: Nat, phase: U32, age: U32, family: Nat, risk: U32, seed: U32, boost: U32}
type Output is Data:
  Output{age: U32, attempt: Nat, token: Nat, selected: List<&2, Nat>, flushAge: U32, span: U32}
type World is Data:
  World{core: C.State, clock: U32, paused: Bool, layout: U32, choice: U32,
    gold: U32, hp: U32, towers: List<&2, Tower>, timers: List<&2, Timer>,
    active: Bool, offered: U32, rejected: U32, clear: U32, delivered: U32,
    output: Output, auto: A.State, mouseX: U32, mouseY: U32, selected: U32, damageWork: U32, damageFlash: U32}
def number(n: Nat) -> U32:
  U32.from_nat(Nat.min(n, 4294967295n))
def sub(+a: U32, +b: U32) -> U32:
  Bool.pick(U32, (a >= b : U32), (a - b : U32), 0)

def core(world: World) -> C.State:
  match world:
    case World{v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def time(world: World) -> U32:
  match world:
    case World{_, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def paused(world: World) -> Bool:
  match world:
    case World{_, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def layout(world: World) -> U32:
  match world:
    case World{_, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def choice(world: World) -> U32:
  match world:
    case World{_, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def gold(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def hp(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def towers(world: World) -> List<&2, Tower>:
  match world:
    case World{_, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _, _}: v

def timers(world: World) -> List<&2, Timer>:
  match world:
    case World{_, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _, _}: v

def active(world: World) -> Bool:
  match world:
    case World{_, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _, _}: v

def offered(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _, _}: v

def rejected(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _, _}: v

def clear(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _, _}: v

def delivered(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _, _}: v

def output(world: World) -> Output:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _, _}: v

def auto(world: World) -> Bool:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _}: A.enabled(v)

def mouse_x(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _}: v

def mouse_y(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _}: v

def selected(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _}: v

def tx(tower: Tower) -> U32:
  match tower:
    case Tower{v, _, _, _, _, _, _, _}: v

def ty(tower: Tower) -> U32:
  match tower:
    case Tower{_, v, _, _, _, _, _, _}: v

def tkind(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, v, _, _, _, _, _}: v

def level(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, _, v, _, _, _, _}: v

def cooldown(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, _, _, v, _, _, _}: v

def flash(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, _, _, _, v, _, _}: v

def aim(tower: Tower) -> Nat:
  match tower:
    case Tower{_, _, _, _, _, _, v, _}: v

def charges(tower: Tower) -> U32:
  match tower:
    case Tower{_, _, _, _, _, _, _, v}: v

def timer_id(timer: Timer) -> Nat:
  match timer:
    case Timer{v, _, _, _, _, _, _}: v

def timer_phase(timer: Timer) -> U32:
  match timer:
    case Timer{_, v, _, _, _, _, _}: v

def timer_age(timer: Timer) -> U32:
  match timer:
    case Timer{_, _, v, _, _, _, _}: v

def timer_family(timer: Timer) -> Nat:
  match timer:
    case Timer{_, _, _, v, _, _, _}: v

def timer_risk(timer: Timer) -> U32:
  match timer:
    case Timer{_, _, _, _, v, _, _}: v

def timer_seed(timer: Timer) -> U32:
  match timer:
    case Timer{_, _, _, _, _, v, _}: v

def timer_boost(timer: Timer) -> U32:
  match timer:
    case Timer{_, _, _, _, _, _, v}: v

def delivery_age(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, Output{age, _, _, _, _, _}, _, _, _, _, _, _}: age
def work(core: C.State) -> List<&2, C.Work>:
  match core:
    case C.State{_, _, items, _, _, _, _, _, _}: items
def rounds(core: C.State) -> List<&2, C.Round>:
  match core:
    case C.State{_, items, _, _, _, _, _, _, _}: items
def dispatch(core: C.State) -> Dispatch.State:
  match core:
    case C.State{_, _, _, _, _, _, items, _, _}: items
def with_core(world: World, next: C.State) -> World:
  match world:
    case World{_, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, selected, damage, flash}:
      World{next, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, auto, x, y, selected, damage, flash}
def phase(kind: C.WorkKind) -> U32:
  match kind:
    case C.AwaitingSourceRead{}: 0
    case C.SourceReading{}: 1
    case C.Preparing{}: 2
    case C.Reviewing{}: 3
    case C.AtJev{}: 4
    case C.PendingFinding{_}: 5

def with_effects(world: World, towers: List<&2, Tower>, timers: List<&2, Timer>) -> World:
  match world:
    case World{core, t, p, l, c, g, h, _, _, a, o, r, cl, d, out, auto, x, y, selected, damage, flash}:
      World{core, t, p, l, c, g, h, towers, timers, a, o, r, cl, d, out, auto, x, y, selected, damage, flash}

def damage_work(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _}: v

def damage_flash(world: World) -> U32:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v}: v

# Campaign facts are host metadata; round() reads the actual canonical identity.
def schedule(world: World) -> A.State:
  match world:
    case World{_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, v, _, _, _, _, _}: v
def with_schedule(world: World, schedule: A.State) -> World:
  match world:
    case World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, _, x, y, selected, damage, flash}:
      World{core, t, p, l, c, g, h, ts, ms, a, o, r, cl, d, out, schedule, x, y, selected, damage, flash}
def wave(world: World) -> U32:
  A.wave(schedule(world))
def wave_count() -> U32: 6
def wave_demand() -> U32: 8
def auto_left(world: World) -> U32: A.left(schedule(world))
def auto_pending(world: World) -> Bool: A.pending(schedule(world))
def auto_task(world: World) -> Nat: A.task(schedule(world))
def current_round(items: List<&2, C.Round>) -> Nat:
  match items:
    case C.Round{1n, 1n, id, _, _, _, _, _} <> _: id
    case _ <> rest: current_round(rest)
    case Nil{}: 0n
def round(world: World) -> Nat: current_round(rounds(core(world)))
def wave_interval(+world: World) -> U32:
  sub(220, (20 * U32.min(wave(world), 6) : U32))
