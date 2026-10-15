import Base
import ./Model.bend as M
import ./Core.bend as C
import ./Potential.bend as P
import ./SelectedTargetLaws.bend as Laws
import ../graph-resolution/traversal/INTERPRETER_COMPLETION_NAT_FACTS.bend as N
import ../graph-resolution/traversal/INTERPRETER_STRING_FACTS.bend as S

# Adding an expanded identity can only remove a declaration's charge.
def fresh_mono_case(same: Bool, +already: Bool, +declaration: M.Declaration) -> N.le(
  P.fresh_weight(C.contains_selected(same, _ => already), declaration),
  P.fresh_weight(already, declaration)):
  match same:
    case True{}: N.zero_le(P.fresh_weight(already, declaration))
    case False{}: N.le_refl(P.fresh_weight(already, declaration))

def fresh_mono(+declaration: M.Declaration, +key: String, +seen: List<&2, String>) -> N.le(
  P.selected_credit(Some{declaration}, key <> seen), P.selected_credit(Some{declaration}, seen)):
  fresh_mono_case(String.eq(C.declaration_identity(declaration), key),
    C.contains(C.declaration_identity(declaration), seen), declaration)

def declarations_mono(+items: List<&2, M.Declaration>, +key: String, +seen: List<&2, String>) -> N.le(
  P.declarations_unvisited(items, key <> seen), P.declarations_unvisited(items, seen)):
  match items:
    case []: {==}
    case +head <> +tail:
      N.add_le_add(P.selected_credit(Some{head}, key <> seen), P.declarations_unvisited(tail, key <> seen),
        P.selected_credit(Some{head}, seen), P.declarations_unvisited(tail, seen),
        fresh_mono(head, key, seen), declarations_mono(tail, key, seen))

def supporting_mono(+items: List<&2, M.Supporting>, +key: String, +seen: List<&2, String>) -> N.le(
  P.supporting_unvisited(items, key <> seen), P.supporting_unvisited(items, seen)):
  match items:
    case []: {==}
    case M.Supporting{_, +head} <> +tail:
      N.add_le_add(P.selected_credit(Some{head}, key <> seen), P.supporting_unvisited(tail, key <> seen),
        P.selected_credit(Some{head}, seen), P.supporting_unvisited(tail, seen),
        fresh_mono(head, key, seen), supporting_mono(tail, key, seen))

def credit_mono_key(+default: Maybe<&2, M.Declaration>, +key: String, +seen: List<&2, String>) -> N.le(
  P.selected_credit(default, key <> seen), P.selected_credit(default, seen)):
  match default:
    case None{}: {==}
    case Some{+target}: fresh_mono(target, key, seen)

def credit_mono(+default: Maybe<&2, M.Declaration>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  P.selected_credit(default, P.selected_expanded(selected, seen)), P.selected_credit(default, seen)):
  match selected:
    case None{}: N.le_refl(P.selected_credit(default, seen))
    case Some{target}: credit_mono_key(default, C.declaration_identity(target), seen)

def declarations_selected_mono(+items: List<&2, M.Declaration>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  P.declarations_unvisited(items, P.selected_expanded(selected, seen)), P.declarations_unvisited(items, seen)):
  match selected:
    case None{}: N.le_refl(P.declarations_unvisited(items, seen))
    case Some{target}: declarations_mono(items, C.declaration_identity(target), seen)

def supporting_selected_mono(+items: List<&2, M.Supporting>, +selected: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> N.le(
  P.supporting_unvisited(items, P.selected_expanded(selected, seen)), P.supporting_unvisited(items, seen)):
  match selected:
    case None{}: N.le_refl(P.supporting_unvisited(items, seen))
    case Some{target}: supporting_mono(items, C.declaration_identity(target), seen)

def self_zero(+target: M.Declaration, +seen: List<&2, String>) -> {
  P.selected_credit(Some{target}, P.selected_expanded(Some{target}, seen)) == 0n : Nat
}:
  %Equal.sym(Bool, String.eq(C.declaration_identity(target), C.declaration_identity(target)), True{}, S.eq_refl(C.declaration_identity(target))) : {
    P.fresh_weight(C.contains_selected(_, _ => C.contains(C.declaration_identity(target), seen)), target) == 0n : Nat}
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

def base_certificate(+default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) ->
  N.le(Nat.add(P.selected_credit(default, seen),
    Nat.add(P.selected_credit(default, P.selected_expanded(default, seen)), 0n)),
    Nat.add(P.selected_credit(default, seen), 0n)):
  match default:
    case None{}: {==}
    case Some{+target}:
      %Equal.sym(Nat, P.selected_credit(Some{target}, P.selected_expanded(Some{target}, seen)), 0n,
        self_zero(target, seen)) : N.le(Nat.add(P.selected_credit(Some{target}, seen), Nat.add(_, 0n)),
          Nat.add(P.selected_credit(Some{target}, seen), 0n))
      N.le_refl(Nat.add(P.selected_credit(Some{target}, seen), 0n))

def declarations_certificate(+name: String, +items: List<&2, M.Declaration>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> Data:
  N.le(Nat.add(P.selected_credit(C.lookup_declarations(name, items, default), seen),
    Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_declarations(name, items, default), seen)),
      P.declarations_unvisited(items, P.selected_expanded(C.lookup_declarations(name, items, default), seen)))),
    Nat.add(P.selected_credit(default, seen), P.declarations_unvisited(items, seen)))

def declarations_step(+same: Bool, +name: String, +head: M.Declaration, +tail: List<&2, M.Declaration>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>,
  ih: @+next: Maybe<&2, M.Declaration> -> declarations_certificate(name, tail, next, seen)) ->
  N.le(Nat.add(P.selected_credit(C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen),
    Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)),
      P.declarations_unvisited(head <> tail, P.selected_expanded(C.lookup_declarations(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)))),
    Nat.add(P.selected_credit(default, seen), P.declarations_unvisited(head <> tail, seen))):
  match same:
    case True{}:
      surround(P.selected_credit(C.lookup_declarations(name, tail, Some{head}), seen),
        Nat.add(P.selected_credit(Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen)),
          P.declarations_unvisited(tail, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen))),
        Nat.add(P.selected_credit(Some{head}, seen), P.declarations_unvisited(tail, seen)),
        P.selected_credit(default, P.selected_expanded(C.lookup_declarations(name, tail, Some{head}), seen)),
        P.selected_credit(default, seen), ih(Some{head}),
        credit_mono(default, C.lookup_declarations(name, tail, Some{head}), seen))
    case False{}:
      swap_bound(P.selected_credit(C.lookup_declarations(name, tail, default), seen),
        P.selected_credit(Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        P.selected_credit(default, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        P.declarations_unvisited(tail, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
        P.selected_credit(Some{head}, seen), P.selected_credit(default, seen), P.declarations_unvisited(tail, seen),
        surround(P.selected_credit(C.lookup_declarations(name, tail, default), seen),
          Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
            P.declarations_unvisited(tail, P.selected_expanded(C.lookup_declarations(name, tail, default), seen))),
          Nat.add(P.selected_credit(default, seen), P.declarations_unvisited(tail, seen)),
          P.selected_credit(Some{head}, P.selected_expanded(C.lookup_declarations(name, tail, default), seen)),
          P.selected_credit(Some{head}, seen), ih(default),
          credit_mono(Some{head}, C.lookup_declarations(name, tail, default), seen)))

def declarations_fold(+items: List<&2, M.Declaration>, +name: String,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> declarations_certificate(name, items, default, seen):
  match items:
    case []: base_certificate(default, seen)
    case +head <> +tail:
      declarations_step(String.eq(name, C.declaration_name(head)), name, head, tail, default, seen,
        next => declarations_fold(tail, name, next, seen))

def supporting_certificate(+name: String, +items: List<&2, M.Supporting>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> Data:
  N.le(Nat.add(P.selected_credit(C.lookup_supporting(name, items, default), seen),
    Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_supporting(name, items, default), seen)),
      P.supporting_unvisited(items, P.selected_expanded(C.lookup_supporting(name, items, default), seen)))),
    Nat.add(P.selected_credit(default, seen), P.supporting_unvisited(items, seen)))

def supporting_step(+same: Bool, +name: String, +key: String, +head: M.Declaration, +tail: List<&2, M.Supporting>,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>,
  ih: @+next: Maybe<&2, M.Declaration> -> supporting_certificate(name, tail, next, seen)) ->
  N.le(Nat.add(P.selected_credit(C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen),
    Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)),
      P.supporting_unvisited(M.Supporting{key, head} <> tail, P.selected_expanded(C.lookup_supporting(name, tail, Bool.pick(Maybe<&2, M.Declaration>, same, Some{head}, default)), seen)))),
    Nat.add(P.selected_credit(default, seen), P.supporting_unvisited(M.Supporting{key, head} <> tail, seen))):
  match same:
    case True{}:
      surround(P.selected_credit(C.lookup_supporting(name, tail, Some{head}), seen),
        Nat.add(P.selected_credit(Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen)),
          P.supporting_unvisited(tail, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen))),
        Nat.add(P.selected_credit(Some{head}, seen), P.supporting_unvisited(tail, seen)),
        P.selected_credit(default, P.selected_expanded(C.lookup_supporting(name, tail, Some{head}), seen)),
        P.selected_credit(default, seen), ih(Some{head}),
        credit_mono(default, C.lookup_supporting(name, tail, Some{head}), seen))
    case False{}:
      swap_bound(P.selected_credit(C.lookup_supporting(name, tail, default), seen),
        P.selected_credit(Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        P.selected_credit(default, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        P.supporting_unvisited(tail, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
        P.selected_credit(Some{head}, seen), P.selected_credit(default, seen), P.supporting_unvisited(tail, seen),
        surround(P.selected_credit(C.lookup_supporting(name, tail, default), seen),
          Nat.add(P.selected_credit(default, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
            P.supporting_unvisited(tail, P.selected_expanded(C.lookup_supporting(name, tail, default), seen))),
          Nat.add(P.selected_credit(default, seen), P.supporting_unvisited(tail, seen)),
          P.selected_credit(Some{head}, P.selected_expanded(C.lookup_supporting(name, tail, default), seen)),
          P.selected_credit(Some{head}, seen), ih(default),
          credit_mono(Some{head}, C.lookup_supporting(name, tail, default), seen)))

def supporting_fold(+items: List<&2, M.Supporting>, +name: String,
  +default: Maybe<&2, M.Declaration>, +seen: List<&2, String>) -> supporting_certificate(name, items, default, seen):
  match items:
    case []: base_certificate(default, seen)
    case M.Supporting{+key, +head} <> +tail:
      supporting_step(String.eq(name, key), name, key, head, tail, default, seen,
        next => supporting_fold(tail, name, next, seen))

def attach_right(+credit: Nat, +left: Nat, +old_left: Nat, +right: Nat, +old_right: Nat,
  bound: N.le(Nat.add(credit, left), old_left), mono: N.le(right, old_right)) ->
  N.le(Nat.add(credit, Nat.add(left, right)), Nat.add(old_left, old_right)):
  %N.add_assoc(credit, left, right) : N.le(_, Nat.add(old_left, old_right))
  N.add_le_add(Nat.add(credit, left), right, old_left, old_right, bound, mono)

def Laws.selected_target_drop(catalog, name, target_id, expanded):
  match catalog target_id:
    case M.Catalog{+declarations, +supporting} None{}:
      attach_right(P.selected_credit(C.lookup_declarations(name, declarations, None{}), expanded),
        P.declarations_unvisited(declarations, P.selected_expanded(C.lookup_declarations(name, declarations, None{}), expanded)),
        P.declarations_unvisited(declarations, expanded),
        P.supporting_unvisited(supporting, P.selected_expanded(C.lookup_declarations(name, declarations, None{}), expanded)),
        P.supporting_unvisited(supporting, expanded), declarations_fold(declarations, name, None{}, expanded),
        supporting_selected_mono(supporting, C.lookup_declarations(name, declarations, None{}), expanded))
    case M.Catalog{+declarations, +supporting} Some{+key}:
      surround(P.selected_credit(C.lookup_supporting(key, supporting, None{}), expanded),
        P.supporting_unvisited(supporting, P.selected_expanded(C.lookup_supporting(key, supporting, None{}), expanded)),
        P.supporting_unvisited(supporting, expanded),
        P.declarations_unvisited(declarations, P.selected_expanded(C.lookup_supporting(key, supporting, None{}), expanded)),
        P.declarations_unvisited(declarations, expanded), supporting_fold(supporting, key, None{}, expanded),
        declarations_selected_mono(declarations, C.lookup_supporting(key, supporting, None{}), expanded))

def main() -> Unit:
  Unit{}
