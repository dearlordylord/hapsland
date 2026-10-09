import Base
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
  catalog: Map<&2, Maybe<&2, Core.Declaration>>
) -> Map<&2, Maybe<&2, Core.Declaration>>:
  match items:
    case []: catalog
    case DeclarationEntry{key, declaration} <> rest:
      declarations_go(
        rest,
        Map.set(&2, Maybe<&2, Core.Declaration>, catalog, key, Some{declaration})
      )

def imports_go(
  items: List<&2, ImportEntry>,
  catalog: Map<&2, Maybe<&2, Core.ImportBinding>>
) -> Map<&2, Maybe<&2, Core.ImportBinding>>:
  match items:
    case []: catalog
    case ImportEntry{key, binding} <> rest:
      imports_go(rest, Map.set(&2, Maybe<&2, Core.ImportBinding>, catalog, key, Some{binding}))

def identities_go(items: List<&2, String>, catalog: Map<&2, Bool>) -> Map<&2, Bool>:
  match items:
    case []: catalog
    case key <> rest: identities_go(rest, Map.set(&2, Bool, catalog, key, True{}))

def identities(items: List<&2, String>) -> Map<&2, Bool>:
  identities_go(items, MTip{})

def targets_go(
  items: List<&2, PathTargetsEntry>,
  catalog: Map<&2, Map<&2, Bool>>
) -> Map<&2, Map<&2, Bool>>:
  match items:
    case []: catalog
    case PathTargetsEntry{path, targets} <> rest:
      targets_go(rest, Map.set(&2, Map<&2, Bool>, catalog, path, identities(targets)))

def targets(items: List<&2, PathTargetsEntry>) -> Map<&2, Map<&2, Bool>>:
  targets_go(items, MTip{})

def facts(input: BoundaryFacts) -> Core.Facts:
  match input:
    case BoundaryFacts{aware, declarations, imports, supporting}:
      Core.Facts{
        aware,
        declarations_go(declarations, MTip{}),
        imports_go(imports, MTip{}),
        declarations_go(supporting, MTip{})
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

def state_visited(input: BoundaryState) -> Map<&2, Bool>:
  match input:
    case BoundaryState{visited, _, _, _, _, _, _}: identities(visited)

def state_budget(input: BoundaryState) -> Core.Budget:
  match input:
    case BoundaryState{_, targets, limits, max_targets, work, graph_work, max_depth}:
      budget(limits, targets, max_targets, work, graph_work, max_depth)
