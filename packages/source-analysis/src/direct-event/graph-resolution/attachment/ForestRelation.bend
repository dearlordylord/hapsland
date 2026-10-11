import Base
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O

# Draft conjunct of the whole reachable Entry/Machine relation. This is not a
# restriction on raw resolver inputs or a separately accepted migration unit.
# Detached constructions remain in the counted forest after rollback.
def incoming_references(items: List<&2, F.Reference>, +address: O.NodeAddress) -> Nat:
  match items:
    case []: 0n
    case F.Expanded{_, child} <> tail:
      (Bool.pick(Nat, F.same_address(child, address), 1n, 0n)
        + incoming_references(tail, address) : Nat)
    case _ <> tail: incoming_references(tail, address)

def incoming(nodes: List<&2, F.Node>, +address: O.NodeAddress) -> Nat:
  match nodes:
    case []: 0n
    case F.Node{_, _, references} <> tail:
      (incoming_references(references, address) + incoming(tail, address) : Nat)

def references_valid(items: List<&2, F.Reference>, +owner: O.NodeAddress,
    +nodes: List<&2, F.Node>) -> Bool:
  match items:
    case []: True{}
    case F.Expanded{_, +child} <> tail:
      Bool.and(Nat.is_eq(F.count_address(nodes, child), 1n),
        Bool.and(F.born_after(owner, child), references_valid(tail, owner, nodes)))
    case _ <> tail: references_valid(tail, owner, nodes)

def nodes_valid(items: List<&2, F.Node>, +nodes: List<&2, F.Node>) -> Bool:
  match items:
    case []: True{}
    case F.Node{+address, _, references} <> tail:
      Bool.and(Nat.is_eq(F.count_address(nodes, address), 1n),
        Bool.and(Nat.is_le(incoming(nodes, address), 1n),
          Bool.and(references_valid(references, address, nodes), nodes_valid(tail, nodes))))

def root_valid(root: Maybe<&2, O.NodeAddress>, +nodes: List<&2, F.Node>) -> Bool:
  match root:
    case None{}: True{}
    case Some{+address}:
      Bool.and(Nat.is_eq(F.count_address(nodes, address), 1n),
        Nat.is_eq(incoming(nodes, address), 0n))

def retained(forest: F.Forest) -> Bool:
  match forest:
    case F.Forest{root, +nodes}:
      Bool.and(root_valid(root, nodes), nodes_valid(nodes, nodes))

# The actual frame's next_episode is above every retained occurrence. Failed
# pre-attachment attempts may reuse it; an appended construction advances it
# before any later attempt, and rollback retains that advanced value.
def episodes_before(items: List<&2, F.Node>, +next: Nat) -> Bool:
  match items:
    case []: True{}
    case F.Node{O.NodeAddress{episode, _}, _, _} <> tail:
      Bool.and(Nat.is_lt(episode, next), episodes_before(tail, next))

def frame_forest(+forest: F.Forest, next: Nat) -> Bool:
  match forest:
    case F.Forest{_, nodes}:
      Bool.and(retained(forest), episodes_before(nodes, next))

def main() -> Unit:
  Unit{}
