import Base
import ./BOUNDARY.bend as Boundary

# Structural closure of the existing Boundary insertion history. This does
# not assume or prove membership properties of an arbitrary Patricia map.
def append_insert(
  +history: List<&2, String>,
  +catalog: Map<&2, Bool>,
  +inserted: String
) -> {
  Boundary.identities_go(List.append(&2, String, history, inserted <> []), catalog)
  == Map.set(&2, Bool, Boundary.identities_go(history, catalog), inserted, True{})
  : Map<&2, Bool>
}:
  match history:
    case []: {==}
    case head <> tail:
      append_insert(tail, Map.set(&2, Bool, catalog, head, True{}), inserted)

def main() -> Unit:
  Unit{}
