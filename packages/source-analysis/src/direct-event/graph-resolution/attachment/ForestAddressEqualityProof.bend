import Base
import ../ForestSpecification.bend as F
import ../WholeObservation.bend as O

# Existing mathlib Nat fact: vendor/bendlib/packages/bend-mathlib/nat.bend
# SHA256 445fb22805af3d01f9c9a08cefcf0e5d02f2ac750a424aeb1e0f0b6836f87991.
# The equality test is symmetric.
law is_eq_comm:
  for a: Nat
  for b: Nat
  {Nat.is_eq(a, b) == Nat.is_eq(b, a) : Bool}

def is_eq_comm(a, b):
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      {==}
    case 1n++p 1n++q:
      %is_eq_comm(p, q) : {Nat.is_eq(p, q) == _ : Bool}
      {==}

def same_route_symmetric(
  +left: List<&2, Nat>,
  +right: List<&2, Nat>
) -> { F.same_route(left, right) == F.same_route(right, left) : Bool }:
  match left right:
    case Nil{} Nil{}: {==}
    case Nil{} Con{_, _}: {==}
    case Con{_, _} Nil{}: {==}
    case +head <> +tail +other <> +rest:
      %is_eq_comm(head, other): {
        Bool.and(Nat.is_eq(head, other), F.same_route(tail, rest))
        == Bool.and(_, F.same_route(rest, tail)) : Bool
      }
      %same_route_symmetric(tail, rest): {
        Bool.and(Nat.is_eq(head, other), F.same_route(tail, rest))
        == Bool.and(Nat.is_eq(head, other), _) : Bool
      }
      {==}

def same_address_symmetric(
  +left: O.NodeAddress,
  +right: O.NodeAddress
) -> { F.same_address(left, right) == F.same_address(right, left) : Bool }:
  match left right:
    case O.NodeAddress{+episode, +route} O.NodeAddress{+other, +rest}:
      %is_eq_comm(episode, other): {
        Bool.and(Nat.is_eq(episode, other), F.same_route(route, rest))
        == Bool.and(_, F.same_route(rest, route)) : Bool
      }
      %same_route_symmetric(route, rest): {
        Bool.and(Nat.is_eq(episode, other), F.same_route(route, rest))
        == Bool.and(Nat.is_eq(episode, other), _) : Bool
      }
      {==}

