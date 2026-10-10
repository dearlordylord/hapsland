import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_MACHINE.bend as Machine
import ./MACHINE_BASE_PROOF.bend as BaseProof

import ./RANK_DISPATCH_LAWS.bend as Dispatch

# Implements all nineteen exact Astra-approved dispatch support laws.

def Dispatch.observe_machine_depth_preserves_projection(machine, depth):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def Dispatch.charge_machine_work_preserves_projection(machine):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def Dispatch.charge_machine_target_preserves_projection(machine, key):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def Dispatch.omit_preserves_projection(machine, owner, index, name, reason):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def Dispatch.include_preserves_projection(machine, owner, index, name, identity):
  match machine:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _}: {==}

def Dispatch.queue_import_preserves_projection(
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  imported
):
  match machine imported:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _} Core.ImportBinding{
      path,
      name,
      type_only,
      composite
    }: {==}

def Dispatch.import_by_kind_preserves_projection(
  expected,
  type_only,
  machine,
  owner,
  index,
  symbol,
  depth,
  imported
):
  match expected type_only:
    case Core.FunctionKind{} True{}:
      Dispatch.omit_preserves_projection(machine, owner, index, symbol, Core.UnsupportedTarget{})
    case Core.FunctionKind{} False{}:
      Dispatch.queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.FunctionKind{},
        imported
      )
    case Core.AnyKind{} _:
      Dispatch.queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.AnyKind{},
        imported
      )
    case Core.TypeKind{} _:
      Dispatch.queue_import_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.TypeKind{},
        imported
      )

def Dispatch.import_present_preserves_projection(
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  imported
):
  match imported:
    case None{}:
      Dispatch.omit_preserves_projection(machine, owner, index, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{path, name, type_only, composite}}:
      Dispatch.import_by_kind_preserves_projection(
        expected,
        type_only,
        machine,
        owner,
        index,
        symbol,
        depth,
        Core.ImportBinding{path, name, type_only, composite}
      )

def Dispatch.charge_if_local_preserves_projection(local, machine):
  match local:
    case None{}: {==}
    case Some{declaration}: Dispatch.charge_machine_work_preserves_projection(machine)

def Dispatch.bundled_queue_preserves_projection(
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  declaration
):
  match machine declaration:
    case Core.Machine{facts, _, frames, visited, _, _, _, _, _} Core.Declaration{
      handle,
      identity,
      function,
      bundled,
      references
    }: {==}

def Dispatch.bundled_materialize_preserves_projection(
  visited,
  machine,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  match visited:
    case True{}:
      Dispatch.include_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        Core.declaration_identity(declaration)
      )
    case False{}:
      Dispatch.bundled_queue_preserves_projection(
        machine,
        owner,
        index,
        symbol,
        depth,
        expected,
        declaration
      )

def Dispatch.bundled_budget_preserves_projection(
  allowed,
  visited,
  machine,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  match allowed:
    case False{}: Dispatch.omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.ReferenceLimit{}
    )
    case True{}: Dispatch.bundled_materialize_preserves_projection(
      visited,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    )

def Dispatch.charge_if_visited_preserves_projection(visited, machine):
  match visited:
    case True{}: Dispatch.charge_machine_work_preserves_projection(machine)
    case False{}: {==}

def Dispatch.bundled_charged_preserves_projection(
  machine,
  visited,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  Dispatch.bundled_budget_preserves_projection(
    Core.machine_allows(machine),
    visited,
    machine,
    declaration,
    owner,
    index,
    symbol,
    depth,
    expected
  )

def Dispatch.projection_equal_rank(before, after, same):
  Equal.trans(
    Nat,
    Rank.rank(after),
    Machine.projected_rank(Machine.projection(after)),
    Rank.rank(before),
    BaseProof.rank_from_projection(after),
    Equal.trans(
      Nat,
      Machine.projected_rank(Machine.projection(after)),
      Machine.projected_rank(Machine.projection(before)),
      Rank.rank(before),
      Equal.cong(
        Machine.Traversal,
        Nat,
        Machine.projected_rank,
        Machine.projection(after),
        Machine.projection(before),
        same
      ),
      Equal.sym(
        Nat,
        Rank.rank(before),
        Machine.projected_rank(Machine.projection(before)),
        BaseProof.rank_from_projection(before)
      )
    )
  )

def Dispatch.bundled_seen_preserves_projection(
  visited,
  machine,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  +intermediate = Core.charge_if_visited(visited, machine)
  final = Core.bundled_charged(
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
    Machine.Traversal,
    Machine.projection(final),
    Machine.projection(intermediate),
    Machine.projection(machine),
    Dispatch.bundled_charged_preserves_projection(
      intermediate,
      visited,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    Dispatch.charge_if_visited_preserves_projection(visited, machine)
  )

def Dispatch.bundled_target_preserves_projection(
  machine,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  +identity = Core.declaration_identity(declaration)
  +intermediate = Core.charge_machine_target(machine, identity)
  +visited = Core.has_identity(Core.machine_visited(machine), identity)
  final = Core.bundled_seen(
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
    Machine.Traversal,
    Machine.projection(final),
    Machine.projection(intermediate),
    Machine.projection(machine),
    Dispatch.bundled_seen_preserves_projection(
      visited,
      intermediate,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    Dispatch.charge_machine_target_preserves_projection(machine, identity)
  )

def Dispatch.bundled_admit_preserves_projection(
  valid,
  machine,
  declaration,
  owner,
  index,
  symbol,
  depth,
  expected
):
  match valid:
    case False{}: Dispatch.omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case True{}: Dispatch.bundled_target_preserves_projection(
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected
    )

def Dispatch.bundled_lookup_preserves_projection(
  found,
  machine,
  owner,
  index,
  symbol,
  depth,
  expected,
  target
):
  match found:
    case None{}: Dispatch.omit_preserves_projection(
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case Some{declaration}:
      Dispatch.bundled_admit_preserves_projection(
        Core.bundled_valid(declaration, target, expected),
        machine,
        declaration,
        owner,
        index,
        symbol,
        depth,
        expected
      )
