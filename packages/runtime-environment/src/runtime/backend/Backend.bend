import Base

# Raw validated backend/catalog facts. Presence of model is independent of its
# value, matching the native own model property before default selection.
type ModelField is Data:
  Missing{}
  Supplied{value: Maybe<&2, String>}
type Field is Data:
  Field{name: String, value: String}
type Selection is Data:
  Selection{provider: String, model: ModelField, fields: List<&2, Field>}
type Declaration is Data:
  Declaration{id: String, default_model: Maybe<&2, String>, destination: String}
type Identity is Data:
  Identity{provider: String, model: String, destination: String}

def default_selection() -> Selection:
  Selection{"jev", Missing{}, []}

def field(+name: String, fields: List<&2, Field>) -> Maybe<&2, String>:
  match fields:
    case []: None{}
    case Field{key, value} <> tail:
      Bool.pick(Maybe<&2, String>, String.eq(name, key), Some{value}, field(name, tail))

def declaration_id(value: Declaration) -> String:
  match value:
    case Declaration{id, _, _}: id

def declaration(+provider: String, catalog: List<&2, Declaration>) -> Maybe<&2, Declaration>:
  match catalog:
    case []: None{}
    case +head <> tail:
      Bool.pick(
        Maybe<&2, Declaration>,
        String.eq(provider, declaration_id(head)),
        Some{head},
        declaration(provider, tail)
      )
