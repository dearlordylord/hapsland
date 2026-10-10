import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_COMPLETION.bend as Complete
import ./NUMERIC_SPEC_COMPLETION_RANK.bend as Payload

# Finite actual rank expressions; conditional premises checked by the runner.
def allowance_after(facts: Core.Facts, state: Spec.State) -> Nat:
  Complete.allowance(facts, Spec.local_work(state))

def unseen_root_rank(facts: Core.Facts, name: Core.Label, expected: Core.ExpectedKind, state: Spec.State) -> Nat:
  Measure.root_rank(facts, name, expected, Measure.visited(state))

def root_inventory_drop(+facts: Core.Facts, state: Spec.State, +declaration: Core.Declaration, seen: Bool) -> Bool:
  +visited = Measure.visited(state)
  Nat.is_le((Measure.unseen(facts, Own.set(Bool, visited, Core.declaration_identity(declaration), True{})) + Core.declaration_reference_count(Some{declaration}) : Nat), (Measure.unseen(facts, visited) + Measure.reentry_if(seen, Payload.children(declaration)) : Nat))

def root_score_decreases(after: Nat, count: Nat, before: Nat, reentry: Nat) -> Bool:
  Nat.is_le((3n * after + 3n * count + 1n + 1n : Nat), (3n * (before + reentry : Nat) + 3n : Nat))

def root_children_rank_decreases(+facts: Core.Facts, name: Core.Label, expected: Core.ExpectedKind,
    +state: Spec.State, +path: Nat, depth: Nat, +declaration: Core.Declaration) -> Bool:
  Nat.is_le((Measure.request_rank(Spec.ReferencesRequest{Payload.children(declaration), facts, path, Spec.address(state), 0n, depth, Spec.enter(state, path, Core.declaration_identity(declaration))}) + 1n : Nat), Measure.root_rank(facts, name, expected, Measure.visited(state)))

def request_rank_positive(request: Spec.Request) -> Bool:
  Nat.is_le(1n, Measure.request_rank(request))

def reference_head_allowance(before: Nat, fuel: Nat) -> Bool:
  Nat.is_le((3n * before + 3n : Nat), fuel)

def reference_sibling_bound(after: Nat, count: Nat, fuel: Nat) -> Bool:
  Nat.is_le((3n * after + 3n * count + 1n : Nat), fuel)
