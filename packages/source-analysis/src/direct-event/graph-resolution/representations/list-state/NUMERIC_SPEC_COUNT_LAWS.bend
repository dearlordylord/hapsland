import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./TREE_MACHINE_RELATION.bend as Relation

# Independent tree bound counts every raw declaration reference exactly.
law declaration_count_exact:
  for +declaration: Maybe<&2, Core.Declaration>
  {Relation.count_declaration(declaration) == Core.declaration_reference_count(declaration) : Nat}

# Own.values retains every raw value and order, including duplicate dictionary keys.
law raw_catalog_count_exact:
  for +catalog: Own.Dictionary<Maybe<&2, Core.Declaration>>
  {
    Relation.count_catalog(Own.values(Maybe<&2, Core.Declaration>, catalog))
    == Core.trie_reference_count(catalog) : Nat
  }
