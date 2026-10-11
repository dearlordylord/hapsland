import Base
import ./AttachmentNaturalArithmeticFacts.bend as N
import ./AttachmentCatalogDistinctProof.bend as D
import ../traversal/INTERPRETER_BOOL_FACTS.bend as B
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O
import ../Types.bend as T

# Exact existing address/count dependencies selected from ConstructionForestProof.
def same_route_refl(route: List<&2, Nat>) -> {F.same_route(route, route) == True{} : Bool}:
  match route:
    case []: {==}
    case +head <> +tail:
      B.and_eq_true(Nat.is_eq(head, head), F.same_route(tail, tail),
        N.is_eq_refl(head), same_route_refl(tail))


def address_refl(+address: O.NodeAddress) -> {F.same_address(address, address) == True{} : Bool}:
  match address:
    case O.NodeAddress{+episode, +route}:
      B.and_eq_true(
        Nat.is_eq(episode, episode),
        F.same_route(route, route),
        N.is_eq_refl(episode),
        same_route_refl(route)
      )

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
        N.add_assoc(
          Bool.pick(Nat, F.same_address(address, owner), 1n, 0n),
          F.count_address(tail, address),
          F.count_address(right, address)
        )
      )


def sum_zero_left(+left: Nat, +right: Nat, zero: {Nat.add(left, right) == 0n : Nat}) -> {left == 0n : Nat}:
  match left:
    case 0n: {==}
    case 1n+rest:
      Empty.absurd({1n+rest == 0n : Nat}, N.succ_ne_zero(Nat.add(rest, right))(zero))

def prefix_absent(+prefix: List<&2, F.Node>, +address: O.NodeAddress, +artifact: T.Artifact,
    +references: List<&2, F.Reference>, +tail: List<&2, F.Node>,
    unique: {F.count_address(List.append(&2, F.Node, prefix, F.Node{address, artifact, references} <> tail), address) == 1n : Nat}) ->
    {F.count_address(prefix, address) == 0n : Nat}:
  count: {Nat.add(F.count_address(prefix, address), Nat.add(Bool.pick(Nat, F.same_address(address, address), 1n, 0n), F.count_address(tail, address))) == 1n : Nat} =
    %count_append(prefix, F.Node{address, artifact, references} <> tail, address): {_ == 1n : Nat}
    unique
  one: {Nat.add(F.count_address(prefix, address), 1n+F.count_address(tail, address)) == 1n : Nat} =
    %address_refl(address): {Nat.add(F.count_address(prefix, address), Nat.add(Bool.pick(Nat, _, 1n, 0n), F.count_address(tail, address))) == 1n : Nat}
    count
  successor: {1n+Nat.add(F.count_address(prefix, address), F.count_address(tail, address)) == 1n : Nat} =
    %N.add_succ(F.count_address(prefix, address), F.count_address(tail, address)): {_ == 1n : Nat}
    one
  sum_zero_left(F.count_address(prefix, address), F.count_address(tail, address),
    N.succ_inj(Nat.add(F.count_address(prefix, address), F.count_address(tail, address)), 0n, successor))

def skip_step(+owner: O.NodeAddress, +artifact: T.Artifact, +references: List<&2, F.Reference>,
    +prefix: List<&2, F.Node>, +tail: List<&2, F.Node>, +address: O.NodeAddress,
    parts: {F.same_address(address, owner) == False{} : Bool} & {F.count_address(prefix, address) == 0n : Nat},
    recursive: {F.count_address(prefix, address) == 0n : Nat} ->
      {F.node_at(List.append(&2, F.Node, prefix, tail), address) == F.node_at(tail, address) : Maybe<&2, F.Node>}) ->
    {F.node_at(List.append(&2, F.Node, F.Node{owner, artifact, references} <> prefix, tail), address) == F.node_at(tail, address) : Maybe<&2, F.Node>}:
  match parts:
    case (different, zero):
      %Equal.sym(Bool, F.same_address(address, owner), False{}, different): {Bool.pick(Maybe<&2, F.Node>, _, Some{F.Node{owner, artifact, references}}, F.node_at(List.append(&2, F.Node, prefix, tail), address)) == F.node_at(tail, address) : Maybe<&2, F.Node>}
      recursive(zero)

def skip_absent(prefix: List<&2, F.Node>, +tail: List<&2, F.Node>, +address: O.NodeAddress,
    zero: {F.count_address(prefix, address) == 0n : Nat}) ->
    {F.node_at(List.append(&2, F.Node, prefix, tail), address) == F.node_at(tail, address) : Maybe<&2, F.Node>}:
  match prefix:
    case []: {==}
    case F.Node{+owner, +artifact, +references} <> +rest:
      skip_step(owner, artifact, references, rest, tail, address,
        D.zero_parts(F.same_address(address, owner), F.count_address(rest, address), zero),
        absent => skip_absent(rest, tail, address, absent))

def exact_node(+prefix: List<&2, F.Node>, +address: O.NodeAddress, +artifact: T.Artifact,
    +references: List<&2, F.Reference>, +tail: List<&2, F.Node>,
    unique: {F.count_address(List.append(&2, F.Node, prefix, F.Node{address, artifact, references} <> tail), address) == 1n : Nat}) ->
    {F.node_at(List.append(&2, F.Node, prefix, F.Node{address, artifact, references} <> tail), address) == Some{F.Node{address, artifact, references}} : Maybe<&2, F.Node>}:
  Equal.trans(Maybe<&2, F.Node>, F.node_at(List.append(&2, F.Node, prefix, F.Node{address, artifact, references} <> tail), address),
    F.node_at(F.Node{address, artifact, references} <> tail, address), Some{F.Node{address, artifact, references}},
    skip_absent(prefix, F.Node{address, artifact, references} <> tail, address, prefix_absent(prefix, address, artifact, references, tail, unique)),
    %Equal.sym(Bool, F.same_address(address, address), True{}, address_refl(address)): {Bool.pick(Maybe<&2, F.Node>, _, Some{F.Node{address, artifact, references}}, F.node_at(tail, address)) == Some{F.Node{address, artifact, references}} : Maybe<&2, F.Node>}
    {==})

def main() -> Unit:
  Unit{}


