import Base
import ./Own.bend as Own
import ./core.bend as Core

# Laws quantify ordered records, never arbitrary hand-built Map trees.
# Each fold uses Map.set from MTip: the final occurrence of a key wins.
# Artifact identities may repeat and prior budget counters may exceed limits.
type DeclarationEntry is Data:
  DeclarationEntry{key: String, declaration: Core.Declaration}

type ImportEntry is Data:
  ImportEntry{key: String, binding: Core.ImportBinding}

type PathTargetsEntry is Data:
  PathTargetsEntry{path: String, targets: List<&2, String>}

type BoundaryFacts is Data:
  BoundaryFacts{
    kind_aware: Bool,
    declarations: List<&2, DeclarationEntry>,
    imports: List<&2, ImportEntry>,
    supporting: List<&2, DeclarationEntry>
  }

def declarations_go(
  items: List<&2, DeclarationEntry>,
  catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Own.Dictionary<Maybe<&2, Core.Declaration>>:
  match items:
    case []: catalog
    case DeclarationEntry{key, declaration} <> rest:
      declarations_go(
        rest,
        Own.set(Maybe<&2, Core.Declaration>, catalog, key, Some{declaration})
      )

def imports_go(
  items: List<&2, ImportEntry>,
  catalog: Own.Dictionary<Maybe<&2, Core.ImportBinding>>
) -> Own.Dictionary<Maybe<&2, Core.ImportBinding>>:
  match items:
    case []: catalog
    case ImportEntry{key, binding} <> rest:
      imports_go(rest, Own.set(Maybe<&2, Core.ImportBinding>, catalog, key, Some{binding}))

def identities_go(items: List<&2, String>, catalog: Own.Dictionary<Bool>) -> Own.Dictionary<Bool>:
  match items:
    case []: catalog
    case key <> rest: identities_go(rest, Own.set(Bool, catalog, key, True{}))

def identities(items: List<&2, String>) -> Own.Dictionary<Bool>:
  identities_go(items, Own.DNil{})

def targets_go(
  items: List<&2, PathTargetsEntry>,
  catalog: Own.Dictionary<Own.Dictionary<Bool>>
) -> Own.Dictionary<Own.Dictionary<Bool>>:
  match items:
    case []: catalog
    case PathTargetsEntry{path, targets} <> rest:
      targets_go(rest, Own.set(Own.Dictionary<Bool>, catalog, path, identities(targets)))

def targets(items: List<&2, PathTargetsEntry>) -> Own.Dictionary<Own.Dictionary<Bool>>:
  targets_go(items, Own.DNil{})

def facts(input: BoundaryFacts) -> Core.Facts:
  match input:
    case BoundaryFacts{aware, declarations, imports, supporting}:
      Core.Facts{
        aware,
        declarations_go(declarations, Own.DNil{}),
        imports_go(imports, Own.DNil{}),
        declarations_go(supporting, Own.DNil{})
      }

def budget(limits: Core.LocalLimits, prior_targets: List<&2, PathTargetsEntry>,
    max_targets: Nat, work: Nat, graph_work: Nat, max_depth: Nat) -> Core.Budget:
  Core.Budget{limits, targets(prior_targets), max_targets, work, graph_work, max_depth}

type BoundaryState is Data:
  BoundaryState{
    visited: List<&2, String>,
    targets: List<&2, PathTargetsEntry>,
    limits: Core.LocalLimits,
    max_targets: Nat,
    work: Nat,
    graph_work: Nat,
    max_depth: Nat
  }

def state_visited(input: BoundaryState) -> Own.Dictionary<Bool>:
  match input:
    case BoundaryState{visited, _, _, _, _, _, _}: identities(visited)

def state_budget(input: BoundaryState) -> Core.Budget:
  match input:
    case BoundaryState{_, targets, limits, max_targets, work, graph_work, max_depth}:
      budget(limits, targets, max_targets, work, graph_work, max_depth)

# Single host call performs normalization and the complete planner.
def bulk_plan(input: BoundaryFacts, +state: BoundaryState, path: String, name: String, expected: Core.ExpectedKind, depth: Nat) -> Core.RunResult:
  Core.plan(facts(input), path, name, expected, state_visited(state), state_budget(state), depth)
