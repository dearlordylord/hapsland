import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./LAWS.bend as Laws
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def Laws.reference_inventory_append_exact(left, right):
  match left:
    case []: {==}
    case +head <> +tail:
      %Equal.sym(
        Nat,
        Core.catalog_reference_count(List.append(&2, Maybe<&2, Core.Declaration>, tail, right)),
        (Core.catalog_reference_count(tail) + Core.catalog_reference_count(right) : Nat),
        Laws.reference_inventory_append_exact(tail, right)
      ):
        {(Core.declaration_reference_count(head) + _ : Nat)
          == ((Core.declaration_reference_count(head) + Core.catalog_reference_count(tail) : Nat)
            + Core.catalog_reference_count(right) : Nat) : Nat}
      NatFacts.add_assoc_sym(Core.declaration_reference_count(head),
        Core.catalog_reference_count(tail), Core.catalog_reference_count(right))

def Laws.direct_inventory_exact(catalog):
  match catalog:
    case Own.DNil{}: {==}
    case Own.DLeaf{key, value}: NatFacts.add_zero_sym(Core.declaration_reference_count(value))
    case Own.DBranch{divisor, +zero, +one, count}:
      %Equal.sym(
        Nat,
        Core.trie_reference_count(zero),
        Core.catalog_reference_count(Own.values(Maybe<&2, Core.Declaration>, zero)),
        Laws.direct_inventory_exact(zero)
      ):
        {
          (_ + Core.trie_reference_count(one) : Nat)
          == Core.catalog_reference_count(
            List.append(
              &2,
              Maybe<&2, Core.Declaration>,
              Own.values(Maybe<&2, Core.Declaration>, zero),
              Own.values(Maybe<&2, Core.Declaration>, one)
            )
          )
          : Nat
        }
      %Equal.sym(
        Nat,
        Core.trie_reference_count(one),
        Core.catalog_reference_count(Own.values(Maybe<&2, Core.Declaration>, one)),
        Laws.direct_inventory_exact(one)
      ):
        {
          (Core.catalog_reference_count(Own.values(Maybe<&2, Core.Declaration>, zero)) + _ : Nat)
          == Core.catalog_reference_count(
            List.append(
              &2,
              Maybe<&2, Core.Declaration>,
              Own.values(Maybe<&2, Core.Declaration>, zero),
              Own.values(Maybe<&2, Core.Declaration>, one)
            )
          )
          : Nat
        }
      Equal.sym(
        Nat,
        Core.catalog_reference_count(
          List.append(
            &2,
            Maybe<&2, Core.Declaration>,
            Own.values(Maybe<&2, Core.Declaration>, zero),
            Own.values(Maybe<&2, Core.Declaration>, one)
          )
        ),
        (Core.catalog_reference_count(
          Own.values(Maybe<&2, Core.Declaration>, zero)
        ) + Core.catalog_reference_count(Own.values(Maybe<&2, Core.Declaration>, one)) : Nat),
        Laws.reference_inventory_append_exact(
          Own.values(Maybe<&2, Core.Declaration>, zero),
          Own.values(Maybe<&2, Core.Declaration>, one)
        )
      )
