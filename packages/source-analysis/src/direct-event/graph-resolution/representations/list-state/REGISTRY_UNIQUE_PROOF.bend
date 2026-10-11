import Base
import ./REGISTRY_RELATION.bend as Registry
import ./REGISTRY_UNIQUE_LAWS.bend as Unique
import ./REGISTRY_SUPPORT_LAWS.bend as Support
import ./REGISTRY_SUPPORT_PROOF.bend as SupportProof
import ./REGISTRY_APPEND_LAWS.bend as Append
import ./REGISTRY_APPEND_PROOF.bend as AppendProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/string.bend as StringFacts

def Unique.missing_is_none(found, missing):
  match found:
    case None{}: {==}
    case Some{identity}:
      Empty.absurd(
        {Some{identity} == None{} : Maybe<&2, Nat>},
        BoolFacts.internal_false_ne_true(missing)
      )

def Unique.missing_head_guard(equal, found, missing):
  match equal:
    case False{}: {==}
    case True{}:
      Empty.absurd(
        {True{} == False{} : Bool},
        Support.none_not_some(Nat, 1n, Equal.sym(Maybe<&2, Nat>, Some{1n}, None{}, missing))
      )

def Unique.missing_head_suffix(equal, found, missing):
  match equal found:
    case True{} +found:
      Empty.absurd(
        {Registry.increment(found) == None{} : Maybe<&2, Nat>},
        Support.none_not_some(Nat, 1n, Equal.sym(Maybe<&2, Nat>, Some{1n}, None{}, missing))
      )
    case False{} None{}: {==}
    case False{} Some{+index}:
      Empty.absurd(
        {Some{(1n + index : Nat)} == None{} : Maybe<&2, Nat>},
        Support.none_not_some(Nat, (1n + (1n + index : Nat) : Nat),
          Equal.sym(Maybe<&2, Nat>, Some{(1n + (1n + index : Nat) : Nat)}, None{}, missing))
      )

def Unique.missing_suffix(head, rest, name, missing):
  Unique.missing_head_suffix(String.eq(head, name), Registry.find(rest, name), missing)

def append_absent_at(+equal: Bool, +length: Nat, found: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  Append.append_lookup(found, equal, length)

def append_equal_at(+length: Nat, equal: Bool) -> Maybe<&2, Nat>:
  Append.append_lookup(None{}, equal, length)

def Unique.append_preserves_missing(names, added, query, missing, distinct):
  +found = Registry.find(names, query)
  +equal = String.eq(added, query)
  +length = List.length(&2, String, names)
  +after = Registry.find(List.append(&2, String, names, [added]), query)
  +specified = Append.append_lookup(found, equal, length)
  +absent = Append.append_lookup(None{}, equal, length)
  first = Append.find_append_exact(names, added, query)
  second = Equal.cong(Maybe<&2, Nat>, Maybe<&2, Nat>, append_absent_at(equal, length),
    found, None{}, Append.increment_injective(found, None{}, missing))
  third = Equal.cong(Bool, Maybe<&2, Nat>, append_equal_at(length), equal, False{}, distinct)
  combined = Equal.trans(Maybe<&2, Nat>, after, specified, None{}, first,
    Equal.trans(Maybe<&2, Nat>, specified, absent, None{}, second, third))
  Equal.cong(Maybe<&2, Nat>, Maybe<&2, Nat>, Registry.increment, after, None{}, combined)

def compare_from(+head: String, name: String) -> Bool:
  String.eq(head, name)

def Unique.reverse_false_step(equal, head, name, forward, matches):
  match equal:
    case False{}: {==}
    case True{}:
      +comparison = String.eq(head, name)
      +self = String.eq(head, head)
      exact = StringFacts.eq_of_eq_true(name, head, matches)
      same = Equal.cong(String, Bool, compare_from(head), name, head, exact)
      contradiction = Equal.trans(Bool, False{}, comparison, True{},
        Equal.sym(Bool, comparison, False{}, forward),
        Equal.trans(Bool, comparison, self, True{}, same, StringFacts.eq_refl(head)))
      Empty.absurd({True{} == False{} : Bool}, BoolFacts.internal_false_ne_true(contradiction))

def Unique.absent_head_distinct(head, rest, name, missing):
  Unique.reverse_false_step(String.eq(name, head), head, name,
    Unique.missing_head_guard(String.eq(head, name), Registry.find(rest, name), missing), {==})

def Unique.unique_append_cons(head, rest, name, head_missing, name_missing, suffix):
  +extended = List.append(&2, String, rest, [name])
  +found = Registry.encode(extended, head)
  exact = Unique.append_preserves_missing(rest, name, head, head_missing,
    Unique.absent_head_distinct(head, rest, name, name_missing))
  missing = Equal.cong(Maybe<&2, Nat>, Bool, Registry.is_missing, found, None{}, exact)
  BoolFacts.and_eq_true(Registry.is_missing(found), Registry.unique(extended), missing, suffix)

def Unique.unique_append_missing(names, name, valid, missing):
  match names:
    case []: {==}
    case +head <> +rest:
      +absent = Registry.is_missing(Registry.encode(rest, head))
      +suffix_valid = Registry.unique(rest)
      Unique.unique_append_cons(head, rest, name,
        Unique.missing_is_none(Registry.encode(rest, head),
          BoolFacts.eq_true_of_and_left(absent, suffix_valid, valid)),
        missing,
        Unique.unique_append_missing(rest, name,
          BoolFacts.eq_true_of_and_right(absent, suffix_valid, valid),
          Unique.missing_suffix(head, rest, name, missing)))

def Unique.intern_unique_step(found, names, name, matches, valid):
  match found:
    case None{}: Unique.unique_append_missing(names, name, valid, matches)
    case Some{identity}: valid


law intern_preserves_unique:
  for +names: List<&2, String>
  for +name: String
  for valid: {Registry.unique(names) == True{} : Bool}
  {Registry.unique(Registry.names_of(Registry.intern(names, name))) == True{} : Bool}

law collect_preserves_unique:
  for +items: List<&2, String>
  for +names: List<&2, String>
  for valid: {Registry.unique(names) == True{} : Bool}
  {Registry.unique(Registry.collect(items, names)) == True{} : Bool}

law constructed_registry_unique:
  for items: List<&2, String>
  {Registry.unique(Registry.registry(items)) == True{} : Bool}

def intern_preserves_unique(names, name, valid):
  Unique.intern_unique_step(Registry.encode(names, name), names, name, {==}, valid)

def collect_preserves_unique(items, names, valid):
  match items:
    case []: valid
    case +head <> rest:
      collect_preserves_unique(rest, Registry.names_of(Registry.intern(names, head)),
        intern_preserves_unique(names, head, valid))

def constructed_registry_unique(items):
  collect_preserves_unique(items, [], {==})
