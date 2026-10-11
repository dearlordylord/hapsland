import Base
import ./AttachmentCatalogValidation.bend as Catalog
import ./AttachmentFrameView.bend as V
import ./RetainedForestProjection.bend as P
import ./ForestRelation.bend as Relation
import ../SourceValidationSpecification.bend as Validation
import ../State.bend as S
import ../Types.bend as T
import ../ForestSpecification.bend as F
import ../traversal/core.bend as Local

# Actual view reads only the actual frame and erased chronology. It never reads
# a reference frame or calls a policy/correctness function supplied by a caller.
def string_count(items: List<&2, String>, +key: String) -> Nat:
  match items:
    case []: 0n
    case head <> tail:
      (Bool.pick(Nat, String.eq(head, key), 1n, 0n) + string_count(tail, key) : Nat)

def strings_unique(items: List<&2, String>, +all: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail:
      Bool.and(Nat.is_eq(string_count(all, head), 1n), strings_unique(tail, all))

def nat_count(items: List<&2, Nat>, +key: Nat) -> Nat:
  match items:
    case []: 0n
    case head <> tail:
      (Bool.pick(Nat, Nat.is_eq(head, key), 1n, 0n) + nat_count(tail, key) : Nat)

def nats_unique(items: List<&2, Nat>, +all: List<&2, Nat>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail:
      Bool.and(Nat.is_eq(nat_count(all, head), 1n), nats_unique(tail, all))

def catalog_valid(items: List<&2, T.ArtifactEntry>) -> Bool:
  Catalog.catalog_valid(items)

def dense(items: List<&2, Local.PlannedNode>, +next: Nat) -> Bool:
  match items:
    case []: True{}
    case Local.PlannedNode{id, _} <> tail:
      Bool.and(Nat.is_eq(id, next), dense(tail, (next + 1n : Nat)))

def order_valid(order: V.Order) -> Bool:
  match order:
    case V.Order{+pending, +targets, +ids, +captured, +identities, +visited}:
      Bool.and(nats_unique(pending, pending), Bool.and(nats_unique(targets, targets),
        Bool.and(strings_unique(ids, ids), Bool.and(strings_unique(captured, captured),
          Bool.and(nats_unique(identities, identities), strings_unique(visited, visited))))))

def coverage(+order: V.Order, +frame: T.ResolverFrame) -> Bool:
  match order:
    case V.Order{pending, targets, ids, captured, identities, visited}:
      Bool.and(
        order_valid(order),
        Bool.and(
          Nat.is_eq(
            List.length(&2, Nat, pending),
            List.length(&2, String, Map.keys(&2, Maybe<&2, Local.Pending>, S.frame_pending(frame)))
          ),
          Bool.and(
            Nat.is_eq(
              List.length(&2, Nat, targets),
              List.length(
                &2,
                String,
                Map.keys(&2, Maybe<&2, T.Target>, S.frame_target_paths(frame))
              )
            ),
            Bool.and(
              Nat.is_eq(
                List.length(&2, String, ids),
                List.length(&2, String, Map.keys(&2, Maybe<&2, Nat>, S.frame_target_ids(frame)))
              ),
              Bool.and(
                Nat.is_eq(
                  List.length(&2, String, captured),
                  List.length(
                    &2,
                    String,
                    Map.keys(&2, Maybe<&2, T.CapturedFacts>, S.frame_captured(frame))
                  )
                ),
                Bool.and(
                  Nat.is_eq(
                    List.length(&2, Nat, identities),
                    List.length(
                      &2,
                      String,
                      Map.keys(&2, Maybe<&2, String>, S.frame_target_artifacts(frame))
                    )
                  ),
                  Nat.is_eq(
                    List.length(&2, String, visited),
                    List.length(&2, String, Map.keys(&2, Bool, S.frame_visited(frame)))
                  )
                )
              )
            )
          )
        )
      )

def pending_entry(id: Nat, value: Maybe<&2, V.PendingPayload>,
    source: Maybe<&2, V.EdgeSource>) -> Maybe<&2, V.PendingEntry>:
  match value source:
    case Some{payload} Some{V.EdgeSource{_, facts, catalog}}:
      Some{V.PendingEntry{id, payload, facts, catalog}}
    case _ _: None{}

def pending_value(
  value: Maybe<&2, Local.Pending>,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, V.PendingPayload>:
  match value:
    case Some{payload}: V.pending_payload(payload, addresses)
    case None{}: None{}

def target_payload(
  value: Maybe<&2, V.PendingPayload>,
  target: T.Target
) -> Maybe<&2, V.TargetPayload>:
  match value target:
    case Some{edge} T.FileTarget{path, name, _}: Some{V.FileTarget{path, name, edge}}
    case Some{edge} T.BundledTarget{declaration, facts, _}: Some{
      V.BundledTarget{declaration, facts, edge}
    }
    case _ _: None{}

def target_value(
  value: Maybe<&2, T.Target>,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, V.TargetPayload>:
  match value:
    case Some{+target}:
      match target:
        case T.FileTarget{_, _, edge}: target_payload(V.pending_payload(edge, addresses), target)
        case T.BundledTarget{_, _, edge}: target_payload(V.pending_payload(edge, addresses), target)
    case None{}: None{}

def target_entry(id: Nat, value: Maybe<&2, V.TargetPayload>) -> Maybe<&2, V.TargetEntry>:
  match value:
    case Some{payload}: Some{V.TargetEntry{id, payload}}
    case None{}: None{}

def id_entry(key: String, value: Maybe<&2, Nat>) -> Maybe<&2, V.TargetId>:
  match value:
    case Some{id}: Some{V.TargetId{key, id}}
    case None{}: None{}

def captured_entry(
  path: String,
  value: Maybe<&2, T.CapturedFacts>,
  source: Maybe<&2, V.CaptureSource>
) -> Maybe<&2, V.CapturedEntry>:
  match value source:
    case Some{facts} Some{V.CaptureSource{_, original, _}}: Some{
      V.CapturedEntry{path, facts, original}
    }
    case _ _: None{}

def identity_entry(id: Nat, value: Maybe<&2, String>) -> Maybe<&2, V.TargetArtifact>:
  match value:
    case Some{text}: Some{V.TargetArtifact{id, text}}
    case None{}: None{}

def visited_entry(key: String, value: Bool) -> Maybe<&2, String>:
  match value:
    case True{}: Some{key}
    case False{}: None{}

def pending_prefix(
  item: Maybe<&2, V.PendingEntry>,
  rest: Maybe<&2, List<&2, V.PendingEntry>>
) -> Maybe<&2, List<&2, V.PendingEntry>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def pending(
  order: List<&2, Nat>,
  +entries: Map<&2, Maybe<&2, Local.Pending>>,
  +sources: List<&2, V.EdgeSource>,
  +addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, List<&2, V.PendingEntry>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      pending_prefix(
        pending_entry(
          head,
          pending_value(
            Local.map_result(
              Maybe<&2, Local.Pending>,
              Map.get(Maybe<&2, Local.Pending>, None{}, entries, Nat.show(head))
            ),
            addresses
          ),
          V.edge_at(sources, head)
        ),
        pending(tail, entries, sources, addresses)
      )

def targets_prefix(
  item: Maybe<&2, V.TargetEntry>,
  rest: Maybe<&2, List<&2, V.TargetEntry>>
) -> Maybe<&2, List<&2, V.TargetEntry>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def targets(
  order: List<&2, Nat>,
  +entries: Map<&2, Maybe<&2, T.Target>>,
  +addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, List<&2, V.TargetEntry>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      targets_prefix(
        target_entry(
          head,
          target_value(
            Local.map_result(
              Maybe<&2, T.Target>,
              Map.get(Maybe<&2, T.Target>, None{}, entries, Nat.show(head))
            ),
            addresses
          )
        ),
        targets(tail, entries, addresses)
      )

def ids_prefix(
  item: Maybe<&2, V.TargetId>,
  rest: Maybe<&2, List<&2, V.TargetId>>
) -> Maybe<&2, List<&2, V.TargetId>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def ids(
  order: List<&2, String>,
  +entries: Map<&2, Maybe<&2, Nat>>
) -> Maybe<&2, List<&2, V.TargetId>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      ids_prefix(
        id_entry(
          head,
          Local.map_result(Maybe<&2, Nat>, Map.get(Maybe<&2, Nat>, None{}, entries, head))
        ),
        ids(tail, entries)
      )

def captured_prefix(
  item: Maybe<&2, V.CapturedEntry>,
  rest: Maybe<&2, List<&2, V.CapturedEntry>>
) -> Maybe<&2, List<&2, V.CapturedEntry>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def captured(
  order: List<&2, String>,
  +entries: Map<&2, Maybe<&2, T.CapturedFacts>>,
  +sources: List<&2, V.CaptureSource>
) -> Maybe<&2, List<&2, V.CapturedEntry>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      captured_prefix(
        captured_entry(
          head,
          Local.map_result(
            Maybe<&2, T.CapturedFacts>,
            Map.get(Maybe<&2, T.CapturedFacts>, None{}, entries, head)
          ),
          V.capture_at(sources, head)
        ),
        captured(tail, entries, sources)
      )

def identities_prefix(
  item: Maybe<&2, V.TargetArtifact>,
  rest: Maybe<&2, List<&2, V.TargetArtifact>>
) -> Maybe<&2, List<&2, V.TargetArtifact>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def identities(
  order: List<&2, Nat>,
  +entries: Map<&2, Maybe<&2, String>>
) -> Maybe<&2, List<&2, V.TargetArtifact>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      identities_prefix(
        identity_entry(
          head,
          Local.map_result(
            Maybe<&2, String>,
            Map.get(Maybe<&2, String>, None{}, entries, Nat.show(head))
          )
        ),
        identities(tail, entries)
      )

def visited_prefix(
  item: Maybe<&2, String>,
  rest: Maybe<&2, List<&2, String>>
) -> Maybe<&2, List<&2, String>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def visited(order: List<&2, String>, +entries: Map<&2, Bool>) -> Maybe<&2, List<&2, String>>:
  match order:
    case []: Some{[]}
    case +head <> tail:
      visited_prefix(
        visited_entry(head, Local.map_result(Bool, Map.get(Bool, False{}, entries, head))),
        visited(tail, entries)
      )

def frame_view(forest: Maybe<&2, F.Forest>,
    pending: Maybe<&2, List<&2, V.PendingEntry>>,
    targets: Maybe<&2, List<&2, V.TargetEntry>>,
    ids: Maybe<&2, List<&2, V.TargetId>>,
    captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    identities: Maybe<&2, List<&2, V.TargetArtifact>>,
    visited: Maybe<&2, List<&2, String>>,
    frame: T.ResolverFrame, remaining: Nat, episode: Nat) -> Maybe<&2, V.Frame>:
  match forest pending targets ids captured identities visited frame:
    case Some{forest} Some{pending} Some{targets} Some{ids} Some{captured}
      Some{identities} Some{visited}
      T.ResolverFrame{branch, limits, graph, command, deps, _, _, _, _, budget,
        node, edge, target, artifact, _, _, _, _, _, artifacts}:
      Some{V.Frame{branch, limits, graph, command, deps, forest, pending, targets,
        ids, captured, identities, visited, V.actual_budget(budget), node, edge,
        target, artifact, artifacts, remaining, episode}}
    case _ _ _ _ _ _ _ _: None{}

def forest_valid(+forest: Maybe<&2, F.Forest>, episode: Nat) -> Maybe<&2, F.Forest>:
  match forest:
    case Some{value}:
      Bool.pick(Maybe<&2, F.Forest>, Relation.frame_forest(value, episode), forest, None{})
    case None{}: None{}

def projected(+frame: T.ResolverFrame, history: V.History) -> Maybe<&2, V.Frame>:
  match history:
    case V.History{+addresses, V.Order{pending_order, target_order, id_order,
        capture_order, identity_order, visited_order}, sources, captures, _, remaining, +episode}:
      frame_view(forest_valid(P.project(S.frame_root(frame), S.frame_nodes(frame),
          S.frame_references(frame), S.frame_artifacts(frame), addresses), episode),
        pending(pending_order, S.frame_pending(frame), sources, addresses),
        targets(target_order, S.frame_target_paths(frame), addresses),
        ids(id_order, S.frame_target_ids(frame)),
        captured(capture_order, S.frame_captured(frame), captures),
        identities(identity_order, S.frame_target_artifacts(frame)),
        visited(visited_order, S.frame_visited(frame)), frame, remaining, episode)

def validated(valid: Bool, frame: T.ResolverFrame, history: V.History) -> Maybe<&2, V.Frame>:
  match valid:
    case True{}: projected(frame, history)
    case False{}: None{}

def project(+frame: T.ResolverFrame, +history: V.History) -> Maybe<&2, V.Frame>:
  match history:
    case V.History{_, order, _, _, _, _, _}:
      validated(
        Bool.and(
          coverage(order, frame),
          Bool.and(
            dense(S.frame_nodes(frame), 0n),
            Bool.and(
              Nat.is_eq(
                S.frame_next_node(frame),
                List.length(&2, Local.PlannedNode, S.frame_nodes(frame))
              ),
              catalog_valid(S.frame_artifacts(frame))
            )
          )
        ),
        frame,
        history
      )

def main() -> Unit:
  Unit{}
