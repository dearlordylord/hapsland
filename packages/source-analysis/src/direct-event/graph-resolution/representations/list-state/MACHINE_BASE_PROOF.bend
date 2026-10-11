import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank

import ./RANK_MACHINE.bend as Machine

# The complete rank depends exactly on the shared traversal projection.
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

# Updating observed budget state leaves the traversal Machine.projection unchanged.

law budget_preserves_projection:
  for +machine: Core.Machine
  for budget: Core.Budget
  {
    Machine.projection(Core.replace_budget(machine, budget))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# Exact five base projection statements; selected expansion is a separate proof.

def rank_from_projection(machine):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def catalog_from_projection(machine):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def reference_preserves_projection(machine, slot):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def pending_preserves_projection(machine, pending):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def budget_preserves_projection(machine, budget):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}
