import Base
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Dispatch.bend as Dispatch

type Target is Data:
  Target{partition: Nat, lifetime: Nat, round: Nat, operation: Nat, request: Nat}

# Absence also covers completed requests: terminal callbacks must not be rewritten.
def request(state: Canonical.State, target: Target) -> Maybe<&2, Dispatch.Request>:
  match state target:
    case Canonical.State{_, _, _, _, _, _, Dispatch.State{_, _, _, _, requests}, _, _} Target{p, l, r, o, id}:
      Dispatch.request_phase(requests, p, l, r, o, id)

def identity(p: Nat, l: Nat, r: Nat, o: Nat, id: Nat, target: Target) -> Bool:
  match target:
    case Target{tp, tl, tr, to, tid}:
      Dispatch.request_matches(Dispatch.Request{p, l, r, o, id, False{}, False{}}, tp, tl, tr, to, tid)

# Callback cancellation is scoped to the same complete production identity as
# applicability. Other events and another request's callbacks are untouched.
def callback(event: Canonical.CanonicalEvent, target: Target) -> Bool:
  match event:
    case Canonical.JevRequestStarted{p, l, r, o, id}: identity(p, l, r, o, id, target)
    case Canonical.JevRequestInterrupted{p, l, r, o, id}: identity(p, l, r, o, id, target)
    case Canonical.JevRequestSettled{p, l, r, o, id, _, _}: identity(p, l, r, o, id, target)
    case _: False{}
