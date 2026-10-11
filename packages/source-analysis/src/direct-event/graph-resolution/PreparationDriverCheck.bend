import Base
import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import ./PreparationSpecification.bend as P
import ./Types.bend as T
import ./Environment.bend as E
import ./WholeObservation.bend as O
import ./DeadlineSpecification.bend as Deadline

# Existing preparation interpreter; fixture host binds mechanical path algebra.
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
def suffix_result(+name: String, suffix: Maybe<&2, String>) -> String:
  match suffix:
    case None{}: name
    case Some{+suffix}: Bool.pick(String, String.ends_with(name, suffix),
      String.take(name, (String.length(name) - String.length(suffix) : Nat)), name)
def suffix_base(value: String, suffix: Maybe<&2, String>) -> String:
  suffix_result(basename(value), suffix)
def selection(state: P.State) -> P.Selection:
  P.choose(~absolute, ~dirname, ~relative, "/", state)
def reply(state: P.State, outcome: T.ServiceOutcome) -> P.Selection:
  P.consume(
    ~absolute,
    ~dirname,
    ~suffix_base,
    ~join,
    ~relative,
    ~extension,
    ~normalize,
    ~expired,
    "/",
    state,
    outcome
  )
def suspend(operation: T.Operation, world: Nat) -> E.Response<Nat>:
  match world:
    case +sequence: E.Suspended{Nat.add(sequence, 1n), O.ProviderLease{1n, sequence}, []}
def advance(progress: P.Progress<Nat>) -> P.Progress<Nat>:
  P.advance(~selection, ~reply, Nat, suspend, progress)
def complete(progress: P.Progress<Nat>, completion: E.Completion<Nat>) -> P.Progress<Nat>:
  P.complete(~reply, Nat, progress, completion)
def main() -> Unit:
  Unit{}
