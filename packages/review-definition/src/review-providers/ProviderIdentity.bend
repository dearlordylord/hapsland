import Base
import ../../../runtime-environment/src/runtime/backend/Backend.bend as Backend

# Template policy stays in Bend; only encodeURIComponent is a host engine.
type Token is Data:
  Literal{value: String}
  Placeholder{field: String}
type Capture is Data:
  Closed{body: String, tail: String}
  Unclosed{}
type State is Data:
  State{
    provider: String,
    model: String,
    fields: List<&2, Backend.Field>,
    pending: List<&2, Token>,
    destination: String
  }
type Step is Data:
  Continue{state: State}
  EncodeComponent{value: String, state: State}
  Completed{identity: Backend.Identity}
  TypeError{message: String}
  URIError{}
  InvalidReply{}

def prepend_capture(character: Char, capture: Capture) -> Capture:
  match capture:
    case Closed{body, tail}: Closed{SCon{character, body}, tail}
    case Unclosed{}: Unclosed{}

def capture_character(
  +character: Char,
  +tail: String,
  closing: Bool,
  next: Unit -> Capture
) -> Capture:
  match closing:
    case True{}: Closed{"", tail}
    case False{}: prepend_capture(character, next(Unit{}))

def capture(value: String) -> Capture:
  match value:
    case "": Unclosed{}
    case SCon{+character, +tail}:
      next: Unit -> Capture = (unit) => capture(tail)
      capture_character(character, tail, U32.is_eq(Char.to_u32(character), 125), next)

def token_capture(
  captured: Capture,
  rest: String,
  parse: String -> List<&2, Token>
) -> List<&2, Token>:
  match captured:
    case Closed{"", _}: Literal{"{"} <> parse(rest)
    case Closed{body, tail}: Placeholder{body} <> parse(tail)
    case Unclosed{}: Literal{SCon{'{', rest}} <> []

def token_character(
  +character: Char,
  +tail: String,
  opening: Bool,
  parse: String -> List<&2, Token>
) -> List<&2, Token>:
  match opening:
    case True{}: token_capture(capture(tail), tail, parse)
    case False{}: Literal{SCon{character, ""}} <> parse(tail)

def tokens(fuel: Nat, value: String) -> List<&2, Token>:
  match fuel value:
    case 0n _: []
    case _ "": []
    case 1n++k SCon{+character, +tail}:
      parse: String -> List<&2, Token> = (rest) => tokens(k, rest)
      token_character(character, tail, U32.is_eq(Char.to_u32(character), 123), parse)

def lookup(
  +name: String,
  +provider: String,
  +model: String,
  fields: List<&2, Backend.Field>
) -> Maybe<&2, String>:
  Bool.pick(
    Maybe<&2, String>,
    String.eq(name, "model"),
    Some{model},
    Bool.pick(
      Maybe<&2, String>,
      String.eq(name, "provider"),
      Some{provider},
      Backend.field(name, fields)
    )
  )

def placeholder(value: Maybe<&2, String>, state: State) -> Step:
  match value:
    case None{}: TypeError{"Missing review destination field"}
    case Some{value}: EncodeComponent{value, state}

def advance(state: State) -> Step:
  match state:
    case State{provider, model, _, [], destination}: Completed{
      Backend.Identity{provider, model, destination}
    }
    case State{provider, model, fields, Literal{value} <> pending, destination}:
      Continue{State{provider, model, fields, pending, String.append(destination, value)}}
    case State{+provider, +model, +fields, Placeholder{name} <> pending, destination}:
      placeholder(
        lookup(name, provider, model, fields),
        State{provider, model, fields, pending, destination}
      )

def begin_model(
  provider: String,
  model: Maybe<&2, String>,
  fields: List<&2, Backend.Field>,
  +destination: String
) -> Step:
  match model:
    case None{}: TypeError{"Review provider has no model"}
    case Some{model}: Continue{
      State{provider, model, fields, tokens(String.length(destination), destination), ""}
    }

def selected_model(value: Backend.ModelField, fallback: Maybe<&2, String>) -> Maybe<&2, String>:
  match value:
    case Backend.Missing{}: fallback
    case Backend.Supplied{value}: value

def begin_catalog(
  selection: Backend.Selection,
  declaration: Maybe<&2, Backend.Declaration>
) -> Step:
  match selection declaration:
    case _ None{}: TypeError{"Unknown review provider"}
    case Backend.Selection{provider, model, fields} Some{
      Backend.Declaration{_, fallback, destination}
    }:
      begin_model(provider, selected_model(model, fallback), fields, destination)

def initial(+selection: Backend.Selection, catalog: List<&2, Backend.Declaration>) -> Step:
  match selection:
    case Backend.Selection{provider, _, _}: begin_catalog(
      selection,
      Backend.declaration(provider, catalog)
    )

def encoded(step: Step, value: String) -> Step:
  match step:
    case EncodeComponent{_, State{provider, model, fields, pending, destination}}:
      Continue{State{provider, model, fields, pending, String.append(destination, value)}}
    case _: InvalidReply{}

def encoding_failed(step: Step) -> Step:
  match step:
    case EncodeComponent{_, _}: URIError{}
    case _: InvalidReply{}
