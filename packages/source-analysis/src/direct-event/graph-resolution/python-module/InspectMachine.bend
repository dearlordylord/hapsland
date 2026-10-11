import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ./Authority.bend as Authority

# GraphSession.inspect admission. Extraction remains an explicit intermediate
# boundary; parsing/import authority and flow decisions belong to Bend.
type Stage is Data:
  CheckingAuthority{}
  Inspecting{}
type State is Data:
  State{path: String, capture: T.CaptureToken, invocation: Nat, next: Nat, stage: Stage}
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{facts: Maybe<&2, T.SourceFacts>, next: Nat}
  Failed{failure: T.TechnicalFailure}

def request(path: String, capture: T.CaptureToken, +invocation: Nat, +next: Nat,
    stage: Stage, operation: T.Operation) -> Step:
  Await{State{path, capture, invocation, Nat.add(next, 1n), stage}, T.Request{invocation, next, operation}}

def inspect(allowed: Bool, +path: String, +capture: T.CaptureToken, invocation: Nat, next: Nat) -> Step:
  match allowed:
    case False{}: Returned{None{}, next}
    case True{}: request(path, capture, invocation, next, Inspecting{},
      T.InspectSource{path, capture, T.PythonSourceContext{T.TypeBranch{}}})

def imports_allowed(imports: Maybe<&2, List<&2, Authority.Import>>, path: String, capture: T.CaptureToken,
    invocation: Nat, next: Nat) -> Step:
  match imports:
    case None{}: inspect(False{}, path, capture, invocation, next)
    case Some{_}: inspect(True{}, path, capture, invocation, next)

def frontend(result: T.SourceOutcome, next: Nat) -> Step:
  match result:
    case T.SourceUnsupported{}: Returned{None{}, next}
    case T.SourceInspected{facts}: Returned{Some{facts}, next}

def outcome(state: State, result: T.ServiceOutcome) -> Step:
  match state result:
    case State{path, capture, invocation, next, CheckingAuthority{}} T.PythonSyntaxResult{syntax}:
      imports_allowed(Authority.python_imports(syntax), path, capture, invocation, next)
    case State{_, _, _, next, Inspecting{}} T.FrontendResult{result}: frontend(result, next)
    case _ T.ProviderRejected{exception}: Failed{T.ForeignProviderFailure{exception}}
    case _ _: Failed{T.MalformedReply{}}

def checked(state: State, reply: Protocol.CheckedReply) -> Step:
  match reply:
    case Protocol.RejectedReply{failure}: Failed{failure}
    case Protocol.CheckedOutcome{result}: outcome(state, result)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{state, request}: checked(state, Protocol.check(request, reply))
    case _: Failed{T.MalformedReply{}}

def type_branch(root: Bool, +path: String, +capture: T.CaptureToken, invocation: Nat, next: Nat) -> Step:
  match root:
    case True{}: inspect(True{}, path, capture, invocation, next)
    case False{}: request(path, capture, invocation, next, CheckingAuthority{}, T.ParsePythonSyntax{capture})

def begin(branch: T.Branch, +path: String, root_path: String, capture: T.CaptureToken, invocation: Nat, next: Nat) -> Step:
  match branch:
    case T.TypeBranch{}: type_branch(String.eq(path, root_path), path, capture, invocation, next)
    case T.FunctionBranch{}: Returned{None{}, next}

def main() -> Unit:
  Unit{}
