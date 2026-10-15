import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Specification.bend as S
import ./Continuation.bend as K
import ./Potential.bend as P
import ./WeightedInventory.bend as W

# Proof-only ghost spine for the actual cursor. No catalog traversal or new
# evaluator lives here: enclosing composes existing Spec continuations only.
type Ghost is Data:
  Ghost{depth: Nat, prefix: List<&2, M.ReferencePlan>, subtotal: S.BytesExpr}

def shape(frames: List<&2, C.Frame>, ghosts: List<&2, Ghost>, +root_slot: Nat) -> Bool:
  match frames ghosts:
    case C.Frame{slot, _, _, None{}} <> Nil{} Ghost{_, _, _} <> Nil{}: Nat.is_eq(slot, root_slot)
    case C.Frame{_, _, _, Some{_}} <> parents Ghost{_, _, _} <> rest: shape(
      parents,
      rest,
      root_slot
    )
    case _ _: False{}

# Each ancestor's required depth uses the current shared expanded identities.
def bounds(frames: List<&2, C.Frame>, ghosts: List<&2, Ghost>, +catalog: M.Catalog,
  +purpose: C.Purpose, +expanded: List<&2, String>) -> Type:
  match frames ghosts:
    case Nil{} Nil{}: Unit
    case C.Frame{_, +pending, reversed, _} <> parents Ghost{depth, prefix, _} <> rest:
      K.accumulator_relation(purpose, reversed, prefix)
      & {Nat.is_le(W.specification_required(pending, catalog, expanded), depth) == True{} : Bool}
      & bounds(parents, rest, catalog, purpose, expanded)
    case _ _: Empty

# Executable projection for finite falsification of the same shape/depth
# clauses. It does not claim to inhabit the Type-valued semantic relation.
def bounds_valid(frames: List<&2, C.Frame>, ghosts: List<&2, Ghost>, +catalog: M.Catalog,
  +expanded: List<&2, String>) -> Bool:
  match frames ghosts:
    case Nil{} Nil{}: True{}
    case C.Frame{_, pending, _, _} <> parents Ghost{depth, _, _} <> rest:
      Bool.and(Nat.is_le(W.specification_required(pending, catalog, expanded), depth),
        bounds_valid(parents, rest, catalog, expanded))
    case _ _: False{}

def plug_parent(
  frames: List<&2, C.Frame>,
  ghosts: List<&2, Ghost>,
  child_slot: Nat,
  symbol: String,
  +catalog: M.Catalog,
  continuation: S.ReferencesResult -> Type
) -> S.ReferencesResult -> Type:
  match frames ghosts:
    case C.Frame{_, pending, _, _} <> _ Ghost{depth, prefix, subtotal} <> _:
      result => K.child_continuation(
        result,
        child_slot,
        depth,
        pending,
        prefix,
        subtotal,
        symbol,
        catalog,
        continuation
      )
    case _ _: _ => Empty

# A parent ghost already includes its outstanding edge charge, but not the
# outstanding child's references or subtotal. It retains its own sibling depth.
def enclosing(frames: List<&2, C.Frame>, ghosts: List<&2, Ghost>, +root: M.Declaration,
  +catalog: M.Catalog) -> S.ReferencesResult -> Type:
  match frames ghosts:
    case C.Frame{_, _, _, None{}} <> Nil{} Ghost{_, _, _} <> Nil{}: result => K.root_continuation(
      result,
      root,
      catalog
    )
    case C.Frame{slot, _, _, Some{symbol}} <> +parents Ghost{_, _, _} <> +rest:
      plug_parent(parents, rest, slot, symbol, catalog, enclosing(parents, rest, root, catalog))
    case _ _: _ => Empty

def semantic(+frames: List<&2, C.Frame>, +ghosts: List<&2, Ghost>, root: M.Declaration,
  +catalog: M.Catalog, purpose: C.Purpose, state: S.State) -> Type:
  match frames ghosts:
    case +head <> +parents Ghost{depth, +prefix, +subtotal} <> +rest:
      K.frame_relation(head, purpose, depth, prefix, subtotal, state, catalog,
        enclosing(head <> parents, Ghost{depth, prefix, subtotal} <> rest, root, catalog))
    case _ _: Empty

# invocation fixes catalog/purpose/outer roots/prior outcomes. Request changes
# only through acknowledged native commands and is supplied by the trace part
# of the root invariant, which is not yet established by this owner.
def cursor(root: M.Declaration, +invocation: C.Global, request: Nat,
  actual: C.Cursor, +ghosts: List<&2, Ghost>) -> Type:
  match root actual:
    case +root C.Cursor{
      +global,
      slot,
      +name,
      +expanded,
      +referenced,
      +failure,
      +remaining,
      +frames
    }:
      {global == C.global_count(invocation, request) : C.Global}
      & {slot == S.declaration_slot(root) : Nat}
      & {name == S.declaration_name(root) : String}
      & {shape(frames, ghosts, S.declaration_slot(root)) == True{} : Bool}
      & {
        P.cursor_valid(
          C.Cursor{global, slot, name, expanded, referenced, failure, remaining, frames}
        )
        == True{}
        : Bool
      }
      & bounds(frames, ghosts, C.global_catalog(invocation), C.global_purpose(invocation), expanded)
      & semantic(frames, ghosts, root, C.global_catalog(invocation), C.global_purpose(invocation),
        S.State{name, expanded, referenced, failure})

def initial_ghost(+root: M.Declaration, catalog: M.Catalog) -> Ghost:
  Ghost{K.root_reference_depth(root, catalog), [], K.initial_subtotal(root)}

# The cursor retained by the actual root-entry queue, before its Acks update
# request. The root's declaration tick has already been spent.
def initial_cursor(root: M.Declaration, invocation: C.Global) -> C.Cursor:
  match root invocation:
    case M.Declaration{+slot, +identity, +name, +references} C.Global{
      M.Catalog{+declarations, +supporting},
      purpose,
      pending,
      outcomes,
      request
    }:
      C.Cursor{
        C.Global{M.Catalog{declarations, supporting}, purpose, pending, outcomes, request},
        slot,
        name,
        [identity],
        [],
        None{},
        Nat.add(
          List.length(&2, M.Reference, references),
          Nat.add(M.declarations_inventory(declarations), M.supporting_inventory(supporting))
        ),
        [C.Frame{slot, references, [], None{}}]
      }

# Proof constructors for the actual fresh-child transition. Their explicit
# predecessor budgets are supplied by the internal branch theorem.
def enter_cursor(rest: Nat, actual: C.Cursor, target: M.Declaration, +symbol: String,
  target_id: Maybe<&2, String>) -> C.Cursor:
  match actual target:
    case C.Cursor{
      global,
      root,
      +name,
      expanded,
      +referenced,
      failure,
      _,
      C.Frame{parent_slot, _ <> tail, reversed, site} <> ancestors
    }
      M.Declaration{slot, identity, _, references}:
      C.Cursor{
        global,
        root,
        name,
        identity <> expanded,
        C.reference_names(name, symbol, target_id, referenced),
        failure,
        rest,
        C.Frame{
          slot,
          references,
          [],
          Some{symbol}
        } <> C.Frame{parent_slot, tail, reversed, site} <> ancestors
      }
    case cursor _: cursor

def enter_ghosts(
  +depth: Nat,
  ghosts: List<&2, Ghost>,
  +target: M.Declaration,
  +symbol: String
) -> List<&2, Ghost>:
  match ghosts:
    case Ghost{_, prefix, subtotal} <> rest:
      Ghost{depth, [], K.initial_subtotal(target)}
      <> Ghost{1n+depth, prefix, S.edge_total(subtotal, symbol, Some{target})} <> rest
    case []: []

# Internal successor-budget branch contract. Outside a named-head cursor
# with two remaining ticks and two Spec equations it makes no claim. The
# whole preservation proof must derive those successors from fresh credit.
def fresh_case(+root: M.Declaration, +invocation: C.Global, +request: Nat,
  +actual: C.Cursor, +ghosts: List<&2, Ghost>, +target: M.Declaration) -> Type:
  match actual ghosts:
    case C.Cursor{+global, +slot, +name, +expanded, +referenced, +failure, 2n++rest,
      C.Frame{+parent_slot, M.Named{+symbol, +target_id} <> +tail, +reversed, +site} <> +ancestors}
      Ghost{2n++depth, +prefix, +subtotal} <> +others:
      {
        C.lookup(C.global_catalog(global), symbol, target_id)
        == Some{target}
        : Maybe<&2, M.Declaration>
      }
      -> {C.contains(C.declaration_identity(target), expanded) == False{} : Bool}
      -> {
        Nat.is_gt(
          List.length(&2, String, C.reference_names(name, symbol, target_id, referenced)),
          16n
        )
        == False{}
        : Bool
      }
      -> cursor(root, invocation, request,
        C.Cursor{global, slot, name, expanded, referenced, failure, 2n+rest,
          C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors},
        Ghost{2n+depth, prefix, subtotal} <> others)
      -> (cursor(
        root,
        invocation,
        request,
        enter_cursor(
          rest,
          C.Cursor{
            global,
            slot,
            name,
            expanded,
            referenced,
            failure,
            2n+rest,
            C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
          },
          target,
          symbol,
          target_id
        ),
        enter_ghosts(depth, Ghost{2n+depth, prefix, subtotal} <> others, target, symbol)
      )
        & {
          C.advance_cursor(
            C.Cursor{
              global,
              slot,
              name,
              expanded,
              referenced,
              failure,
              2n+rest,
              C.Frame{parent_slot, M.Named{symbol, target_id} <> tail, reversed, site} <> ancestors
            }
          )
          == C.cursor_ops(
            enter_cursor(
              rest,
              C.Cursor{
                global,
                slot,
                name,
                expanded,
                referenced,
                failure,
                2n+rest,
                C.Frame{
                  parent_slot,
                  M.Named{symbol, target_id} <> tail,
                  reversed,
                  site
                } <> ancestors
              },
              target,
              symbol,
              target_id
            ),
            C.child_operations(
              C.global_purpose(global),
              C.edge_operations(C.global_purpose(global), symbol, Some{target}),
              S.declaration_slot(target)
            )
          )
          : C.Step
        })
    case _ _: Unit

def main() -> Unit:
  Unit{}
