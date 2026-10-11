import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_MEMBERSHIP_LAWS.bend as Membership
import ./NUMERIC_SPEC_MEMBERSHIP_PROOF.bend as MembershipProof
import ./NUMERIC_SPEC_INVENTORY_LAWS.bend as Inventory
import ./NUMERIC_SPEC_INVENTORY_PROOF.bend as InventoryProof
import ./NUMERIC_SPEC_COMPLETION_BASE_LAWS.bend as Complete
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

# Actual interpreter kinds and full-reference state transport; no completion premise.
def Complete.interpret_root_conversion_exact(fuel, facts, path, name, expected, depth, state):
  match fuel:
    case 0n: {==}
    case 1n+remaining: {==}

def Complete.interpret_references_conversion_exact(
  fuel,
  items,
  facts,
  path,
  owner,
  index,
  depth,
  state
):
  match fuel:
    case 0n: {==}
    case 1n+remaining: {==}

def Complete.seen_membership_exact(state, identity):
  match state:
    case Spec.State{visited, budget, address, pending}: {==}

def Complete.enter_visited_exact(state, path, identity):
  match state:
    case Spec.State{visited, budget, address, pending}: {==}

def Complete.reference_declaration_weight_nonincreasing(
  fuel,
  reference,
  facts,
  path,
  owner,
  index,
  depth,
  state,
  declaration
):
  match declaration:
    case None{}: {==}
    case Some{Core.Declaration{_, +identity, _, _, +references}}:
      child_contract = {request => present => MembershipProof.interpret_preserves_visited(fuel, request, identity, present): Member.contract(fuel, identity)}
      retains = {present => Membership.reference_preserves_member(fuel, identity, reference, facts, path, owner, index, depth, state, present, child_contract):
        {Member.member(state, identity) == True{} : Bool} ->
        {Member.reference_member(Spec.reference(reference, facts, path, owner, index, depth, state, Spec.build_child(Spec.interpret(fuel))), identity) == True{} : Bool}}
      Inventory.retained_weight_nonincreasing(
        Member.member(state, identity),
        Member.reference_member(
          Spec.reference(
            reference,
            facts,
            path,
            owner,
            index,
            depth,
            state,
            Spec.build_child(Spec.interpret(fuel))
          ),
          identity
        ),
        List.length(&2, Core.Reference, references),
        retains
      )

def Complete.reference_catalog_weight_nonincreasing(
  fuel,
  reference,
  facts,
  path,
  owner,
  index,
  depth,
  state,
  catalog
):
  match catalog:
    case Own.DNil{}: {==}
    case Own.DCon{_, +head, +rest, _}:
      first = Complete.reference_declaration_weight_nonincreasing(
        fuel,
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        head
      )
      suffix = Complete.reference_catalog_weight_nonincreasing(
        fuel,
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        rest
      )
      +before = Measure.visited(state)
      +after = Member.reference_visited(
        Spec.reference(
          reference,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.build_child(Spec.interpret(fuel))
        )
      )
      NatFacts.add_le_add(
        Rank.unseen_declaration(after, head),
        Rank.unseen_catalog(after, rest),
        Rank.unseen_declaration(before, head),
        Rank.unseen_catalog(before, rest),
        first,
        suffix
      )
