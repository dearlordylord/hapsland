import Base
import ./Types.bend as T
import ./WholeObservation.bend as O
import ./GraphSpecification.bend as ReferenceGraph
import ./traversal/core.bend as Local
import ./traversal/SPEC.bend as Recursive
import ../../../../agent-flow-bend/ImportGraph.bend as Graph

# Independent whole specification under construction. The root/local part
# below uses the existing recursive specification, never production steps,
# Root/Facts/Composition/materialization or Rust policy implementations.
# Rust preparation, expansion and whole observation projection remain pending.
# This is not yet the fixed whole SPEC used by an approved equality law.
type Catalog is Data:
  Catalog{next: Nat, artifacts: List<&2, T.ArtifactEntry>,
    declarations: Map<&2, Maybe<&2, Local.Declaration>>}

type Source is Data:
  Source{facts: Local.Facts, next_artifact: Nat, artifacts: List<&2, T.ArtifactEntry>}

type PermitWork is Data:
  ConvertedGraphWork{work: Nat}
  NegativeWorkBoundary{magnitude: Nat}

type RejectedRoot is Data:
  RejectedRoot{tree: Recursive.Tree, source: Source}

type RootResult is Data:
  RootMissing{state: Maybe<&2, Recursive.State>, retained: Maybe<&2, RejectedRoot>}
  RootBuilt{state: Recursive.State, tree: Recursive.Tree, source: Source}
  EvaluationExhausted{state: Recursive.State}

def optional_bool(value: Maybe<&2, Bool>) -> Bool:
  match value:
    case None{}: False{}
    case Some{value}: value

def function_kind(kind: T.ArtifactKind) -> Bool:
  match kind:
    case T.FunctionArtifact{}: True{}
    case _: False{}

def origin_is_bundled(origin: Maybe<&2, T.BundledOrigin>) -> Bool:
  match origin:
    case None{}: False{}
    case Some{_}: True{}

def references(items: List<&2, T.FactReference>) -> List<&2, Local.Reference>:
  match items:
    case []: []
    case T.FactReference{kind, name, expected, target} <> tail:
      Local.Reference{kind, name, expected, target} <> references(tail)

def declaration(
  artifact: T.Artifact,
  refs: List<&2, T.FactReference>,
  handle: Nat
) -> Local.Declaration:
  match artifact:
    case T.Artifact{origin, _, id, kind, _, _, _, _}:
      Local.Declaration{
        handle,
        id,
        function_kind(kind),
        origin_is_bundled(origin),
        references(refs)
      }

# Catalog location is independent of origin. A supporting-map member with no
# bundled origin must remain invalid for bundled traversal, and vice versa.
# SourceFacts are the mechanically encoded frontend map domain: unique keys,
# complete artifacts and exact optional fields are binding obligations.
def catalog(
  items: List<&2, T.FactDeclaration>,
  +next: Nat,
  artifacts: List<&2, T.ArtifactEntry>,
  declarations: Map<&2, Maybe<&2, Local.Declaration>>
) -> Catalog:
  match items:
    case []: Catalog{next, List.reverse(&2, T.ArtifactEntry, artifacts), declarations}
    case T.FactDeclaration{key, +artifact, refs, _} <> tail:
      catalog(
        tail,
        (next + 1n : Nat),
        T.ArtifactEntry{next, artifact} <> artifacts,
        Map.set(
          &2,
          Maybe<&2, Local.Declaration>,
          declarations,
          key,
          Some{declaration(artifact, refs, next)}
        )
      )

def imports(items: List<&2, T.FactImport>) -> Map<&2, Maybe<&2, Local.ImportBinding>>:
  match items:
    case []: MTip{}
    case T.FactImport{key, path, name, type_only} <> tail:
      Map.set(&2, Maybe<&2, Local.ImportBinding>, imports(tail), key,
        Some{Local.ImportBinding{path, name, optional_bool(type_only)}})

def with_supporting(ordinary: Catalog, supporting: Catalog,
    bindings: Map<&2, Maybe<&2, Local.ImportBinding>>, aware: Bool) -> Source:
  match ordinary supporting:
    case Catalog{_, artifacts, declarations} Catalog{next, more_artifacts, supporting}:
      Source{Local.Facts{aware, declarations, bindings, supporting}, next,
        List.append(&2, T.ArtifactEntry, artifacts, more_artifacts)}

def after_ordinary(+ordinary: Catalog, supporting: List<&2, T.FactDeclaration>,
    bindings: Map<&2, Maybe<&2, Local.ImportBinding>>, aware: Bool) -> Source:
  match ordinary:
    case Catalog{next, _, _}:
      with_supporting(ordinary, catalog(supporting, next, [], MTip{}), bindings, aware)

def source(facts: T.SourceFacts, next_artifact: Nat) -> Source:
  match facts:
    case T.SourceFacts{aware, declarations, bindings, supporting}:
      after_ordinary(catalog(declarations, next_artifact, [], MTip{}), supporting,
        imports(bindings), optional_bool(aware))

def root_expected(branch: T.Branch) -> Local.ExpectedKind:
  match branch:
    case T.TypeBranch{}: Local.AnyKind{}
    case T.FunctionBranch{}: Local.FunctionKind{}

def local_limits(limits: Graph.Limits) -> Local.LocalLimits:
  match limits:
    case Graph.Limits{_, _, _, _, _, targets, depth, work}:
      Local.LocalLimits{work, depth, targets}

def initial_state(limits: Graph.Limits, identity: String) -> Recursive.State:
  Recursive.State{Map.set(&2, Bool, MTip{}, identity, True{}),
    Local.Budget{local_limits(limits), MTip{}, 0n, 0n, 0n, 0n}, 0n, []}

def admitted(budget: Local.Budget) -> Bool:
  match budget:
    case Local.Budget{Local.LocalLimits{work_cap, depth_cap, targets_cap}, _,
      maximum_targets, work, graph_work, depth}:
      Bool.and(Bool.not(Nat.is_gt(depth, depth_cap)),
        Bool.and(Bool.not(Nat.is_gt(maximum_targets, targets_cap)),
          Bool.not(Nat.is_gt((work + graph_work : Nat), work_cap))))

def root_admitted(
  allowed: Bool,
  state: Recursive.State,
  tree: Recursive.Tree,
  source: Source
) -> RootResult:
  match allowed:
    case False{}: RootMissing{Some{state}, Some{RejectedRoot{tree, source}}}
    case True{}: RootBuilt{state, tree, source}

def root_built(build: Recursive.Build, source: Source) -> RootResult:
  match build:
    case Recursive.Missing{state}: RootMissing{Some{state}, None{}}
    case Recursive.InsufficientBound{state}: EvaluationExhausted{state}
    case Recursive.Built{+state, tree}:
      root_admitted(admitted(Recursive.state_budget(state)), state, tree, source)

def root_declaration(found: Maybe<&2, Local.Declaration>, fuel: Nat, +source: Source,
    path: String, name: String, limits: Graph.Limits) -> RootResult:
  match found source:
    case None{} _: RootMissing{None{}, None{}}
    case Some{Local.Declaration{_, identity, _, _, _}} Source{facts, _, _}:
      root_built(
        Recursive.as_build(
          Recursive.interpret(
            fuel,
            Recursive.Request{
              facts,
              path,
              name,
              Local.AnyKind{},
              0n,
              initial_state(limits, identity)
            }
          )
        ),
        source
      )

# Native first selects the root by requested branch, then buildLocal traverses
# with its default expected kind. Preserve both steps on kind-aware Rust facts.
def root(fuel: Nat, +source: Source, +path: String, +name: String,
    branch: T.Branch, limits: Graph.Limits) -> RootResult:
  match source:
    case Source{facts, _, _}:
      root_declaration(Recursive.find_declaration(facts, name, root_expected(branch)),
        fuel, source, path, name, limits)

# Only call at the independently selected native permit boundary. Missing
# roots, unsupported references and invalid bundled facts can short-circuit
# without any permit call. This is conversion, not a traversal specification.
# The whole signed-work driver and original preceding effects remain pending;
# original Nat-domain recursive SPEC and its three obligations are unchanged.
def permit_work(graph_work: O.SignedNat) -> PermitWork:
  match graph_work:
    case O.Negative{0n}: ConvertedGraphWork{0n}
    case O.Negative{magnitude}: NegativeWorkBoundary{magnitude}
    case O.Nonnegative{work}: ConvertedGraphWork{work}

# Both independent Rust preparation and expansion will use this reference
# policy. Their service/worklist drivers and final projectors remain pending.
def initial_graph(limits: Graph.Limits) -> Graph.Graph:
  ReferenceGraph.initial(limits)

def graph_event(state: Graph.Graph, event: Graph.GraphEvent) -> Graph.Step:
  ReferenceGraph.transition(state, event)

def main() -> Unit:
  Unit{}
