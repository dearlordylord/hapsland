import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_COMPLETION.bend as Complete
import ./NUMERIC_SPEC_COMPLETION_RANK.bend as Payload

# A budget-only change preserves the full child allowance.
law allowance_visited_exact:
  for +facts: Core.Facts
  for +before: Spec.State
  for +after: Spec.State
  for same: {Measure.visited(after) == Measure.visited(before) : Own.Dictionary<Bool>}
  {Complete.allowance(facts, after) == Complete.allowance(facts, before) : Nat}

# Actual selected unseen child has no reentry charge.
law unseen_root_rank_exact:
  for +facts: Core.Facts
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, name, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for absent: {
    Own.contains(Bool, Measure.visited(state), Core.declaration_identity(declaration))
    == False{}
    : Bool
  }
  {
    Measure.root_rank(facts, name, expected, Measure.visited(state))
    == Complete.allowance(facts, state)
    : Nat
  }

# Entering the selected root accounts for its children, whether already visited or new.
law selected_root_inventory_drop:
  for +seen: Bool
  for +facts: Core.Facts
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +path: Nat
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, name, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for tested: {
    Own.contains(Bool, Measure.visited(state), Core.declaration_identity(declaration))
    == seen
    : Bool
  }
  {
    Nat.is_le(
      (Measure.unseen(
        facts,
        Own.set(Bool, Measure.visited(state), Core.declaration_identity(declaration), True{})
      ) + Core.declaration_reference_count(Some{declaration}) : Nat),
      (Measure.unseen(
        facts,
        Measure.visited(state)
      ) + Measure.reentry_if(seen, Payload.children(declaration)) : Nat)
    )
    == True{}
    : Bool
  }

# Scalar bound for the full selected-root request-to-children step.
law root_score_decreases:
  for +after: Nat
  for +count: Nat
  for +before: Nat
  for +reentry: Nat
  for drop: {Nat.is_le((after + count : Nat), (before + reentry : Nat)) == True{} : Bool}
  {
    Nat.is_le((3n * after + 3n * count + 1n + 1n : Nat), (3n * (before + reentry : Nat) + 3n : Nat))
    == True{}
    : Bool
  }

# Entire actual children request consumes at least one unit of root request rank.
law root_children_rank_decreases:
  for +facts: Core.Facts
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +path: Nat
  for +depth: Nat
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, name, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      (Measure.request_rank(
        Spec.ReferencesRequest{
          Payload.children(declaration),
          facts,
          path,
          Spec.address(state),
          0n,
          depth,
          Spec.enter(state, path, Core.declaration_identity(declaration))
        }
      ) + 1n : Nat),
      Measure.root_rank(facts, name, expected, Measure.visited(state))
    )
    == True{}
    : Bool
  }

# Every root or references request has positive rank, including empty raw catalogs.
law request_rank_positive:
  for +request: Spec.Request
  {Nat.is_le(1n, Measure.request_rank(request)) == True{} : Bool}

# A nonempty parent references bound covers one complete reference and its child.
law reference_head_allowance:
  for +before: Nat
  for +count: Nat
  for +fuel: Nat
  for enough: {
    Nat.is_le((3n * before + 3n * (1n + count : Nat) + 1n : Nat), (1n + fuel : Nat))
    == True{}
    : Bool
  }
  {Nat.is_le((3n * before + 3n : Nat), fuel) == True{} : Bool}

# Actual returned state with nonincreasing unseen weight covers the remaining siblings.
law reference_sibling_bound:
  for +after: Nat
  for +before: Nat
  for +count: Nat
  for +fuel: Nat
  for drop: {Nat.is_le(after, before) == True{} : Bool}
  for enough: {
    Nat.is_le((3n * before + 3n * (1n + count : Nat) + 1n : Nat), (1n + fuel : Nat))
    == True{}
    : Bool
  }
  {Nat.is_le((3n * after + 3n * count + 1n : Nat), fuel) == True{} : Bool}
