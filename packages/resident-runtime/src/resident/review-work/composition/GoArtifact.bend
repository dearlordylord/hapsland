import Base
import ./ArtifactProtocol.bend as A
import ../../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/PreparationMachine.bend as Preparation
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/PreparationModel.bend as M
import ../../../../../source-analysis/src/direct-event/graph-resolution/go-module/Package.bend as Package

# The artifact owns only pure Go child progression/projection. Invocation,
# generation, provider leases, interruption and resource disposal remain with
# the existing Canonical composition owner and its shared mechanical driver.
type Step is Data:
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

def preparation_await(state: Preparation.State, request: T.Request) -> A.GoView:
  match state:
    case Preparation.State{runtime, _}: A.GoAwait{request, M.next_request(runtime)}

def preparation_returned(prepared: Maybe<&2, M.Prepared>, next: Nat) -> A.GoView:
  match prepared:
    case None{}: A.GoReturned{A.GoUnavailable{}, next}
    case Some{prepared}: A.GoReturned{A.GoPrepared{prepared}, next}

def preparation_view(child: Preparation.Step) -> A.GoView:
  match child:
    case Preparation.Internal{_}: A.GoContinue{}
    case Preparation.Await{state, request}: preparation_await(state, request)
    case Preparation.Returned{prepared, next}: preparation_returned(prepared, next)
    case Preparation.Failed{failure, next}: A.GoFailed{failure, next}

def view(step: Step) -> A.GoView:
  match step:
    case Preparing{child}: preparation_view(child)
    case Inspected{facts, next}: A.GoReturned{A.GoInspected{facts}, next}

def begin(command: A.GoCommand) -> Step:
  match command:
    case A.GoPrepare{input}: Preparing{Preparation.initial(input)}
    case A.GoInspect{prepared, path, branch, next}: inspect(prepared, path, branch, next)

def advance(step: Step) -> Step:
  match step:
    case Preparing{Preparation.Internal{state}}: Preparing{Preparation.advance(state)}
    case step: step

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Preparing{child}: Preparing{Preparation.resume(child, reply)}
    case Inspected{_, next}: Preparing{Preparation.Failed{T.ReplyAfterTerminal{}, next}}

def main() -> Unit:
  Unit{}
