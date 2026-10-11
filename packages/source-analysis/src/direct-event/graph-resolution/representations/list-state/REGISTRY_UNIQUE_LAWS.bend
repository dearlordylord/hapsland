import Base
import ./REGISTRY_RELATION.bend as Registry

# The missing discriminator gives the exact absent optional identity.
law missing_is_none:
  for +found: Maybe<&2, Nat>
  for missing: {Registry.is_missing(found) == True{} : Bool}
  {found == None{} : Maybe<&2, Nat>}

# A missing cons lookup can only have taken the false head branch.
law missing_head_guard:
  for +equal: Bool
  for +found: Maybe<&2, Nat>
  for missing: {
    Registry.increment(Registry.find_step(equal, next => found)) == None{}
    : Maybe<&2, Nat>
  }
  {equal == False{} : Bool}

# The same actual missing cons branch also entails a missing suffix lookup.
law missing_head_suffix:
  for +equal: Bool
  for +found: Maybe<&2, Nat>
  for missing: {
    Registry.increment(Registry.find_step(equal, next => found)) == None{}
    : Maybe<&2, Nat>
  }
  {Registry.increment(found) == None{} : Maybe<&2, Nat>}

# An absent String in a cons registry is absent in its suffix too.
law missing_suffix:
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for missing: {Registry.encode(head <> rest, name) == None{} : Maybe<&2, Nat>}
  {Registry.encode(rest, name) == None{} : Maybe<&2, Nat>}

# An absent String differs from the head, including the reverse comparison direction.
law absent_head_distinct:
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for missing: {Registry.encode(head <> rest, name) == None{} : Maybe<&2, Nat>}
  {String.eq(name, head) == False{} : Bool}

# Appending a different String preserves an absent query, not just existing IDs.
law append_preserves_missing:
  for +names: List<&2, String>
  for +added: String
  for +query: String
  for missing: {Registry.encode(names, query) == None{} : Maybe<&2, Nat>}
  for distinct: {String.eq(added, query) == False{} : Bool}
  {Registry.encode(List.append(&2, String, names, [added]), query) == None{} : Maybe<&2, Nat>}

# Rebuild uniqueness from the actual absent head and the proved appended suffix.
law unique_append_cons:
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for head_missing: {Registry.encode(rest, head) == None{} : Maybe<&2, Nat>}
  for name_missing: {Registry.encode(head <> rest, name) == None{} : Maybe<&2, Nat>}
  for suffix: {Registry.unique(List.append(&2, String, rest, [name])) == True{} : Bool}
  {Registry.unique(List.append(&2, String, head <> rest, [name])) == True{} : Bool}

# Appending an absent String preserves uniqueness for every finite registry.
law unique_append_missing:
  for +names: List<&2, String>
  for +name: String
  for +valid: {Registry.unique(names) == True{} : Bool}
  for +missing: {Registry.encode(names, name) == None{} : Maybe<&2, Nat>}
  {Registry.unique(List.append(&2, String, names, [name])) == True{} : Bool}

# The selected branch is constrained by the actual lookup, never an assumed miss.
law intern_unique_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for matches: {Registry.encode(names, name) == found : Maybe<&2, Nat>}
  for valid: {Registry.unique(names) == True{} : Bool}
  {Registry.unique(Registry.names_of(Registry.intern_select(found, names, name))) == True{} : Bool}

# Reverse comparison uses the actual String.eq guard and exact String equality.
law reverse_false_step:
  for +equal: Bool
  for +head: String
  for +name: String
  for forward: {String.eq(head, name) == False{} : Bool}
  for matches: {String.eq(name, head) == equal : Bool}
  {equal == False{} : Bool}
