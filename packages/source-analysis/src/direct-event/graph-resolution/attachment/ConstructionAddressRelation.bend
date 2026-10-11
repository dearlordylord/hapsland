import Base
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../traversal/core.bend as Local
import ../traversal/SPEC.bend as Recursive
import ./ForestRelation.bend as Relation

# Construction case of the whole Entry/Machine relation. Numeric aliases are
# permitted here: density is derived separately from actual local planner
# results, never imposed on raw trees or external resolver input.
# The three actual lists must have exactly the same order and extent.
def aligned(nodes: List<&2, Local.PlannedNode>, addresses: List<&2, F.AddressEntry>,
    occurrences: List<&2, F.Node>) -> Bool:
  match nodes addresses occurrences:
    case Nil{} Nil{} Nil{}: True{}
    case Con{Local.PlannedNode{local, _}, tail} Con{F.AddressEntry{other, address}, rest}
        Con{F.Node{birth, _, _}, more}:
      Bool.and(Nat.is_eq(local, other),
        Bool.and(F.same_address(address, birth), aligned(tail, rest, more)))
    case _ _ _: False{}

def actual_layout(flat: Recursive.Flat, created: F.Created) -> Bool:
  match flat created:
    case Recursive.Flat{nodes, _} F.Created{_, occurrences, addresses}:
      aligned(nodes, addresses, occurrences)
    case _ _: False{}

def created_forest(created: F.Created) -> F.Forest:
  match created:
    case F.Created{root, nodes, _}: F.Forest{Some{root}, nodes}

def construction_case(+created: F.Created, flat: Recursive.Flat, +episode: Nat,
    route: List<&2, Nat>) -> Bool:
  match created:
    case F.Created{root, _, _}:
      Bool.and(F.same_address(root, O.NodeAddress{episode, route}),
        Bool.and(actual_layout(flat, created),
          Relation.frame_forest(created_forest(created), (episode + 1n : Nat))))

def main() -> Unit:
  Unit{}
