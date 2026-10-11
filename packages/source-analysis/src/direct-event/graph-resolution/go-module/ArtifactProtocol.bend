import Base
import ../../../../../agent-flow-bend/ImportGraph.bend as Graph
import ./Configuration.bend as Configuration
import ./Package.bend as Package
import ../Types.bend as T

type Input is Data:
  Input{
    invocation: Nat,
    next_request: Nat,
    root_path: String,
    root_capture: T.CaptureToken,
    root_bytes: Nat,
    branch: T.Branch,
    clock: T.ClockToken,
    caller_cache: Maybe<&2, T.CacheToken>,
    limits: Graph.Limits,
    configuration: Maybe<&2, Configuration.Configuration>,
    configuration_identity: Maybe<&2, String>
  }
type BoundDeclaration is Data:
  BoundDeclaration{key: String, declaration: Package.Declaration}
type Prepared is Data:
  Prepared{root_path: String, declarations: List<&2, BoundDeclaration>,
    dependencies: List<&2, String>, binding_fingerprint: String, limits: Graph.Limits}

# Go preparation retains its existing source-analysis session declaration owner.
# The extra Continue view asks only for another pure transition, never a host
# language-policy decision or a separately allocated Canonical invocation.
type GoCommand is Data:
  GoPrepare{input: Input}
  GoInspect{prepared: Prepared, path: String, branch: T.Branch, next: Nat}
type GoResult is Data:
  GoUnavailable{}
  GoPrepared{prepared: Prepared}
  GoInspected{facts: Maybe<&2, T.SourceFacts>}
type GoView is Data:
  GoContinue{}
  GoAwait{request: T.Request, next: Nat}
  GoReturned{result: GoResult, next: Nat}
  GoFailed{failure: T.TechnicalFailure, next: Nat}
