import Base
import ./REGISTRY_RELATION.bend as Registry
import ./REGISTRY_SUPPORT_LAWS.bend as Support

def append_missing(equal: Bool, length: Nat) -> Maybe<&2, Nat>:
  match equal:
    case True{}: Some{length}
    case False{}: None{}

def append_lookup(found: Maybe<&2, Nat>, equal: Bool, length: Nat) -> Maybe<&2, Nat>:
  match found:
    case None{}: append_missing(equal, length)
    case Some{index}: Some{index}

# Incrementing an optional position never loses or merges its identity.
law increment_injective:
  for +left: Maybe<&2, Nat>
  for +right: Maybe<&2, Nat>
  for equal: {Registry.increment(left) == Registry.increment(right) : Maybe<&2, Nat>}
  {left == right : Maybe<&2, Nat>}

# The appended String occupies exactly the old list length.
law appended_get_exact:
  for +names: List<&2, String>
  for +name: String
  {
    Registry.get(List.append(&2, String, names, [name]), List.length(&2, String, names))
    == Some{name}
    : Maybe<&2, String>
  }

# Adding a head commutes with the independent appended-lookup characterization.
law append_increment:
  for +found: Maybe<&2, Nat>
  for +equal: Bool
  for +length: Nat
  {
    append_lookup(Registry.increment(found), equal, (1n + length : Nat))
    == Registry.increment(append_lookup(found, equal, length))
    : Maybe<&2, Nat>
  }

# Empty original lookup selects only the single appended value.
law append_empty:
  for +equal: Bool
  {Registry.find_step(equal, next => None{}) == append_missing(equal, 0n) : Maybe<&2, Nat>}

# Reassemble the head using only the actual lookup equality of its smaller suffix.
law append_head_step:
  for +equal: Bool
  for +rest: List<&2, String>
  for +added: String
  for +query: String
  for suffix: {
    Registry.find(List.append(&2, String, rest, [added]), query)
    == append_lookup(
      Registry.find(rest, query),
      String.eq(added, query),
      List.length(&2, String, rest)
    )
    : Maybe<&2, Nat>
  }
  {
    Support.selected_head(equal, List.append(&2, String, rest, [added]), query)
    == append_lookup(
      Support.selected_head(equal, rest, query),
      String.eq(added, query),
      (1n + List.length(&2, String, rest) : Nat)
    )
    : Maybe<&2, Nat>
  }

# Independent complete lookup specification for appending one registry String.
law find_append_exact:
  for +names: List<&2, String>
  for +added: String
  for +query: String
  {
    Registry.find(List.append(&2, String, names, [added]), query)
    == append_lookup(
      Registry.find(names, query),
      String.eq(added, query),
      List.length(&2, String, names)
    )
    : Maybe<&2, Nat>
  }

# Existing selected positions are unaffected by the appended-lookup alternative.
law append_encoded_selected:
  for +found: Maybe<&2, Nat>
  for +equal: Bool
  for +length: Nat
  for +identity: Nat
  for selected: {Registry.increment(found) == Some{identity} : Maybe<&2, Nat>}
  {Registry.increment(append_lookup(found, equal, length)) == Some{identity} : Maybe<&2, Nat>}

# Appending an absent requested String yields exactly the new one-based ID.
law appended_encode_missing:
  for +names: List<&2, String>
  for +name: String
  for missing: {Registry.encode(names, name) == None{} : Maybe<&2, Nat>}
  {
    Registry.encode(List.append(&2, String, names, [name]), name)
    == Some{(1n + List.length(&2, String, names) : Nat)}
    : Maybe<&2, Nat>
  }
