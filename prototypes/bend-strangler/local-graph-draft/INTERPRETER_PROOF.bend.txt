import Base
import ./SPEC.bend as Spec
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_LAWS.bend as Laws
import ./INTERPRETER_INVENTORY_PROOF.bend as Inventory
import ./INTERPRETER_COMPLETION_DRIVER_PROOF.bend as Driver
import ./INTERPRETER_COMPLETION_RANK_PROOF.bend as Rank
import ./INTERPRETER_ORDER_PROOF.bend as Order

# Canonical original two-law owner. All recursive calls decrease actual fuel;
# both the child and sibling induction contracts are concretely instantiated.
def Laws.interpret_preserves_inventory(fuel, request, catalog, valid):
  Inventory.interpret_preserves_inventory(fuel, request, catalog, valid)

def Laws.interpret_and_flatten_complete(fuel, request, valid, enough):
  match fuel:
    case 0n:
      Empty.absurd(
        {Measure.projected_success(0n, request, Spec.interpret(0n, request)) == True{} : Bool},
        Order.internal_false_ne_true(
          Order.le_trans(
            1n,
            Measure.request_rank(request),
            0n,
            Rank.request_rank_positive(request),
            enough
          )
        )
      )
    case 1n++remaining:
      Driver.dispatch_complete(remaining, request, valid, enough,
        next => valid_next => enough_next =>
          Laws.interpret_and_flatten_complete(remaining, next, valid_next, enough_next),
        next => valid_next => enough_next =>
          Laws.interpret_and_flatten_complete(remaining, next, valid_next, enough_next))
