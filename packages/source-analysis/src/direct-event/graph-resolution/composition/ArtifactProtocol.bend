import Base
import ../Types.bend as T
import ../traversal/core.bend as Local
import ../python-module/ArtifactProtocol.bend as P

# Closed source-bearing child contract. Canonical receives only work identity
# and opaque result handles, never these payloads or syntax/session snapshots.
# State and provider leases have distinct identities; neither is request ID.
type StateHandle is Data:
  StateHandle{invocation: Nat, id: Nat}
type ProviderLease is Data:
  ProviderLease{invocation: Nat, id: Nat}


def main() -> Unit:
  Unit{}

# Closed generic machine return continuations; host never decides which one.
type ParentAction is Data:
  RootBudget{state: T.ResolverState}
  RootInspected{state: T.ResolverState, outcome: T.SourceOutcome}
  TargetInspected{state: T.ResolverState, outcome: T.SourceOutcome}
  ImportResolved{state: T.ResolverState, edge: Local.Pending, result: Maybe<&2, P.Resolution>}
  PythonUnresolved{state: T.ResolverState}
  Iteration{state: T.ResolverState}
  CaptureAdmitted{state: T.ResolverState, cached: T.CacheOutcome}
  CaptureFinished{state: T.ResolverState, outcome: T.CaptureOutcome}
  CaptureRefused{state: T.ResolverState}
  Deadline{state: T.ResolverState}
  Unavailable{}
  Failure{failure: T.TechnicalFailure}
  Publish{result: T.ResolverStep}
