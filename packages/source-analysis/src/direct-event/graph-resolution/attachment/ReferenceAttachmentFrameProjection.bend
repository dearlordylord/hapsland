import Base
import ./AttachmentFrameView.bend as V
import ../Types.bend as T
import ../SPEC.bend as Root
import ../ForestSpecification.bend as F
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D
import ../SignedLocalSpecification.bend as Signed
import ../traversal/core.bend as Local
import ../traversal/Traversal.bend as LocalTraversal
import ../traversal/SPEC.bend as Recursive
import ../../../../../agent-flow-bend/ImportGraph.bend as G

# Independent reference observation. No actual frame/projection is consulted.
# History supplies erased allocation and capture provenance; coherence with each
# original source/catalog and uniqueness of that provenance remain relation
# obligations. Ordered reference associations are never sorted or reconstructed
# from the actual side. Missing required provenance/lookup returns None.
def prefix(-A: Data, head: Maybe<&2, A>, tail: Maybe<&2, List<&2, A>>) -> Maybe<&2, List<&2, A>>:
  match head tail:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def payload(value: F.Pending) -> V.PendingPayload:
  match value:
    case F.Pending{owner, Local.Pending{_, index, from, symbol, name, depth, expected, target}}:
      V.PendingPayload{owner, index, from, symbol, name, depth, expected, target}

def pending(items: List<&2, X.Edge>) -> List<&2, V.PendingEntry>:
  match items:
    case []: []
    case X.Edge{id, value, source, catalog} <> tail:
      V.PendingEntry{id, payload(value), source, catalog} <> pending(tail)

def edge_payload(edge: X.Edge) -> V.PendingPayload:
  match edge:
    case X.Edge{_, value, _, _}: payload(value)

def facts(catalog: Root.Source) -> Local.Facts:
  match catalog:
    case Root.Source{value, _, _}: value

def bundled(
  found: Maybe<&2, Local.Declaration>,
  catalog: Root.Source,
  edge: X.Edge
) -> Maybe<&2, V.TargetPayload>:
  match found:
    case Some{Local.Declaration{handle, _, _, _, _}}:
      Some{V.BundledTarget{handle, facts(catalog), edge_payload(edge)}}
    case None{}: None{}

def target(value: D.Target) -> Maybe<&2, V.TargetPayload>:
  match value:
    case D.FileTarget{path, name, edge}: Some{V.FileTarget{path, name, edge_payload(edge)}}
    case D.BundledTarget{T.FactDeclaration{key, _, _, _}, _, +catalog, edge}:
      bundled(LocalTraversal.supporting_lookup(facts(catalog), key), catalog, edge)

def target_entry(id: Nat, value: Maybe<&2, V.TargetPayload>) -> Maybe<&2, V.TargetEntry>:
  match value:
    case Some{value}: Some{V.TargetEntry{id, value}}
    case None{}: None{}

def targets(items: List<&2, D.TargetEntry>) -> Maybe<&2, List<&2, V.TargetEntry>>:
  match items:
    case []: Some{[]}
    case D.TargetEntry{id, value} <> tail:
      prefix(V.TargetEntry, target_entry(id, target(value)), targets(tail))

def ids(items: List<&2, D.TargetId>) -> List<&2, V.TargetId>:
  match items:
    case []: []
    case D.TargetId{key, id} <> tail: V.TargetId{key, id} <> ids(tail)

def exports(items: List<&2, T.FactDeclaration>, accumulated: Map<&2, Bool>) -> Map<&2, Bool>:
  match items:
    case []: accumulated
    case T.FactDeclaration{key, _, _, value} <> tail:
      exports(tail, Map.set(&2, Bool, accumulated, key, value))

def source_exports(source: T.SourceFacts) -> Map<&2, Bool>:
  match source:
    case T.SourceFacts{_, declarations, _, _}: exports(declarations, Map.new(&2, Bool))

def captured_entry(path: String, +source: T.SourceFacts, bytes: Nat,
    provenance: Maybe<&2, V.CaptureSource>) -> Maybe<&2, V.CapturedEntry>:
  match provenance:
    case Some{V.CaptureSource{_, _, catalog}}:
      Some{
        V.CapturedEntry{
          path,
          T.CapturedFacts{facts(catalog), source_exports(source), bytes},
          source
        }
      }
    case None{}: None{}

def captured(
  items: List<&2, X.Captured>,
  +sources: List<&2, V.CaptureSource>
) -> Maybe<&2, List<&2, V.CapturedEntry>>:
  match items:
    case []: Some{[]}
    case X.Captured{+path, source, bytes} <> tail:
      prefix(
        V.CapturedEntry,
        captured_entry(path, source, bytes, V.capture_at(sources, path)),
        captured(tail, sources)
      )

def identities(items: List<&2, X.TargetArtifact>) -> List<&2, V.TargetArtifact>:
  match items:
    case []: []
    case X.TargetArtifact{target, identity} <> tail:
      V.TargetArtifact{target, identity} <> identities(tail)

def visited_item(key: String, present: Bool) -> Maybe<&2, String>:
  match present:
    case True{}: Some{key}
    case False{}: None{}

def visited_entries(order: List<&2, String>, +values: Map<&2, Bool>) -> Maybe<&2, List<&2, String>>:
  match order:
    case []: Some{[]}
    case +key <> tail:
      prefix(
        String,
        visited_item(key, Local.map_result(Bool, Map.get(Bool, False{}, values, key))),
        visited_entries(tail, values)
      )

def string_count(items: List<&2, String>, +key: String) -> Nat:
  match items:
    case []: 0n
    case head <> tail:
      (Bool.pick(Nat, String.eq(head, key), 1n, 0n) + string_count(tail, key) : Nat)

def unique_strings(items: List<&2, String>, +all: List<&2, String>) -> Bool:
  match items:
    case []: True{}
    case +head <> tail:
      Bool.and(Nat.is_eq(string_count(all, head), 1n), unique_strings(tail, all))

def visited(+order: List<&2, String>, +values: Map<&2, Bool>) -> Maybe<&2, List<&2, String>>:
  Bool.pick(Maybe<&2, List<&2, String>>,
    Bool.and(unique_strings(order, order), Nat.is_eq(List.length(&2, String, order),
      List.length(&2, String, Map.keys(&2, Bool, values)))),
    visited_entries(order, values), None{})

def branch(context: T.FrontendContext) -> T.Branch:
  match context:
    case T.TypeScriptContext{value}: value
    case T.RustSourceContext{value, _}: value
    case T.BendSourceContext{value}: value
    case T.PythonSourceContext{value}: value

def node_count(forest: F.Forest) -> Nat:
  match forest:
    case F.Forest{_, nodes}: List.length(&2, F.Node, nodes)

def graph_limits(graph: G.Graph) -> G.Limits:
  match graph:
    case G.Graph{_, _, _, _, _, _, _, _, _, _, limits}: limits

def assembled(state: D.State, history: V.History,
    projected_targets: Maybe<&2, List<&2, V.TargetEntry>>,
    projected_captured: Maybe<&2, List<&2, V.CapturedEntry>>,
    projected_visited: Maybe<&2, List<&2, String>>) -> Maybe<&2, V.Frame>:
  match state history projected_targets projected_captured projected_visited:
    case D.State{D.Config{_, _, _, context, _, _},
      X.Frame{G.Bounded{+graph, remaining}, command, +forest,
        Signed.State{Recursive.State{_, budget, _, _}, signed}, edges, _, artifacts_by_target,
        next_edge, episode, next_artifact, dependencies}, _, target_ids, next_target, _, _, _}
      V.History{_, _, _, _, artifacts, _, _}
      Some{targets} Some{captures} Some{seen}:
      Some{V.Frame{branch(context), graph_limits(graph), graph, command, dependencies, forest,
        pending(edges), targets, ids(target_ids), captures, identities(artifacts_by_target),
        seen, V.budget(budget, signed), node_count(forest), next_edge,
        next_target, next_artifact, artifacts, remaining, episode}}
    case _ _ _ _ _: None{}

def project(+state: D.State, +history: V.History) -> Maybe<&2, V.Frame>:
  match state history:
    case D.State{_, X.Frame{_, _, _, Signed.State{Recursive.State{values, _, _, _}, _},
      _, captures, _, _, _, _, _}, target_values, _, _, _, _, _}
      V.History{_, V.Order{_, _, _, _, _, seen}, _, sources, _, _, _}:
      assembled(
        state,
        history,
        targets(target_values),
        captured(captures, sources),
        visited(seen, values)
      )

def main() -> Unit:
  Unit{}
