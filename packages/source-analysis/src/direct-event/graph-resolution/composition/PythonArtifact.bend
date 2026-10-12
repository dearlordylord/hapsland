import Base
import ../Types.bend as T
import ../python-module/ArtifactProtocol.bend as P
import ../python-module/Session.bend as Python
import ../python-module/PreparationMachine.bend as Preparation
import ../python-module/InspectMachine.bend as Inspect
import ../python-module/ResolveImportMachine.bend as Import
import ../python-module/RevalidationMachine.bend as Revalidation

# Artifact-local state is retained behind invocation-owned opaque host handles.
# The host calls begin/resume/view; continuation decisions are child Bend code.
type Step is Data:
  Preparing{child: Preparation.Step}
  Inspecting{child: Inspect.Step}
  Resolving{child: Import.Step}
  Revalidating{child: Revalidation.Step}

def resolution(result: Maybe<&2, Import.Resolution>) -> Maybe<&2, P.Resolution>:
  match result:
    case None{}: None{}
    case Some{Import.Resolution{path, name}}: Some{P.Resolution{path, name}}

def preparation_request(state: Preparation.State, request: T.Request) -> P.PythonView:
  match state:
    case Preparation.State{_, _, next, _}: P.Await{request, None{}, next}

def preparation_view(child: Preparation.Step) -> P.PythonView:
  match child:
    case Preparation.Await{state, request}: preparation_request(state, request)
    case Preparation.Returned{None{}, next}: P.Returned{P.PreparationUnavailable{}, next}
    case Preparation.Returned{Some{Preparation.Prepared{session, cache}}, next}: P.Returned{
      P.Prepared{session, cache},
      next
    }
    case Preparation.Failed{failure}: P.Failed{failure, None{}, None{}}

def inspection_request(state: Inspect.State, request: T.Request) -> P.PythonView:
  match state:
    case Inspect.State{_, _, _, next, _}: P.Await{request, None{}, next}

def inspection_view(child: Inspect.Step) -> P.PythonView:
  match child:
    case Inspect.Await{state, request}: inspection_request(state, request)
    case Inspect.Returned{facts, next}: P.Returned{P.Inspected{facts}, next}
    case Inspect.Failed{failure}: P.Failed{failure, None{}, None{}}

def import_view(child: Import.Step) -> P.PythonView:
  match child:
    case Import.Await{+state, request}: P.Await{
      request,
      Some{Import.state_session(state)},
      Import.state_next_request(state)
    }
    case Import.Returned{session, result, next}: P.Returned{
      P.Resolved{session, resolution(result)},
      next
    }
    case Import.Failed{failure, session, next}: P.Failed{failure, Some{session}, Some{next}}

def revalidation_view(child: Revalidation.Step) -> P.PythonView:
  match child:
    case Revalidation.Await{+state, request}: P.Await{
      request,
      Some{Revalidation.state_session(state)},
      Revalidation.state_next_request(state)
    }
    case Revalidation.Returned{session, valid, next}: P.Returned{
      P.Revalidated{session, valid},
      next
    }
    case Revalidation.Failed{failure}: P.Failed{failure, None{}, None{}}

def view(step: Step) -> P.PythonView:
  match step:
    case Preparing{child}: preparation_view(child)
    case Inspecting{child}: inspection_view(child)
    case Resolving{child}: import_view(child)
    case Revalidating{child}: revalidation_view(child)

def begin(command: P.PythonCommand) -> Step:
  match command:
    case P.Prepare{
      root,
      capture,
      root_bytes,
      files,
      read_bytes,
      work,
      source_cap,
      depth,
      clock,
      invocation,
      caller_cache,
      next
    }:
      Preparing{Preparation.begin(Preparation.Input{root, capture, root_bytes, files, read_bytes,
        work, source_cap, depth, clock, invocation, caller_cache}, next)}
    case P.Inspect{branch, path, root, capture, invocation, next}:
      Inspecting{Inspect.begin(branch, path, root, capture, invocation, next)}
    case P.ResolveImport{
      session,
      remaining,
      from,
      module,
      member,
      root,
      clock,
      cache,
      separator,
      invocation,
      next
    }:
      Resolving{
        Import.begin(
          session,
          remaining,
          from,
          module,
          member,
          root,
          clock,
          cache,
          separator,
          invocation,
          next
        )
      }
    case P.Revalidate{session, remaining, clock, separator, invocation, next}:
      Revalidating{
        Revalidation.begin(
          Python.with_remaining(session, remaining),
          clock,
          separator,
          invocation,
          next
        )
      }

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Preparing{child}: Preparing{Preparation.resume(child, reply)}
    case Inspecting{child}: Inspecting{Inspect.resume(child, reply)}
    case Resolving{child}: Resolving{Import.resume(child, reply)}
    case Revalidating{child}: Revalidating{Revalidation.resume(child, reply)}

def main() -> Unit:
  Unit{}
