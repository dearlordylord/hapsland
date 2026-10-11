import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure

def weight(seen: Bool, amount: Nat) -> Nat:
  Own.choose(Nat, seen, 0n, next => amount)

# Monomorphic actual expressions for pre-proof finite inventory falsification.
def retained_weight_nonincreasing(before: Bool, after: Bool, +amount: Nat) -> Bool:
  Nat.is_le(weight(after, amount), weight(before, amount))

def interpret_declaration_weight_nonincreasing(+fuel: Nat, +request: Spec.Request,
    +declaration: Maybe<&2, Core.Declaration>) -> Bool:
  Nat.is_le(
    Rank.unseen_declaration(
      Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
      declaration
    ),
    Rank.unseen_declaration(Measure.visited(Measure.request_state(request)), declaration)
  )

def interpret_catalog_weight_nonincreasing(+fuel: Nat, +request: Spec.Request,
    +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>) -> Bool:
  Nat.is_le(
    Rank.unseen_catalog(
      Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
      catalog
    ),
    Rank.unseen_catalog(Measure.visited(Measure.request_state(request)), catalog)
  )
