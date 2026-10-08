# Jobless command scope must select the owning partition's collection behavior.
# Original context inputs exercise NativeRun scope resolution and actual Driver handling.
import Base
import ./DefenseConsumer.bend as Consumer
import ../../packages/monkey-business-bend/NativeRun.bend as Run
import ../../packages/monkey-business-bend/NativeRunTypes.bend as T
import ../../packages/monkey-business-bend/Driver.bend as Driver
import ../../packages/monkey-business-bend/Engine.bend as Engine
import ../../packages/agent-flow-bend/Canonical.bend as C
import ../../packages/agent-flow-bend/Handoff.bend as Handoff

def require(ok: Bool, message: String) -> IO(Unit):
  match ok:
    case True{}: IO.print("PASS " ++ message)
    case False{}: IO.die(Unit, 1, "FAIL " ++ message)
def ready(partition: Nat) -> C.CanonicalEvent:
  C.CollectionReady{14n, partition, 1n, 1n, 4n, False{}}
def scoped(+state: T.State, +partition: Nat) -> Driver.Context:
  Run.command_partition(
    state,
    Run.command_context(state, Driver.immediate(ready(partition), False{}), None{}, None{}),
    Some{partition}
  )
def same_bool(a: Bool, b: Bool) -> Bool:
  match a:
    case True{}: b
    case False{}: Bool.not(b)
def flags(context: Driver.Context, partition: Nat, background: Bool, automatic: Bool) -> Bool:
  match context:
    case Driver.Context{
      p,
      _,
      _,
      _,
      job,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      collection,
      _,
      _,
      _,
      _,
      _,
      generated,
      _
    }:
      Nat.is_eq(p, partition) && Bool.not(job) && same_bool(generated, background) && same_bool(
        collection,
        automatic
      )
def selected_surface(handled: Driver.Handled, background: Bool) -> Bool:
  match handled:
    case Driver.Handled{
      True{},
      Driver.Action{
        C.FinalCandidateCheck{_, _, _, _, _, _},
        _,
        Some{Driver.Candidate{1n, 14n, 1n, 14n, Handoff.Background{}, _}},
        _,
        _
      } <> Nil{}
    }: background
    case Driver.Handled{
      True{},
      Driver.Action{
        C.FinalCandidateCheck{_, _, _, _, _, _},
        _,
        Some{Driver.Candidate{2n, 14n, 1n, 14n, Handoff.Edit{}, _}},
        _,
        _
      } <> Nil{}
    }: Bool.not(background)
    case _: False{}
def handled(+state: T.State, +partition: Nat) -> Driver.Handled:
  Driver.handle(
    Engine.canonical(Run.core(state)),
    ready(partition),
    C.EventEstablished{C.CollectionEligible{}},
    scoped(state, partition)
  )
# Admit the original configured arrival, then register Stop through its checked owner.
def admitted(advanced: T.Advanced) -> T.State:
  match advanced:
    case T.Advanced{state, _, _}: state
def registered(state: T.State, result: Engine.StopRegistered) -> T.State:
  match result:
    case Engine.StopRegistered{core, _, _}: Run.replace_core(state, core)
def stopping(+state: T.State) -> T.State:
  registered(state, Engine.stop_start(Run.core(state), 1n, Run.clock(state), 100000n, False{}))
def main() -> IO(Unit):
  +states: List<&2, T.State> = [Consumer.initial()]
  +stopped: List<&2, T.State> = [
    stopping(admitted(Run.advance(Consumer.boxed(states), 128n, 31000n)))
  ]
  do IO<Unit>:
    require(
      flags(scoped(Consumer.boxed(states), 1n), 1n, True{}, True{}),
      "jobless generated command uses Background collection"
    )
    require(
      selected_surface(handled(Consumer.boxed(states), 1n), True{}),
      "actual CollectionEligible handling selects Background candidate"
    )
    require(
      flags(scoped(Consumer.boxed(states), 2n), 2n, False{}, True{}),
      "jobless nongenerated command retains Edit collection"
    )
    require(
      selected_surface(handled(Consumer.boxed(states), 2n), False{}),
      "actual nongenerated CollectionEligible handling selects Edit candidate"
    )
    require(
      Run.active_finish(
        Consumer.boxed(stopped),
        1n
      ) && flags(scoped(Consumer.boxed(stopped), 1n), 1n, True{}, False{}),
      "owning partition Stop disables automatic collection"
    )
    require(
      flags(scoped(Consumer.boxed(stopped), 2n), 2n, False{}, True{}),
      "another partition Stop does not disable collection"
    )
