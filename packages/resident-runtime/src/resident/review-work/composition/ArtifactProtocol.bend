import Base
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/PreparationModel.bend as Go
import ../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../../source-analysis/src/direct-event/graph-resolution/traversal/core.bend as Local
import ../../../../../source-analysis/src/direct-event/graph-resolution/python-module/ArtifactProtocol.bend as P

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

# Go preparation retains its existing source-analysis session declaration owner.
# The extra Continue view asks only for another pure transition, never a host
# language-policy decision or a separately allocated Canonical invocation.
type GoCommand is Data:
  GoPrepare{input: Go.Input}
  GoInspect{prepared: Go.Prepared, path: String, branch: T.Branch, next: Nat}
type GoResult is Data:
  GoUnavailable{}
  GoPrepared{prepared: Go.Prepared}
  GoInspected{facts: Maybe<&2, T.SourceFacts>}
type GoView is Data:
  GoContinue{}
  GoAwait{request: T.Request, next: Nat}
  GoReturned{result: GoResult, next: Nat}
  GoFailed{failure: T.TechnicalFailure, next: Nat}
