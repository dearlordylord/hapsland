import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Potential.bend as P
import ./PotentialLaws.bend as Laws
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N

# Existing Nat order/addition facts suffice for the entry case. No String or
# lookup assumption is needed until the later child-expansion preservation case.
def fresh_bounded(+already: Bool, +declaration: M.Declaration) -> {
  Nat.is_le(P.fresh_weight(already, declaration), M.declaration_inventory(declaration)) == True{} : Bool
}:
  match already:
    case True{}: N.zero_le(M.declaration_inventory(declaration))
    case False{}: N.le_refl(M.declaration_inventory(declaration))

def declarations_bounded(+declarations: List<&2, M.Declaration>, +expanded: List<&2, String>) -> {
  Nat.is_le(P.declarations_unvisited(declarations, expanded), M.declarations_inventory(declarations)) == True{} : Bool
}:
  match declarations:
    case []: {==}
    case +head <> +tail:
      N.add_le_add(P.fresh_weight(Core.contains(Core.declaration_identity(head), expanded), head),
        P.declarations_unvisited(tail, expanded), M.declaration_inventory(head), M.declarations_inventory(tail),
        fresh_bounded(Core.contains(Core.declaration_identity(head), expanded), head), declarations_bounded(tail, expanded))

def supporting_bounded(+supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> {
  Nat.is_le(P.supporting_unvisited(supporting, expanded), M.supporting_inventory(supporting)) == True{} : Bool
}:
  match supporting:
    case []: {==}
    case M.Supporting{_, +declaration} <> +tail:
      N.add_le_add(P.fresh_weight(Core.contains(Core.declaration_identity(declaration), expanded), declaration),
        P.supporting_unvisited(tail, expanded), M.declaration_inventory(declaration), M.supporting_inventory(tail),
        fresh_bounded(Core.contains(Core.declaration_identity(declaration), expanded), declaration), supporting_bounded(tail, expanded))

def catalog_bounded(+declarations: List<&2, M.Declaration>, +supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> {
  Nat.is_le(P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded),
    Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting))) == True{} : Bool
}:
  N.add_le_add(P.declarations_unvisited(declarations, expanded), P.supporting_unvisited(supporting, expanded),
    M.declarations_inventory(declarations), M.supporting_inventory(supporting),
    declarations_bounded(declarations, expanded), supporting_bounded(supporting, expanded))

def entry_numeric(+count: Nat, +declarations: List<&2, M.Declaration>, +supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> {
  Nat.is_le(Nat.add(Nat.add(count, 0n), P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded)),
    Nat.add(count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)))) == True{} : Bool
}:
  Equal.trans(Bool,
    Nat.is_le(Nat.add(Nat.add(count, 0n), P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded)),
      Nat.add(count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)))),
    Nat.is_le(Nat.add(count, P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded)),
      Nat.add(count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)))), True{},
    Equal.cong(Nat, Bool, value => Nat.is_le(Nat.add(value, P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded)),
      Nat.add(count, Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)))),
      Nat.add(count, 0n), count, N.add_zero(count)),
    N.add_le_add_left(P.catalog_unvisited(M.Catalog{declarations, supporting}, expanded),
      Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting)), count,
      catalog_bounded(declarations, supporting, expanded)))

def Laws.root_entry_valid(root, catalog, purpose, pending, prefix, request):
  match root catalog purpose:
    case M.Declaration{_, identity, _, references} M.Catalog{declarations, supporting} Core.Trees{}:
      entry_numeric(List.length(&2, M.Reference, references), declarations, supporting, [identity])
    case M.Declaration{_, identity, _, references} M.Catalog{declarations, supporting} Core.Outcomes{}:
      entry_numeric(List.length(&2, M.Reference, references), declarations, supporting, [identity])
    case M.Declaration{_, identity, _, references} M.Catalog{declarations, supporting} Core.Preflight{}:
      entry_numeric(List.length(&2, M.Reference, references), declarations, supporting, [identity])

def main() -> Unit:
  Unit{}
