import Base
import ./REGISTRY_RELATION.bend as Registry
import ./REGISTRY_SUPPORT_LAWS.bend as Support
import ./REGISTRY_SUPPORT_PROOF.bend as SupportProof

law selected_id_decodes:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}
  {Registry.decode(names, identity) == Some{name} : Maybe<&2, String>}

law shared_id_exact:
  for +names: List<&2, String>
  for +left: String
  for +right: String
  for +identity: Nat
  for selected_left: {Registry.encode(names, left) == Some{identity} : Maybe<&2, Nat>}
  for selected_right: {Registry.encode(names, right) == Some{identity} : Maybe<&2, Nat>}
  {left == right : String}

law intern_existing_exact:
  for +names: List<&2, String>
  for +name: String
  for +identity: Nat
  for selected: {Registry.encode(names, name) == Some{identity} : Maybe<&2, Nat>}
  {Registry.intern(names, name) == Tuple{names, identity} : List<&2, String> & Nat}

def selected_id_decodes(names, name, identity, selected):
  suffix = {+index => found => Support.get_from_find(names, name, index, found) : Support.selected_get_continuation(Registry.find(names, name), names, name)}
  Support.increment_decodes(Registry.find(names, name), names, name, identity, selected, suffix)

def shared_id_exact(names, left, right, identity, selected_left, selected_right):
  Support.some_injective(
    String,
    left,
    right,
    Equal.trans(
      Maybe<&2, String>,
      Some{left},
      Registry.decode(names, identity),
      Some{right},
      Equal.sym(
        Maybe<&2, String>,
        Registry.decode(names, identity),
        Some{left},
        selected_id_decodes(names, left, identity, selected_left)
      ),
      selected_id_decodes(names, right, identity, selected_right)
    )
  )

def intern_existing_exact(names, name, identity, selected):
  %Equal.sym(Maybe<&2, Nat>, Registry.encode(names, name), Some{identity}, selected):
    {Registry.intern_select(_, names, name) == Tuple{names, identity} : List<&2, String> & Nat}
  {==}
