import Base
import ./REGISTRY_RELATION.bend as Registry

# Any successful positional lookup is within the structural list length.
law get_index_bound:
  for +names: List<&2, String>
  for +name: String
  for +index: Nat
  for selected: {Registry.get(names, index) == Some{name} : Maybe<&2, String>}
  {Nat.is_lt(index, List.length(&2, String, names)) == True{} : Bool}

# Successful decoding excludes zero and bounds the complete one-based identity.
law decode_id_bound:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for decoded: {Registry.decode(names, identity) == Some{name} : Maybe<&2, String>}
  {
    Bool.and(Nat.is_lt(0n, identity), Nat.is_le(identity, List.length(&2, String, names)))
    == True{}
    : Bool
  }

# An absent head cannot hide a selected equal String in the suffix.
law unique_get_step:
  for +equal: Bool
  for +head: String
  for +rest: List<&2, String>
  for +name: String
  for +index: Nat
  for matches: {String.eq(head, name) == equal : Bool}
  for missing: {Registry.encode(rest, head) == None{} : Maybe<&2, Nat>}
  for selected: {Registry.encode(rest, name) == Some{(1n + index : Nat)} : Maybe<&2, Nat>}
  {Registry.encode(head <> rest, name) == Some{(1n + (1n + index : Nat) : Nat)} : Maybe<&2, Nat>}

# Every position of a unique registry is the exact first-hit encoding position.
law unique_get_encodes:
  for +names: List<&2, String>
  for +name: String
  for +index: Nat
  for +valid: {Registry.unique(names) == True{} : Bool}
  for decoded: {Registry.get(names, index) == Some{name} : Maybe<&2, String>}
  {Registry.encode(names, name) == Some{(1n + index : Nat)} : Maybe<&2, Nat>}

# Increment changes positions but preserves the absence discriminator exactly.
law increment_missing_exact:
  for +found: Maybe<&2, Nat>
  {Registry.is_missing(Registry.increment(found)) == Registry.is_missing(found) : Bool}

# A present String after a false head comparison is actually present in the suffix.
law present_cons_false:
  for +head: String
  for +rest: List<&2, String>
  for +query: String
  for distinct: {String.eq(head, query) == False{} : Bool}
  for occurs: {Registry.present(head <> rest, query) == True{} : Bool}
  {Registry.present(rest, query) == True{} : Bool}

# Interning a head then collecting the suffix retains that head's assigned identity.
law collect_head_present:
  for +rest: List<&2, String>
  for +names: List<&2, String>
  for +head: String
  {
    Registry.present(Registry.collect(rest, Registry.names_of(Registry.intern(names, head))), head)
    == True{}
    : Bool
  }

def coverage_continuation(+rest: List<&2, String>, +query: String) -> Type:
  @+names: List<&2, String> ->
  {Registry.present(rest, query) == True{} : Bool} ->
  {Registry.present(Registry.collect(rest, names), query) == True{} : Bool}

# The actual head comparison dispatches only to the strictly smaller input suffix.
law collect_occurrence_step:
  for +equal: Bool
  for +head: String
  for +rest: List<&2, String>
  for +names: List<&2, String>
  for +query: String
  for matches: {String.eq(head, query) == equal : Bool}
  for occurs: {Registry.present(head <> rest, query) == True{} : Bool}
  for suffix: coverage_continuation(rest, query)
  {Registry.present(Registry.collect(head <> rest, names), query) == True{} : Bool}
