import Base
import ./Types.bend as T
import ./Facts.bend as Syntax
import ./Composition.bend as Compose
import ./Core.bend as Materialize
import ../local-graph-draft/core.bend as Local
import ../../../packages/agent-flow-bend/ImportGraph.bend as Graph

# Root construction is pure. Runtime supplies syntax facts and measured bytes;
# Bend chooses the declaration, traverses it, registers edges and owns the frame.
type RootOutcome is Data:
  RootUnavailable{}
  RootPrepared{frame: T.ResolverFrame}
  RootTraversalFailure{machine: Local.Machine}
  RootMalformedSyntax{}

def expected(branch: T.Branch) -> Local.ExpectedKind:
  match branch:
    case T.TypeBranch{}: Local.AnyKind{}
    case T.FunctionBranch{}: Local.FunctionKind{}

def branch_key(branch: T.Branch) -> String:
  match branch:
    case T.TypeBranch{}: "type"
    case T.FunctionBranch{}: "function"

def initial_budget(+limits: Graph.Limits) -> Local.Budget:
  Local.Budget{
    Local.LocalLimits{Graph.work_cap(limits), Graph.depth_cap(limits), Graph.edge_cap(limits)},
    MTip{},
    0n,
    0n,
    0n,
    0n
  }

def permits(limits: Graph.Limits, budget: Local.Budget) -> Bool:
  match budget:
    case Local.Budget{_, _, targets, work, graph_work, depth}:
      Graph.local_budget(limits, work, depth, targets, graph_work)

def root_frame_registered(
  registration: Compose.RegisteredPending,
  +plan: Local.Plan,
  source: Syntax.PreparedFacts,
  +path: String,
  name: String,
  +branch: T.Branch,
  +limits: Graph.Limits,
  source_bytes: Nat,
  dependencies: List<&2, String>,
  identity: String
) -> T.ResolverFrame:
  match registration:
    case Compose.RegisteredPending{next_edge, _, pending}:
      match plan:
        case Local.Plan{root, +nodes, references, _, visited, budget}:
          match source:
            case Syntax.PreparedFacts{facts, exported, next_artifact, artifacts}:
              key = String.append(
                path,
                String.append("\0", String.append(branch_key(branch), String.append("\0", name)))
              )
              T.ResolverFrame{
                branch,
                limits,
                Graph.initial(limits),
                Graph.NoCommand{},
                dependencies,
                root,
                nodes,
                references,
                visited,
                budget,
                List.length(&2, Local.PlannedNode, nodes),
                next_edge,
                2n,
                next_artifact,
                pending,
                MTip{},
                Map.set(&2, Maybe<&2, Nat>, MTip{}, key, Some{1n}),
                Map.set(&2, Maybe<&2, String>, MTip{}, "1", Some{identity}),
                Map.set(
                  &2,
                  Maybe<&2, T.CapturedFacts>,
                  MTip{},
                  path,
                  Some{T.CapturedFacts{facts, exported, source_bytes}}
                ),
                artifacts
              }

def root_plan(result: Local.RunResult, source: Syntax.PreparedFacts, path: String,
    name: String, branch: T.Branch, +limits: Graph.Limits, source_bytes: Nat,
    dependencies: List<&2, String>, identity: String) -> RootOutcome:
  match result:
    case Local.CompletePlan{+plan}:
      match plan:
        case Local.Plan{_, _, _, pending, _, +budget}:
          yes : Unit -> RootOutcome = _ => RootPrepared{
            root_frame_registered(
              Compose.register_pending(pending, 1n, MTip{}),
              plan,
              source,
              path,
              name,
              branch,
              limits,
              source_bytes,
              dependencies,
              identity
            )
          }
          no : Unit -> RootOutcome = _ => RootUnavailable{}
          Materialize.decide(RootOutcome, permits(limits, budget), yes, no)
    case Local.MissingRoot{_, _}: RootUnavailable{}
    case Local.InvariantFailure{machine}: RootTraversalFailure{machine}

def root_decl(found: Maybe<&2, Local.Declaration>, +source: Syntax.PreparedFacts,
    +path: String, +name: String, +branch: T.Branch, +limits: Graph.Limits,
    source_bytes: Nat, dependencies: List<&2, String>) -> RootOutcome:
  match found:
    case None{}: RootUnavailable{}
    case Some{Local.Declaration{_, +identity, function, _, _}}:
      match source:
        case Syntax.PreparedFacts{facts, _, _, _}:
          root_plan(
            Local.plan(
              facts,
              path,
              name,
              Local.AnyKind{},
              Local.identity_entry(MTip{}, identity),
              initial_budget(limits),
              0n
            ),
            source,
            path,
            name,
            branch,
            limits,
            source_bytes,
            dependencies,
            identity
          )

def root_prepared(+source: Syntax.PreparedFacts, +path: String, +name: String,
    +branch: T.Branch, limits: Graph.Limits, source_bytes: Nat,
    dependencies: List<&2, String>) -> RootOutcome:
  match source:
    case Syntax.PreparedFacts{facts, _, _, _}:
      root_decl(
        Local.declaration_lookup(facts, name, expected(branch)),
        source,
        path,
        name,
        branch,
        limits,
        source_bytes,
        dependencies
      )

def from_syntax(source: Maybe<&2, Syntax.PreparedFacts>, path: String, name: String,
    branch: T.Branch, limits: Graph.Limits, source_bytes: Nat,
    dependencies: List<&2, String>) -> RootOutcome:
  match source:
    case None{}: RootMalformedSyntax{}
    case Some{facts}: root_prepared(facts, path, name, branch, limits, source_bytes, dependencies)

def prepare(source: T.SourceFacts, path: String, name: String, branch: T.Branch,
    limits: Graph.Limits, source_bytes: Nat, dependencies: List<&2, String>) -> RootOutcome:
  from_syntax(Syntax.prepare(source, 0n), path, name, branch, limits, source_bytes, dependencies)

def unit(frame: T.ResolverFrame) -> Maybe<&2, T.ProductValue>:
  match frame:
    case T.ResolverFrame{
      _,
      _,
      _,
      _,
      dependencies,
      root,
      nodes,
      references,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      artifacts
    }:
      Materialize.review_unit(root, nodes, references, artifacts, dependencies)

# IDs handed to Root are exactly those registered in the pending map, in order.
def root_edge_ids(count: Nat, +next: Nat) -> List<&2, Nat>:
  match count:
    case 0n: []
    case 1n++remaining: next <> root_edge_ids(remaining, (next + 1n : Nat))

def frame_transition(frame: T.ResolverFrame, transition: Graph.Step) -> T.ResolverFrame:
  match frame:
    case T.ResolverFrame{
      branch,
      limits,
      _,
      _,
      dependencies,
      root,
      nodes,
      references,
      visited,
      budget,
      next_node,
      next_edge,
      next_target,
      next_artifact,
      pending,
      paths,
      ids,
      targets,
      captured,
      artifacts
    }:
      match transition:
        case Graph.Step{graph, command}:
          T.ResolverFrame{
            branch,
            limits,
            graph,
            command,
            dependencies,
            root,
            nodes,
            references,
            visited,
            budget,
            next_node,
            next_edge,
            next_target,
            next_artifact,
            pending,
            paths,
            ids,
            targets,
            captured,
            artifacts
          }

def initialize(+frame: T.ResolverFrame, source_bytes: Nat, tree_bytes: Nat) -> T.ResolverFrame:
  match frame:
    case T.ResolverFrame{
      _,
      _,
      graph,
      _,
      _,
      _,
      _,
      _,
      _,
      budget,
      _,
      next_edge,
      _,
      _,
      _,
      _,
      _,
      _,
      _,
      _
    }:
      match budget:
        case Local.Budget{_, _, _, work, _, _}:
          frame_transition(
            frame,
            Graph.step(
              graph,
              Graph.Root{
                1n,
                source_bytes,
                tree_bytes,
                work,
                root_edge_ids(Nat.sub(next_edge, 1n), 1n)
              }
            )
          )

def main() -> Unit:
  Unit{}
