import Base
import ./core.bend as Core
import ./RANK_MACHINE_LAWS.bend as MachineLaws
import ./MACHINE_BASE_PROOF.bend as BaseProof
import ./EXPAND_RANK_PROOF.bend as Expand
import ./CONSUMING_RANK_PROOF.bend as Consume
import ./POSITIVE_RANK_PROOF.bend as Positive
import ./RANK_GROWTH_LAWS.bend as Growth
import ./GROWTH_PROOF.bend as GrowthProof
import ./RANK_DISPATCH_LAWS.bend as Dispatch
import ./DISPATCH_PROOF.bend as DispatchProof

# Canonical complete nine-law machine component gate, including actual dispatch.

def MachineLaws.rank_from_projection(machine):
  BaseProof.rank_from_projection(machine)

def MachineLaws.catalog_from_projection(machine):
  BaseProof.catalog_from_projection(machine)

def MachineLaws.reference_preserves_projection(machine, slot):
  BaseProof.reference_preserves_projection(machine, slot)

def MachineLaws.pending_preserves_projection(machine, pending):
  BaseProof.pending_preserves_projection(machine, pending)

def MachineLaws.budget_preserves_projection(machine, budget):
  BaseProof.budget_preserves_projection(machine, budget)

def MachineLaws.selected_expand_rank_bound(
  machine,
  declaration,
  key,
  owner,
  index,
  name,
  depth,
  selected,
  absent
):
  Expand.selected_expand_rank_bound(
    machine,
    declaration,
    key,
    owner,
    index,
    name,
    depth,
    selected,
    absent
  )

def MachineLaws.consuming_reference_rank_exact(machine, owner, depth, index, reference, rest):
  Consume.consuming_reference_rank_exact(machine, owner, depth, index, reference, rest)

def MachineLaws.nonterminal_rank_positive(machine, active):
  Positive.nonterminal_rank_positive(machine, active)

def MachineLaws.visit_reference_rank_bound(machine, owner, index, depth, reference):
  match reference:
    case Core.Reference{+kind, +name, +expected, +target}:
      +intermediate = Core.observe_machine_depth(machine, (depth + 1n : Nat))
      same = Dispatch.observe_machine_depth_preserves_projection(machine, (depth + 1n : Nat))
      growth = Growth.reference_kind_rank_bound(
        kind,
        target,
        intermediate,
        owner,
        index,
        name,
        depth,
        expected
      )
      Growth.projection_transports_growth(
        machine,
        intermediate,
        Core.reference_kind(kind, target, intermediate, owner, index, name, depth, expected),
        same,
        growth
      )
