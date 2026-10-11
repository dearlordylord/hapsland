import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE.bend as Machine

# Equal traversal projections have equal ranks for arbitrary raw machines.
law projection_equal_rank:
  for +before: Core.Machine
  for +after: Core.Machine
  for same: {Machine.projection(after) == Machine.projection(before) : Machine.Traversal}
  {Rank.rank(after) == Rank.rank(before) : Nat}

# observe_machine_depth preserves traversal while changing output or budget.
law observe_machine_depth_preserves_projection:
  for +machine: Core.Machine
  for +depth: Nat
  {
    Machine.projection(Core.observe_machine_depth(machine, depth))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# charge_machine_work preserves traversal while changing output or budget.
law charge_machine_work_preserves_projection:
  for +machine: Core.Machine
  {
    Machine.projection(Core.charge_machine_work(machine))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# charge_machine_target preserves traversal while changing output or budget.
law charge_machine_target_preserves_projection:
  for +machine: Core.Machine
  for +key: Nat
  {
    Machine.projection(Core.charge_machine_target(machine, key))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# omit preserves traversal while changing output or budget.
law omit_preserves_projection:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +name: Core.Label
  for +reason: Core.Omission
  {
    Machine.projection(Core.omit(machine, owner, index, name, reason))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# include preserves traversal while changing output or budget.
law include_preserves_projection:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +name: Core.Label
  for +identity: Nat
  {
    Machine.projection(Core.include(machine, owner, index, name, identity))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# queue_import preserves traversal while changing output or budget.
law queue_import_preserves_projection:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +imported: Core.ImportBinding
  {
    Machine.projection(Core.queue_import(machine, owner, index, symbol, depth, expected, imported))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# import_by_kind preserves traversal while changing output or budget.
law import_by_kind_preserves_projection:
  for +expected: Core.ExpectedKind
  for +type_only: Bool
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +imported: Core.ImportBinding
  {
    Machine.projection(
      Core.import_by_kind(expected, type_only, machine, owner, index, symbol, depth, imported)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# import_present preserves traversal while changing output or budget.
law import_present_preserves_projection:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +imported: Maybe<&2, Core.ImportBinding>
  {
    Machine.projection(
      Core.import_present(machine, owner, index, symbol, depth, expected, imported)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# charge_if_local preserves traversal while changing output or budget.
law charge_if_local_preserves_projection:
  for +local: Maybe<&2, Core.Declaration>
  for +machine: Core.Machine
  {
    Machine.projection(Core.charge_if_local(local, machine))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_queue preserves traversal while changing output or budget.
law bundled_queue_preserves_projection:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +declaration: Core.Declaration
  {
    Machine.projection(
      Core.bundled_queue(machine, owner, index, symbol, depth, expected, declaration)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_materialize preserves traversal while changing output or budget.
law bundled_materialize_preserves_projection:
  for +visited: Bool
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_materialize(visited, machine, declaration, owner, index, symbol, depth, expected)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_budget preserves traversal while changing output or budget.
law bundled_budget_preserves_projection:
  for +allowed: Bool
  for +visited: Bool
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_budget(
        allowed,
        visited,
        machine,
        declaration,
        owner,
        index,
        symbol,
        depth,
        expected
      )
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# charge_if_visited preserves traversal while changing output or budget.
law charge_if_visited_preserves_projection:
  for +visited: Bool
  for +machine: Core.Machine
  {
    Machine.projection(Core.charge_if_visited(visited, machine))
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_charged preserves traversal while changing output or budget.
law bundled_charged_preserves_projection:
  for +machine: Core.Machine
  for +visited: Bool
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_charged(machine, visited, declaration, owner, index, symbol, depth, expected)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_seen preserves traversal while changing output or budget.
law bundled_seen_preserves_projection:
  for +visited: Bool
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_seen(visited, machine, declaration, owner, index, symbol, depth, expected)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_target preserves traversal while changing output or budget.
law bundled_target_preserves_projection:
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_target(machine, declaration, owner, index, symbol, depth, expected)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_admit preserves traversal while changing output or budget.
law bundled_admit_preserves_projection:
  for +valid: Bool
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Machine.projection(
      Core.bundled_admit(valid, machine, declaration, owner, index, symbol, depth, expected)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

# bundled_lookup preserves traversal while changing output or budget.
law bundled_lookup_preserves_projection:
  for +found: Maybe<&2, Core.Declaration>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +target: Nat
  {
    Machine.projection(
      Core.bundled_lookup(found, machine, owner, index, symbol, depth, expected, target)
    )
    == Machine.projection(machine)
    : Machine.Traversal
  }

