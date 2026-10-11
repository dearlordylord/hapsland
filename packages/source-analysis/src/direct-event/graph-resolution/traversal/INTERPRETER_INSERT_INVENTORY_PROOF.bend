import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./RANK.bend as Rank
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia
import ./patricia-proof/PATRICIA_INSERT_PROOF.bend as Insert
import ./INTERPRETER_NAT_FACTS.bend as NatFacts

# Exact tuple projection, independent of the boundary-history qualification closure.
def identity_projection_exact(pair: Map<&2, Bool> & Bool) -> {
  Core.map_result(Bool, pair) == Insert.has_value(Bool, pair) : Bool
}:
  match pair:
    case Tuple{_, value}: {==}

# Verbatim already-checked monotonicity dependency from CHILD_INVENTORY_PROOF.
# Its selected-lookup routing proof is not needed by the whole interpreter induction.
def membership_union(+visited: Map<&2, Bool>, +identity: String, +query: String,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
  CoreTraversal.has_identity(Map.set(&2, Bool, visited, identity, True{}), query)
  == Bool.or(String.eq(query, identity), CoreTraversal.has_identity(visited, query)) : Bool
}:
  +updated = Map.set(&2, Bool, visited, identity, True{})
  append : Bool -> Bool = old => Bool.or(String.eq(query, identity), old)
  Equal.trans(
    Bool,
    CoreTraversal.has_identity(updated, query),
    Insert.has_value(Bool, Map.has(&2, Bool, updated, query)),
    Bool.or(String.eq(query, identity), CoreTraversal.has_identity(visited, query)),
    identity_projection_exact(Map.has(&2, Bool, updated, query)),
    Equal.trans(
      Bool,
      Insert.has_value(Bool, Map.has(&2, Bool, updated, query)),
      Bool.or(
        String.eq(query, identity),
        Insert.has_value(Bool, Map.has(&2, Bool, visited, query))
      ),
      Bool.or(String.eq(query, identity), CoreTraversal.has_identity(visited, query)),
      Insert.set_has_membership(Bool, visited, identity, True{}, query, valid),
      Equal.cong(
        Bool,
        Bool,
        append,
        Insert.has_value(Bool, Map.has(&2, Bool, visited, query)),
        CoreTraversal.has_identity(visited, query),
        Equal.sym(
          Bool,
          CoreTraversal.has_identity(visited, query),
          Insert.has_value(Bool, Map.has(&2, Bool, visited, query)),
          identity_projection_exact(Map.has(&2, Bool, visited, query))
        )
      )
    )
  )

def union_weight_nonincreasing(+seen: Bool, +same: Bool, +amount: Nat) -> {
  Nat.is_le(Rank.unseen_weight(Bool.or(same, seen), amount), Rank.unseen_weight(seen, amount))
  == True{} : Bool
}:
  match seen same:
    case True{} True{}: {==}
    case True{} False{}: {==}
    case False{} True{}: NatFacts.zero_le(amount)
    case False{} False{}: NatFacts.le_refl(amount)

def declaration_nonincreasing(+visited: Map<&2, Bool>, +identity: String,
  +declaration: Maybe<&2, Core.Declaration>,
  valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
  Nat.is_le(Rank.unseen_declaration(Map.set(&2, Bool, visited, identity, True{}), declaration),
    Rank.unseen_declaration(visited, declaration)) == True{} : Bool
}:
  match declaration:
    case None{}: {==}
    case Some{Core.Declaration{_, +name, _, _, +references}}:
      %Equal.sym(Bool,
        CoreTraversal.has_identity(Map.set(&2, Bool, visited, identity, True{}), name),
        Bool.or(String.eq(name, identity), CoreTraversal.has_identity(visited, name)),
        membership_union(visited, identity, name, valid)):
        {
          Nat.is_le(
            Rank.unseen_weight(_, List.length(&2, Core.Reference, references)),
            Rank.unseen_weight(
              CoreTraversal.has_identity(visited, name),
              List.length(&2, Core.Reference, references)
            )
          )
          == True{}
          : Bool
        }
      union_weight_nonincreasing(CoreTraversal.has_identity(visited, name), String.eq(name, identity),
        List.length(&2, Core.Reference, references))

def catalog_nonincreasing(catalog: Map<&2, Maybe<&2, Core.Declaration>>,
  +visited: Map<&2, Bool>, +identity: String,
  +valid: {Patricia.canonical(Bool, visited) == True{} : Bool}) -> {
  Nat.is_le(Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), catalog),
    Rank.unseen_catalog(visited, catalog)) == True{} : Bool
}:
  match catalog:
    case MTip{}: {==}
    case MLeaf{_, declaration}: declaration_nonincreasing(visited, identity, declaration, valid)
    case MNode{_, +lo, +hi}:
      NatFacts.add_le_add(
        Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), lo),
        Rank.unseen_catalog(Map.set(&2, Bool, visited, identity, True{}), hi),
        Rank.unseen_catalog(visited, lo), Rank.unseen_catalog(visited, hi),
        catalog_nonincreasing(lo, visited, identity, valid),
        catalog_nonincreasing(hi, visited, identity, valid))

