import Base
import ./REGISTRY_RELATION.bend as Registry

# Actual existing-or-new dispatch always returns a correctly decodable String ID.
law intern_decode_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for matches: {Registry.encode(names, name) == found : Maybe<&2, Nat>}
  {
    Registry.decode(
      Registry.names_of(Registry.intern_select(found, names, name)),
      Registry.id_of(Registry.intern_select(found, names, name))
    )
    == Some{name}
    : Maybe<&2, String>
  }

# Actual existing-or-new dispatch fixes both the returned ID and future encoding.
law intern_encode_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for matches: {Registry.encode(names, name) == found : Maybe<&2, Nat>}
  {
    Registry.encode(Registry.names_of(Registry.intern_select(found, names, name)), name)
    == Some{Registry.id_of(Registry.intern_select(found, names, name))}
    : Maybe<&2, Nat>
  }

# Both dispatch branches preserve every existing encoding, even for arbitrary flags.
law intern_preserve_step:
  for +found: Maybe<&2, Nat>
  for +names: List<&2, String>
  for +name: String
  for +query: String
  for +identity: Nat
  for selected: {Registry.encode(names, query) == Some{identity} : Maybe<&2, Nat>}
  {
    Registry.encode(Registry.names_of(Registry.intern_select(found, names, name)), query)
    == Some{identity}
    : Maybe<&2, Nat>
  }
