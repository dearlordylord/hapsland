import Base
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/ArtifactProtocol.bend as GoProtocol
import ../../../../../source-analysis/src/direct-event/graph-resolution/Protocol.bend as Protocol
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/Configuration.bend as Configuration
import ../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/PreparationMachine.bend as Preparation
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/PreparationModel.bend as M
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/Package.bend as Package

# The artifact owns only pure Go child progression/projection. Invocation,
# generation, provider leases, interruption and resource disposal remain with
# the existing Canonical composition owner and its shared mechanical driver.
type Step is Data:
  Configuring{input: M.Input, request: T.Request}
  Preparing{child: Preparation.Step}
  Inspected{facts: Maybe<&2, T.SourceFacts>, next: Nat}

def declarations(items: List<&2, M.BoundDeclaration>) -> List<&2, T.FactDeclaration>:
  match items:
    case []: []
    case M.BoundDeclaration{
      key,
      Package.Declaration{T.FactDeclaration{_, artifact, references, exported}, _}
    } <> tail:
      T.FactDeclaration{key, artifact, references, exported} <> declarations(tail)

# Package-qualified keys select declarations; artifact identities and reference
# display symbols stay untouched. Locations remain in the retained Prepared
# value; native resolver inspection consumes the facts projected here.
def inspected(
  same_root: Bool,
  branch: T.Branch,
  items: List<&2, M.BoundDeclaration>,
  next: Nat
) -> Step:
  match same_root branch:
    case True{} T.TypeBranch{}: Inspected{
      Some{T.SourceFacts{None{}, declarations(items), [], []}},
      next
    }
    case _ _: Inspected{None{}, next}

def inspect(prepared: M.Prepared, path: String, branch: T.Branch, next: Nat) -> Step:
  match prepared:
    case M.Prepared{root, declarations, _, _, _}: inspected(
      String.eq(root, path),
      branch,
      declarations,
      next
    )

def preparation_await(state: Preparation.State, request: T.Request) -> GoProtocol.GoView:
  match state:
    case Preparation.State{runtime, _}: GoProtocol.GoAwait{request, M.next_request(runtime)}

def preparation_returned(prepared: Maybe<&2, M.Prepared>, next: Nat) -> GoProtocol.GoView:
  match prepared:
    case None{}: GoProtocol.GoReturned{GoProtocol.GoUnavailable{}, next}
    case Some{prepared}: GoProtocol.GoReturned{GoProtocol.GoPrepared{prepared}, next}

def preparation_view(child: Preparation.Step) -> GoProtocol.GoView:
  match child:
    case Preparation.Internal{_}: GoProtocol.GoContinue{}
    case Preparation.Await{state, request}: preparation_await(state, request)
    case Preparation.Returned{prepared, next}: preparation_returned(prepared, next)
    case Preparation.Failed{failure, next}: GoProtocol.GoFailed{failure, next}

def configuration_next(request: T.Request) -> Nat:
  match request:
    case T.Request{_, id, _}: Nat.add(id, 1n)

def configuration_view(+request: T.Request) -> GoProtocol.GoView:
  GoProtocol.GoAwait{request, configuration_next(request)}

def configured(
  input: M.Input,
  next: Nat,
  configuration: Maybe<&2, Configuration.Configuration>
) -> Step:
  match input:
    case M.Input{owner, _, path, capture, bytes, branch, clock, cache, limits, _, identity}:
      Preparing{
        Preparation.initial(
          M.Input{
            owner,
            next,
            path,
            capture,
            bytes,
            branch,
            clock,
            cache,
            limits,
            configuration,
            identity
          }
        )
      }

def configuration_result(outcome: T.ServiceOutcome, input: M.Input, next: Nat) -> Step:
  match outcome:
    case T.GoConfigurationRead{configuration}: configured(input, next, configuration)
    case T.ProviderRejected{exception}: Preparing{
      Preparation.Failed{T.ForeignProviderFailure{exception}, next}
    }
    case _: Preparing{Preparation.Failed{T.MalformedReply{}, next}}

def configuration_reply(checked: Protocol.CheckedReply, input: M.Input, next: Nat) -> Step:
  match checked:
    case Protocol.CheckedOutcome{outcome}: configuration_result(outcome, input, next)
    case Protocol.RejectedReply{failure}: Preparing{Preparation.Failed{failure, next}}

def prepare(+input: M.Input) -> Step:
  match input:
    case M.Input{_, _, _, _, _, T.FunctionBranch{}, _, _, _, _, _}: Preparing{
      Preparation.initial(input)
    }
    case M.Input{+owner, +next, _, _, _, T.TypeBranch{}, _, _, _, _, _}: Configuring{
      input,
      T.Request{owner, next, T.ReadGoConfiguration{}}
    }

def view(step: Step) -> GoProtocol.GoView:
  match step:
    case Configuring{_, request}: configuration_view(request)
    case Preparing{child}: preparation_view(child)
    case Inspected{facts, next}: GoProtocol.GoReturned{GoProtocol.GoInspected{facts}, next}

def begin(command: GoProtocol.GoCommand) -> Step:
  match command:
    case GoProtocol.GoPrepare{input}: prepare(input)
    case GoProtocol.GoInspect{prepared, path, branch, next}: inspect(prepared, path, branch, next)

def advance(step: Step) -> Step:
  match step:
    case Preparing{Preparation.Internal{state}}: Preparing{Preparation.advance(state)}
    case step: step

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Configuring{input, +request}: configuration_reply(
      Protocol.check(request, reply),
      input,
      configuration_next(request)
    )
    case Preparing{child}: Preparing{Preparation.resume(child, reply)}
    case Inspected{_, next}: Preparing{Preparation.Failed{T.ReplyAfterTerminal{}, next}}

def main() -> Unit:
  Unit{}
