import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE.bend as Machine

def query_key(facts: Core.Facts, name: Core.Label, expected: Core.ExpectedKind) -> Nat:
  match facts:
    case Core.Facts{kind_aware, _, _, _}: Core.lookup_key(kind_aware, expected, name)

# Projection equality transports the exact raw-catalog lookup witness.
law projection_preserves_lookup:
  for +before: Core.Machine
  for +after: Core.Machine
  for +key: Nat
  for +value: Maybe<&2, Core.Declaration>
  for same: {Machine.projection(after) == Machine.projection(before) : Machine.Traversal}
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(before)),
      key
    )
    == value
    : Maybe<&2, Core.Declaration>
  }
  {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(after)),
      key
    )
    == value
    : Maybe<&2, Core.Declaration>
  }

# A preserved traversal can increase rank by at most one.
law projection_growth_bound:
  for +before: Core.Machine
  for +after: Core.Machine
  for same: {Machine.projection(after) == Machine.projection(before) : Machine.Traversal}
  {Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat)) == True{} : Bool}

# An output/budget-only prefix preserves the subsequent growth bound.
law projection_transports_growth:
  for +before: Core.Machine
  for +intermediate: Core.Machine
  for +after: Core.Machine
  for same: {Machine.projection(intermediate) == Machine.projection(before) : Machine.Traversal}
  for growth: {Nat.is_le(Rank.rank(after), (Rank.rank(intermediate) + 1n : Nat)) == True{} : Bool}
  {Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat)) == True{} : Bool}

# Actual declaration lookup is the structural catalog query used by the proof.
law declaration_lookup_exact:
  for +facts: Core.Facts
  for +symbol: Core.Label
  for +expected: Core.ExpectedKind
  {
    Core.declaration_lookup(facts, symbol, expected)
    == Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(facts),
      query_key(facts, symbol, expected)
    )
    : Maybe<&2, Core.Declaration>
  }

# Actual local_expand_if increases rank by at most one.
law local_expand_if_rank_bound:
  for +visited: Bool
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +name: Core.Label
  for +depth: Nat
  for +key: Nat
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
  for seen: {
    Core.has_identity(Core.machine_visited(machine), Core.declaration_identity(declaration))
    == visited
    : Bool
  }
  {
    Nat.is_le(
      Rank.rank(Core.local_expand_if(visited, machine, declaration, owner, index, name, depth)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual local_expand increases rank by at most one.
law local_expand_rank_bound:
  for +machine: Core.Machine
  for +declaration: Core.Declaration
  for +owner: Nat
  for +index: Nat
  for +name: Core.Label
  for +depth: Nat
  for +key: Nat
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
  {
    Nat.is_le(
      Rank.rank(Core.local_expand(machine, declaration, owner, index, name, depth)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual materialize_allowed increases rank by at most one.
law materialize_allowed_rank_bound:
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +key: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == local
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      Rank.rank(
        Core.materialize_allowed(local, imported, machine, owner, index, symbol, depth, expected)
      ),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual ordinary_budget increases rank by at most one.
law ordinary_budget_rank_bound:
  for +allowed: Bool
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +key: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == local
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      Rank.rank(
        Core.ordinary_budget(
          allowed,
          local,
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      ),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual ordinary_charged increases rank by at most one.
law ordinary_charged_rank_bound:
  for +machine: Core.Machine
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +key: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == local
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      Rank.rank(
        Core.ordinary_charged(machine, local, imported, owner, index, symbol, depth, expected)
      ),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual ordinary_ambiguity increases rank by at most one.
law ordinary_ambiguity_rank_bound:
  for +conflict: Bool
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +key: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == local
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      Rank.rank(
        Core.ordinary_ambiguity(
          conflict,
          local,
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      ),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual ordinary_targets increases rank by at most one.
law ordinary_targets_rank_bound:
  for +machine: Core.Machine
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +key: Nat
  for selected: {
    Own.lookup(
      Maybe<&2, Core.Declaration>,
      None{},
      Rank.declaration_catalog(Core.machine_facts(machine)),
      key
    )
    == local
    : Maybe<&2, Core.Declaration>
  }
  {
    Nat.is_le(
      Rank.rank(
        Core.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
      ),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual ordinary_reference increases rank by at most one.
law ordinary_reference_rank_bound:
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Nat.is_le(
      Rank.rank(Core.ordinary_reference(machine, owner, index, symbol, depth, expected)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual named_reference increases rank by at most one.
law named_reference_rank_bound:
  for +target: Maybe<&2, Nat>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Nat.is_le(
      Rank.rank(Core.named_reference(target, machine, owner, index, symbol, depth, expected)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

# Actual reference_kind increases rank by at most one.
law reference_kind_rank_bound:
  for +kind: Core.ReferenceKind
  for +target: Maybe<&2, Nat>
  for +machine: Core.Machine
  for +owner: Nat
  for +index: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Nat.is_le(
      Rank.rank(Core.reference_kind(kind, target, machine, owner, index, symbol, depth, expected)),
      (Rank.rank(machine) + 1n : Nat)
    )
    == True{}
    : Bool
  }

