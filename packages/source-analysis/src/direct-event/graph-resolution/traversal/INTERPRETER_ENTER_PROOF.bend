import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia
import ./INTERPRETER_INVENTORY_RELATION.bend as R
import ./INTERPRETER_INSERT_INVENTORY_PROOF.bend as Inventory
import ./patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert

def enter_progress(
  +state: Spec.State,
  +path: String,
  +identity: String,
  +before: Map<&2, Bool>,
  +catalog: Map<&2, Maybe<&2, Core.Declaration>>,
  incoming: {R.holds(Measure.visited(state), before, catalog)==True{}:Bool}
) -> {R.holds(Measure.visited(Spec.enter(state, path, identity)), before, catalog)==True{}:Bool}:
  match state:
    case Spec.State{+visited, +budget, +address, +pending}:
      +incoming=incoming
      +valid=R.lawful(visited, before, catalog, incoming)
      +updated=Map.set(&2, Bool, visited, identity, True{})
      inserted=Insert.set_preserves_canonical(Bool, visited, identity, True{}, valid)
      decreased=Inventory.catalog_nonincreasing(catalog, visited, identity, valid)
      progress=R.conjoin(
        Patricia.canonical(Bool, updated),
        Nat.is_le(Rank.unseen_catalog(updated, catalog), Rank.unseen_catalog(visited, catalog)),
        inserted,
        decreased
      )
      R.compose(updated, visited, before, catalog, progress, incoming)

