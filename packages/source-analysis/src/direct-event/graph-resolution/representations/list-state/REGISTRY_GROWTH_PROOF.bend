import Base
import ./REGISTRY_RELATION.bend as Registry
import ./REGISTRY_APPEND_LAWS.bend as Append
import ./REGISTRY_APPEND_PROOF.bend as AppendProof
import ./REGISTRY_DECODE_PROOF.bend as Decode
import ./REGISTRY_INTERN_LAWS.bend as Intern

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

law intern_encodes:
  for +names: List<&2, String>
  for +name: String
  {
    Registry.encode(Registry.names_of(Registry.intern(names, name)), name)
    == Some{Registry.id_of(Registry.intern(names, name))}
    : Maybe<&2, Nat>
  }

law collect_preserves_selected:
  for +items: List<&2, String>
  for +names: List<&2, String>
  for +query: String
  for +identity: Nat
  for selected: {Registry.encode(names, query) == Some{identity} : Maybe<&2, Nat>}
  {Registry.encode(Registry.collect(items, names), query) == Some{identity} : Maybe<&2, Nat>}

def extension_preserves_selected(names, added, query, identity, selected):
  +after = Registry.find(List.append(&2, String, names, [added]), query)
  +found = Registry.find(names, query)
  +matches = String.eq(added, query)
  +length = List.length(&2, String, names)
  +specified = Append.append_lookup(found, matches, length)
  Equal.trans(
    Maybe<&2, Nat>,
    Registry.increment(after),
    Registry.increment(specified),
    Some{identity},
    Equal.cong(
      Maybe<&2, Nat>,
      Maybe<&2, Nat>,
      Registry.increment,
      after,
      specified,
      Append.find_append_exact(names, added, query)
    ),
    Append.append_encoded_selected(found, matches, length, identity, selected)
  )

def Intern.intern_decode_step(found, names, name, matches):
  match found:
    case None{}: Append.appended_get_exact(names, name)
    case Some{identity}: Decode.selected_id_decodes(names, name, identity, matches)

def Intern.intern_encode_step(found, names, name, matches):
  match found:
    case None{}: Append.appended_encode_missing(names, name, matches)
    case Some{identity}: matches

def Intern.intern_preserve_step(found, names, name, query, identity, selected):
  match found:
    case None{}: extension_preserves_selected(names, name, query, identity, selected)
    case Some{index}: selected

def intern_decodes(names, name):
  Intern.intern_decode_step(Registry.encode(names, name), names, name, {==})

def intern_encodes(names, name):
  Intern.intern_encode_step(Registry.encode(names, name), names, name, {==})

def intern_preserves_selected(names, name, query, identity, selected):
  Intern.intern_preserve_step(Registry.encode(names, name), names, name, query, identity, selected)

def collect_preserves_selected(items, names, query, identity, selected):
  match items:
    case []: selected
    case +head <> rest:
      collect_preserves_selected(
        rest,
        Registry.names_of(Registry.intern(names, head)),
        query,
        identity,
        intern_preserves_selected(names, head, query, identity, selected)
      )
