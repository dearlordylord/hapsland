import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./RANK_SUPPORT_LAWS.bend as Weight
import ./UNSEEN_PROOF.bend as UnseenProof
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_MEMBERSHIP_PROOF.bend as MembershipProof
import ./NUMERIC_SPEC_INVENTORY_LAWS.bend as Inventory
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

# Exact approved whole-interpreter inventory transports; no completion claim.
def Inventory.retained_weight_nonincreasing(before, after, amount, retains):
  match before after:
    case True{} True{}: {==}
    case True{} False{}:
      Empty.absurd(
        {Nat.is_le(amount, 0n) == True{} : Bool},
        BoolFacts.internal_false_ne_true(retains({==}))
      )
    case False{} True{}: NatFacts.zero_le(amount)
    case False{} False{}: NatFacts.le_refl(amount)

def Inventory.interpret_declaration_weight_nonincreasing(fuel, request, declaration):
  match declaration:
    case None{}: {==}
    case Some{Core.Declaration{_, +identity, _, _, +references}}:
      retains = {present => MembershipProof.interpret_preserves_visited(fuel, request, identity, present):
        {Member.request_member(request, identity) == True{} : Bool} ->
        {Member.result_member(Spec.interpret(fuel, request), identity) == True{} : Bool}}
      Inventory.retained_weight_nonincreasing(
        Member.request_member(request, identity),
        Member.result_member(Spec.interpret(fuel, request), identity),
        List.length(&2, Core.Reference, references), retains)

def Inventory.interpret_catalog_weight_nonincreasing(fuel, request, catalog):
  match catalog:
    case Own.DNil{}: {==}
    case Own.DCon{_, +declaration, +rest, _}:
      head = Inventory.interpret_declaration_weight_nonincreasing(fuel, request, declaration)
      tail = Inventory.interpret_catalog_weight_nonincreasing(fuel, request, rest)
      +before = Measure.visited(Measure.request_state(request))
      +after = Measure.visited(Measure.result_state(Spec.interpret(fuel, request)))
      NatFacts.add_le_add(
        Rank.unseen_declaration(after, declaration),
        Rank.unseen_catalog(after, rest),
        Rank.unseen_declaration(before, declaration),
        Rank.unseen_catalog(before, rest),
        head,
        tail
      )
