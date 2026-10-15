import Base
import ./Model.bend as M
import ./Core.bend as Core

# Verification measure of the actual cursor, not another traversal machine.
# The explicit entry root is already expanded while a Cursor exists. Its
# pending references are in frames; its initial charge is in Model inventory.
def fresh_weight(already: Bool, declaration: M.Declaration) -> Nat:
  match already:
    case True{}: 0n
    case False{}: M.declaration_inventory(declaration)

def declarations_unvisited(
  declarations: List<&2, M.Declaration>,
  +expanded: List<&2, String>
) -> Nat:
  match declarations:
    case []: 0n
    case +head <> tail:
      Nat.add(fresh_weight(Core.contains(Core.declaration_identity(head), expanded), head),
        declarations_unvisited(tail, expanded))

def supporting_unvisited(supporting: List<&2, M.Supporting>, +expanded: List<&2, String>) -> Nat:
  match supporting:
    case []: 0n
    case M.Supporting{_, +declaration} <> tail:
      Nat.add(
        fresh_weight(Core.contains(Core.declaration_identity(declaration), expanded), declaration),
        supporting_unvisited(tail, expanded)
      )

def catalog_unvisited(catalog: M.Catalog, +expanded: List<&2, String>) -> Nat:
  match catalog:
    case M.Catalog{declarations, supporting}:
      Nat.add(
        declarations_unvisited(declarations, expanded),
        supporting_unvisited(supporting, expanded)
      )

# Credit belongs to the actual selected declaration, including a fold's
# incoming default. Already-expanded entries contribute no new semantic work.
def selected_credit(selected: Maybe<&2, M.Declaration>, +expanded: List<&2, String>) -> Nat:
  match selected:
    case None{}: 0n
    case Some{+target}:
      fresh_weight(Core.contains(Core.declaration_identity(target), expanded), target)

def selected_expanded(
  selected: Maybe<&2, M.Declaration>,
  expanded: List<&2, String>
) -> List<&2, String>:
  match selected:
    case None{}: expanded
    case Some{target}: Core.declaration_identity(target) <> expanded

# The lookup result must pay its own charge from the same catalog. This
# counts duplicate identities rather than assuming unique slots or names.
def selected_drop_result(
  +selected: Maybe<&2, M.Declaration>,
  +catalog: M.Catalog,
  +expanded: List<&2, String>
) -> Bool:
  Nat.is_le(Nat.add(selected_credit(selected, expanded),
    catalog_unvisited(catalog, selected_expanded(selected, expanded))),
    catalog_unvisited(catalog, expanded))

def selected_drop(
  +catalog: M.Catalog,
  name: String,
  target_id: Maybe<&2, String>,
  +expanded: List<&2, String>
) -> Bool:
  selected_drop_result(Core.lookup(catalog, name, target_id), catalog, expanded)

def pending_references(frames: List<&2, Core.Frame>) -> Nat:
  match frames:
    case []: 0n
    case Core.Frame{_, references, _, _} <> tail:
      Nat.add(List.length(&2, M.Reference, references), pending_references(tail))

def potential(cursor: Core.Cursor) -> Nat:
  match cursor:
    case Core.Cursor{global, _, _, expanded, _, _, _, frames}:
      Nat.add(pending_references(frames), catalog_unvisited(Core.global_catalog(global), expanded))

def cursor_valid(+cursor: Core.Cursor) -> Bool:
  match cursor:
    case Core.Cursor{global, root, name, expanded, referenced, failure, +remaining, frames}:
      Nat.is_le(
        potential(
          Core.Cursor{global, root, name, expanded, referenced, failure, remaining, frames}
        ),
        remaining
      )

def deferred_valid(next: Core.Deferred) -> Bool:
  match next:
    case Core.RootNext{_}: True{}
    case Core.CursorNext{cursor}: cursor_valid(cursor)

# Engine queues retain a cursor after its semantic tasks have been charged.
# This predicate alone does not assert progress, correspondence or completion.
def step_valid(step: Core.Step) -> Bool:
  match step:
    case Core.Continue{cursor}: cursor_valid(cursor)
    case Core.Engine{_, _, _, next}: deferred_valid(next)
    case Core.NextRoot{_}: True{}
    case Core.Completed{_}: True{}
    case Core.PreflightCompleted{}: True{}
    case Core.Exhausted{}: False{}
    case Core.InvalidReply{}: False{}

def entry_valid(root: M.Declaration, catalog: M.Catalog, purpose: Core.Purpose,
  pending: List<&2, M.Declaration>, prefix: List<&2, M.Outcome>, request: Nat) -> Bool:
  step_valid(Core.next_root(Core.Global{catalog, purpose, root <> pending, prefix, request}))

def main() -> Unit:
  Unit{}
