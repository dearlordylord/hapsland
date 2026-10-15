import Base
import ./Model.bend as M
import ./Potential.bend as P

# Child expansion consumes only inventory present in the actual last-wins
# lookup catalog. None and already-expanded results have zero fresh charge.
law selected_target_drop:
  for +catalog: M.Catalog
  for +name: String
  for +target_id: Maybe<&2, String>
  for +expanded: List<&2, String>
  { P.selected_drop(catalog, name, target_id, expanded) == True{} : Bool }

def main() -> Unit:
  Unit{}
