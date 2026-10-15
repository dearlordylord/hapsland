import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Potential.bend as P
import ./WeightedInventory.bend as W
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../graph-resolution/traversal/INTERPRETER_STRING_FACTS.bend as S

# Adding an expanded identity can only remove a declaration's charge.
def fresh_mono_case(~weight: M.Declaration -> Nat, same: Bool, +already: Bool, +declaration: M.Declaration) -> N.le(
  W.fresh_weight(~weight, C.contains_selected(same, _ => already), declaration),
  W.fresh_weight(~weight, already, declaration)):
  match same:
    case True{}: N.zero_le(W.fresh_weight(~weight, already, declaration))
    case False{}: N.le_refl(W.fresh_weight(~weight, already, declaration))

def fresh_mono(~weight: M.Declaration -> Nat, +declaration: M.Declaration, +key: String, +seen: List<&2, String>) -> N.le(
  W.selected_credit(~weight, Some{declaration}, key <> seen), W.selected_credit(~weight, Some{declaration}, seen)):
  fresh_mono_case(~weight, String.eq(C.declaration_identity(declaration), key),
    C.contains(C.declaration_identity(declaration), seen), declaration)

def declarations_mono(~weight: M.Declaration -> Nat, +items: List<&2, M.Declaration>, +key: String, +seen: List<&2, String>) -> N.le(
  W.declarations_unvisited(~weight, items, key <> seen), W.declarations_unvisited(~weight, items, seen)):
  match items:
    case []: {==}
    case +head <> +tail:
      N.add_le_add(W.selected_credit(~weight, Some{head}, key <> seen), W.declarations_unvisited(~weight, tail, key <> seen),
        W.selected_credit(~weight, Some{head}, seen), W.declarations_unvisited(~weight, tail, seen),
        fresh_mono(~weight, head, key, seen), declarations_mono(~weight, tail, key, seen))

def supporting_mono(~weight: M.Declaration -> Nat, +items: List<&2, M.Supporting>, +key: String, +seen: List<&2, String>) -> N.le(
  W.supporting_unvisited(~weight, items, key <> seen), W.supporting_unvisited(~weight, items, seen)):
  match items:
    case []: {==}
    case M.Supporting{_, +head} <> +tail:
      N.add_le_add(W.selected_credit(~weight, Some{head}, key <> seen), W.supporting_unvisited(~weight, tail, key <> seen),
        W.selected_credit(~weight, Some{head}, seen), W.supporting_unvisited(~weight, tail, seen),
        fresh_mono(~weight, head, key, seen), supporting_mono(~weight, tail, key, seen))

def credit_mono_key(~weight: M.Declaration -> Nat, +default: Maybe<&2, M.Declaration>, +key: String, +seen: List<&2, String>) -> N.le(
  W.selected_credit(~weight, default, key <> seen), W.selected_credit(~weight, default, seen)):
  match default:
    case None{}: {==}
    case Some{+target}: fresh_mono(~weight, target, key, seen)

def credit_mono(~weight: M.Declaration -> Nat, +default: Maybe<&2, M.Declaration>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  W.selected_credit(~weight, default, P.selected_expanded(selected, seen)), W.selected_credit(~weight, default, seen)):
  match selected:
    case None{}: N.le_refl(W.selected_credit(~weight, default, seen))
    case Some{target}: credit_mono_key(~weight, default, C.declaration_identity(target), seen)

def declarations_selected_mono(~weight: M.Declaration -> Nat, +items: List<&2, M.Declaration>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  W.declarations_unvisited(~weight, items, P.selected_expanded(selected, seen)), W.declarations_unvisited(~weight, items, seen)):
  match selected:
    case None{}: N.le_refl(W.declarations_unvisited(~weight, items, seen))
    case Some{target}: declarations_mono(~weight, items, C.declaration_identity(target), seen)

def supporting_selected_mono(~weight: M.Declaration -> Nat, +items: List<&2, M.Supporting>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  W.supporting_unvisited(~weight, items, P.selected_expanded(selected, seen)), W.supporting_unvisited(~weight, items, seen)):
  match selected:
    case None{}: N.le_refl(W.supporting_unvisited(~weight, items, seen))
    case Some{target}: supporting_mono(~weight, items, C.declaration_identity(target), seen)

def self_zero(~weight: M.Declaration -> Nat, +target: M.Declaration, +seen: List<&2, String>) -> {
  W.selected_credit(~weight, Some{target}, P.selected_expanded(Some{target}, seen)) == 0n : Nat
}:
  %Equal.sym(Bool, String.eq(C.declaration_identity(target), C.declaration_identity(target)), True{}, S.eq_refl(C.declaration_identity(target))) : {
    W.fresh_weight(~weight, C.contains_selected(_, _ => C.contains(C.declaration_identity(target), seen)), target) == 0n : Nat}
  {==}

# Add one unselected entry around a certificate for the selected fold.
def surround(+c: Nat, +rest: Nat, +old: Nat, +extra: Nat, +old_extra: Nat,
  bound: N.le(Nat.add(c, rest), old), mono: N.le(extra, old_extra)) ->
  N.le(Nat.add(c, Nat.add(extra, rest)), Nat.add(old_extra, old)):
  %Equal.sym(Nat, Nat.add(c, Nat.add(extra, rest)), Nat.add(extra, Nat.add(c, rest)),
    N.add_left_comm(c, extra, rest)) : N.le(_, Nat.add(old_extra, old))
  N.add_le_add(extra, Nat.add(c, rest), old_extra, old, mono, bound)

def swap_bound(+c: Nat, +a: Nat, +b: Nat, +tail: Nat, +x: Nat, +y: Nat, +old_tail: Nat,
  bound: N.le(Nat.add(c, Nat.add(a, Nat.add(b, tail))), Nat.add(x, Nat.add(y, old_tail)))) ->
  N.le(Nat.add(c, Nat.add(b, Nat.add(a, tail))), Nat.add(y, Nat.add(x, old_tail))):
  %N.add_left_comm(a, b, tail) : N.le(Nat.add(c, _), Nat.add(y, Nat.add(x, old_tail)))
  %N.add_left_comm(x, y, old_tail) : N.le(Nat.add(c, Nat.add(a, Nat.add(b, tail))), _)
  bound

def base_certificate(~weight: M.Declaration -> Nat, +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) ->
  N.le(Nat.add(W.selected_credit(~weight, default, seen),
    Nat.add(W.selected_credit(~weight, default, P.selected_expanded(default, seen)), 0n)),
    Nat.add(W.selected_credit(~weight, default, seen), 0n)):
  match default:
    case None{}: {==}
    case Some{+target}:
      %Equal.sym(Nat, W.selected_credit(~weight, Some{target}, P.selected_expanded(Some{target}, seen)), 0n,
        self_zero(~weight, target, seen)) : N.le(Nat.add(W.selected_credit(~weight, Some{target}, seen), Nat.add(_, 0n)),
          Nat.add(W.selected_credit(~weight, Some{target}, seen), 0n))
      N.le_refl(Nat.add(W.selected_credit(~weight, Some{target}, seen), 0n))

def declarations_certificate(~weight: M.Declaration -> Nat, +name: String, +items: List<&2, M.Declaration>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> Data:
  N.le(Nat.add(W.selected_credit(~weight, C.lookup_declarations(name, items, default), seen),
    Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_declarations(name, items, default), seen)),
      W.declarations_unvisited(~weight, items, P.selected_expanded(C.lookup_declarations(name, items, default), seen)))),
    Nat.add(W.selected_credit(~weight, default, seen), W.declarations_unvisited(~weight, items, seen)))

def declarations_step(~weight: M.Declaration -> Nat, +same: Bool, +name: String, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>,
  ih: @+next: Maybe<&2, M.Declaration> -> declarations_certificate(~weight, name, tail, next, seen)) ->
  N.le(Nat.add(W.selected_credit(~weight, C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen),
    Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)),
      W.declarations_unvisited(~weight, head <> tail, P.selected_expanded(C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)))),
    Nat.add(W.selected_credit(~weight, default, seen), W.declarations_unvisited(~weight, head <> tail, seen))):
  match same:
    case True{}:
      surround(W.selected_credit(~weight, C.lookup_declarations(name, tail, Some{head}), seen),
        Nat.add(W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen)),
          W.declarations_unvisited(~weight, tail, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen))),
        Nat.add(W.selected_credit(~weight, Some{head}, seen), W.declarations_unvisited(~weight, tail, seen)),
        W.selected_credit(~weight, default, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen)),
        W.selected_credit(~weight, default, seen), ih(Some{head}),
        credit_mono(~weight, default, C.lookup_declarations(name, tail, Some{head}), seen))
    case False{}:
      swap_bound(W.selected_credit(~weight, C.lookup_declarations(name, tail, default), seen),
        W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        W.selected_credit(~weight, default, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        W.declarations_unvisited(~weight, tail, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        W.selected_credit(~weight, Some{head}, seen), W.selected_credit(~weight, default, seen), W.declarations_unvisited(~weight, tail, seen),
        surround(W.selected_credit(~weight, C.lookup_declarations(name, tail, default), seen),
          Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
            W.declarations_unvisited(~weight, tail, P.selected_expanded(C.lookup_declarations(name, tail, default), seen))),
          Nat.add(W.selected_credit(~weight, default, seen), W.declarations_unvisited(~weight, tail, seen)),
          W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
          W.selected_credit(~weight, Some{head}, seen), ih(default),
          credit_mono(~weight, Some{head}, C.lookup_declarations(name, tail, default), seen)))

def declarations_fold(~weight: M.Declaration -> Nat, +items: List<&2, M.Declaration>, +name: String,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> declarations_certificate(~weight, name, items, default, seen):
  match items:
    case []: base_certificate(~weight, default, seen)
    case +head <> +tail:
      declarations_step(~weight, String.eq(name, C.declaration_name(head)), name, head, tail, default, seen,
        next => declarations_fold(~weight, tail, name, next, seen))

def supporting_certificate(~weight: M.Declaration -> Nat, +name: String, +items: List<&2, M.Supporting>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> Data:
  N.le(Nat.add(W.selected_credit(~weight, C.lookup_supporting(name, items, default), seen),
    Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_supporting(name, items, default), seen)),
      W.supporting_unvisited(~weight, items, P.selected_expanded(C.lookup_supporting(name, items, default), seen)))),
    Nat.add(W.selected_credit(~weight, default, seen), W.supporting_unvisited(~weight, items, seen)))

def supporting_step(~weight: M.Declaration -> Nat, +same: Bool, +name: String, +key: String, +head: M.Declaration, +tail: List<&2, M.Supporting>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>,
  ih: @+next: Maybe<&2, M.Declaration> -> supporting_certificate(~weight, name, tail, next, seen)) ->
  N.le(Nat.add(W.selected_credit(~weight, C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen),
    Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)),
      W.supporting_unvisited(~weight, M.Supporting{key, head} <> tail, P.selected_expanded(C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)))),
    Nat.add(W.selected_credit(~weight, default, seen), W.supporting_unvisited(~weight, M.Supporting{key, head} <> tail, seen))):
  match same:
    case True{}:
      surround(W.selected_credit(~weight, C.lookup_supporting(name, tail, Some{head}), seen),
        Nat.add(W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen)),
          W.supporting_unvisited(~weight, tail, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen))),
        Nat.add(W.selected_credit(~weight, Some{head}, seen), W.supporting_unvisited(~weight, tail, seen)),
        W.selected_credit(~weight, default, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen)),
        W.selected_credit(~weight, default, seen), ih(Some{head}),
        credit_mono(~weight, default, C.lookup_supporting(name, tail, Some{head}), seen))
    case False{}:
      swap_bound(W.selected_credit(~weight, C.lookup_supporting(name, tail, default), seen),
        W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        W.selected_credit(~weight, default, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        W.supporting_unvisited(~weight, tail, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        W.selected_credit(~weight, Some{head}, seen), W.selected_credit(~weight, default, seen), W.supporting_unvisited(~weight, tail, seen),
        surround(W.selected_credit(~weight, C.lookup_supporting(name, tail, default), seen),
          Nat.add(W.selected_credit(~weight, default, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
            W.supporting_unvisited(~weight, tail, P.selected_expanded(C.lookup_supporting(name, tail, default), seen))),
          Nat.add(W.selected_credit(~weight, default, seen), W.supporting_unvisited(~weight, tail, seen)),
          W.selected_credit(~weight, Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
          W.selected_credit(~weight, Some{head}, seen), ih(default),
          credit_mono(~weight, Some{head}, C.lookup_supporting(name, tail, default), seen)))

def supporting_fold(~weight: M.Declaration -> Nat, +items: List<&2, M.Supporting>, +name: String,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> supporting_certificate(~weight, name, items, default, seen):
  match items:
    case []: base_certificate(~weight, default, seen)
    case M.Supporting{+key, +head} <> +tail:
      supporting_step(~weight, String.eq(name, key), name, key, head, tail, default, seen,
        next => supporting_fold(~weight, tail, name, next, seen))

def attach_right(+credit: Nat, +left: Nat, +old_left: Nat, +right: Nat, +old_right: Nat,
  bound: N.le(Nat.add(credit, left), old_left), mono: N.le(right, old_right)) ->
  N.le(Nat.add(credit, Nat.add(left, right)), Nat.add(old_left, old_right)):
  %N.add_assoc(credit, left, right) : N.le(_, Nat.add(old_left, old_right))
  N.add_le_add(Nat.add(credit, left), right, old_left, old_right, bound, mono)

def selected_target_drop(~weight: M.Declaration -> Nat, +catalog: M.Catalog, +name: String,
  +target_id: Maybe<&2, String>, +expanded: List<&2, String>) -> {
  W.selected_drop(~weight, catalog, name, target_id, expanded) == True{} : Bool
}:
  match catalog target_id:
    case M.Catalog{+declarations, +supporting} None{}:
      attach_right(W.selected_credit(~weight, C.lookup_declarations(name, declarations, None{}), expanded),
        W.declarations_unvisited(~weight, declarations, P.selected_expanded(C.lookup_declarations(name, declarations, None{}), expanded)),
        W.declarations_unvisited(~weight, declarations, expanded),
        W.supporting_unvisited(~weight, supporting, P.selected_expanded(C.lookup_declarations(name, declarations, None{}), expanded)),
        W.supporting_unvisited(~weight, supporting, expanded), declarations_fold(~weight, declarations, name, None{}, expanded),
        supporting_selected_mono(~weight, supporting, C.lookup_declarations(name, declarations, None{}), expanded))
    case M.Catalog{+declarations, +supporting} Some{+key}:
      surround(W.selected_credit(~weight, C.lookup_supporting(key, supporting, None{}), expanded),
        W.supporting_unvisited(~weight, supporting, P.selected_expanded(C.lookup_supporting(key, supporting, None{}), expanded)),
        W.supporting_unvisited(~weight, supporting, expanded),
        W.declarations_unvisited(~weight, declarations, P.selected_expanded(C.lookup_supporting(key, supporting, None{}), expanded)),
        W.declarations_unvisited(~weight, declarations, expanded), supporting_fold(~weight, supporting, key, None{}, expanded),
        declarations_selected_mono(~weight, declarations, C.lookup_supporting(key, supporting, None{}), expanded))

def specification_selected_drop(+catalog: M.Catalog, +name: String,
  +target_id: Maybe<&2, String>, +expanded: List<&2, String>) -> {
  W.specification_drop(catalog, name, target_id, expanded) == True{} : Bool
}:
  selected_target_drop(~W.specification_weight, catalog, name, target_id, expanded)

def main() -> Unit:
  Unit{}
