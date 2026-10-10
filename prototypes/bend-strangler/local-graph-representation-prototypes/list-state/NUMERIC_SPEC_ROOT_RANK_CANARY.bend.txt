import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./RANK.bend as Rank
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_ROOT_RANK.bend as Root
import ./TREE_MACHINE_RELATION.bend as Relation

def declaration_inventory_partition(+visited: Own.Dictionary<Bool>,
    +declaration: Maybe<&2, Core.Declaration>) -> Bool:
  Nat.is_eq(
    (Rank.unseen_declaration(visited, declaration) + Measure.reentry(visited, declaration) : Nat),
    Core.declaration_reference_count(declaration)
  )

def lookup_inventory_bound(+catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>,
    +visited: Own.Dictionary<Bool>, key: Nat) -> Bool:
  Nat.is_le(
    (Rank.unseen_catalog(
      visited,
      catalog
    ) + Measure.reentry(
      visited,
      Own.lookup(Maybe<&2, Core.Declaration>, None{}, catalog, key)
    ) : Nat),
    Core.trie_reference_count(catalog)
  )

def lookup_inventory_step(+visited: Own.Dictionary<Bool>, +head: Maybe<&2, Core.Declaration>,
    +rest: Own.Dictionary<Maybe<&2, Core.Declaration>>, key: Nat, found: Bool) -> Bool:
  Nat.is_le(
    (Rank.unseen_declaration(
      visited,
      head
    ) + Rank.unseen_catalog(
      visited,
      rest
    ) + Measure.reentry(visited, Root.lookup_step(found, head, rest, key)) : Nat),
    (Core.declaration_reference_count(head) + Core.trie_reference_count(rest) : Nat)
  )

def initial_rank_within_original_bound(+facts: Core.Facts, name: Core.Label,
    expected: Core.ExpectedKind, visited: Own.Dictionary<Bool>) -> Bool:
  Nat.is_le(Measure.root_rank(facts, name, expected, visited), Relation.spec_bound(facts))

def unseen_weight(seen: Bool, amount: Nat) -> Nat:
  Own.choose(Nat, seen, 0n, next => amount)

def seen_weight_partition(+seen: Bool, +references: List<&2, Core.Reference>) -> Bool:
  Nat.is_eq(
    (unseen_weight(
      seen,
      List.length(&2, Core.Reference, references)
    ) + Measure.reentry_if(seen, references) : Nat),
    List.length(&2, Core.Reference, references)
  )

def cons_lookup_source(
  head: Maybe<&2, Core.Declaration>,
  rest: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  name: Nat,
  count: Nat,
  key: Nat
) -> Maybe<&2, Core.Declaration>:
  Own.lookup(Maybe<&2, Core.Declaration>, None{}, Own.DCon{name, head, rest, count}, key)

def cons_lookup_projected(
  found: Bool,
  head: Maybe<&2, Core.Declaration>,
  rest: Own.Dictionary<Maybe<&2, Core.Declaration>>,
  key: Nat
) -> Maybe<&2, Core.Declaration>:
  Root.lookup_step(found, head, rest, key)

def tree_catalog_count(catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>) -> Nat:
  Relation.count_catalog(Own.values(Maybe<&2, Core.Declaration>, catalog))

def raw_catalog_count(catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>) -> Nat:
  Core.trie_reference_count(catalog)
