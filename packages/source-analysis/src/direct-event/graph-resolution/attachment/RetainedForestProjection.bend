import Base
import ../Types.bend as T
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../traversal/core.bend as Local

# Internal reachable-frame projection for the whole attachment relation.
# This deliberately validates more than Core.review_unit on arbitrary malformed
# frames. It is not an external-input restriction or a production representation.
# All retained occurrences, including rollback-detached nodes, remain in order.
def node_count(items: List<&2, Local.PlannedNode>, +id: Nat) -> Nat:
  match items:
    case []: 0n
    case Local.PlannedNode{other, _} <> tail:
      (Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n) + node_count(tail, id) : Nat)

def handle_count(items: List<&2, T.ArtifactEntry>, +id: Nat) -> Nat:
  match items:
    case []: 0n
    case T.ArtifactEntry{other, _} <> tail:
      (Bool.pick(Nat, Nat.is_eq(id, other), 1n, 0n) + handle_count(tail, id) : Nat)

def catalog_unique(items: List<&2, T.ArtifactEntry>, +all: List<&2, T.ArtifactEntry>) -> Bool:
  match items:
    case []: True{}
    case T.ArtifactEntry{id, _} <> tail:
      Bool.and(Nat.is_eq(handle_count(all, id), 1n), catalog_unique(tail, all))

def address_count(items: List<&2, F.AddressEntry>, +address: O.NodeAddress) -> Nat:
  match items:
    case []: 0n
    case F.AddressEntry{_, other} <> tail:
      (Bool.pick(Nat, F.same_address(address, other), 1n, 0n) + address_count(tail, address) : Nat)

def aligned(items: List<&2, Local.PlannedNode>, entries: List<&2, F.AddressEntry>,
    +all_nodes: List<&2, Local.PlannedNode>, +all_addresses: List<&2, F.AddressEntry>) -> Bool:
  match items entries:
    case Nil{} Nil{}: True{}
    case Con{Local.PlannedNode{+id, _}, tail} Con{F.AddressEntry{other, address}, rest}:
      Bool.and(Nat.is_eq(id, other), Bool.and(Nat.is_eq(node_count(all_nodes, id), 1n),
        Bool.and(Nat.is_eq(address_count(all_addresses, address), 1n),
          aligned(tail, rest, all_nodes, all_addresses))))
    case _ _: False{}

# Filtering preserves the original slot-list order; it never sorts indices.
def owner_slot(slot: Local.ReferenceSlot, owner: Nat,
    +rest: List<&2, Local.ReferenceSlot>) -> List<&2, Local.ReferenceSlot>:
  match slot:
    case Local.ReferenceSlot{+id, index, symbol, reference}:
      Bool.pick(List<&2, Local.ReferenceSlot>, Nat.is_eq(id, owner),
        Local.ReferenceSlot{id, index, symbol, reference} <> rest, rest)

def owner_slots(items: List<&2, Local.ReferenceSlot>, +owner: Nat) -> List<&2, Local.ReferenceSlot>:
  match items:
    case []: []
    case +slot <> tail:
      owner_slot(slot, owner, owner_slots(tail, owner))


def slots_owned(items: List<&2, Local.ReferenceSlot>, +nodes: List<&2, Local.PlannedNode>) -> Bool:
  match items:
    case []: True{}
    case Local.ReferenceSlot{owner, _, _, _} <> tail:
      Bool.and(Nat.is_eq(node_count(nodes, owner), 1n), slots_owned(tail, nodes))

def forward_reference(
  reference: Local.PlannedReference,
  later: List<&2, Local.PlannedNode>
) -> Bool:
  match reference:
    case Local.Expanded{id}: Nat.is_eq(node_count(later, id), 1n)
    case _: True{}

def indexed(items: List<&2, Local.ReferenceSlot>, +next: Nat,
    +later: List<&2, Local.PlannedNode>) -> Bool:
  match items:
    case []: True{}
    case Local.ReferenceSlot{_, index, _, reference} <> tail:
      Bool.and(Nat.is_eq(index, next),
        Bool.and(forward_reference(reference, later), indexed(tail, (next + 1n : Nat), later)))

def forward_nodes(
  items: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>
) -> Bool:
  match items:
    case []: True{}
    case Local.PlannedNode{id, _} <> +tail:
      Bool.and(indexed(owner_slots(slots, id), 0n, tail), forward_nodes(tail, slots))

def expanded_reference(address: Maybe<&2, O.NodeAddress>, symbol: String) -> Maybe<&2, F.Reference>:
  match address:
    case Some{child}: Some{F.Expanded{F.ReferenceSymbol{symbol}, child}}
    case None{}: None{}

def reference(
  slot: Local.ReferenceSlot,
  addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, F.Reference>:
  match slot:
    case Local.ReferenceSlot{_, _, symbol, Local.Included{identity}}:
      Some{F.Included{F.ReferenceSymbol{symbol}, F.ArtifactIdentity{identity}}}
    case Local.ReferenceSlot{_, _, symbol, Local.Omitted{reason, target}}:
      Some{F.Omitted{F.ReferenceSymbol{symbol}, F.ReferenceSymbol{target}, reason}}
    case Local.ReferenceSlot{_, _, symbol, Local.Expanded{child}}:
      expanded_reference(F.address_at(addresses, child), symbol)

def reference_prefix(
  item: Maybe<&2, F.Reference>,
  rest: Maybe<&2, List<&2, F.Reference>>
) -> Maybe<&2, List<&2, F.Reference>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def references(
  items: List<&2, Local.ReferenceSlot>,
  +addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, List<&2, F.Reference>>:
  match items:
    case []: Some{[]}
    case slot <> tail:
      reference_prefix(reference(slot, addresses), references(tail, addresses))

def projected_node(address: Maybe<&2, O.NodeAddress>, artifact: Maybe<&2, T.Artifact>,
    refs: Maybe<&2, List<&2, F.Reference>>) -> Maybe<&2, F.Node>:
  match address artifact refs:
    case Some{birth} Some{value} Some{items}: Some{F.Node{birth, value, items}}
    case _ _ _: None{}

def node_prefix(
  item: Maybe<&2, F.Node>,
  rest: Maybe<&2, List<&2, F.Node>>
) -> Maybe<&2, List<&2, F.Node>>:
  match item rest:
    case Some{head} Some{tail}: Some{head <> tail}
    case _ _: None{}

def nodes(
  items: List<&2, Local.PlannedNode>,
  +slots: List<&2, Local.ReferenceSlot>,
  +artifacts: List<&2, T.ArtifactEntry>,
  +addresses: List<&2, F.AddressEntry>
) -> Maybe<&2, List<&2, F.Node>>:
  match items:
    case []: Some{[]}
    case Local.PlannedNode{+id, handle} <> tail:
      node_prefix(projected_node(F.address_at(addresses, id), F.artifact_at(artifacts, handle),
        references(owner_slots(slots, id), addresses)), nodes(tail, slots, artifacts, addresses))

def forest(
  root: Maybe<&2, O.NodeAddress>,
  items: Maybe<&2, List<&2, F.Node>>
) -> Maybe<&2, F.Forest>:
  match root items:
    case Some{birth} Some{retained}: Some{F.Forest{Some{birth}, retained}}
    case _ _: None{}

def validated(valid: Bool, root: Nat, items: List<&2, Local.PlannedNode>,
    slots: List<&2, Local.ReferenceSlot>, artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>) -> Maybe<&2, F.Forest>:
  match valid:
    case False{}: None{}
    case True{}: forest(F.address_at(addresses, root), nodes(items, slots, artifacts, addresses))

def project(root: Nat, +items: List<&2, Local.PlannedNode>,
    +slots: List<&2, Local.ReferenceSlot>, +artifacts: List<&2, T.ArtifactEntry>,
    +addresses: List<&2, F.AddressEntry>) -> Maybe<&2, F.Forest>:
  validated(Bool.and(aligned(items, addresses, items, addresses),
    Bool.and(catalog_unique(artifacts, artifacts),
      Bool.and(slots_owned(slots, items), forward_nodes(items, slots)))),
    root, items, slots, artifacts, addresses)

def main() -> Unit:
  Unit{}
