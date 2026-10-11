import Base
import ./MAP_WEIGHT_LAWS.bend as Laws
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ../../../../../../vendor/bendlib/packages/bend-mathlib/nat.bend as NatFacts

def Laws.left_reconstruction_weight_exact(position, sibling, result):
  match result:
    case Tuple{map, found}: {==}

def Laws.right_reconstruction_weight_exact(position, sibling, result):
  match result:
    case Tuple{map, found}: {==}

def Laws.leaf_lookup_inventory_bounded(value, comparison):
  match comparison:
    case Tuple{Tuple{key, leaf_key}, EQ{}}: NatFacts.le_refl(
      CoreTraversal.declaration_reference_count(value)
    )
    case Tuple{Tuple{key, leaf_key}, LT{}}: NatFacts.zero_le(
      CoreTraversal.declaration_reference_count(value)
    )
    case Tuple{Tuple{key, leaf_key}, GT{}}: NatFacts.zero_le(
      CoreTraversal.declaration_reference_count(value)
    )

def Laws.catalog_inventory_accumulator_exact(catalog, acc):
  match catalog:
    case MTip{}: {==}
    case MLeaf{key, value}: {==}
    case MNode{position, +lo, +hi}:
      %Equal.sym(
        Nat,
        CoreTraversal.catalog_reference_count(
          Map.values.go(
            &2,
            Maybe<&2, Core.Declaration>,
            lo,
            Map.values.go(&2, Maybe<&2, Core.Declaration>, hi, acc)
          )
        ),
        (Laws.inventory(
          lo
        ) + CoreTraversal.catalog_reference_count(
          Map.values.go(&2, Maybe<&2, Core.Declaration>, hi, acc)
        ) : Nat),
        Laws.catalog_inventory_accumulator_exact(
          lo,
          Map.values.go(&2, Maybe<&2, Core.Declaration>, hi, acc)
        )
      ):
        {
          _
          == ((Laws.inventory(
            lo
          ) + Laws.inventory(hi) : Nat) + CoreTraversal.catalog_reference_count(acc) : Nat)
          : Nat
        }
      %Equal.sym(Nat,
        CoreTraversal.catalog_reference_count(Map.values.go(&2, Maybe<&2, Core.Declaration>, hi, acc)),
        (Laws.inventory(hi) + CoreTraversal.catalog_reference_count(acc) : Nat),
        Laws.catalog_inventory_accumulator_exact(hi, acc)):
        {
          (Laws.inventory(lo) + _ : Nat)
          == ((Laws.inventory(
            lo
          ) + Laws.inventory(hi) : Nat) + CoreTraversal.catalog_reference_count(acc) : Nat)
          : Nat
        }
      NatFacts.add_assoc_sym(
        Laws.inventory(lo),
        Laws.inventory(hi),
        CoreTraversal.catalog_reference_count(acc)
      )

def Laws.catalog_inventory_exact(catalog):
  %NatFacts.add_zero(Laws.inventory(catalog)):
    {CoreTraversal.catalog_reference_count(Map.values(&2, Maybe<&2, Core.Declaration>, catalog)) == _ : Nat}
  Laws.catalog_inventory_accumulator_exact(catalog, [])

def Laws.routed_lookup_inventory_bounded(catalog, route):
  match catalog route:
    case MNode{position, MTip{}, +hi} Tuple{key, False{}}:
      NatFacts.zero_le(Laws.inventory(hi))
    case MNode{+position, MLeaf{+leaf_key, +value}, +hi} Tuple{+key, False{}}:
      %Equal.sym(
        Nat,
        Laws.result_weight(
          Map.lo(
            &2,
            Maybe<&2, Core.Declaration>,
            Maybe<&2, Core.Declaration>,
            position,
            hi,
            Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
          )
        ),
        Laws.result_weight(
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        ),
        Laws.left_reconstruction_weight_exact(
          position,
          hi,
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        )
      ):
        {
          Nat.is_le(_, (CoreTraversal.declaration_reference_count(value) + Laws.inventory(hi) : Nat))
          == True{}
          : Bool
        }
      NatFacts.le_trans(
        Laws.result_weight(
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        ),
        CoreTraversal.declaration_reference_count(value),
        (CoreTraversal.declaration_reference_count(value) + Laws.inventory(hi) : Nat),
        Laws.leaf_lookup_inventory_bounded(value, String.cmp(key, leaf_key)),
        NatFacts.le_add_right(CoreTraversal.declaration_reference_count(value), Laws.inventory(hi))
      )
    case MNode{+position, MNode{+child_position, +child_lo, +child_hi}, +hi} Tuple{+key, False{}}:
      %Equal.sym(
        Nat,
        Laws.result_weight(
          Map.lo(
            &2,
            Maybe<&2, Core.Declaration>,
            Maybe<&2, Core.Declaration>,
            position,
            hi,
            Map.get.go(
              Maybe<&2, Core.Declaration>,
              MNode{child_position, child_lo, child_hi},
              None{},
              Map.bit(key, child_position)
            )
          )
        ),
        Laws.result_weight(
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        ),
        Laws.left_reconstruction_weight_exact(
          position,
          hi,
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        )
      ):
        {
          Nat.is_le(
            _,
            (Laws.inventory(MNode{child_position, child_lo, child_hi}) + Laws.inventory(hi) : Nat)
          )
          == True{}
          : Bool
        }
      NatFacts.le_trans(
        Laws.result_weight(
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        ),
        Laws.inventory(MNode{child_position, child_lo, child_hi}),
        (Laws.inventory(MNode{child_position, child_lo, child_hi}) + Laws.inventory(hi) : Nat),
        Laws.routed_lookup_inventory_bounded(
          MNode{child_position, child_lo, child_hi},
          Map.bit(key, child_position)
        ),
        NatFacts.le_add_right(
          Laws.inventory(MNode{child_position, child_lo, child_hi}),
          Laws.inventory(hi)
        )
      )
    case MNode{position, +lo, MTip{}} Tuple{key, True{}}:
      NatFacts.zero_le((Laws.inventory(lo) + 0n : Nat))
    case MNode{+position, +lo, MLeaf{+leaf_key, +value}} Tuple{+key, True{}}:
      %Equal.sym(
        Nat,
        Laws.result_weight(
          Map.hi(
            &2,
            Maybe<&2, Core.Declaration>,
            Maybe<&2, Core.Declaration>,
            position,
            lo,
            Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
          )
        ),
        Laws.result_weight(
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        ),
        Laws.right_reconstruction_weight_exact(
          position,
          lo,
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        )
      ):
        {
          Nat.is_le(_, (Laws.inventory(lo) + CoreTraversal.declaration_reference_count(value) : Nat))
          == True{}
          : Bool
        }
      NatFacts.le_trans(
        Laws.result_weight(
          Map.get.leaf(Maybe<&2, Core.Declaration>, None{}, value, String.cmp(key, leaf_key))
        ),
        CoreTraversal.declaration_reference_count(value),
        (Laws.inventory(lo) + CoreTraversal.declaration_reference_count(value) : Nat),
        Laws.leaf_lookup_inventory_bounded(value, String.cmp(key, leaf_key)),
        NatFacts.le_add_left(CoreTraversal.declaration_reference_count(value), Laws.inventory(lo))
      )
    case MNode{+position, +lo, MNode{+child_position, +child_lo, +child_hi}} Tuple{+key, True{}}:
      %Equal.sym(
        Nat,
        Laws.result_weight(
          Map.hi(
            &2,
            Maybe<&2, Core.Declaration>,
            Maybe<&2, Core.Declaration>,
            position,
            lo,
            Map.get.go(
              Maybe<&2, Core.Declaration>,
              MNode{child_position, child_lo, child_hi},
              None{},
              Map.bit(key, child_position)
            )
          )
        ),
        Laws.result_weight(
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        ),
        Laws.right_reconstruction_weight_exact(
          position,
          lo,
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        )
      ):
        {
          Nat.is_le(
            _,
            (Laws.inventory(lo) + Laws.inventory(MNode{child_position, child_lo, child_hi}) : Nat)
          )
          == True{}
          : Bool
        }
      NatFacts.le_trans(
        Laws.result_weight(
          Map.get.go(
            Maybe<&2, Core.Declaration>,
            MNode{child_position, child_lo, child_hi},
            None{},
            Map.bit(key, child_position)
          )
        ),
        Laws.inventory(MNode{child_position, child_lo, child_hi}),
        (Laws.inventory(lo) + Laws.inventory(MNode{child_position, child_lo, child_hi}) : Nat),
        Laws.routed_lookup_inventory_bounded(
          MNode{child_position, child_lo, child_hi},
          Map.bit(key, child_position)
        ),
        NatFacts.le_add_left(
          Laws.inventory(MNode{child_position, child_lo, child_hi}),
          Laws.inventory(lo)
        )
      )
    case MTip{} _: {==}
    case MLeaf{key, value} _: NatFacts.zero_le(CoreTraversal.declaration_reference_count(value))

def Laws.lookup_inventory_bounded(catalog, key):
  match catalog:
    case MTip{}: {==}
    case MLeaf{leaf_key, value}:
      Laws.leaf_lookup_inventory_bounded(value, String.cmp(key, leaf_key))
    case MNode{+position, lo, hi}:
      Laws.routed_lookup_inventory_bounded(MNode{position, lo, hi}, Map.bit(key, position))
