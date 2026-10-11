import Base
import ./PreparationModel.bend as Go
import ../Types.bend as T

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
