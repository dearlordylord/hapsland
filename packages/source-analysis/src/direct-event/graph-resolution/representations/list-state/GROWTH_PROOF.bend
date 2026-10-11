import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE.bend as Machine
import ./RANK_GROWTH_LAWS.bend as Growth
import ./DISPATCH_PROOF.bend as DispatchProof
import ./RANK_DISPATCH_LAWS.bend as Dispatch
import ./MACHINE_BASE_PROOF.bend as BaseProof
import ./EXPAND_RANK_PROOF.bend as Expand
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def lookup_at(
  key: Nat,
  catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
) -> Maybe<&2, Core.Declaration>:
  Own.lookup(Maybe<&2, Core.Declaration>, None{}, catalog, key)

def Growth.projection_preserves_lookup(before, after, key, value, same, selected):
  +left = Rank.declaration_catalog(Core.machine_facts(after))
  +right = Rank.declaration_catalog(Core.machine_facts(before))
  catalogs = Equal.trans(
    Own.Dictionary<Maybe<&2, Core.Declaration>>,
    left,
    Machine.projected_catalog(Machine.projection(after)),
    right,
    BaseProof.catalog_from_projection(after),
    Equal.trans(
      Own.Dictionary<Maybe<&2, Core.Declaration>>,
      Machine.projected_catalog(Machine.projection(after)),
      Machine.projected_catalog(Machine.projection(before)),
      right,
      Equal.cong(
        Machine.Traversal,
        Own.Dictionary<Maybe<&2, Core.Declaration>>,
        Machine.projected_catalog,
        Machine.projection(after),
        Machine.projection(before),
        same
      ),
      Equal.sym(
        Own.Dictionary<Maybe<&2, Core.Declaration>>,
        right,
        Machine.projected_catalog(Machine.projection(before)),
        BaseProof.catalog_from_projection(before)
      )
    )
  )
  Equal.trans(
    Maybe<&2, Core.Declaration>,
    lookup_at(key, left),
    lookup_at(key, right),
    value,
    Equal.cong(
      Own.Dictionary<Maybe<&2, Core.Declaration>>,
      Maybe<&2, Core.Declaration>,
      lookup_at(key),
      left,
      right,
      catalogs
    ),
    selected
  )

def Growth.projection_growth_bound(before, after, same):
  %Equal.sym(
    Nat,
    Rank.rank(after),
    Rank.rank(before),
    Dispatch.projection_equal_rank(before, after, same)
  ):
    {Nat.is_le(_, (Rank.rank(before) + 1n : Nat)) == True{} : Bool}
  NatFacts.le_add_right(Rank.rank(before), 1n)

def Growth.projection_transports_growth(before, intermediate, after, same, growth):
  %Dispatch.projection_equal_rank(before, intermediate, same):
    {Nat.is_le(Rank.rank(after), (_ + 1n : Nat)) == True{} : Bool}
  growth

def Growth.declaration_lookup_exact(facts, symbol, expected):
  match facts:
    case Core.Facts{kind_aware, declarations, imports, supporting}: {==}

def Growth.local_expand_if_rank_bound(
  visited,
  machine,
  declaration,
  owner,
  index,
  name,
  depth,
  key,
  selected,
  seen
):
  match visited:
    case True{}:
      Growth.projection_growth_bound(
        machine,
        Core.include(machine, owner, index, name, Core.declaration_identity(declaration)),
        Dispatch.include_preserves_projection(
          machine,
          owner,
          index,
          name,
          Core.declaration_identity(declaration)
        )
      )
    case False{}:
      Expand.selected_expand_rank_bound(
        machine,
        declaration,
        key,
        owner,
        index,
        name,
        depth,
        selected,
        seen
      )

def Growth.local_expand_rank_bound(machine, declaration, owner, index, name, depth, key, selected):
  Growth.local_expand_if_rank_bound(
    Core.has_identity(Core.machine_visited(machine), Core.declaration_identity(declaration)),
    machine,
    declaration,
    owner,
    index,
    name,
    depth,
    key,
    selected,
    {==}
  )

def Growth.materialize_allowed_rank_bound(
  local,
  imported,
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  key,
  selected
):
  match local:
    case None{}:
      Growth.projection_growth_bound(
        machine,
        Core.import_present(machine, owner, index, symbol, depth, expected, imported),
        Dispatch.import_present_preserves_projection(
          machine,
          owner,
          index,
          symbol,
          depth,
          expected,
          imported
        )
      )
    case Some{declaration}:
      Growth.local_expand_rank_bound(
        machine,
        declaration,
        owner,
        index,
        symbol,
        (depth + 1n : Nat),
        key,
        selected
      )

def Growth.ordinary_budget_rank_bound(
  allowed,
  local,
  imported,
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  key,
  selected
):
  match allowed:
    case False{}:
      Growth.projection_growth_bound(
        machine,
        Core.omit(machine, owner, index, symbol, Core.ReferenceLimit{}),
        Dispatch.omit_preserves_projection(machine, owner, index, symbol, Core.ReferenceLimit{})
      )
    case True{}:
      Growth.materialize_allowed_rank_bound(
        local,
        imported,
        machine,
        owner,
        index,
        symbol,
        depth,
        expected,
        key,
        selected
      )

def Growth.ordinary_charged_rank_bound(
  machine,
  local,
  imported,
  owner,
  index,
  symbol,
  depth,
  expected,
  key,
  selected
):
  Growth.ordinary_budget_rank_bound(
    Core.machine_allows(machine),
    local,
    imported,
    machine,
    owner,
    index,
    symbol,
    depth,
    expected,
    key,
    selected
  )

def Growth.ordinary_ambiguity_rank_bound(
  conflict,
  local,
  imported,
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  key,
  selected
):
  match conflict:
    case True{}:
      Growth.projection_growth_bound(
        machine,
        Core.omit(machine, owner, index, symbol, Core.UnsupportedTarget{}),
        Dispatch.omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{})
      )
    case False{}:
      +intermediate = Core.charge_if_local(local, machine)
      +same = Dispatch.charge_if_local_preserves_projection(local, machine)
      next_selected = Growth.projection_preserves_lookup(
        machine,
        intermediate,
        key,
        local,
        same,
        selected
      )
      growth = Growth.ordinary_charged_rank_bound(
        intermediate,
        local,
        imported,
        owner,
        index,
        symbol,
        depth,
        expected,
        key,
        next_selected
      )
      Growth.projection_transports_growth(
        machine,
        intermediate,
        Core.ordinary_charged(intermediate, local, imported, owner, index, symbol, depth, expected),
        same,
        growth
      )

def Growth.ordinary_targets_rank_bound(
  machine,
  local,
  imported,
  owner,
  index,
  symbol,
  depth,
  expected,
  key,
  selected
):
  +target = Core.reference_target_key(Core.machine_path(machine), symbol, local, imported)
  +intermediate = Core.charge_machine_target(machine, target)
  +same = Dispatch.charge_machine_target_preserves_projection(machine, target)
  next_selected = Growth.projection_preserves_lookup(
    machine,
    intermediate,
    key,
    local,
    same,
    selected
  )
  +conflict = Core.ambiguous(local, imported, expected)
  growth = Growth.ordinary_ambiguity_rank_bound(
    conflict,
    local,
    imported,
    intermediate,
    owner,
    index,
    symbol,
    depth,
    expected,
    key,
    next_selected
  )
  Growth.projection_transports_growth(
    machine,
    intermediate,
    Core.ordinary_ambiguity(
      conflict,
      local,
      imported,
      intermediate,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    same,
    growth
  )

def Growth.ordinary_reference_rank_bound(machine, owner, index, symbol, depth, expected):
  +facts = Core.machine_facts(machine)
  +local = Core.declaration_lookup(facts, symbol, expected)
  key = Growth.query_key(facts, symbol, expected)
  selected = Equal.sym(Maybe<&2, Core.Declaration>, local,
    Own.lookup(Maybe<&2, Core.Declaration>, None{}, Rank.declaration_catalog(facts), key),
    Growth.declaration_lookup_exact(facts, symbol, expected))
  Growth.ordinary_targets_rank_bound(
    machine,
    local,
    Core.import_lookup(facts, symbol),
    owner,
    index,
    symbol,
    depth,
    expected,
    key,
    selected
  )

def Growth.named_reference_rank_bound(target, machine, owner, index, symbol, depth, expected):
  match target:
    case None{}: Growth.ordinary_reference_rank_bound(
      machine,
      owner,
      index,
      symbol,
      depth,
      expected
    )
    case Some{identity}:
      Growth.projection_growth_bound(
        machine,
        Core.bundled_lookup(
          Core.supporting_lookup(Core.machine_facts(machine), identity),
          machine,
          owner,
          index,
          symbol,
          depth,
          expected,
          identity
        ),
        Dispatch.bundled_lookup_preserves_projection(
          Core.supporting_lookup(Core.machine_facts(machine), identity),
          machine,
          owner,
          index,
          symbol,
          depth,
          expected,
          identity
        )
      )

def Growth.reference_kind_rank_bound(kind, target, machine, owner, index, symbol, depth, expected):
  match kind:
    case Core.Unsupported{}:
      Growth.projection_growth_bound(
        machine,
        Core.omit(machine, owner, index, symbol, Core.UnsupportedTarget{}),
        Dispatch.omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{})
      )
    case Core.Named{}: Growth.named_reference_rank_bound(
      target,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected
    )
