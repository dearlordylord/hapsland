import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia
import ./INTERPRETER_ENTER_PROOF.bend as Enter
import ./INTERPRETER_INVENTORY_TRANSPORT_PROOF.bend as Transport
import ./INTERPRETER_INVENTORY_RELATION.bend as R
import ./INTERPRETER_PROJECTIONS_PROOF.bend as Prim

# Exact approved whole-interpreter law. The implementation parameter is supplied
# by the concrete actual Map.set proof, not exposed as an additional premise.
law interpret_preserves_inventory:
  for +fuel: Nat
  for +request: Spec.Request
  for +catalog: Map<&2, Maybe<&2, Core.Declaration>>
  for valid: {
    Patricia.canonical(Bool, Measure.visited(Measure.request_state(request))) == True{} : Bool
  }
  {
    Bool.and(
      Patricia.canonical(
        Bool,
        Measure.visited(Measure.result_state(Spec.interpret(fuel, request)))
      ),
      Nat.is_le(
        Rank.unseen_catalog(
          Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
          catalog
        ),
        Rank.unseen_catalog(Measure.visited(Measure.request_state(request)), catalog)
      )
    )
    == True{}
    : Bool
  }

def interpret_preserves_inventory(fuel, request, catalog, valid):
  match fuel:
    case 0n:
      R.replace_after(
        Measure.visited(Measure.result_state(Spec.insufficient(request))),
        Measure.visited(Measure.request_state(request)),
        Measure.visited(Measure.request_state(request)),
        catalog,
        Prim.insufficient_visited_exact(request),
        R.reflexive(Measure.visited(Measure.request_state(request)), catalog, valid)
      )
    case 1n++remaining:
      Transport.dispatch_progress(Enter.enter_progress, remaining, request, catalog, valid,
        next => valid_next => interpret_preserves_inventory(remaining, next, catalog, valid_next),
        next => valid_next => interpret_preserves_inventory(remaining, next, catalog, valid_next))
