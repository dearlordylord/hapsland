import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ./CHILD_INVENTORY_PROOF.bend as Inventory
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia
import ../representations/list-state/PATRICIA_INSERT_PROOF.bend as Insert
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

# Proof-only projection. The actual String machine and all its outputs remain unchanged.
type Traversal is Data:
  Traversal{
    catalog: Map<&2, Maybe<&2, Core.Declaration>>,
    visited: Map<&2, Bool>,
    frames: List<&2, Core.Frame>
  }

def projection(machine: Core.Machine) -> Traversal:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}:
      Traversal{Rank.declaration_catalog(facts), visited, frames}

def projected_rank(state: Traversal) -> Nat:
  match state:
    case Traversal{catalog, visited, +frames}:
      (2n * Rank.unseen_catalog(visited, catalog) + 2n * Rank.pending_references(frames)
        + List.length(&2, Core.Frame, frames) : Nat)

def projected_valid(state: Traversal) -> Bool:
  match state:
    case Traversal{_, visited, _}: Patricia.canonical(Bool, visited)

def valid(machine: Core.Machine) -> Bool:
  Patricia.canonical(Bool, CoreTraversal.machine_visited(machine))

def rank_projection(
  +machine: Core.Machine
) -> {Rank.rank(machine) == projected_rank(projection(machine)) : Nat}:
  match machine:
    case Core.Machine{_, _, _, _, _, _, _, _, _}: {==}

def valid_projection(
  +machine: Core.Machine
) -> {valid(machine) == projected_valid(projection(machine)) : Bool}:
  match machine:
    case Core.Machine{_, _, _, _, _, _, _, _, _}: {==}

def observe_machine_depth_preserves_projection(+machine: Core.Machine,
  +depth: Nat) -> {
  projection(CoreTraversal.observe_machine_depth(machine, depth))
  == projection(machine)
  : Traversal
}:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}


def charge_machine_work_preserves_projection(+machine: Core.Machine) -> {
  projection(CoreTraversal.charge_machine_work(machine))
  == projection(machine)
  : Traversal
}:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}


def charge_machine_target_preserves_projection(+machine: Core.Machine,
  +key: String) -> {
  projection(CoreTraversal.charge_machine_target(machine, key))
  == projection(machine)
  : Traversal
}:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}


def omit_preserves_projection(+machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +name: String,
  +reason: Core.Omission) -> {
  projection(CoreTraversal.omit(machine, owner, index, name, reason))
  == projection(machine)
  : Traversal
}:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}


def include_preserves_projection(+machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +name: String,
  +identity: String) -> {
  projection(CoreTraversal.include(machine, owner, index, name, identity))
  == projection(machine)
  : Traversal
}:
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}


def queue_import_preserves_projection(+machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +imported: Core.ImportBinding) -> {
  projection(CoreTraversal.queue_import(machine, owner, index, symbol, depth, expected, imported))
  == projection(machine)
  : Traversal
}:
  match machine imported:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _} Core.ImportBinding{
      path,
      name,
      type_only
    }: {==}


def import_by_kind_preserves_projection(+expected: Core.ExpectedKind,
  +type_only: Bool,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +imported: Core.ImportBinding) -> {
  projection(
    CoreTraversal.import_by_kind(expected, type_only, machine, owner, index, symbol, depth, imported)
  )
  == projection(machine)
  : Traversal
}:
  match expected type_only:
    case Core.FunctionKind{} True{}:
      omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case Core.FunctionKind{} False{}:
      queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.FunctionKind{},
        imported
      )
    case Core.AnyKind{} _:
      queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.AnyKind{},
        imported
      )
    case Core.TypeKind{} _:
      queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.TypeKind{},
        imported
      )


def import_present_preserves_projection(+machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +imported: Maybe<&2, Core.ImportBinding>) -> {
  projection(
    CoreTraversal.import_present(machine, owner, index, symbol, depth, expected, imported)
  )
  == projection(machine)
  : Traversal
}:
  match imported:
    case None{}:
      omit_preserves_projection(machine, owner, index, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{path, name, type_only}}:
      import_by_kind_preserves_projection(
        expected,
        type_only,
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.ImportBinding{path, name, type_only}
      )


def charge_if_local_preserves_projection(+local: Maybe<&2, Core.Declaration>,
  +machine: Core.Machine) -> {
  projection(CoreTraversal.charge_if_local(local, machine))
  == projection(machine)
  : Traversal
}:
  match local:
    case None{}: {==}
    case Some{declaration}: charge_machine_work_preserves_projection(machine)


def bundled_queue_preserves_projection(+machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +declaration: Core.Declaration) -> {
  projection(
    CoreTraversal.bundled_queue(machine, owner, index, symbol, depth, expected, declaration)
  )
  == projection(machine)
  : Traversal
}:
  match machine declaration:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _} Core.Declaration{
      handle,
      identity,
      function,
      bundled,
      references
    }: {==}


def bundled_materialize_preserves_projection(+visited: Bool,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_materialize(visited, machine, declaration, owner, index, symbol, depth, expected)
  )
  == projection(machine)
  : Traversal
}:
  match visited:
    case True{}:
      include_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        CoreTraversal.declaration_identity(declaration)
      )
    case False{}:
      bundled_queue_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        expected,
        declaration
      )


def bundled_budget_preserves_projection(+allowed: Bool,
  +visited: Bool,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_budget(
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
  == projection(machine)
  : Traversal
}:
  match allowed:
    case False{}: omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.ReferenceLimit{}
    )
    case True{}: bundled_materialize_preserves_projection(
      visited,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    )


def charge_if_visited_preserves_projection(+visited: Bool,
  +machine: Core.Machine) -> {
  projection(CoreTraversal.charge_if_visited(visited, machine))
  == projection(machine)
  : Traversal
}:
  match visited:
    case True{}: charge_machine_work_preserves_projection(machine)
    case False{}: {==}


def bundled_charged_preserves_projection(+machine: Core.Machine,
  +visited: Bool,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_charged(machine, visited, declaration, owner, index, symbol, depth, expected)
  )
  == projection(machine)
  : Traversal
}:
  bundled_budget_preserves_projection(
    CoreTraversal.machine_allows(machine),
    visited,
    machine,
    declaration,
    owner,
    index,
    symbol,
    depth,
    expected
  )


def bundled_seen_preserves_projection(+visited: Bool,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_seen(visited, machine, declaration, owner, index, symbol, depth, expected)
  )
  == projection(machine)
  : Traversal
}:
  +intermediate = CoreTraversal.charge_if_visited(visited, machine)
  final = CoreTraversal.bundled_charged(
    intermediate,
    visited,
    declaration,
    owner,
    index,
    symbol,
    depth,
    expected
  )
  Equal.trans(
    Traversal,
    projection(final),
    projection(intermediate),
    projection(machine),
    bundled_charged_preserves_projection(
      intermediate,
      visited,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    charge_if_visited_preserves_projection(visited, machine)
  )


def bundled_target_preserves_projection(+machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_target(machine, declaration, owner, index, symbol, depth, expected)
  )
  == projection(machine)
  : Traversal
}:
  +identity = CoreTraversal.declaration_identity(declaration)
  +intermediate = CoreTraversal.charge_machine_target(machine, identity)
  +visited = CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), identity)
  final = CoreTraversal.bundled_seen(
    visited,
    intermediate,
    declaration,
    owner,
    index,
    symbol,
    depth,
    expected
  )
  Equal.trans(
    Traversal,
    projection(final),
    projection(intermediate),
    projection(machine),
    bundled_seen_preserves_projection(
      visited,
      intermediate,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    charge_machine_target_preserves_projection(machine, identity)
  )


def bundled_admit_preserves_projection(+valid: Bool,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
  projection(
    CoreTraversal.bundled_admit(valid, machine, declaration, owner, index, symbol, depth, expected)
  )
  == projection(machine)
  : Traversal
}:
  match valid:
    case False{}: omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case True{}: bundled_target_preserves_projection(
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    )


def bundled_lookup_preserves_projection(+found: Maybe<&2, Core.Declaration>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +target: String) -> {
  projection(
    CoreTraversal.bundled_lookup(found, machine, owner, index, symbol, depth, expected, target)
  )
  == projection(machine)
  : Traversal
}:
  match found:
    case None{}: omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case Some{declaration}:
      bundled_admit_preserves_projection(
        CoreTraversal.bundled_valid(declaration, target, expected),
        machine,
        declaration,
        owner,
        index,
        symbol,
        depth,
        expected
      )

def lookup(+machine: Core.Machine, key: String) -> Maybe<&2, Core.Declaration>:
  Core.map_result(Maybe<&2, Core.Declaration>, Map.get(Maybe<&2, Core.Declaration>, None{},
    Rank.declaration_catalog(CoreTraversal.machine_facts(machine)), key))

def expansion_rank(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +key: String,
  owner: Nat,
  index: Nat,
  name: String,
  depth: Nat,
  lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == Some{declaration} : Maybe<&2, Core.Declaration>},
  absent: {
    CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    == False{}
    : Bool
  }
) -> {
  Nat.is_le(Rank.rank(CoreTraversal.expand_node(machine, declaration, owner, index, name, depth)),
    (Rank.rank(machine) + 1n : Nat)) == True{} : Bool
}:
  match machine declaration:
    case Core.Machine{+facts, _, +frames, +visited, _, _, _, _, _} Core.Declaration{
      handle,
      +identity,
      function,
      bundled,
      +references
    }:
      +entry = {Core.Declaration{handle, identity, function, bundled, references} : Core.Declaration}
      +catalog = Rank.declaration_catalog(facts)
      +after = Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), catalog)
      +before = Rank.unseen_catalog(visited, catalog)
      +amount = List.length(&2, Core.Reference, references)
      +pending = Rank.pending_references(frames)
      +frame_count = List.length(&2, Core.Frame, frames)
      bound = Inventory.selected_child_inventory_decrease(
        catalog,
        visited,
        key,
        entry,
        lawful,
        selected,
        absent
      )
      %NatFacts.mul_add_sym(2n, amount, pending):
        {
          Nat.is_le(
            Nat.add(Nat.add(Nat.mul(2n, after), _), Nat.add(1n, frame_count)),
            Nat.add(Nat.add(Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)), frame_count), 1n)
          )
          == True{}
          : Bool
        }
      %NatFacts.add_assoc(Nat.mul(2n, after), Nat.mul(2n, amount), Nat.mul(2n, pending)):
        {
          Nat.is_le(
            Nat.add(_, Nat.add(1n, frame_count)),
            Nat.add(Nat.add(Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)), frame_count), 1n)
          )
          == True{}
          : Bool
        }
      %NatFacts.mul_add(2n, after, amount):
        {
          Nat.is_le(
            Nat.add(Nat.add(_, Nat.mul(2n, pending)), Nat.add(1n, frame_count)),
            Nat.add(Nat.add(Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)), frame_count), 1n)
          )
          == True{}
          : Bool
        }
      %NatFacts.add_assoc_sym(Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)), frame_count, 1n):
        {
          Nat.is_le(
            Nat.add(
              Nat.add(Nat.mul(2n, Nat.add(after, amount)), Nat.mul(2n, pending)),
              Nat.add(1n, frame_count)
            ),
            _
          )
          == True{}
          : Bool
        }
      %NatFacts.add_comm(1n, frame_count):
        {
          Nat.is_le(
            Nat.add(
              Nat.add(Nat.mul(2n, Nat.add(after, amount)), Nat.mul(2n, pending)),
              Nat.add(1n, frame_count)
            ),
            Nat.add(Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)), _)
          )
          == True{}
          : Bool
        }
      doubled = NatFacts.mul_le_mul_left(Nat.add(after, amount), before, 2n, bound)
      with_pending = NatFacts.add_le_add_right(
        Nat.mul(2n, Nat.add(after, amount)),
        Nat.mul(2n, before),
        Nat.mul(2n, pending),
        doubled
      )
      NatFacts.add_le_add_right(
        Nat.add(Nat.mul(2n, Nat.add(after, amount)), Nat.mul(2n, pending)),
        Nat.add(Nat.mul(2n, before), Nat.mul(2n, pending)),
        Nat.add(1n, frame_count),
        with_pending
      )

def expansion_valid(+machine: Core.Machine, +declaration: Core.Declaration,
  owner: Nat, index: Nat, name: String, depth: Nat,
  lawful: {valid(machine) == True{} : Bool}) -> {
  valid(CoreTraversal.expand_node(machine, declaration, owner, index, name, depth)) == True{} : Bool
}:
  match machine declaration:
    case Core.Machine{_, _, _, visited, _, _, _, _, _} Core.Declaration{_, identity, _, _, _}:
      Insert.set_preserves_canonical(Bool, visited, identity, True{}, lawful)

def projection_equal_rank(+before: Core.Machine, +after: Core.Machine,
  same: {projection(after) == projection(before) : Traversal}) -> {
  Rank.rank(after) == Rank.rank(before) : Nat
}:
  Equal.trans(
    Nat,
    Rank.rank(after),
    projected_rank(projection(after)),
    Rank.rank(before),
    rank_projection(after),
    Equal.trans(
      Nat,
      projected_rank(projection(after)),
      projected_rank(projection(before)),
      Rank.rank(before),
      Equal.cong(Traversal, Nat, projected_rank, projection(after), projection(before), same),
      Equal.sym(Nat, Rank.rank(before), projected_rank(projection(before)), rank_projection(before))
    )
  )

def projection_equal_valid(+before: Core.Machine, +after: Core.Machine,
  same: {projection(after) == projection(before) : Traversal}) -> {
  valid(after) == valid(before) : Bool
}:
  Equal.trans(
    Bool,
    valid(after),
    projected_valid(projection(after)),
    valid(before),
    valid_projection(after),
    Equal.trans(
      Bool,
      projected_valid(projection(after)),
      projected_valid(projection(before)),
      valid(before),
      Equal.cong(Traversal, Bool, projected_valid, projection(after), projection(before), same),
      Equal.sym(Bool, valid(before), projected_valid(projection(before)), valid_projection(before))
    )
  )

def growth(+before: Core.Machine, +after: Core.Machine) -> Bool:
  Bool.and(valid(after), Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat)))

def combine_growth(+before: Core.Machine, +after: Core.Machine,
  lawful: {valid(after) == True{} : Bool},
  bound: {Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat)) == True{} : Bool}) -> {
  growth(before, after) == True{} : Bool
}:
  %Equal.sym(Bool, valid(after), True{}, lawful):
    {Bool.and(_, Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat))) == True{} : Bool}
  bound

def projection_growth(+before: Core.Machine, +after: Core.Machine,
  +same: {projection(after) == projection(before) : Traversal},
  lawful: {valid(before) == True{} : Bool}) -> {
  growth(before, after) == True{} : Bool
}:
  %Equal.sym(Bool, valid(after), valid(before), projection_equal_valid(before, after, same)):
    {Bool.and(_, Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat))) == True{} : Bool}
  %Equal.sym(Bool, valid(before), True{}, lawful):
    {Bool.and(_, Nat.is_le(Rank.rank(after), (Rank.rank(before) + 1n : Nat))) == True{} : Bool}
  %Equal.sym(Nat, Rank.rank(after), Rank.rank(before), projection_equal_rank(before, after, same)):
    {Nat.is_le(_, (Rank.rank(before) + 1n : Nat)) == True{} : Bool}
  NatFacts.le_add_right(Rank.rank(before), 1n)

def expansion_growth(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +key: String,
  +owner: Nat,
  +index: Nat,
  +name: String,
  +depth: Nat,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == Some{declaration} : Maybe<&2, Core.Declaration>},
  absent: {
    CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    == False{}
    : Bool
  }
) -> {
    growth(machine, CoreTraversal.expand_node(machine, declaration, owner, index, name, depth))
    == True{}
    : Bool
  }:
  combine_growth(machine, CoreTraversal.expand_node(machine, declaration, owner, index, name, depth),
    expansion_valid(machine, declaration, owner, index, name, depth, lawful),
    expansion_rank(machine, declaration, key, owner, index, name, depth, lawful, selected, absent))

def projected_lookup(state: Traversal, key: String) -> Maybe<&2, Core.Declaration>:
  match state:
    case Traversal{catalog, _, _}:
      Core.map_result(
        Maybe<&2, Core.Declaration>,
        Map.get(Maybe<&2, Core.Declaration>, None{}, catalog, key)
      )

def lookup_projection(+machine: Core.Machine, +key: String) -> {
  lookup(machine, key) == projected_lookup(projection(machine), key) : Maybe<&2, Core.Declaration>
}:
  match machine:
    case Core.Machine{_, _, _, _, _, _, _, _, _}: {==}

def lookup_transport(+before: Core.Machine, +after: Core.Machine, +key: String,
  +found: Maybe<&2, Core.Declaration>, same: {projection(after) == projection(before) : Traversal},
  selected: {lookup(before, key) == found : Maybe<&2, Core.Declaration>}) -> {
  lookup(after, key) == found : Maybe<&2, Core.Declaration>
}:
  select : Traversal -> Maybe<&2, Core.Declaration> = state => projected_lookup(state, key)
  Equal.trans(
    Maybe<&2, Core.Declaration>,
    lookup(after, key),
    projected_lookup(projection(after), key),
    found,
    lookup_projection(after, key),
    Equal.trans(
      Maybe<&2, Core.Declaration>,
      projected_lookup(projection(after), key),
      projected_lookup(projection(before), key),
      found,
      Equal.cong(
        Traversal,
        Maybe<&2, Core.Declaration>,
        select,
        projection(after),
        projection(before),
        same
      ),
      Equal.trans(
        Maybe<&2, Core.Declaration>,
        projected_lookup(projection(before), key),
        lookup(before, key),
        found,
        Equal.sym(
          Maybe<&2, Core.Declaration>,
          lookup(before, key),
          projected_lookup(projection(before), key),
          lookup_projection(before, key)
        ),
        selected
      )
    )
  )

def lawful_transport(
  +before: Core.Machine,
  +after: Core.Machine,
  same: {projection(after) == projection(before) : Traversal},
  lawful: {valid(before) == True{} : Bool}
) -> {
  valid(after) == True{} : Bool
}:
  Equal.trans(
    Bool,
    valid(after),
    valid(before),
    True{},
    projection_equal_valid(before, after, same),
    lawful
  )

def growth_transport(+before: Core.Machine, +middle: Core.Machine, +after: Core.Machine,
  same: {projection(middle) == projection(before) : Traversal},
  bounded: {growth(middle, after) == True{} : Bool}) -> {growth(before, after) == True{} : Bool}:
  %projection_equal_rank(before, middle, same):
    {Bool.and(valid(after), Nat.is_le(Rank.rank(after), (_ + 1n : Nat))) == True{} : Bool}
  bounded

def local_if_growth(
  +seen: Bool,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +key: String,
  +owner: Nat,
  +index: Nat,
  +name: String,
  +depth: Nat,
  lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == Some{declaration} : Maybe<&2, Core.Declaration>},
  test: {
    CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    == seen
    : Bool
  }
) -> {
    growth(machine, CoreTraversal.local_expand_if(seen, machine, declaration, owner, index, name, depth))
    == True{}
    : Bool
  }:
  match seen:
    case True{}:
      projection_growth(
        machine,
        CoreTraversal.include(machine, owner, index, name, CoreTraversal.declaration_identity(declaration)),
        include_preserves_projection(
          machine,
          owner,
          index,
          name,
          CoreTraversal.declaration_identity(declaration)
        ),
        lawful
      )
    case False{}:
      expansion_growth(machine, declaration, key, owner, index, name, depth, lawful, selected, test)

def local_growth(+machine: Core.Machine, +declaration: Core.Declaration, +key: String,
  +owner: Nat, +index: Nat, +name: String, +depth: Nat,
  lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == Some{declaration} : Maybe<&2, Core.Declaration>}) -> {
    growth(machine, CoreTraversal.local_expand(machine, declaration, owner, index, name, depth))
    == True{}
    : Bool
  }:
  local_if_growth(
    CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
    machine,
    declaration,
    key,
    owner,
    index,
    name,
    depth,
    lawful,
    selected,
    {==}
  )

def materialize_growth(
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +key: String,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == local : Maybe<&2, Core.Declaration>}
) -> {
    growth(
      machine,
      CoreTraversal.materialize_allowed(local, imported, machine, owner, index, symbol, depth, expected)
    )
    == True{}
    : Bool
  }:
  match local:
    case None{}:
      projection_growth(
        machine,
        CoreTraversal.import_present(machine, owner, index, symbol, depth, expected, imported),
        import_present_preserves_projection(
          machine,
          owner,
          index,
          symbol,
          depth,
          expected,
          imported
        ),
        lawful
      )
    case Some{declaration}:
      local_growth(
        machine,
        declaration,
        key,
        owner,
        index,
        symbol,
        (depth + 1n : Nat),
        lawful,
        selected
      )

def ordinary_budget_growth(
  +allowed: Bool,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +key: String,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == local : Maybe<&2, Core.Declaration>}
) -> {
    growth(
      machine,
      CoreTraversal.ordinary_budget(allowed, local, imported, machine, owner, index, symbol, depth, expected)
    )
    == True{}
    : Bool
  }:
  match allowed:
    case False{}:
      projection_growth(machine, CoreTraversal.omit(machine, owner, index, symbol, Core.ReferenceLimit{}),
        omit_preserves_projection(machine, owner, index, symbol, Core.ReferenceLimit{}), lawful)
    case True{}: materialize_growth(
      local,
      imported,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      key,
      lawful,
      selected
    )

def ordinary_charged_growth(
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +key: String,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == local : Maybe<&2, Core.Declaration>}
) -> {
    growth(
      machine,
      CoreTraversal.ordinary_charged(machine, local, imported, owner, index, symbol, depth, expected)
    )
    == True{}
    : Bool
  }:
  ordinary_budget_growth(
    CoreTraversal.machine_allows(machine),
    local,
    imported,
    machine,
    owner,
    index,
    symbol,
    depth,
    expected,
    key,
    lawful,
    selected
  )

def ordinary_ambiguity_growth(
  +conflict: Bool,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +key: String,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == local : Maybe<&2, Core.Declaration>}
) -> {
    growth(
      machine,
      CoreTraversal.ordinary_ambiguity(
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
    )
    == True{}
    : Bool
  }:
  match conflict:
    case True{}:
      projection_growth(machine, CoreTraversal.omit(machine, owner, index, symbol, Core.UnsupportedTarget{}),
        omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{}), lawful)
    case False{}:
      +middle = CoreTraversal.charge_if_local(local, machine)
      +same = charge_if_local_preserves_projection(local, machine)
      growth_transport(
        machine,
        middle,
        CoreTraversal.ordinary_charged(middle, local, imported, owner, index, symbol, depth, expected),
        same,
        ordinary_charged_growth(
          local,
          imported,
          middle,
          owner,
          index,
          symbol,
          depth,
          expected,
          key,
          lawful_transport(machine, middle, same, lawful),
          lookup_transport(machine, middle, key, local, same, selected)
        )
      )

def ordinary_targets_growth(
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +key: String,
  +lawful: {valid(machine) == True{} : Bool},
  selected: {lookup(machine, key) == local : Maybe<&2, Core.Declaration>}
) -> {
    growth(
      machine,
      CoreTraversal.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
    )
    == True{}
    : Bool
  }:
  +target = CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported)
  +middle = CoreTraversal.charge_machine_target(machine, target)
  +same = charge_machine_target_preserves_projection(machine, target)
  growth_transport(
    machine,
    middle,
    CoreTraversal.ordinary_ambiguity(
      CoreTraversal.ambiguous(local, imported, expected),
      local,
      imported,
      middle,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    same,
    ordinary_ambiguity_growth(
      CoreTraversal.ambiguous(local, imported, expected),
      local,
      imported,
      middle,
      owner,
      index,
      symbol,
      depth,
      expected,
      key,
      lawful_transport(machine, middle, same, lawful),
      lookup_transport(machine, middle, key, local, same, selected)
    )
  )

def ordinary_growth(+machine: Core.Machine, +owner: Nat, +index: Nat, +symbol: String, +depth: Nat,
  +expected: Core.ExpectedKind, lawful: {valid(machine) == True{} : Bool}) -> {
    growth(machine, CoreTraversal.ordinary_reference(machine, owner, index, symbol, depth, expected))
    == True{}
    : Bool
  }:
  match machine:
    case Core.Machine{
      Core.Facts{+aware, +catalog, +imports, +supporting},
      +path,
      +frames,
      +visited,
      +budget,
      +next,
      +nodes,
      +slots,
      +pending
    }:
      +facts = {Core.Facts{aware, catalog, imports, supporting} : Core.Facts}
      +original = {Core.Machine{facts, path, frames, visited, budget, next, nodes, slots, pending} : Core.Machine}
      ordinary_targets_growth(
        CoreTraversal.declaration_lookup(facts, symbol, expected),
        CoreTraversal.import_lookup(facts, symbol),
        original,
        owner,
        index,
        symbol,
        depth,
        expected,
        CoreTraversal.lookup_key(aware, expected, symbol),
        lawful,
        {==}
      )

def named_growth(+target: Maybe<&2, String>, +machine: Core.Machine,
  +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind,
  lawful: {valid(machine) == True{} : Bool}) -> {
    growth(machine, CoreTraversal.named_reference(target, machine, owner, index, symbol, depth, expected))
    == True{}
    : Bool
  }:
  match target:
    case None{}: ordinary_growth(machine, owner, index, symbol, depth, expected, lawful)
    case Some{+identity}:
      +found = CoreTraversal.supporting_lookup(CoreTraversal.machine_facts(machine), identity)
      projection_growth(
        machine,
        CoreTraversal.bundled_lookup(found, machine, owner, index, symbol, depth, expected, identity),
        bundled_lookup_preserves_projection(
          found,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected,
          identity
        ),
        lawful
      )

def kind_growth(+kind: Core.ReferenceKind, +target: Maybe<&2, String>, +machine: Core.Machine,
  +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind,
  lawful: {valid(machine) == True{} : Bool}) -> {
    growth(
      machine,
      CoreTraversal.reference_kind(kind, target, machine, owner, index, symbol, depth, expected)
    )
    == True{}
    : Bool
  }:
  match kind:
    case Core.Unsupported{}:
      projection_growth(machine, CoreTraversal.omit(machine, owner, index, symbol, Core.UnsupportedTarget{}),
        omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{}), lawful)
    case Core.Named{}: named_growth(target, machine, owner, index, symbol, depth, expected, lawful)

def visit_growth(
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +reference: Core.Reference,
  lawful: {valid(machine) == True{} : Bool}
) -> {
  growth(machine, CoreTraversal.visit_reference(machine, owner, index, depth, reference)) == True{} : Bool
}:
  match reference:
    case Core.Reference{+kind, +name, +expected, +target}:
      +middle = CoreTraversal.observe_machine_depth(machine, (depth + 1n : Nat))
      +same = observe_machine_depth_preserves_projection(machine, (depth + 1n : Nat))
      growth_transport(
        machine,
        middle,
        CoreTraversal.reference_kind(kind, target, middle, owner, index, name, depth, expected),
        same,
        kind_growth(
          kind,
          target,
          middle,
          owner,
          index,
          name,
          depth,
          expected,
          lawful_transport(machine, middle, same, lawful)
        )
      )

def consuming_rank(+machine: Core.Machine, +owner: Nat, +depth: Nat, +index: Nat,
  reference: Core.Reference, +rest: List<&2, Core.Reference>) -> {
    Rank.rank(CoreTraversal.push_frame(machine, Core.Frame{owner, depth, index, reference <> rest}))
    == (Rank.rank(
      CoreTraversal.push_frame(machine, Core.Frame{owner, depth, (index + 1n : Nat), rest})
    ) + 2n : Nat)
    : Nat
  }:
  match machine:
    case Core.Machine{facts, _, +frames, visited, _, _, _, _, _}:
      +base = Nat.mul(2n, Rank.unseen_catalog(visited, Rank.declaration_catalog(facts)))
      +pending = Nat.add(List.length(&2, Core.Reference, rest), Rank.pending_references(frames))
      +work = Nat.mul(2n, pending)
      +frame_count = Nat.add(1n, List.length(&2, Core.Frame, frames))
      %NatFacts.mul_succ_sym(2n, pending):
        {
          Nat.add(Nat.add(base, _), frame_count)
          == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n)
          : Nat
        }
      %NatFacts.add_assoc(base, work, 2n):
        {Nat.add(_, frame_count) == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      %NatFacts.add_assoc_sym(Nat.add(base, work), 2n, frame_count):
        {_ == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      %NatFacts.add_comm(frame_count, 2n):
        {
          Nat.add(Nat.add(base, work), _)
          == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n)
          : Nat
        }
      %NatFacts.add_assoc(Nat.add(base, work), frame_count, 2n):
        {_ == Nat.add(Nat.add(Nat.add(base, work), frame_count), 2n) : Nat}
      {==}

def empty_rank(+machine: Core.Machine, owner: Nat, depth: Nat, index: Nat) -> {
  Rank.rank(CoreTraversal.push_frame(machine, Core.Frame{owner, depth, index, []}))
  == (Rank.rank(machine) + 1n : Nat) : Nat
}:
  match machine:
    case Core.Machine{facts, _, +frames, visited, _, _, _, _, _}:
      +base = (2n * Rank.unseen_catalog(visited, Rank.declaration_catalog(facts)) + 2n * Rank.pending_references(
        frames
      ) : Nat)
      +count = List.length(&2, Core.Frame, frames)
      %NatFacts.add_comm(count, 1n):
        {Nat.add(base, _) == Nat.add(Nat.add(base, count), 1n) : Nat}
      %NatFacts.add_assoc(base, count, 1n):
        {_ == Nat.add(Nat.add(base, count), 1n) : Nat}
      {==}


def growth_consumes_two(+before: Nat, +after: Nat,
  bound: {Nat.is_le(after, (before + 1n : Nat)) == True{} : Bool}) -> {
  Nat.is_le((after + 1n : Nat), (before + 2n : Nat)) == True{} : Bool
}:
  %NatFacts.add_assoc(before, 1n, 1n):
    {Nat.is_le(Nat.add(after, 1n), _) == True{} : Bool}
  NatFacts.add_le_add_right(after, Nat.add(before, 1n), 1n, bound)

law step_decreases_preserving_visited:
  for +machine: Core.Machine
  for valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool}
  for active: {CoreTraversal.done(machine) == False{} : Bool}
  {
    Bool.and(
      Patricia.canonical(Bool, CoreTraversal.machine_visited(CoreTraversal.step(machine))),
      Nat.is_le((Rank.rank(CoreTraversal.step(machine)) + 1n : Nat), Rank.rank(machine))
    ) == True{} : Bool
  }

def step_decreases_preserving_visited(machine, valid, active):
  match machine:
    case Core.Machine{+facts, +path, [], +visited, +budget, +next, +nodes, +slots, +pending}:
      Empty.absurd(
        {
          Bool.and(
            Patricia.canonical(Bool, visited),
            Nat.is_le(
              (Rank.rank(
                Core.Machine{facts, path, [], visited, budget, next, nodes, slots, pending}
              ) + 1n : Nat),
              Rank.rank(Core.Machine{facts, path, [], visited, budget, next, nodes, slots, pending})
            )
          )
          == True{}
          : Bool
        },
        BoolFacts.internal_true_ne_false(active)
      )
    case Core.Machine{
      +facts,
      +path,
      Core.Frame{+owner, +depth, +index, []} <> +tail,
      +visited,
      +budget,
      +next,
      +nodes,
      +slots,
      +pending
    }:
      +base = {Core.Machine{facts, path, tail, visited, budget, next, nodes, slots, pending} : Core.Machine}
      %Equal.sym(Bool, Patricia.canonical(Bool, visited), True{}, valid):
        {
          Bool.and(
            _,
            Nat.is_le(
              (Rank.rank(base) + 1n : Nat),
              Rank.rank(CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, []}))
            )
          )
          == True{}
          : Bool
        }
      %Equal.sym(Nat, Rank.rank(CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, []})),
        (Rank.rank(base) + 1n : Nat), empty_rank(base, owner, depth, index)):
        {Nat.is_le((Rank.rank(base) + 1n : Nat), _) == True{} : Bool}
      NatFacts.le_refl((Rank.rank(base) + 1n : Nat))
    case Core.Machine{
      +facts,
      +path,
      Core.Frame{+owner, +depth, +index, +reference <> +rest} <> +tail,
      +visited,
      +budget,
      +next,
      +nodes,
      +slots,
      +pending
    }:
      +base = {Core.Machine{facts, path, tail, visited, budget, next, nodes, slots, pending} : Core.Machine}
      +consumed = CoreTraversal.push_frame(base, Core.Frame{owner, depth, (index + 1n : Nat), rest})
      +after = CoreTraversal.visit_reference(consumed, owner, index, depth, reference)
      +bounded = visit_growth(consumed, owner, index, depth, reference, valid)
      lawful = BoolFacts.eq_true_of_and_left(Patricia.canonical(Bool, CoreTraversal.machine_visited(after)),
        Nat.is_le(Rank.rank(after), (Rank.rank(consumed) + 1n : Nat)), bounded)
      bound = BoolFacts.eq_true_of_and_right(Patricia.canonical(Bool, CoreTraversal.machine_visited(after)),
        Nat.is_le(Rank.rank(after), (Rank.rank(consumed) + 1n : Nat)), bounded)
      %Equal.sym(Bool, Patricia.canonical(Bool, CoreTraversal.machine_visited(after)), True{}, lawful):
        {
          Bool.and(
            _,
            Nat.is_le(
              (Rank.rank(after) + 1n : Nat),
              Rank.rank(CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, reference <> rest}))
            )
          )
          == True{}
          : Bool
        }
      %Equal.sym(
        Nat,
        Rank.rank(CoreTraversal.push_frame(base, Core.Frame{owner, depth, index, reference <> rest})),
        (Rank.rank(consumed) + 2n : Nat),
        consuming_rank(base, owner, depth, index, reference, rest)
      ):
        {Nat.is_le((Rank.rank(after) + 1n : Nat), _) == True{} : Bool}
      growth_consumes_two(Rank.rank(consumed), Rank.rank(after), bound)

def main() -> Unit:
  Unit{}
