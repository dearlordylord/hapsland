import Base
import ./Model.bend as M
import ./Core.bend as Core
import ./Potential.bend as P

# Proof-only weighted inventory of the actual catalog lookup. Both semantic
# tasks and Spec equation depth instantiate this same nonnegative charge.
def fresh_weight(~weight: M.Declaration -> Nat, already: Bool, declaration: M.Declaration) -> Nat:
  match already:
    case True{}: 0n
    case False{}: weight(declaration)

def declarations_unvisited(~weight: M.Declaration -> Nat, 
  declarations: List<&2, M.Declaration>,
  +expanded: List<&2, String>
) -> Nat:
  match declarations:
    case []: 0n
    case +head <> tail:
      Nat.add(fresh_weight(~weight, Core.contains(Core.declaration_identity(head), expanded), head),
        declarations_unvisited(~weight, tail, expanded))

def supporting_unvisited(
  ~weight: M.Declaration -> Nat,
  supporting: List<&2, M.Supporting>,
  +expanded: List<&2, String>
) -> Nat:
  match supporting:
    case []: 0n
    case M.Supporting{_, +declaration} <> tail:
      Nat.add(
        fresh_weight(
          ~weight,
          Core.contains(Core.declaration_identity(declaration), expanded),
          declaration
        ),
        supporting_unvisited(~weight, tail, expanded)
      )

def catalog_unvisited(
  ~weight: M.Declaration -> Nat,
  catalog: M.Catalog,
  +expanded: List<&2, String>
) -> Nat:
  match catalog:
    case M.Catalog{declarations, supporting}:
      Nat.add(
        declarations_unvisited(~weight, declarations, expanded),
        supporting_unvisited(~weight, supporting, expanded)
      )

# Credit belongs to the actual selected declaration, including a fold's
# incoming default. Already-expanded entries contribute no new semantic work.
def selected_credit(
  ~weight: M.Declaration -> Nat,
  selected: Maybe<&2, M.Declaration>,
  +expanded: List<&2, String>
) -> Nat:
  match selected:
    case None{}: 0n
    case Some{+target}:
      fresh_weight(~weight, Core.contains(Core.declaration_identity(target), expanded), target)

# The lookup result must pay its own charge from the same catalog. This
# counts duplicate identities rather than assuming unique slots or names.
def selected_drop_result(~weight: M.Declaration -> Nat, 
  +selected: Maybe<&2, M.Declaration>,
  +catalog: M.Catalog,
  +expanded: List<&2, String>
) -> Bool:
  Nat.is_le(Nat.add(selected_credit(~weight, selected, expanded),
    catalog_unvisited(~weight, catalog, P.selected_expanded(selected, expanded))),
    catalog_unvisited(~weight, catalog, expanded))

def selected_drop(~weight: M.Declaration -> Nat, 
  +catalog: M.Catalog,
  name: String,
  target_id: Maybe<&2, String>,
  +expanded: List<&2, String>
) -> Bool:
  selected_drop_result(~weight, Core.lookup(catalog, name, target_id), catalog, expanded)

# Spec consumes a node equation and an empty references equation, plus
# one equation per reference. This extra charge is proof-only.
def specification_weight(declaration: M.Declaration) -> Nat:
  match declaration:
    case M.Declaration{_, _, _, references}: Nat.add(2n, List.length(&2, M.Reference, references))

def specification_drop(
  catalog: M.Catalog,
  name: String,
  target_id: Maybe<&2, String>,
  expanded: List<&2, String>
) -> Bool:
  selected_drop(~specification_weight, catalog, name, target_id, expanded)

# Remaining active-frame Spec equations. Ancestors keep separate parked bounds.
def specification_required(
  references: List<&2, M.Reference>,
  catalog: M.Catalog,
  expanded: List<&2, String>
) -> Nat:
  Nat.add(
    1n,
    Nat.add(
      List.length(&2, M.Reference, references),
      catalog_unvisited(~specification_weight, catalog, expanded)
    )
  )

def main() -> Unit:
  Unit{}
