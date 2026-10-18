# Finite actual-Lab traces encoded by the existing generated owner codecs.
import Base
import ./DefenseLab.bend as Lab
import ./DefenseHost.bend as H
import ./DefenseModel.bend as M
import ./DefenseLabTraceCodec.bend as Codec
import ./DefenseLabTraceTypes.bend as Trace
import ./DefenseNumericOutput.bend as NumericOutput
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T

def receipt_world(receipt: Lab.Receipt) -> M.World:
  match receipt:
    case Lab.Receipt{value, _, _}: value
def value(worlds: List<&2, M.World>) -> M.World:
  match worlds:
    case head <> _: head
    case Nil{}: H.initial()
def event_count(observation: T.Observation) -> Nat:
  match observation:
    case T.Observation{_, count, _, _, _, _, _}: count
def count(world: M.World) -> Nat: event_count(Lab.engine_observation(world))
# Every scenario starts with real ingress. The bounded warmup below performs
# actual Host ticks; it does not construct actors, callbacks or Canonical facts.
def scenario(+id: U32) -> Lab.Scenario:
  Lab.Scenario{
    400n,
    Bool.pick(Nat, U32.is_eq(id, 10), 5000n, 1200n),
    40n,
    True{},
    Bool.not(U32.is_eq(id, 6)),
    Bool.pick(U32, (id <= 2 : U32), 1, 2),
    Bool.pick(U32, U32.is_eq(id, 14), 4, 1),
    60000
  }
def budget(+id: U32) -> Nat: Bool.pick(Nat, U32.is_eq(id, 14), 512n, 128n)
def warmup_ticks(id: U32) -> Nat:
  match id:
    case 1: 220n
    case 2: 220n
    case 6: 40n
    case 4: 634n
    case 5: 634n
    case 8: 634n
    case 15: 634n
    case 10: 634n
    case _: 490n
def warmup(fuel: Nat, world: M.World) -> M.World:
  match fuel:
    case 0n: world
    case 1n+n: warmup(n, H.tick_world(H.tick_observed(world)))
def built(world: M.World, x: U32, y: U32, kind: U32) -> M.World:
  receipt_world(Lab.apply(world, Lab.Build{x, y, kind}))
def active_build(world: M.World, id: U32) -> M.World:
  match id:
    case 1: built(world, 652, 215, 3)
    case 2: built(world, 652, 215, 3)
    case 4: built(world, 152, 456, 4)
    case 5: built(world, 152, 456, 4)
    case 6: built(world, 652, 215, 3)
    case 7: built(world, 424, 392, 3)
    case 8: built(world, 152, 456, 4)
    case 9: built(built(world, 424, 392, 3), 328, 424, 3)
    case 10: built(world, 152, 456, 4)
    case 14: built(built(world, 424, 392, 3), 328, 424, 3)
    case 15: built(world, 152, 456, 4)
    case _: world
def active_fire(world: M.World, id: U32, tick: U32) -> M.World:
  match id tick:
    case 7 1: receipt_world(Lab.apply(world, Lab.Fire{1, 3n}))
    case 8 1: receipt_world(Lab.apply(world, Lab.Fire{1, 3n}))
    case 9 1: receipt_world(
      Lab.apply(receipt_world(Lab.apply(world, Lab.Fire{1, 4n})), Lab.Fire{2, 3n})
    )
    case _ _: world
def intervention(+world: M.World, +id: U32, tick: U32) -> M.World:
  match tick:
    case 0: Bool.pick(M.World, U32.is_eq(id, 2) || U32.is_eq(id, 5), world, active_build(world, id))
    case 10: Bool.pick(
      M.World,
      U32.is_eq(id, 2) || U32.is_eq(id, 5),
      active_build(world, id),
      active_fire(world, id, 10)
    )
    case _: active_fire(world, id, tick)
def publish_tick(
  +id: U32,
  tick: U32,
  +before: List<&2, M.World>,
  +changed: List<&2, M.World>,
  observed: H.TickObserved,
  rest: List<&2, M.World> -> IO(Unit)
) -> IO(Unit):
  match observed:
    case H.TickObserved{+after, +frames, +physical, transport}:
      continue: Unit -> IO(Unit) = _ => rest([after])
      IO.bind(
        Unit,
        Unit,
        NumericOutput.write(
          U32.to_nat(
            id
          ) <> U32.to_nat(
            tick
          ) <> budget(
            id
          ) <> count(
            after
          ) <> Codec.defenselabtracetypes_envelope(
            [Trace.Envelope{value(before), value(changed), after, frames, physical, transport}],
            Nil{}
          )
        ),
        continue
      )
def advance_mode(active: Bool, +id: U32, +world: M.World) -> H.TickObserved:
  match active:
    case True{}: H.tick_observed(world)
    case False{}: Lab.tick_bounded(world, Nat.sub(budget(id), count(world)))
def advance_world(+id: U32, world: M.World) -> H.TickObserved:
  advance_mode(
    U32.is_eq(
      id,
      1
    ) || U32.is_eq(
      id,
      2
    ) || U32.is_eq(
      id,
      4
    ) || U32.is_eq(id, 5) || U32.is_eq(id, 6) || U32.is_eq(id, 10) || (id >= 14 : U32),
    id,
    world
  )
def advance_tick(
  +id: U32,
  tick: U32,
  +worlds: List<&2, M.World>,
  +changed: List<&2, M.World>,
  rest: List<&2, M.World> -> IO(Unit)
) -> IO(Unit):
  publish_tick(id, tick, worlds, changed, advance_world(id, value(changed)), rest)
def trace(fuel: Nat, +id: U32, +tick: U32, +worlds: List<&2, M.World>) -> IO(Unit):
  match fuel:
    case 0n: IO.pure(Unit, Unit{})
    case 1n+n:
      continue: List<&2, M.World> -> IO(Unit) = next => trace(n, id, (tick + 1 : U32), next)
      advance_tick(id, tick, worlds, [intervention(value(worlds), id, tick)], continue)
# Select one original scenario at runtime, including partial Stop and both
# insertion orders of a callback at its exact cutoff.
def original_finish(world: M.World, id: U32) -> M.World:
  match id:
    case 10: Lab.schedule_finish(world, 9900n)
    case 11: Lab.schedule_finish(world, 9900n)
    case 12: Lab.schedule_finish(world, 9880n)
    case 13: Lab.schedule_finish(world, 9860n)
    case _: world
def original_world(+id: U32) -> M.World:
  warmup(warmup_ticks(id), original_finish(Lab.create_scenario(scenario(id), 152n, 160, 0), id))
def selected(valid: Bool, +id: U32) -> IO(Unit):
  match valid:
    case True{}: trace(40n, id, 0, [original_world(id)])
    case False{}: IO.die(Unit, 1, "expected one scenario id0..15")
def digit(+code: U32) -> IO(Unit):
  selected((code >= 48 : U32) && (code <= 57 : U32), (code - 48 : U32))
def scenario_argument(text: String) -> IO(Unit):
  match text:
    case SCon{head, SNil{}}: digit(Char.to_u32(head))
    case SCon{head, SCon{+tail, SNil{}}}:
      selected(
        U32.is_eq(
          Char.to_u32(head),
          49
        ) && (Char.to_u32(tail) >= 48 : U32) && (Char.to_u32(tail) <= 53 : U32),
        (Char.to_u32(tail) - 38 : U32)
      )
    case _: IO.die(Unit, 1, "expected one scenario id0..15")
def arguments(args: List<String>) -> IO(Unit):
  match args:
    case _ <> text <> Nil{}: scenario_argument(text)
    case _: IO.die(Unit, 1, "expected one scenario id0..15")
def main() -> IO(Unit):
  IO.bind(List<String>, Unit, IO.args(), args => arguments(args))
