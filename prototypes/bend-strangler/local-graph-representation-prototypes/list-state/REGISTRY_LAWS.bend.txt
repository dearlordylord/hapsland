import Base
import ./REGISTRY_RELATION.bend as Registry

# Decoding a selected ID recovers the String even in a raw duplicate registry.
law selected_id_decodes:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}
  {Registry.decode(names, identity) == Some{name} : Maybe<&2, String>}

# A shared ID cannot alias distinct String values or roles.
law shared_id_exact:
  for +names: List<&2, String>
  for +left: String
  for +right: String
  for +identity: Nat
  for selected_left: {Registry.encode(names, left) == Some{identity} : Maybe<&2, Nat>}
  for selected_right: {Registry.encode(names, right) == Some{identity} : Maybe<&2, Nat>}
  {left == right : String}

# Appending a new String preserves every existing ID, including collisions of roles.
law extension_preserves_selected:
  for +names: List<&2, String>
  for +added: String
  for +query: String
  for +identity: Nat
  for selected: {Registry.encode(names, query) == Some{identity} : Maybe<&2, Nat>}
  {
    Registry.encode(List.append(&2, String, names, [added]), query)
    == Some{identity}
    : Maybe<&2, Nat>
  }

# Existing strings reuse both the exact registry and their existing identity.
law intern_existing_exact:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}
  {Registry.intern(names, name) == Tuple{names, identity} : List<&2, String> & Nat}

# Interning always returns an ID that decodes to the requested String.
law intern_decodes:
  for +names: List<&2, String>
  for +name: String
  {
    Registry.decode(
      Registry.names_of(Registry.intern(names, name)),
      Registry.id_of(Registry.intern(names, name))
    )
    == Some{name}
    : Maybe<&2, String>
  }

# Interning preserves all previously assigned IDs.
law intern_preserves_selected:
  for +names: List<&2, String>
  for +name: String
  for +query: String
  for +identity: Nat
  for selected: {Registry.encode(names, query) == Some{identity} : Maybe<&2, Nat>}
  {
    Registry.encode(Registry.names_of(Registry.intern(names, name)), query)
    == Some{identity}
    : Maybe<&2, Nat>
  }

# The newly returned ID is exactly the subsequent encoding of the requested String.
law intern_encodes:
  for +names: List<&2, String>
  for +name: String
  {
    Registry.encode(Registry.names_of(Registry.intern(names, name)), name)
    == Some{Registry.id_of(Registry.intern(names, name))}
    : Maybe<&2, Nat>
  }

# Constructive interning preserves distinct registry entries.
law intern_preserves_unique:
  for +names: List<&2, String>
  for +name: String
  for valid: {Registry.unique(names) == True{} : Bool}
  {Registry.unique(Registry.names_of(Registry.intern(names, name))) == True{} : Bool}

# Folding every finite input list constructs a unique shared registry from empty.
law constructed_registry_unique:
  for items: List<&2, String>
  {Registry.unique(Registry.registry(items)) == True{} : Bool}

# Unique registries also recover the exact ID after decoding a String.
law decoded_id_encodes:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for valid: {Registry.unique(names) == True{} : Bool}
  for decoded: {Registry.decode(names, identity) == Some{name} : Maybe<&2, String>}
  {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}

# Collecting all input strings preserves every ID already present.
law collect_preserves_selected:
  for +items: List<&2, String>
  for +names: List<&2, String>
  for +query: String
  for +identity: Nat
  for selected: {Registry.encode(names, query) == Some{identity} : Maybe<&2, Nat>}
  {Registry.encode(Registry.collect(items, names), query) == Some{identity} : Maybe<&2, Nat>}

# Collecting arbitrary finite inputs preserves a unique starting registry.
law collect_preserves_unique:
  for +items: List<&2, String>
  for +names: List<&2, String>
  for valid: {Registry.unique(names) == True{} : Bool}
  {Registry.unique(Registry.collect(items, names)) == True{} : Bool}

# Every string actually occurring in the collected input is registered afterwards.
law collected_input_present:
  for +items: List<&2, String>
  for +names: List<&2, String>
  for +query: String
  for occurs: {Registry.present(items, query) == True{} : Bool}
  {Registry.present(Registry.collect(items, names), query) == True{} : Bool}

# Every selected ID is positive and within the exact registry length.
law assigned_id_in_range:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}
  {
    Bool.and(Nat.is_lt(0n, identity), Nat.is_le(identity, List.length(&2, String, names)))
    == True{}
    : Bool
  }
