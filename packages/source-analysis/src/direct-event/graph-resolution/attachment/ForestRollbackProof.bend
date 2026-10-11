import Base
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T
import ./ForestRelation.bend as Relation
import ./AttachmentNaturalArithmeticFacts.bend as Arithmetic
import ../traversal/INTERPRETER_NAT_FACTS.bend as Order
import ../traversal/core.bend as Local
import ../traversal/INTERPRETER_ORDER_PROOF.bend as BoolFacts

def same_route_equal(
  +left: List<&2, Nat>,
  +right: List<&2, Nat>,
  +same: {F.same_route(left, right) == True{} : Bool}
) -> {left == right : List<&2, Nat>}:
  match left right:
    case Nil{} Nil{}: {==}
    case Nil{} Con{_, _}: Empty.absurd(
      {left == right : List<&2, Nat>},
      BoolFacts.internal_false_ne_true(same)
    )
    case Con{_, _} Nil{}: Empty.absurd(
      {left == right : List<&2, Nat>},
      BoolFacts.internal_false_ne_true(same)
    )
    case +head <> +tail +other <> +rest:
      %Order.eq_of_is_eq(head, other,
        BoolFacts.eq_true_of_and_left(Nat.is_eq(head, other), F.same_route(tail, rest), same)):
        {head <> tail == _ <> rest : List<&2, Nat>}
      %same_route_equal(tail, rest,
        BoolFacts.eq_true_of_and_right(Nat.is_eq(head, other), F.same_route(tail, rest), same)):
        {head <> tail == head <> _ : List<&2, Nat>}
      {==}

def same_address_equal(
  +left: O.NodeAddress,
  +right: O.NodeAddress,
  +same: {F.same_address(left, right) == True{} : Bool}
) -> {left == right : O.NodeAddress}:
  match left right:
    case O.NodeAddress{+episode, +route} O.NodeAddress{+other, +rest}:
      %Order.eq_of_is_eq(episode, other,
        BoolFacts.eq_true_of_and_left(Nat.is_eq(episode, other), F.same_route(route, rest), same)):
        {O.NodeAddress{episode, route} == O.NodeAddress{_, rest} : O.NodeAddress}
      %same_route_equal(route, rest,
        BoolFacts.eq_true_of_and_right(Nat.is_eq(episode, other), F.same_route(route, rest), same)):
        {O.NodeAddress{episode, route} == O.NodeAddress{episode, _} : O.NodeAddress}
      {==}

def count_append(
  left: List<&2, F.Node>,
  +right: List<&2, F.Node>,
  +address: O.NodeAddress
) -> {
  F.count_address(List.append(&2, F.Node, left, right), address)
  == (F.count_address(left, address) + F.count_address(right, address) : Nat)
  : Nat
}:
  match left:
    case []: {==}
    case F.Node{+owner, artifact, references} <> +tail:
      %Equal.sym(Nat,
        F.count_address(List.append(&2, F.Node, tail, right), address),
        (F.count_address(tail, address) + F.count_address(right, address) : Nat),
        count_append(tail, right, address)): {
          (Bool.pick(Nat, F.same_address(address, owner), 1n, 0n) + _ : Nat)
          == ((Bool.pick(
            Nat,
            F.same_address(address, owner),
            1n,
            0n
          ) + F.count_address(tail, address) : Nat) + F.count_address(right, address) : Nat)
          : Nat
        }
      Equal.sym(
        Nat,
        ((Bool.pick(
          Nat,
          F.same_address(address, owner),
          1n,
          0n
        ) + F.count_address(tail, address) : Nat) + F.count_address(right, address) : Nat),
        (Bool.pick(
          Nat,
          F.same_address(address, owner),
          1n,
          0n
        ) + (F.count_address(tail, address) + F.count_address(right, address) : Nat) : Nat),
        Arithmetic.add_assoc(
          Bool.pick(Nat, F.same_address(address, owner), 1n, 0n),
          F.count_address(tail, address),
          F.count_address(right, address)
        )
      )


def incoming_append(
  left: List<&2, F.Node>,
  +right: List<&2, F.Node>,
  +address: O.NodeAddress
) -> {
  Relation.incoming(List.append(&2, F.Node, left, right), address)
  == (Relation.incoming(left, address) + Relation.incoming(right, address) : Nat)
  : Nat
}:
  match left:
    case []: {==}
    case F.Node{owner, artifact, +references} <> +tail:
      %Equal.sym(Nat,
        Relation.incoming(List.append(&2, F.Node, tail, right), address),
        (Relation.incoming(tail, address) + Relation.incoming(right, address) : Nat),
        incoming_append(tail, right, address)): {
          (Relation.incoming_references(references, address) + _ : Nat)
          == ((Relation.incoming_references(
            references,
            address
          ) + Relation.incoming(tail, address) : Nat) + Relation.incoming(right, address) : Nat)
          : Nat
        }
      Equal.sym(
        Nat,
        ((Relation.incoming_references(
          references,
          address
        ) + Relation.incoming(tail, address) : Nat) + Relation.incoming(right, address) : Nat),
        (Relation.incoming_references(
          references,
          address
        ) + (Relation.incoming(tail, address) + Relation.incoming(right, address) : Nat) : Nat),
        Arithmetic.add_assoc(
          Relation.incoming_references(references, address),
          Relation.incoming(tail, address),
          Relation.incoming(right, address)
        )
      )

# Child cone inclusion: routing through prefix+[index] stays under prefix.

# Proof-only observation of existing occurrence addresses. The actual
# replacement traversal and all retained nodes remain owned by F.
def node_addresses(items: List<&2, F.Node>) -> List<&2, O.NodeAddress>:
  match items:
    case []: []
    case F.Node{address, _, _} <> tail: address <> node_addresses(tail)

def result_nodes(result: F.Nodes) -> List<&2, F.Node>:
  match result:
    case F.Nodes{nodes, _}: nodes

def result_addresses(result: F.Nodes) -> List<&2, O.NodeAddress>:
  node_addresses(result_nodes(result))

def replaced_slots_addresses(
  +slots: F.Slots, +rest: F.Nodes, +address: O.NodeAddress,
  artifact: T.Artifact
) -> {
  result_addresses(F.replaced_slots(slots, rest, address, artifact))
  == address <> result_addresses(rest) : List<&2, O.NodeAddress>
}:
  match slots rest:
    case F.Slots{_, _} F.Nodes{_, _}: {==}

def replace_node_addresses(
  matches: Bool, +node: F.Node, +rest: F.Nodes, index: Nat, reference: F.Reference
) -> {
  result_addresses(F.replace_node(matches, node, rest, index, reference))
  == node_addresses(node <> result_nodes(rest)) : List<&2, O.NodeAddress>
}:
  match matches node rest:
    case False{} F.Node{_, _, _} F.Nodes{_, _}: {==}
    case True{} F.Node{+address, artifact, references} F.Nodes{_, _}:
      replaced_slots_addresses(
        F.replace_slot(references, index, reference),
        rest,
        address,
        artifact
      )

def prepend_addresses(
  +address: O.NodeAddress, +left: List<&2, O.NodeAddress>, +right: List<&2, O.NodeAddress>,
  exact: {left == right : List<&2, O.NodeAddress>}
) -> {address <> left == address <> right : List<&2, O.NodeAddress>}:
  %exact : {address <> left == address <> _ : List<&2, O.NodeAddress>}
  {==}

def replace_nodes_addresses(
  +items: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat, +reference: F.Reference
) -> {
  result_addresses(F.replace_nodes(items, owner, index, reference))
  == node_addresses(items) : List<&2, O.NodeAddress>
}:
  match items:
    case []: {==}
    case +node <> +tail:
      match node:
        case F.Node{+address, _, _}:
          Equal.trans(List<&2, O.NodeAddress>,
            result_addresses(F.replace_nodes(items, owner, index, reference)),
            address <> result_addresses(F.replace_nodes(tail, owner, index, reference)),
            node_addresses(items),
            replace_node_addresses(F.same_address(owner, address), node,
              F.replace_nodes(tail, owner, index, reference), index, reference),
            prepend_addresses(address,
              result_addresses(F.replace_nodes(tail, owner, index, reference)),
              node_addresses(tail), replace_nodes_addresses(tail, owner, index, reference)))

def addresses_before(items: List<&2, O.NodeAddress>, +next: Nat) -> Bool:
  match items:
    case []: True{}
    case O.NodeAddress{episode, _} <> tail:
      Bool.and(Nat.is_lt(episode, next), addresses_before(tail, next))

def node_episodes_exact(+items: List<&2, F.Node>, +next: Nat) -> {
  Relation.episodes_before(items, next)
  == addresses_before(node_addresses(items), next) : Bool
}:
  match items:
    case []: {==}
    case F.Node{O.NodeAddress{+episode, _}, _, _} <> +tail:
      %node_episodes_exact(tail, next) : {
        Bool.and(Nat.is_lt(episode, next), Relation.episodes_before(tail, next))
        == Bool.and(Nat.is_lt(episode, next), _) : Bool
      }
      {==}

def addresses_before_exact(
  +left: List<&2, O.NodeAddress>, +right: List<&2, O.NodeAddress>, +next: Nat,
  exact: {left == right : List<&2, O.NodeAddress>}
) -> {addresses_before(left, next) == addresses_before(right, next) : Bool}:
  %exact : {addresses_before(left, next) == addresses_before(_, next) : Bool}
  {==}

def replace_nodes_episodes(+items: List<&2, F.Node>, +owner: O.NodeAddress,
  +index: Nat, +reference: F.Reference, +next: Nat) -> {
  Relation.episodes_before(result_nodes(F.replace_nodes(items, owner, index, reference)), next)
  == Relation.episodes_before(items, next) : Bool
}:
  Equal.trans(Bool,
    Relation.episodes_before(result_nodes(F.replace_nodes(items, owner, index, reference)), next),
    addresses_before(result_addresses(F.replace_nodes(items, owner, index, reference)), next),
    Relation.episodes_before(items, next),
    node_episodes_exact(result_nodes(F.replace_nodes(items, owner, index, reference)), next),
    Equal.trans(Bool,
      addresses_before(result_addresses(F.replace_nodes(items, owner, index, reference)), next),
      addresses_before(node_addresses(items), next),
      Relation.episodes_before(items, next),
      addresses_before_exact(result_addresses(F.replace_nodes(items, owner, index, reference)),
        node_addresses(items), next, replace_nodes_addresses(items, owner, index, reference)),
      Equal.sym(Bool, Relation.episodes_before(items, next),
        addresses_before(node_addresses(items), next), node_episodes_exact(items, next))))

def address_occurrences(items: List<&2, O.NodeAddress>, +address: O.NodeAddress) -> Nat:
  match items:
    case []: 0n
    case other <> tail:
      (Bool.pick(Nat, F.same_address(address, other), 1n, 0n)
        + address_occurrences(tail, address) : Nat)

def node_occurrences_exact(+items: List<&2, F.Node>, +address: O.NodeAddress) -> {
  F.count_address(items, address)
  == address_occurrences(node_addresses(items), address) : Nat
}:
  match items:
    case []: {==}
    case F.Node{+other, _, _} <> +tail:
      %node_occurrences_exact(tail, address) : {
        (Bool.pick(Nat, F.same_address(address, other), 1n, 0n)
          + F.count_address(tail, address) : Nat)
        == (Bool.pick(Nat, F.same_address(address, other), 1n, 0n) + _ : Nat) : Nat
      }
      {==}

def address_occurrences_exact(
  +left: List<&2, O.NodeAddress>, +right: List<&2, O.NodeAddress>, +address: O.NodeAddress,
  exact: {left == right : List<&2, O.NodeAddress>}
) -> {address_occurrences(left, address) == address_occurrences(right, address) : Nat}:
  %exact : {address_occurrences(left, address) == address_occurrences(_, address) : Nat}
  {==}

def replace_nodes_occurrences(+items: List<&2, F.Node>, +owner: O.NodeAddress,
  +index: Nat, +reference: F.Reference, +address: O.NodeAddress) -> {
  F.count_address(result_nodes(F.replace_nodes(items, owner, index, reference)), address)
  == F.count_address(items, address) : Nat
}:
  Equal.trans(
    Nat,
    F.count_address(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
    address_occurrences(result_addresses(F.replace_nodes(items, owner, index, reference)), address),
    F.count_address(items, address),
    node_occurrences_exact(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
    Equal.trans(
      Nat,
      address_occurrences(
        result_addresses(F.replace_nodes(items, owner, index, reference)),
        address
      ),
      address_occurrences(node_addresses(items), address),
      F.count_address(items, address),
      address_occurrences_exact(
        result_addresses(F.replace_nodes(items, owner, index, reference)),
        node_addresses(items),
        address,
        replace_nodes_addresses(items, owner, index, reference)
      ),
      Equal.sym(
        Nat,
        F.count_address(items, address),
        address_occurrences(node_addresses(items), address),
        node_occurrences_exact(items, address)
      )
    )
  )

def slot_references(result: F.Slots) -> List<&2, F.Reference>:
  match result:
    case F.Slots{references, _}: references

def reference_weight(reference: F.Reference, address: O.NodeAddress) -> Nat:
  match reference:
    case F.Expanded{_, child}: Bool.pick(Nat, F.same_address(child, address), 1n, 0n)
    case _: 0n

def incoming_head(+head: F.Reference, +tail: List<&2, F.Reference>, +address: O.NodeAddress) -> {
  Relation.incoming_references(head <> tail, address)
  == (reference_weight(head, address) + Relation.incoming_references(tail, address) : Nat) : Nat
}:
  match head:
    case F.Expanded{_, _}: {==}
    case F.Included{_, _}: {==}
    case F.Omitted{_, _, _}: {==}

def slots_incoming_prefix(+slots: F.Slots, +head: F.Reference, +address: O.NodeAddress) -> {
  Relation.incoming_references(slot_references(F.slots_prefix(slots, head)), address)
  == (reference_weight(head, address)
    + Relation.incoming_references(slot_references(slots), address) : Nat) : Nat
}:
  match slots head:
    case F.Slots{_, _} F.Expanded{_, _}: {==}
    case F.Slots{_, _} F.Included{_, _}: {==}
    case F.Slots{_, _} F.Omitted{_, _, _}: {==}

# A replacement adds at most its own incoming weight. This handles both the
# old targets (weight zero) and the fresh attachment root (weight at most one).
def replacement_slot_incoming(+items: List<&2, F.Reference>, +index: Nat,
    +reference: F.Reference, +address: O.NodeAddress, +allowance: Nat,
    +weight: Order.le(reference_weight(reference, address), allowance)) ->
    Order.le(Relation.incoming_references(slot_references(F.replace_slot(items, index, reference)), address),
      (allowance + Relation.incoming_references(items, address) : Nat)):
  match items index:
    case [] _: Order.zero_le((allowance + 0n : Nat))
    case +head <> +tail 0n:
      %Equal.sym(Nat, Relation.incoming_references(reference <> tail, address),
        (reference_weight(reference, address) + Relation.incoming_references(tail, address) : Nat),
        incoming_head(reference, tail, address)):
        Order.le(_, (allowance + Relation.incoming_references(head <> tail, address) : Nat))
      Order.le_trans((reference_weight(reference, address) + Relation.incoming_references(tail, address) : Nat),
        (allowance + Relation.incoming_references(tail, address) : Nat),
        (allowance + Relation.incoming_references(head <> tail, address) : Nat),
        Order.add_le_add_right(reference_weight(reference, address), allowance, Relation.incoming_references(tail, address), weight),
        Order.add_le_add_left(Relation.incoming_references(tail, address), Relation.incoming_references(head <> tail, address), allowance,
          %Equal.sym(Nat, Relation.incoming_references(head <> tail, address),
            (reference_weight(head, address) + Relation.incoming_references(tail, address) : Nat), incoming_head(head, tail, address)):
            Order.le(Relation.incoming_references(tail, address), _)
          Order.add_le_add_right(0n, reference_weight(head, address), Relation.incoming_references(tail, address),
            Order.zero_le(reference_weight(head, address)))))
    case +head <> +tail 1n+++remaining:
      %Equal.sym(Nat, Relation.incoming_references(slot_references(F.slots_prefix(F.replace_slot(tail, remaining, reference), head)), address),
        (reference_weight(head, address) + Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address) : Nat),
        slots_incoming_prefix(F.replace_slot(tail, remaining, reference), head, address)):
        Order.le(_, (allowance + Relation.incoming_references(head <> tail, address) : Nat))
      %Equal.sym(Nat, Relation.incoming_references(head <> tail, address),
        (reference_weight(head, address) + Relation.incoming_references(tail, address) : Nat), incoming_head(head, tail, address)):
        Order.le((reference_weight(head, address) + Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address) : Nat), (allowance + _ : Nat))
      %Arithmetic.add_assoc(allowance, reference_weight(head, address), Relation.incoming_references(tail, address)):
        Order.le((reference_weight(head, address) + Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address) : Nat), _)
      %Arithmetic.add_comm(reference_weight(head, address), allowance):
        Order.le((reference_weight(head, address) + Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address) : Nat), (_ + Relation.incoming_references(tail, address) : Nat))
      %Equal.sym(Nat, ((reference_weight(head, address) + allowance : Nat) + Relation.incoming_references(tail, address) : Nat),
        (reference_weight(head, address) + (allowance + Relation.incoming_references(tail, address) : Nat) : Nat),
        Arithmetic.add_assoc(reference_weight(head, address), allowance, Relation.incoming_references(tail, address))):
        Order.le((reference_weight(head, address) + Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address) : Nat), _)
      Order.add_le_add_left(Relation.incoming_references(slot_references(F.replace_slot(tail, remaining, reference)), address),
        (allowance + Relation.incoming_references(tail, address) : Nat), reference_weight(head, address),
        replacement_slot_incoming(tail, remaining, reference, address, allowance, weight))

def omitted_slot_incoming(
  +items: List<&2, F.Reference>, +index: Nat, +symbol: F.ReferenceSymbol,
  +target: F.ReferenceSymbol, +reason: Local.Omission, +address: O.NodeAddress
) -> Order.le(
  Relation.incoming_references(
    slot_references(F.replace_slot(items, index, F.Omitted{symbol, target, reason})), address),
  Relation.incoming_references(items, address)
):
  match items index:
    case [] _: {==}
    case +head <> +tail 0n:
      %Equal.sym(Nat, Relation.incoming_references(head <> tail, address),
        (reference_weight(head, address) + Relation.incoming_references(tail, address) : Nat),
        incoming_head(head, tail, address)) : Order.le(
          Relation.incoming_references(tail, address),
          _
        )
      Order.add_le_add_right(0n, reference_weight(head, address),
        Relation.incoming_references(tail, address), Order.zero_le(reference_weight(head, address)))
    case +head <> +tail 1n+++remaining:
      %Equal.sym(Nat,
        Relation.incoming_references(slot_references(F.slots_prefix(
          F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason}), head)), address),
        (reference_weight(head, address) + Relation.incoming_references(slot_references(
          F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason})), address) : Nat),
        slots_incoming_prefix(F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason}),
          head, address)) : Order.le(_, Relation.incoming_references(items, address))
      %Equal.sym(Nat, Relation.incoming_references(head <> tail, address),
        (reference_weight(head, address) + Relation.incoming_references(tail, address) : Nat),
        incoming_head(head, tail, address)) : Order.le(
          (reference_weight(head, address) + Relation.incoming_references(slot_references(
            F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason})), address) : Nat), _)
      Order.add_le_add_left(Relation.incoming_references(slot_references(
          F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason})), address),
        Relation.incoming_references(tail, address), reference_weight(head, address),
        omitted_slot_incoming(tail, remaining, symbol, target, reason, address))

def replaced_slots_incoming(
  +slots: F.Slots, +rest: F.Nodes, owner: O.NodeAddress, artifact: T.Artifact,
  +address: O.NodeAddress
) -> {
  Relation.incoming(result_nodes(F.replaced_slots(slots, rest, owner, artifact)), address)
  == (Relation.incoming_references(slot_references(slots), address)
    + Relation.incoming(result_nodes(rest), address) : Nat) : Nat
}:
  match slots rest:
    case F.Slots{_, _} F.Nodes{_, _}: {==}

def node_references(node: F.Node) -> List<&2, F.Reference>:
  match node:
    case F.Node{_, _, references}: references

# Combine the two ordered incoming bounds without losing either allowance.
def incoming_bounds_sum(+first: Nat, +last: Nat, +first_allowance: Nat, +last_allowance: Nat,
    +old_first: Nat, +old_last: Nat,
    first_bound: Order.le(first, (first_allowance + old_first : Nat)),
    last_bound: Order.le(last, (last_allowance + old_last : Nat))) ->
    Order.le((first + last : Nat), ((first_allowance + last_allowance : Nat) + (old_first + old_last : Nat) : Nat)):
  %Equal.sym(Nat, ((first_allowance + last_allowance : Nat) + (old_first + old_last : Nat) : Nat),
    (first_allowance + (last_allowance + (old_first + old_last : Nat) : Nat) : Nat),
    Arithmetic.add_assoc(first_allowance, last_allowance, (old_first + old_last : Nat))):
    Order.le((first + last : Nat), _)
  %Arithmetic.add_assoc(last_allowance, old_first, old_last):
    Order.le((first + last : Nat), (first_allowance + _ : Nat))
  %Arithmetic.add_comm(old_first, last_allowance):
    Order.le((first + last : Nat), (first_allowance + (_ + old_last : Nat) : Nat))
  %Equal.sym(Nat, ((old_first + last_allowance : Nat) + old_last : Nat),
    (old_first + (last_allowance + old_last : Nat) : Nat), Arithmetic.add_assoc(old_first, last_allowance, old_last)):
    Order.le((first + last : Nat), (first_allowance + _ : Nat))
  %Arithmetic.add_assoc(first_allowance, old_first, (last_allowance + old_last : Nat)):
    Order.le((first + last : Nat), _)
  Order.add_le_add(first, last, (first_allowance + old_first : Nat), (last_allowance + old_last : Nat), first_bound, last_bound)

def replacement_node_incoming(+matches: Bool, +node: F.Node, +rest: F.Nodes, +index: Nat,
    +reference: F.Reference, +address: O.NodeAddress, +allowance: Nat, +remaining: Nat, +old_tail: Nat,
    weight: Order.le(reference_weight(reference, address), allowance),
    tail_bound: Order.le(Relation.incoming(result_nodes(rest), address), (Nat.mul(remaining, allowance) + old_tail : Nat))) ->
    Order.le(Relation.incoming(result_nodes(F.replace_node(matches, node, rest, index, reference)), address),
      (Nat.mul((Bool.pick(Nat, matches, 1n, 0n) + remaining : Nat), allowance)
        + (Relation.incoming_references(node_references(node), address) + old_tail : Nat) : Nat)):
  match matches node rest:
    case False{} F.Node{_, _, +references} F.Nodes{+tail, _}:
      incoming_bounds_sum(Relation.incoming_references(references, address), Relation.incoming(tail, address),
        0n, Nat.mul(remaining, allowance), Relation.incoming_references(references, address), old_tail,
        Order.le_refl(Relation.incoming_references(references, address)), tail_bound)
    case True{} F.Node{+owner, +artifact, +references} F.Nodes{+tail, +count}:
      %Equal.sym(Nat, Relation.incoming(result_nodes(F.replaced_slots(F.replace_slot(references, index, reference), F.Nodes{tail, count}, owner, artifact)), address),
        (Relation.incoming_references(slot_references(F.replace_slot(references, index, reference)), address) + Relation.incoming(tail, address) : Nat),
        replaced_slots_incoming(F.replace_slot(references, index, reference), F.Nodes{tail, count}, owner, artifact, address)):
        Order.le(_, (Nat.mul((1n + remaining : Nat), allowance) + (Relation.incoming_references(references, address) + old_tail : Nat) : Nat))
      incoming_bounds_sum(Relation.incoming_references(slot_references(F.replace_slot(references, index, reference)), address), Relation.incoming(tail, address),
        allowance, Nat.mul(remaining, allowance), Relation.incoming_references(references, address), old_tail,
        replacement_slot_incoming(references, index, reference, address, allowance, weight), tail_bound)

def replacement_nodes_incoming(+items: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
    +reference: F.Reference, +address: O.NodeAddress, +allowance: Nat,
    +weight: Order.le(reference_weight(reference, address), allowance)) ->
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
      (Nat.mul(F.count_address(items, owner), allowance) + Relation.incoming(items, address) : Nat)):
  match items:
    case []: {==}
    case F.Node{+actual, +artifact, +references} <> +tail:
      replacement_node_incoming(F.same_address(owner, actual), F.Node{actual, artifact, references},
        F.replace_nodes(tail, owner, index, reference), index, reference, address, allowance, F.count_address(tail, owner), Relation.incoming(tail, address),
        weight, replacement_nodes_incoming(tail, owner, index, reference, address, allowance, weight))

def incoming_bit_bound(value: Bool) -> Order.le(Bool.pick(Nat, value, 1n, 0n), 1n):
  match value:
    case False{}: {==}
    case True{}: {==}

def reference_weight_bound(reference: F.Reference, address: O.NodeAddress) ->
    Order.le(reference_weight(reference, address), 1n):
  match reference:
    case F.Expanded{_, child}: incoming_bit_bound(F.same_address(child, address))
    case F.Included{_, _}: {==}
    case F.Omitted{_, _, _}: {==}

# Neither bound adds a premise to the attachment theorem: the new target is
# fresh, all old targets differ from it, and the selected owner occurs once.
def replacement_non_target_incoming(+items: List<&2, F.Node>, +owner: O.NodeAddress,
    +index: Nat, +reference: F.Reference, +address: O.NodeAddress,
    absent: {reference_weight(reference, address) == 0n : Nat}) ->
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
      Relation.incoming(items, address)):
  %Arithmetic.mul_zero(F.count_address(items, owner)):
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
      (_ + Relation.incoming(items, address) : Nat))
  replacement_nodes_incoming(items, owner, index, reference, address, 0n,
    %Equal.sym(Nat, reference_weight(reference, address), 0n, absent): Order.le(_, 0n)
    {==})

def replacement_fresh_incoming(+items: List<&2, F.Node>, +owner: O.NodeAddress,
    +index: Nat, +reference: F.Reference, +address: O.NodeAddress,
    selected: {F.count_address(items, owner) == 1n : Nat},
    fresh: {Relation.incoming(items, address) == 0n : Nat}) ->
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address), 1n):
  %selected:
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
      (Nat.mul(_, 1n) + 0n : Nat))
  %fresh:
    Order.le(Relation.incoming(result_nodes(F.replace_nodes(items, owner, index, reference)), address),
      (Nat.mul(F.count_address(items, owner), 1n) + _ : Nat))
  replacement_nodes_incoming(items, owner, index, reference, address, 1n, reference_weight_bound(reference, address))

def omitted_node_incoming(
  +matches: Bool, +node: F.Node, +rest: F.Nodes, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +address: O.NodeAddress
) -> Order.le(
  Relation.incoming(result_nodes(F.replace_node(matches, node, rest, index,
    F.Omitted{symbol, target, reason})), address),
  Relation.incoming(node <> result_nodes(rest), address)
):
  match matches node rest:
    case False{} F.Node{_, _, _} F.Nodes{_, _}:
      Order.le_refl(Relation.incoming(node <> result_nodes(rest), address))
    case True{} F.Node{+owner, +artifact, +references} F.Nodes{_, _}:
      %Equal.sym(Nat,
        Relation.incoming(result_nodes(F.replaced_slots(
          F.replace_slot(references, index, F.Omitted{symbol, target, reason}),
          rest, owner, artifact)), address),
        (Relation.incoming_references(slot_references(F.replace_slot(references, index,
            F.Omitted{symbol, target, reason})), address)
          + Relation.incoming(result_nodes(rest), address) : Nat),
        replaced_slots_incoming(F.replace_slot(references, index,
          F.Omitted{symbol, target, reason}), rest, owner, artifact, address)) : Order.le(_,
            Relation.incoming(node <> result_nodes(rest), address))
      Order.add_le_add_right(Relation.incoming_references(slot_references(
          F.replace_slot(references, index, F.Omitted{symbol, target, reason})), address),
        Relation.incoming_references(references, address),
        Relation.incoming(result_nodes(rest), address),
        omitted_slot_incoming(references, index, symbol, target, reason, address))

def omitted_nodes_incoming(
  +items: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +address: O.NodeAddress
) -> Order.le(
  Relation.incoming(result_nodes(F.replace_nodes(items, owner, index,
    F.Omitted{symbol, target, reason})), address),
  Relation.incoming(items, address)
):
  match items:
    case []: {==}
    case +node <> +tail:
      match node:
        case F.Node{+actual, _, +references}:
          Order.le_trans(
            Relation.incoming(result_nodes(F.replace_nodes(items, owner, index,
              F.Omitted{symbol, target, reason})), address),
            Relation.incoming(node <> result_nodes(F.replace_nodes(tail, owner, index,
              F.Omitted{symbol, target, reason})), address),
            Relation.incoming(items, address),
            omitted_node_incoming(F.same_address(owner, actual), node,
              F.replace_nodes(tail, owner, index, F.Omitted{symbol, target, reason}),
              index, symbol, target, reason, address),
            Order.add_le_add_left(Relation.incoming(result_nodes(F.replace_nodes(tail,
                owner, index, F.Omitted{symbol, target, reason})), address),
              Relation.incoming(tail, address), Relation.incoming_references(references, address),
              omitted_nodes_incoming(tail, owner, index, symbol, target, reason, address)))

def and_left(+a: Bool, +b: Bool, before: {True{} == Bool.and(a, b) : Bool}) -> {
  True{} == a : Bool
}:
  Equal.sym(Bool, a, True{}, BoolFacts.eq_true_of_and_left(a, b,
    Equal.sym(Bool, True{}, Bool.and(a, b), before)))

def and_right(+a: Bool, +b: Bool, before: {True{} == Bool.and(a, b) : Bool}) -> {
  True{} == b : Bool
}:
  Equal.sym(Bool, b, True{}, BoolFacts.eq_true_of_and_right(a, b,
    Equal.sym(Bool, True{}, Bool.and(a, b), before)))

def and_both(+a: Bool, +b: Bool, left: {True{} == a : Bool}, right: {True{} == b : Bool}) -> {
  True{} == Bool.and(a, b) : Bool
}:
  %left : {True{} == Bool.and(_, b) : Bool}
  right

def count_valid(+old: Nat, +next: Nat, exact: {next == old : Nat},
  before: {True{} == Nat.is_eq(old, 1n) : Bool}) -> {True{} == Nat.is_eq(next, 1n) : Bool}:
  %Equal.sym(Nat, next, old, exact) : {True{} == Nat.is_eq(_, 1n) : Bool}
  before

def occurrence_transport(+old: List<&2, F.Node>, +next: List<&2, F.Node>,
  +address: O.NodeAddress,
  exact: {node_addresses(next) == node_addresses(old) : List<&2, O.NodeAddress>}
) -> {F.count_address(next, address) == F.count_address(old, address) : Nat}:
  Equal.trans(Nat, F.count_address(next, address),
    address_occurrences(node_addresses(next), address), F.count_address(old, address),
    node_occurrences_exact(next, address),
    Equal.trans(Nat, address_occurrences(node_addresses(next), address),
      address_occurrences(node_addresses(old), address), F.count_address(old, address),
      address_occurrences_exact(node_addresses(next), node_addresses(old), address, exact),
      Equal.sym(Nat, F.count_address(old, address),
        address_occurrences(node_addresses(old), address), node_occurrences_exact(old, address))))

def replacement_reference_valid(+reference: F.Reference, +owner: O.NodeAddress,
    +old: List<&2, F.Node>, +next: List<&2, F.Node>,
    +exact: {node_addresses(next) == node_addresses(old) : List<&2, O.NodeAddress>},
    +valid: {True{} == F.reference_valid(reference, owner, old) : Bool}) ->
    {True{} == F.reference_valid(reference, owner, next) : Bool}:
  match reference:
    case F.Included{_, _}: {==}
    case F.Omitted{_, _, _}: {==}
    case F.Expanded{_, +child}:
      and_both(Nat.is_eq(F.count_address(next, child), 1n), F.born_after(owner, child),
        count_valid(F.count_address(old, child), F.count_address(next, child), occurrence_transport(old, next, child, exact),
          and_left(Nat.is_eq(F.count_address(old, child), 1n), F.born_after(owner, child), valid)),
        and_right(Nat.is_eq(F.count_address(old, child), 1n), F.born_after(owner, child), valid))

def references_transport(
  +items: List<&2, F.Reference>,
  +owner: O.NodeAddress,
  +old: List<&2, F.Node>,
  +next: List<&2, F.Node>,
  +exact: {node_addresses(next) == node_addresses(old) : List<&2, O.NodeAddress>},
  +before: {True{} == Relation.references_valid(items, owner, old) : Bool}
) -> {True{} == Relation.references_valid(items, owner, next) : Bool}:
  match items:
    case []: {==}
    case F.Included{_, _} <> tail: references_transport(tail, owner, old, next, exact, before)
    case F.Omitted{_, _, _} <> tail: references_transport(tail, owner, old, next, exact, before)
    case F.Expanded{_, +child} <> +tail:
      and_both(
        Nat.is_eq(F.count_address(next, child), 1n),
        Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, next)),
        count_valid(
          F.count_address(old, child),
          F.count_address(next, child),
          occurrence_transport(old, next, child, exact),
          and_left(
            Nat.is_eq(F.count_address(old, child), 1n),
            Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)),
            before
          )
        ),
        and_both(
          F.born_after(owner, child),
          Relation.references_valid(tail, owner, next),
          and_left(
            F.born_after(owner, child),
            Relation.references_valid(tail, owner, old),
            and_right(
              Nat.is_eq(F.count_address(old, child), 1n),
              Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)),
              before
            )
          ),
          references_transport(
            tail,
            owner,
            old,
            next,
            exact,
            and_right(
              F.born_after(owner, child),
              Relation.references_valid(tail, owner, old),
              and_right(
                Nat.is_eq(F.count_address(old, child), 1n),
                Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, old)),
                before
              )
            )
          )
        )
      )

def references_tail(
  +head: F.Reference, +tail: List<&2, F.Reference>, +owner: O.NodeAddress, +nodes: List<&2, F.Node>,
  before: {True{} == Relation.references_valid(head <> tail, owner, nodes) : Bool}
) -> {True{} == Relation.references_valid(tail, owner, nodes) : Bool}:
  match head:
    case F.Included{_, _}: before
    case F.Omitted{_, _, _}: before
    case F.Expanded{_, +child}:
      and_right(
        F.born_after(owner, child),
        Relation.references_valid(tail, owner, nodes),
        and_right(
          Nat.is_eq(F.count_address(nodes, child), 1n),
          Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, nodes)),
          before
        )
      )

def references_prepend(
  +head: F.Reference, +old: List<&2, F.Reference>, +next: List<&2, F.Reference>,
  +owner: O.NodeAddress, +nodes: List<&2, F.Node>,
  +before: {True{} == Relation.references_valid(head <> old, owner, nodes) : Bool},
  after: {True{} == Relation.references_valid(next, owner, nodes) : Bool}
) -> {True{} == Relation.references_valid(head <> next, owner, nodes) : Bool}:
  match head:
    case F.Included{_, _}: after
    case F.Omitted{_, _, _}: after
    case F.Expanded{_, +child}:
      and_both(
        Nat.is_eq(F.count_address(nodes, child), 1n),
        Bool.and(F.born_after(owner, child), Relation.references_valid(next, owner, nodes)),
        and_left(
          Nat.is_eq(F.count_address(nodes, child), 1n),
          Bool.and(F.born_after(owner, child), Relation.references_valid(old, owner, nodes)),
          before
        ),
        and_both(
          F.born_after(owner, child),
          Relation.references_valid(next, owner, nodes),
          and_left(
            F.born_after(owner, child),
            Relation.references_valid(old, owner, nodes),
            and_right(
              Nat.is_eq(F.count_address(nodes, child), 1n),
              Bool.and(F.born_after(owner, child), Relation.references_valid(old, owner, nodes)),
              before
            )
          ),
          after
        )
      )

def slots_references_prefix(+slots: F.Slots, +head: F.Reference) -> {
  slot_references(F.slots_prefix(slots, head))
  == head <> slot_references(slots) : List<&2, F.Reference>
}:
  match slots:
    case F.Slots{_, _}: {==}

def valid_reference_prepend(+reference: F.Reference, +items: List<&2, F.Reference>,
    +owner: O.NodeAddress, +nodes: List<&2, F.Node>,
    +valid: {True{} == F.reference_valid(reference, owner, nodes) : Bool},
    rest: {True{} == Relation.references_valid(items, owner, nodes) : Bool}) ->
    {True{} == Relation.references_valid(reference <> items, owner, nodes) : Bool}:
  match reference:
    case F.Included{_, _}: rest
    case F.Omitted{_, _, _}: rest
    case F.Expanded{_, +child}:
      and_both(Nat.is_eq(F.count_address(nodes, child), 1n),
        Bool.and(F.born_after(owner, child), Relation.references_valid(items, owner, nodes)),
        and_left(Nat.is_eq(F.count_address(nodes, child), 1n), F.born_after(owner, child), valid),
        and_both(F.born_after(owner, child), Relation.references_valid(items, owner, nodes),
          and_right(Nat.is_eq(F.count_address(nodes, child), 1n), F.born_after(owner, child), valid), rest))

def replacement_slot_valid(+items: List<&2, F.Reference>, +index: Nat, +reference: F.Reference,
    +owner: O.NodeAddress, +nodes: List<&2, F.Node>,
    +valid: {True{} == F.reference_valid(reference, owner, nodes) : Bool},
    +before: {True{} == Relation.references_valid(items, owner, nodes) : Bool}) ->
    {True{} == Relation.references_valid(slot_references(F.replace_slot(items, index, reference)), owner, nodes) : Bool}:
  match items index:
    case [] _: {==}
    case +head <> +tail 0n:
      valid_reference_prepend(reference, tail, owner, nodes, valid, references_tail(head, tail, owner, nodes, before))
    case +head <> +tail 1n+++remaining:
      %Equal.sym(List<&2, F.Reference>, slot_references(F.slots_prefix(F.replace_slot(tail, remaining, reference), head)),
        head <> slot_references(F.replace_slot(tail, remaining, reference)), slots_references_prefix(F.replace_slot(tail, remaining, reference), head)):
        {True{} == Relation.references_valid(_, owner, nodes) : Bool}
      references_prepend(head, tail, slot_references(F.replace_slot(tail, remaining, reference)), owner, nodes, before,
        replacement_slot_valid(tail, remaining, reference, owner, nodes, valid, references_tail(head, tail, owner, nodes, before)))

def omitted_slot_valid(
  +items: List<&2, F.Reference>, +index: Nat, +symbol: F.ReferenceSymbol,
  +target: F.ReferenceSymbol, +reason: Local.Omission,
  +owner: O.NodeAddress, +nodes: List<&2, F.Node>,
  +before: {True{} == Relation.references_valid(items, owner, nodes) : Bool}
) -> {True{} == Relation.references_valid(slot_references(
  F.replace_slot(items, index, F.Omitted{symbol, target, reason})), owner, nodes) : Bool}:
  match items index:
    case [] _: {==}
    case +head <> +tail 0n: references_tail(head, tail, owner, nodes, before)
    case +head <> +tail 1n+++remaining:
      %Equal.sym(List<&2, F.Reference>,
        slot_references(F.slots_prefix(F.replace_slot(tail, remaining,
          F.Omitted{symbol, target, reason}), head)),
        head <> slot_references(F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason})),
        slots_references_prefix(F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason}),
          head)) : {True{} == Relation.references_valid(_, owner, nodes) : Bool}
      references_prepend(head, tail,
        slot_references(F.replace_slot(tail, remaining, F.Omitted{symbol, target, reason})),
        owner, nodes, before,
        omitted_slot_valid(tail, remaining, symbol, target, reason, owner, nodes,
          references_tail(head, tail, owner, nodes, before)))

def incoming_valid(+old: Nat, +next: Nat, less: Order.le(next, old),
  before: {True{} == Nat.is_le(old, 1n) : Bool}) -> {True{} == Nat.is_le(next, 1n) : Bool}:
  Equal.sym(Bool, Nat.is_le(next, 1n), True{}, Order.le_trans(next, old, 1n, less,
    Equal.sym(Bool, True{}, Nat.is_le(old, 1n), before)))

def nodes_tail(
  +node: F.Node, +tail: List<&2, F.Node>, +all: List<&2, F.Node>,
  before: {True{} == Relation.nodes_valid(node <> tail, all) : Bool}
) -> {True{} == Relation.nodes_valid(tail, all) : Bool}:
  match node:
    case F.Node{+address, _, +references}:
      and_right(
        Relation.references_valid(references, address, all),
        Relation.nodes_valid(tail, all),
        and_right(
          Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(
            Relation.references_valid(references, address, all),
            Relation.nodes_valid(tail, all)
          ),
          and_right(
            Nat.is_eq(F.count_address(all, address), 1n),
            Bool.and(
              Nat.is_le(Relation.incoming(all, address), 1n),
              Bool.and(
                Relation.references_valid(references, address, all),
                Relation.nodes_valid(tail, all)
              )
            ),
            before
          )
        )
      )

def present_absent_branch(+nodes: List<&2, F.Node>, +present: O.NodeAddress, +absent: O.NodeAddress,
    counted: {Nat.is_eq(F.count_address(nodes, present), 1n) == True{} : Bool},
    missing: {F.count_address(nodes, absent) == 0n : Nat},
    same: Bool, equality: {F.same_address(present, absent) == same : Bool}) ->
    {F.same_address(present, absent) == False{} : Bool}:
  match same:
    case False{}: equality
    case True{}:
      Empty.absurd({F.same_address(present, absent) == False{} : Bool},
        BoolFacts.internal_false_ne_true(
          %missing: {Nat.is_eq(_, 1n) == True{} : Bool}
          %same_address_equal(present, absent, equality): {Nat.is_eq(F.count_address(nodes, _), 1n) == True{} : Bool}
          counted))

def present_absent_distinct(+nodes: List<&2, F.Node>, +present: O.NodeAddress, +absent: O.NodeAddress,
    counted: {Nat.is_eq(F.count_address(nodes, present), 1n) == True{} : Bool},
    missing: {F.count_address(nodes, absent) == 0n : Nat}) ->
    {F.same_address(present, absent) == False{} : Bool}:
  present_absent_branch(nodes, present, absent, counted, missing, F.same_address(present, absent), {==})

def valid_references_absent_incoming(items: List<&2, F.Reference>, +owner: O.NodeAddress,
    +nodes: List<&2, F.Node>, +query: O.NodeAddress,
    +valid: {True{} == Relation.references_valid(items, owner, nodes) : Bool},
    +absent: {F.count_address(nodes, query) == 0n : Nat}) ->
    {Relation.incoming_references(items, query) == 0n : Nat}:
  match items:
    case []: {==}
    case F.Included{_, _} <> tail: valid_references_absent_incoming(tail, owner, nodes, query, valid, absent)
    case F.Omitted{_, _, _} <> tail: valid_references_absent_incoming(tail, owner, nodes, query, valid, absent)
    case F.Expanded{+symbol, +child} <> +tail:
      %Equal.sym(Bool, F.same_address(child, query), False{},
        present_absent_distinct(nodes, child, query,
          Equal.sym(Bool, True{}, Nat.is_eq(F.count_address(nodes, child), 1n),
            and_left(Nat.is_eq(F.count_address(nodes, child), 1n),
              Bool.and(F.born_after(owner, child), Relation.references_valid(tail, owner, nodes)), valid)), absent)):
        {(Bool.pick(Nat, _, 1n, 0n) + Relation.incoming_references(tail, query) : Nat) == 0n : Nat}
      valid_references_absent_incoming(tail, owner, nodes, query,
        references_tail(F.Expanded{symbol, child}, tail, owner, nodes, valid), absent)

def valid_nodes_absent_incoming(items: List<&2, F.Node>, +all: List<&2, F.Node>, +query: O.NodeAddress,
    +valid: {True{} == Relation.nodes_valid(items, all) : Bool},
    +absent: {F.count_address(all, query) == 0n : Nat}) ->
    {Relation.incoming(items, query) == 0n : Nat}:
  match items:
    case []: {==}
    case F.Node{+address, +artifact, +references} <> +tail:
      +rest: {True{} == Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)) : Bool} =
        and_right(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)),
          and_right(Nat.is_eq(F.count_address(all, address), 1n),
            Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
              Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))), valid))
      %Equal.sym(Nat, Relation.incoming_references(references, query), 0n,
        valid_references_absent_incoming(references, address, all, query,
          and_left(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), rest), absent)):
        {(_ + Relation.incoming(tail, query) : Nat) == 0n : Nat}
      valid_nodes_absent_incoming(tail, all, query,
        and_right(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), rest), absent)

def episodes_before_append(items: List<&2, F.Node>, +suffix: List<&2, F.Node>, +next: Nat,
    +first: {True{} == Relation.episodes_before(items, next) : Bool},
    +last: {True{} == Relation.episodes_before(suffix, next) : Bool}) ->
    {True{} == Relation.episodes_before(List.append(&2, F.Node, items, suffix), next) : Bool}:
  match items:
    case []: last
    case F.Node{O.NodeAddress{+episode, _}, _, _} <> +tail:
      and_both(Nat.is_lt(episode, next), Relation.episodes_before(List.append(&2, F.Node, tail, suffix), next),
        and_left(Nat.is_lt(episode, next), Relation.episodes_before(tail, next), first),
        episodes_before_append(tail, suffix, next,
          and_right(Nat.is_lt(episode, next), Relation.episodes_before(tail, next), first), last))

def nodes_valid_append(items: List<&2, F.Node>, +suffix: List<&2, F.Node>, +all: List<&2, F.Node>,
    +first: {True{} == Relation.nodes_valid(items, all) : Bool},
    +last: {True{} == Relation.nodes_valid(suffix, all) : Bool}) ->
    {True{} == Relation.nodes_valid(List.append(&2, F.Node, items, suffix), all) : Bool}:
  match items:
    case []: last
    case F.Node{+address, _, +references} <> +tail:
      +rest: {True{} == Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
        Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))) : Bool} =
        and_right(Nat.is_eq(F.count_address(all, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
            Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))), first)
      +final: {True{} == Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)) : Bool} =
        and_right(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)), rest)
      and_both(Nat.is_eq(F.count_address(all, address), 1n),
        Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(List.append(&2, F.Node, tail, suffix), all))),
        and_left(Nat.is_eq(F.count_address(all, address), 1n),
          Bool.and(Nat.is_le(Relation.incoming(all, address), 1n),
            Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all))), first),
        and_both(Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(List.append(&2, F.Node, tail, suffix), all)),
          and_left(Nat.is_le(Relation.incoming(all, address), 1n),
            Bool.and(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all)), rest),
          and_both(Relation.references_valid(references, address, all), Relation.nodes_valid(List.append(&2, F.Node, tail, suffix), all),
            and_left(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), final),
            nodes_valid_append(tail, suffix, all,
              and_right(Relation.references_valid(references, address, all), Relation.nodes_valid(tail, all), final), last))))

def node_address(node: F.Node) -> O.NodeAddress:
  match node:
    case F.Node{address, _, _}: address


def node_prefix_valid(
  +node: F.Node,
  +rest: F.Nodes,
  changed: Nat,
  +all: List<&2, F.Node>,
  one: {True{} == Nat.is_eq(F.count_address(all, node_address(node)), 1n) : Bool},
  parents: {True{} == Nat.is_le(Relation.incoming(all, node_address(node)), 1n) : Bool},
  references: {
    True{}
    == Relation.references_valid(node_references(node), node_address(node), all)
    : Bool
  },
  tail: {True{} == Relation.nodes_valid(result_nodes(rest), all) : Bool}
) -> {
  True{}
  == Relation.nodes_valid(result_nodes(F.nodes_prefix(rest, node, changed)), all)
  : Bool
}:
  match node rest:
    case F.Node{+address, _, +items} F.Nodes{+nodes, _}:
      and_both(
        Nat.is_eq(F.count_address(all, address), 1n),
        Bool.and(
          Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(Relation.references_valid(items, address, all), Relation.nodes_valid(nodes, all))
        ),
        one,
        and_both(
          Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(
            Relation.references_valid(items, address, all),
            Relation.nodes_valid(nodes, all)
          ),
          parents,
          and_both(
            Relation.references_valid(items, address, all),
            Relation.nodes_valid(nodes, all),
            references,
            tail
          )
        )
      )

def replaced_slots_valid(
  +slots: F.Slots,
  rest: F.Nodes,
  +address: O.NodeAddress,
  artifact: T.Artifact,
  +all: List<&2, F.Node>,
  one: {True{} == Nat.is_eq(F.count_address(all, address), 1n) : Bool},
  parents: {True{} == Nat.is_le(Relation.incoming(all, address), 1n) : Bool},
  references: {True{} == Relation.references_valid(slot_references(slots), address, all) : Bool},
  tail: {True{} == Relation.nodes_valid(result_nodes(rest), all) : Bool}
) -> {
  True{}
  == Relation.nodes_valid(result_nodes(F.replaced_slots(slots, rest, address, artifact)), all)
  : Bool
}:
  match slots:
    case F.Slots{items, changed}:
      node_prefix_valid(
        F.Node{address, artifact, items},
        rest,
        changed,
        all,
        one,
        parents,
        references,
        tail
      )

def replacement_node_conditions(matches: Bool, +node: F.Node, +rest: F.Nodes,
    +owner: O.NodeAddress, +index: Nat, +reference: F.Reference, +all: List<&2, F.Node>,
    same: {F.same_address(owner, node_address(node)) == matches : Bool},
    valid: {True{} == F.reference_valid(reference, owner, all) : Bool},
    one: {True{} == Nat.is_eq(F.count_address(all, node_address(node)), 1n) : Bool},
    parents: {True{} == Nat.is_le(Relation.incoming(all, node_address(node)), 1n) : Bool},
    references: {True{} == Relation.references_valid(node_references(node), node_address(node), all) : Bool},
    tail: {True{} == Relation.nodes_valid(result_nodes(rest), all) : Bool}) ->
    {True{} == Relation.nodes_valid(result_nodes(F.replace_node(matches, node, rest, index, reference)), all) : Bool}:
  match matches node:
    case False{} _: node_prefix_valid(node, rest, 0n, all, one, parents, references, tail)
    case True{} F.Node{+address, artifact, +items}:
      replaced_slots_valid(F.replace_slot(items, index, reference), rest, address, artifact, all, one, parents,
        replacement_slot_valid(items, index, reference, address, all,
          %same_address_equal(owner, address, same): {True{} == F.reference_valid(reference, _, all) : Bool}
          valid, references), tail)

def apply_node_conditions(
  matches: Bool,
  +node: F.Node,
  +rest: F.Nodes,
  +index: Nat,
  +symbol: F.ReferenceSymbol,
  +target: F.ReferenceSymbol,
  +reason: Local.Omission,
  +all: List<&2, F.Node>,
  one: {True{} == Nat.is_eq(F.count_address(all, node_address(node)), 1n) : Bool},
  parents: {True{} == Nat.is_le(Relation.incoming(all, node_address(node)), 1n) : Bool},
  references: {
    True{}
    == Relation.references_valid(node_references(node), node_address(node), all)
    : Bool
  },
  tail: {True{} == Relation.nodes_valid(result_nodes(rest), all) : Bool}
) -> {True{} == Relation.nodes_valid(result_nodes(F.replace_node(matches, node, rest,
  index, F.Omitted{symbol, target, reason})), all) : Bool}:
  match matches node:
    case False{} _: node_prefix_valid(node, rest, 0n, all, one, parents, references, tail)
    case True{} F.Node{+address, artifact, +items}:
      replaced_slots_valid(F.replace_slot(items, index, F.Omitted{symbol, target, reason}),
        rest, address, artifact, all, one, parents,
        omitted_slot_valid(items, index, symbol, target, reason, address, all, references), tail)

def omitted_node_fields(
  +matches: Bool, +node: F.Node, +tail: List<&2, F.Node>, +rest: F.Nodes,
  +all: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +before: {True{} == Relation.nodes_valid(node <> tail, all) : Bool},
  after_tail: {True{} == Relation.nodes_valid(result_nodes(rest),
    result_nodes(F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason}))) : Bool}
) -> {True{} == Relation.nodes_valid(result_nodes(F.replace_node(matches, node, rest,
  index, F.Omitted{symbol, target, reason})),
  result_nodes(F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason}))) : Bool}:
  match node:
    case F.Node{+address, _, +references}:
      +next: List<&2, F.Node> = result_nodes(
        F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason})
      )
      +inner: {
        True{}
        == Bool.and(
          Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(
            Relation.references_valid(references, address, all),
            Relation.nodes_valid(tail, all)
          )
        )
        : Bool
      } =
          and_right(
            Nat.is_eq(F.count_address(all, address), 1n),
            Bool.and(
              Nat.is_le(Relation.incoming(all, address), 1n),
              Bool.and(
                Relation.references_valid(references, address, all),
                Relation.nodes_valid(tail, all)
              )
            ),
            before
          )
      +more: {True{} == Bool.and(Relation.references_valid(references, address, all),
        Relation.nodes_valid(tail, all)) : Bool} = and_right(
          Nat.is_le(Relation.incoming(all, address), 1n),
          Bool.and(
            Relation.references_valid(references, address, all),
            Relation.nodes_valid(tail, all)
          ),
          inner
        )
      apply_node_conditions(
        matches,
        node,
        rest,
        index,
        symbol,
        target,
        reason,
        next,
        count_valid(
          F.count_address(all, address),
          F.count_address(next, address),
          replace_nodes_occurrences(all, owner, index, F.Omitted{symbol, target, reason}, address),
          and_left(
            Nat.is_eq(F.count_address(all, address), 1n),
            Bool.and(
              Nat.is_le(Relation.incoming(all, address), 1n),
              Bool.and(
                Relation.references_valid(references, address, all),
                Relation.nodes_valid(tail, all)
              )
            ),
            before
          )
        ),
        incoming_valid(
          Relation.incoming(all, address),
          Relation.incoming(next, address),
          omitted_nodes_incoming(all, owner, index, symbol, target, reason, address),
          and_left(
            Nat.is_le(Relation.incoming(all, address), 1n),
            Bool.and(
              Relation.references_valid(references, address, all),
              Relation.nodes_valid(tail, all)
            ),
            inner
          )
        ),
        references_transport(
          references,
          address,
          all,
          next,
          replace_nodes_addresses(all, owner, index, F.Omitted{symbol, target, reason}),
          and_left(
            Relation.references_valid(references, address, all),
            Relation.nodes_valid(tail, all),
            more
          )
        ),
        after_tail
      )

def omitted_valid_nodes(
  +items: List<&2, F.Node>, +all: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +before: {True{} == Relation.nodes_valid(items, all) : Bool}
) -> {True{} == Relation.nodes_valid(
  result_nodes(F.replace_nodes(items, owner, index, F.Omitted{symbol, target, reason})),
  result_nodes(F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason}))) : Bool}:
  match items:
    case []: {==}
    case +node <> +tail:
      match node:
        case F.Node{+address, _, _}:
          omitted_node_fields(F.same_address(owner, address), node, tail,
            F.replace_nodes(tail, owner, index, F.Omitted{symbol, target, reason}), all,
            owner, index, symbol, target, reason, before,
            omitted_valid_nodes(tail, all, owner, index, symbol, target, reason,
              nodes_tail(node, tail, all, before)))

def less_zero(+value: Nat, less: Order.le(value, 0n)) -> {True{} == Nat.is_eq(value, 0n) : Bool}:
  match value:
    case 0n: {==}
    case 1n++_:
      Empty.absurd({True{} == Nat.is_eq(value, 0n) : Bool}, Order.internal_false_ne_true(less))

def incoming_zero_bound(+old: Nat, +next: Nat, less: Order.le(next, old),
  before: {True{} == Nat.is_eq(old, 0n) : Bool}) -> Order.le(next, 0n):
  %Order.eq_of_is_eq(old, 0n, Equal.sym(Bool, True{}, Nat.is_eq(old, 0n), before)) : Order.le(
    next,
    _
  )
  less

def replacement_root_valid(+root: O.NodeAddress, +all: List<&2, F.Node>, +owner: O.NodeAddress,
    +index: Nat, +reference: F.Reference,
    absent: {reference_weight(reference, root) == 0n : Nat},
    +before: {True{} == Relation.root_valid(Some{root}, all) : Bool}) ->
    {True{} == Relation.root_valid(Some{root}, result_nodes(F.replace_nodes(all, owner, index, reference))) : Bool}:
  +next: List<&2, F.Node> = result_nodes(F.replace_nodes(all, owner, index, reference))
  and_both(Nat.is_eq(F.count_address(next, root), 1n), Nat.is_eq(Relation.incoming(next, root), 0n),
    count_valid(F.count_address(all, root), F.count_address(next, root), replace_nodes_occurrences(all, owner, index, reference, root),
      and_left(Nat.is_eq(F.count_address(all, root), 1n), Nat.is_eq(Relation.incoming(all, root), 0n), before)),
    less_zero(Relation.incoming(next, root),
      incoming_zero_bound(Relation.incoming(all, root), Relation.incoming(next, root),
        replacement_non_target_incoming(all, owner, index, reference, root, absent),
        and_right(Nat.is_eq(F.count_address(all, root), 1n), Nat.is_eq(Relation.incoming(all, root), 0n), before))))

def omitted_valid_root(
  +root: Maybe<&2, O.NodeAddress>, +all: List<&2, F.Node>, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +before: {True{} == Relation.root_valid(root, all) : Bool}
) -> {True{} == Relation.root_valid(root,
  result_nodes(F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason}))) : Bool}:
  match root:
    case None{}: {==}
    case Some{+address}:
      +next: List<&2, F.Node> = result_nodes(
        F.replace_nodes(all, owner, index, F.Omitted{symbol, target, reason})
      )
      and_both(
        Nat.is_eq(F.count_address(next, address), 1n),
        Nat.is_eq(Relation.incoming(next, address), 0n),
        count_valid(
          F.count_address(all, address),
          F.count_address(next, address),
          replace_nodes_occurrences(all, owner, index, F.Omitted{symbol, target, reason}, address),
          and_left(
            Nat.is_eq(F.count_address(all, address), 1n),
            Nat.is_eq(Relation.incoming(all, address), 0n),
            before
          )
        ),
        less_zero(
          Relation.incoming(next, address),
          incoming_zero_bound(
            Relation.incoming(all, address),
            Relation.incoming(next, address),
            omitted_nodes_incoming(all, owner, index, symbol, target, reason, address),
            and_right(
              Nat.is_eq(F.count_address(all, address), 1n),
              Nat.is_eq(Relation.incoming(all, address), 0n),
              before
            )
          )
        )
      )

def transported_true(
  +old: Bool,
  +next: Bool,
  exact: {next == old : Bool},
  before: {True{} == old : Bool}
) -> {
  True{} == next : Bool
}:
  %Equal.sym(Bool, next, old, exact) : {True{} == _ : Bool}
  before

def replacement_valid(result: F.Replacement, next: Nat) -> Bool:
  match result:
    case F.ReplacementInvalid{}: True{}
    case F.Replaced{forest}: Relation.frame_forest(forest, next)

def omitted_replace_result(
  +result: F.Nodes, +root: Maybe<&2, O.NodeAddress>, +next: Nat,
  nodes: {True{} == Relation.nodes_valid(result_nodes(result), result_nodes(result)) : Bool},
  root_good: {True{} == Relation.root_valid(root, result_nodes(result)) : Bool},
  episodes: {True{} == Relation.episodes_before(result_nodes(result), next) : Bool}
) -> {True{} == replacement_valid(F.replacement(result, root), next) : Bool}:
  match result:
    case F.Nodes{_, 0n}: {==}
    case F.Nodes{+items, 1n}:
      and_both(
        Relation.retained(F.Forest{root, items}),
        Relation.episodes_before(items, next),
        and_both(
          Relation.root_valid(root, items),
          Relation.nodes_valid(items, items),
          root_good,
          nodes
        ),
        episodes
      )
    case F.Nodes{_, 2n++_}: {==}

def omitted_replace_allowed(
  +allowed: Bool, +forest: F.Forest, +next: Nat, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  +before: {True{} == Relation.frame_forest(forest, next) : Bool}
) -> {True{} == replacement_valid(F.replace_allowed(allowed, forest, owner, index,
  F.Omitted{symbol, target, reason}), next) : Bool}:
  match allowed forest:
    case False{} _: {==}
    case True{} F.Forest{+root, +items}:
      +retained: {True{} == Relation.retained(forest) : Bool} =
        and_left(Relation.retained(forest), Relation.episodes_before(items, next), before)
      omitted_replace_result(
        F.replace_nodes(items, owner, index, F.Omitted{symbol, target, reason}),
        root,
        next,
        omitted_valid_nodes(
          items,
          items,
          owner,
          index,
          symbol,
          target,
          reason,
          and_right(Relation.root_valid(root, items), Relation.nodes_valid(items, items), retained)
        ),
        omitted_valid_root(
          root,
          items,
          owner,
          index,
          symbol,
          target,
          reason,
          and_left(Relation.root_valid(root, items), Relation.nodes_valid(items, items), retained)
        ),
        transported_true(
          Relation.episodes_before(items, next),
          Relation.episodes_before(
            result_nodes(F.replace_nodes(items, owner, index, F.Omitted{symbol, target, reason})),
            next
          ),
          replace_nodes_episodes(items, owner, index, F.Omitted{symbol, target, reason}, next),
          and_right(Relation.retained(forest), Relation.episodes_before(items, next), before)
        )
      )

def omitted_replacement_valid(
  +forest: F.Forest, +next: Nat, +owner: O.NodeAddress, +index: Nat,
  +symbol: F.ReferenceSymbol, +target: F.ReferenceSymbol, +reason: Local.Omission,
  before: {True{} == Relation.frame_forest(forest, next) : Bool}
) -> {True{} == replacement_valid(F.replace(forest, owner, index,
  F.Omitted{symbol, target, reason}), next) : Bool}:
  match forest:
    case F.Forest{_, +items}:
      omitted_replace_allowed(Bool.and(Nat.is_eq(F.count_address(items, owner), 1n),
        F.reference_valid(F.Omitted{symbol, target, reason}, owner, items)),
        forest, next, owner, index, symbol, target, reason, before)

def main() -> Unit:
  Unit{}
