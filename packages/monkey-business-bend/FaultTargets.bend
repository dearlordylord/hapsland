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
