import Base
import ./RetainedForestProjection.bend as P
import ../Core.bend as Core
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ../traversal/core.bend as Local

# Proof-only invariant for the one materialization transport. Uses the real
# node list and built-product map; no duplicate runtime representation.
def suffix_weight(nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>) -> Nat:
  match nodes:
    case Nil{}: 0n
    case Con{Local.PlannedNode{id, _}, tail}:
      (2n + List.length(&2, Local.ReferenceSlot, P.owner_slots(slots, id))
        + suffix_weight(tail, slots) : Nat)

def suffix_allowance(nodes: List<&2, Local.PlannedNode>,
    slots: List<&2, Local.ReferenceSlot>) -> Nat:
  (suffix_weight(nodes, slots) + 2n : Nat)

def rendered_node(+id: Nat, +suffix: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>,
    +forest: F.Forest, +built: Map<&2, Maybe<&2, T.ProductValue>>) -> Type:
  Exists(O.NodeAddress, address =>
    Exists(T.ProductValue, value =>
      {F.address_at(addresses, id) == Some{address} : Maybe<&2, O.NodeAddress>} &
      {Core.map_read(Maybe<&2, T.ProductValue>, None{}, built, Nat.show(id))
        == Some{value} : Maybe<&2, T.ProductValue>} &
      @+extra: Nat ->
        {F.materialize((suffix_allowance(suffix, slots) + extra : Nat), forest, address)
          == F.Materialized{value} : F.Materialization}))

def rendered_suffix(nodes: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +addresses: List<&2, F.AddressEntry>,
    +forest: F.Forest, +built: Map<&2, Maybe<&2, T.ProductValue>>) -> Type:
  match nodes:
    case Nil{}: Unit
    case Con{Local.PlannedNode{+id, +handle}, +tail}:
      rendered_node(id, Con{Local.PlannedNode{id, handle}, tail},
        slots, addresses, forest, built) &
      rendered_suffix(tail, slots, addresses, forest, built)

def main() -> Unit:
  Unit{}
