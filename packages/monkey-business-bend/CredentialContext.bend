import Base
import ./CredentialFacts.bend as CredentialFacts
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as Canonical

# The native/public driver consumes the same frozen generation facts. Explicit
# false scenario facts stay false; absent backend capture remains an explicit
# fixture assumption rather than a newly fabricated issuance.
def captured_match(found: Maybe<&2, Nat>, current: Nat, supplied: Bool) -> Bool:
  match found:
    case None{}: supplied
    case Some{generation}: supplied && Nat.is_eq(current, generation)

def operation_generation(state: CredentialFacts.State, operation: Nat, supplied: Bool) -> Bool:
  match state:
    case CredentialFacts.State{_, generation, issued}: captured_match(CredentialFacts.lookup(issued, operation), generation, supplied)

def candidate_generation(state: CredentialFacts.State, candidate: Maybe<&2, Driver.Candidate>, supplied: Bool) -> Bool:
  match candidate:
    case Some{Driver.Candidate{_, advice, _, _, _, _}}: operation_generation(state, advice, supplied)
    case None{}: supplied

def event_generation(state: CredentialFacts.State, event: Canonical.CanonicalEvent, supplied: Bool) -> Bool:
  match event:
    case Canonical.JevRequestReady{_, _, _, operation, _, _, _, _, _, _}: operation_generation(state, operation, supplied)
    case Canonical.JevRequestStarted{_, _, _, operation, _}: operation_generation(state, operation, supplied)
    case Canonical.JevRequestInterrupted{_, _, _, operation, _}: operation_generation(state, operation, supplied)
    case Canonical.JevRequestSettled{_, _, _, operation, _, _, _}: operation_generation(state, operation, supplied)
    case Canonical.CollectionReady{advice, _, _, _, _, _}: operation_generation(state, advice, supplied)
    case _: supplied

def apply(+state: CredentialFacts.State, event: Canonical.CanonicalEvent, context: Driver.Context) -> Driver.Context:
  match state context:
    case CredentialFacts.State{available, _, _} Driver.Context{p, l, r, bytes, job, delay, outcome, current, credential, generation, readable, lifetime, +candidate, collection, review, output, certain, output_delay, output_lease, background, dispatch}:
      Driver.Context{p, l, r, bytes, job, delay, outcome, current, credential && available,
        candidate_generation(state, candidate, event_generation(state, event, generation)),
        readable, lifetime, candidate, collection, review, output, certain, output_delay, output_lease, background, dispatch}
