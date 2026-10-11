import Base
import ../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.bend as Local
import ../../../../../source-analysis/src/direct-event/graph-resolution/python-module/Session.bend as Python

# Closed source-bearing child contract. Canonical receives only work identity
# and opaque result handles, never these payloads or syntax/session snapshots.
# State and provider leases have distinct identities; neither is request ID.
type StateHandle is Data:
  StateHandle{invocation: Nat, id: Nat}
type ProviderLease is Data:
  ProviderLease{invocation: Nat, id: Nat}

type Resolution is Data:
  Resolution{path: String, name: String}
type PythonCommand is Data:
  Prepare{root: String, capture: T.CaptureToken, root_bytes: Nat, files: Nat,
    read_bytes: Nat, work: Nat, source_cap: Nat, depth: Nat, clock: T.ClockToken,
    invocation: Nat, caller_cache: Maybe<&2, T.CacheToken>, next: Nat}
  Inspect{branch: T.Branch, path: String, root: String, capture: T.CaptureToken,
    invocation: Nat, next: Nat}
  ResolveImport{session: Python.Session, remaining: Python.Remaining, from: String,
    module: String, member: String, root: String, clock: T.ClockToken,
    cache: T.CacheToken, separator: String, invocation: Nat, next: Nat}
  Revalidate{session: Python.Session, remaining: Python.Remaining, clock: T.ClockToken,
    separator: String, invocation: Nat, next: Nat}
type PythonResult is Data:
  PreparationUnavailable{}
  Prepared{session: Python.Session, cache: T.CacheToken}
  Inspected{facts: Maybe<&2, T.SourceFacts>}
  Resolved{session: Python.Session, result: Maybe<&2, Resolution>}
  Revalidated{session: Python.Session, valid: Bool}
type PythonView is Data:
  Await{request: T.Request, session: Maybe<&2, Python.Session>, next: Nat}
  Returned{result: PythonResult, next: Nat}
  Failed{failure: T.TechnicalFailure, session: Maybe<&2, Python.Session>, next: Maybe<&2, Nat>}

def main() -> Unit:
  Unit{}

# Closed generic machine return continuations; host never decides which one.
type ParentAction is Data:
  RootBudget{state: T.ResolverState}
  RootInspected{state: T.ResolverState, outcome: T.SourceOutcome}
  TargetInspected{state: T.ResolverState, outcome: T.SourceOutcome}
  ImportResolved{state: T.ResolverState, edge: Local.Pending, result: Maybe<&2, Resolution>}
  PythonUnresolved{state: T.ResolverState}
  Iteration{state: T.ResolverState}
  CaptureAdmitted{state: T.ResolverState, cached: T.CacheOutcome}
  CaptureFinished{state: T.ResolverState, outcome: T.CaptureOutcome}
  CaptureRefused{state: T.ResolverState}
  Deadline{state: T.ResolverState}
  Unavailable{}
  Failure{failure: T.TechnicalFailure}
  Publish{result: T.ResolverStep}
