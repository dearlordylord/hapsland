import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./Failure.bend as ResolveOwner
import ./Root.bend as Root
import ./Composition.bend as Compose
import ./traversal/core.bend as Local

def bundled_target(target: Local.PendingTarget) -> Bool:
  match target:
    case Local.BundledTarget{_}: True{}
    case _: False{}

def bundled_edge(edge: Local.Pending) -> Bool:
  match edge:
    case Local.Pending{_, _, _, _, _, _, _, target}: bundled_target(target)

def bundled_optional(edge: Maybe<&2, Local.Pending>) -> Bool:
  match edge:
    case None{}: False{}
    case Some{edge}: bundled_edge(edge)

def bundled_state(state: T.ResolverState) -> Bool:
  bundled_optional(S.scratch_pending_edge(S.state_scratch(state)))

def edge_owner(edge: Local.Pending) -> Nat:
  match edge:
    case Local.Pending{owner, _, _, _, _, _, _, _}: owner

def edge_index(edge: Local.Pending) -> Nat:
  match edge:
    case Local.Pending{_, index, _, _, _, _, _, _}: index

def attached_frame(attachment: Compose.Attachment, frame: T.ResolverFrame) -> T.ResolverFrame:
  match attachment:
    case Compose.Attachment{_, next_node, next_edge, nodes, references, pending, _, _, budget}:
      S.with_frame_budget(
        S.with_frame_pending(
          S.with_frame_references(
            S.with_frame_nodes(
              S.with_frame_next_edge(S.with_frame_next_node(frame, next_node), next_edge),
              nodes
            ),
            references
          ),
          pending
        ),
        budget
      )

def request_candidate(product: Maybe<&2, T.ProductValue>, child: T.TentativeChild,
    ids: List<&2, Nat>, previous: Nat, +state: T.ResolverState) -> Loop.Continuation:
  match product:
    case None{}: ResolveOwner.malformed()
    case Some{+value}:
      match child:
        case T.TentativeChild{
          target,
          path,
          capture,
          source_bytes,
          file,
          artifact,
          identity,
          before,
          plan,
          _,
          _,
          _
        }:
          Loop.ServiceStep{
            S.request(
              S.with_state_scratch(
                state,
                S.with_scratch_tentative(
                  S.state_scratch(state),
                  Some{
                    T.TentativeChild{
                      target,
                      path,
                      capture,
                      source_bytes,
                      file,
                      artifact,
                      identity,
                      before,
                      plan,
                      previous,
                      value,
                      ids
                    }
                  }
                )
              ),
              T.MeasuringCandidateTree{},
              T.EncodeProduct{value}
            )
          }

def attachment(attachment: Maybe<&2, Compose.Attachment>, child: T.TentativeChild,
    previous: Nat, +state: T.ResolverState, frame: T.ResolverFrame) -> Loop.Continuation:
  match attachment:
    case None{}: ResolveOwner.malformed()
    case Some{+attachment}:
      match attachment:
        case Compose.Attachment{_, _, _, _, _, _, ids, _, _}:
          +updated = attached_frame(attachment, frame)
          request_candidate(
            Root.unit(updated),
            child,
            ids,
            previous,
            S.with_state_frame(state, Some{updated})
          )

def previous_child(+child: T.TentativeChild, +frame: T.ResolverFrame,
    +edge: Local.Pending, previous: Nat, +state: T.ResolverState) -> Loop.Continuation:
  match child:
    case T.TentativeChild{_, _, _, _, _, _, +identity, _, plan, _, _, _}:
      attachment(
        Compose.tentative_attachment(
          Compose.remap(plan, S.frame_next_node(frame)),
          S.frame_nodes(frame),
          S.frame_references(frame),
          edge_owner(edge),
          edge_index(edge),
          Bool.pick(
            Maybe<&2, String>,
            Bool.and(
              Bool.not(bundled_state(state)),
              Local.map_result(Bool, Map.get(Bool, False{}, S.frame_visited(frame), identity))
            ),
            Some{identity},
            None{}
          ),
          S.frame_next_edge(frame),
          S.frame_pending(frame)
        ),
        child,
        previous,
        state,
        frame
      )

def previous_parts(child: Maybe<&2, T.TentativeChild>, frame: Maybe<&2, T.ResolverFrame>,
    edge: Maybe<&2, Local.Pending>, previous: Nat, state: T.ResolverState) -> Loop.Continuation:
  match child frame edge:
    case Some{child} Some{frame} Some{edge}: previous_child(child, frame, edge, previous, state)
    case _ _ _: ResolveOwner.malformed()

def previous(bytes: Nat, +state: T.ResolverState) -> Loop.Continuation:
  previous_parts(S.scratch_tentative(S.state_scratch(state)), S.state_frame(state),
    S.scratch_pending_edge(S.state_scratch(state)), bytes, state)

def main() -> Unit:
  Unit{}
