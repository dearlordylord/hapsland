import Base
import ../../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import ../ExpansionDriverSpecification.bend as D
import ../Types.bend as T
import ../Environment.bend as E
import ../WholeObservation.bend as O
import ../DeadlineSpecification.bend as Deadline

# Separately emitted continuation of the existing independent expansion driver.
# The host binds path algebra; all expansion selection/accounting remains in D.
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
def selection(state: D.State) -> D.Selection:
  D.choose(~absolute, ~dirname, ~join, ~normalize, ~extension, "/", 10000n, state)
def reply(state: D.State, outcome: T.ServiceOutcome) -> D.Selection:
  D.consume(~dirname, ~join, ~relative, ~expired, state, outcome)
def suspend(operation: T.Operation, world: Nat) -> E.Response<Nat>:
  match world:
    case +sequence: E.Suspended{Nat.add(sequence, 1n), O.ProviderLease{1n, sequence}, []}
def advance(progress: D.Progress<Nat>) -> D.Progress<Nat>:
  D.advance(~selection, ~reply, Nat, suspend, progress)
def complete(progress: D.Progress<Nat>, completion: E.Completion<Nat>) -> D.Progress<Nat>:
  D.complete(~reply, Nat, progress, completion)
def main() -> Unit:
  Unit{}
