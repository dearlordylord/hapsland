import Base
import ./REGISTRY_RELATION.bend as Registry

def selected_head(equal: Bool, rest: List<&2, String>, name: String) -> Maybe<&2, Nat>:
  Registry.find_step(equal, next => Registry.find(rest, name))

def get_continuation(+rest: List<&2, String>, +name: String) -> Type:
  @+index: Nat -> {Registry.find(rest, name) == Some{index} : Maybe<&2, Nat>} -> {
    Registry.get(rest, index)
    == Some{name}
    : Maybe<&2, String>
  }

def selected_get_continuation(
  +found: Maybe<&2, Nat>,
  +names: List<&2, String>,
  +name: String
) -> Type:
  @+index: Nat -> {found == Some{index} : Maybe<&2, Nat>} -> {
    Registry.get(names, index)
    == Some{name}
    : Maybe<&2, String>
  }

# Distinct Maybe constructors cannot be equal, for any reusable payload type.
law none_not_some:
  for -V: Data
  for value: V
  for equal: {None{} == Some{value} : Maybe<&2, V>}
  Empty

# Some preserves exact equality of its payload, including Nat and String.
law some_injective:
  for -V: Data
  for +left: V
  for +right: V
  for equal: {Some{left} == Some{right} : Maybe<&2, V>}
  {left == right : V}

# Zero-based lookup returns exactly the String selected by the actual find.
law get_from_find:
  for +names: List<&2, String>
  for +name: String
  for +index: Nat
  for selected: {Registry.find(names, name) == Some{index} : Maybe<&2, Nat>}
  {Registry.get(names, index) == Some{name} : Maybe<&2, String>}

# A failed head comparison uses an incremented selection from the smaller suffix.
law find_increment_get_step:
  for +found: Maybe<&2, Nat>
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for +index: Nat
  for find_matches: {Registry.find(rest, name) == found : Maybe<&2, Nat>}
  for selected: {Registry.increment(found) == Some{index} : Maybe<&2, Nat>}
  for suffix: get_continuation(rest, name)
  {Registry.get(head <> rest, index) == Some{name} : Maybe<&2, String>}

# The actual equality guard selects the head or delegates to the smaller suffix.
law find_get_step:
  for +equal: Bool
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for +index: Nat
  for matches: {String.eq(head, name) == equal : Bool}
  for selected: {selected_head(equal, rest, name) == Some{index} : Maybe<&2, Nat>}
  for suffix: get_continuation(rest, name)
  {Registry.get(head <> rest, index) == Some{name} : Maybe<&2, String>}

# Increment converts a zero-based selected lookup into exact one-based decoding.
law increment_decodes:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.increment(found) == Some{identity} : Maybe<&2, Nat>}
  for suffix: selected_get_continuation(found, names, name)
  {Registry.decode(names, identity) == Some{name} : Maybe<&2, String>}
