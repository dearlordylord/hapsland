import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE.bend as Machine

# Exact step laws use the shared traversal projection owner.
law rank_from_projection:
  for +machine: Core.Machine
  {Rank.rank(machine) == Machine.projected_rank(Machine.projection(machine)) : Nat}

# Projection preserves the catalog used by the actual declaration lookup.
law catalog_from_projection:
  for +machine: Core.Machine
  {
    Rank.declaration_catalog(Core.machine_facts(machine))
    == Machine.projected_catalog(Machine.projection(machine))
    : Own.Dictionary<Maybe<&2, Core.Declaration>>
  }

# Adding ordered reference output leaves traversal state unchanged.
law reference_preserves_projection:
  for +machine: Core.Machine
  for slot: Core.ReferenceSlot
  {
    Machine.projection(Core.add_reference(machine, slot))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# Adding ordered pending output leaves traversal state unchanged.
law pending_preserves_projection:
  for +machine: Core.Machine
  for pending: Core.Pending
  {
    Machine.projection(Core.add_pending(machine, pending))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# Updating observed budget state leaves the traversal projection unchanged.
law budget_preserves_projection:
  for +machine: Core.Machine
  for budget: Core.Budget
  {
    Machine.projection(Core.replace_budget(machine, budget))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# A selected unseen child can increase rank by at most the one new frame.
law selected_expand_rank_bound:
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +key: Nat
  for owner: Nat
  for index: Nat
  for name: Core.Label
  for depth: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for absent: {
    Core.has_identity(Core.machine_visited(machine), Core.declaration_identity(declaration))
    == False{}
    : Bool
  }
  {
    Nat.is_le(
      Rank.rank(Core.expand_node(machine, declaration, owner, index, name, depth)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Processing a reference creates at most one frame, paid for by selected weight.
# The statement covers the entire production dispatch without copied policy logic.
law visit_reference_rank_bound:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for reference: Core.Reference
  {
    Nat.is_le(
      Rank.rank(Core.visit_reference(machine, owner, index, depth, reference)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Consuming a reference head reduces pending-reference rank by exactly two.
law consuming_reference_rank_exact:
  for +machine: Core.Machine
  for +owner: Nat
  for +depth: Nat
  for +index: Nat
  for reference: Core.Reference
  for +rest: List<&2, Core.Reference>
  {
    Rank.rank(Core.push_frame(machine, Core.Frame{owner, depth, index, reference <> rest}))
    == (Rank.rank(
      Core.push_frame(machine, Core.Frame{owner, depth, (index + 1n : Nat), rest})
    ) + 2n : Nat)
    : Nat
  }

# A nonterminal machine has positive rank because its frame count is positive.
law nonterminal_rank_positive:
  for +machine: Core.Machine
  for active: {Core.done(machine) == False{} : Bool}
  {Nat.is_lt(0n, Rank.rank(machine)) == True{} : Bool}
