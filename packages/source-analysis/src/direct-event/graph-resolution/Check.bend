import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Resolve.bend as Resolve
import ./Failure.bend as ResolveOwner
import ./traversal/core.bend as Local
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

def checked(
  frame: Maybe<&2, T.ResolverFrame>,
  allowed: Bool,
  state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: ResolveOwner.malformed()
    case Some{frame}: Resolve.progressed(
      False{},
      state,
      S.advance(frame, Graph.PathChecked{allowed})
    )

def target(target: Maybe<&2, T.Target>, +state: T.ResolverState) -> Loop.Continuation:
  match target:
    case None{}: Resolve.invalid(state)
    case Some{T.BundledTarget{_, _, _}}: checked(S.state_frame(state), True{}, state)
    case Some{T.FileTarget{path, _, _}}: Loop.ServiceStep{
      S.request(state, T.CheckingTargetPath{}, T.AccessPath{path})
    }

def begin_frame(
  frame: Maybe<&2, T.ResolverFrame>,
  id: Nat,
  state: T.ResolverState
) -> Loop.Continuation:
  match frame:
    case None{}: ResolveOwner.malformed()
    case Some{frame}: target(Local.map_result(Maybe<&2, T.Target>,
      Map.get(Maybe<&2, T.Target>, None{}, S.frame_target_paths(frame), Nat.show(id))), state)

def begin(+state: T.ResolverState, id: Nat) -> Loop.Continuation:
  begin_frame(S.state_frame(state), id, state)

def access(outcome: T.AccessOutcome, +state: T.ResolverState) -> Loop.Continuation:
  match outcome:
    case T.AccessDenied{}: checked(S.state_frame(state), False{}, state)
    case T.AccessAllowed{_, _}: checked(S.state_frame(state), True{}, state)

def main() -> Unit:
  Unit{}
