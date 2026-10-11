import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import ./EntrySpecification.bend as I
import ./ExpansionDriverSpecification.bend as D
import ./Types.bend as T
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./DeadlineSpecification.bend as Deadline
import ./go-module/ArtifactProtocol.bend as GoProtocol
import ./python-module/ArtifactProtocol.bend as PythonProtocol

# Full reference entry over the existing operation-selected environment.
# The check host binds only path algebra and mechanically relays Go child views.
def basename(value: String) -> String:
  ""
def join(parts: List<&2, String>) -> String:
  ""
def dirname(value: String) -> String:
  ""
def extension(value: String) -> String:
  ""
def normalize(value: String) -> String:
  ""
def relative(from: String, to: String) -> String:
  ""
def absolute(value: String) -> Bool:
  String.starts_with(value, "/")
def expired(bits: ArtifactValue.Binary64) -> Bool:
  Deadline.expired(bits)
def suspend(operation: T.Operation, world: Nat) -> E.Response<Nat>:
  match world:
    case +sequence: E.Suspended{Nat.add(sequence, 1n), O.ProviderLease{1n, sequence}, []}
def entry_selection(state: I.State) -> I.Selection:
  I.choose(~extension, state)
def entry_reply(state: I.State, outcome: T.ServiceOutcome) -> I.Selection:
  I.consume(~expired, state, outcome)
def initial(input: T.ResolverInput) -> I.Progress<Nat>:
  I.begin(Nat, input, 1n, E.WorldState{0n, []})
def advance(progress: I.Progress<Nat>) -> I.Progress<Nat>:
  match progress:
    case I.EntryReady{state, world}: I.consumed(Nat, entry_selection(state), world)
    case I.EntrySelected{state, operation, world}: I.issue(
      ~entry_reply,
      Nat,
      suspend,
      state,
      operation,
      world
    )
    case other: other
def complete(progress: I.Progress<Nat>, completion: E.Completion<Nat>) -> I.Progress<Nat>:
  match progress:
    case I.EntryWaiting{state, exchange}: I.completed_exchange(
      ~entry_reply,
      Nat,
      state,
      exchange,
      completion
    )
    case I.EntryPythonChildWaiting{state, exchange}: I.go_completed_exchange(
      Nat,
      state,
      exchange,
      completion
    )
    case I.EntryGoChildWaiting{state, exchange}: I.go_completed_exchange(
      Nat,
      state,
      exchange,
      completion
    )
    case other: other
def accept_expansion(progress: I.Progress<Nat>, child: D.Progress<Nat>) -> I.Progress<Nat>:
  match progress:
    case I.EntryExpanding{state, _}: I.expansion_progress(Nat, state, child)
    case other: other
def go_child_completed(progress: I.Progress<Nat>, view: GoProtocol.GoView) -> I.Progress<Nat>:
  I.go_child_completed(Nat, suspend, progress, view)
def python_child_completed(
  progress: I.Progress<Nat>,
  view: PythonProtocol.PythonView
) -> I.Progress<Nat>:
  I.python_child_completed(Nat, suspend, progress, view)
def cancel(progress: I.Progress<Nat>) -> I.Progress<Nat>:
  I.cancel(Nat, progress)
def accepted_result(progress: I.Progress<Nat>) -> Maybe<&2, T.ProductResult>:
  I.accepted_result(progress)
def main() -> Unit:
  Unit{}
