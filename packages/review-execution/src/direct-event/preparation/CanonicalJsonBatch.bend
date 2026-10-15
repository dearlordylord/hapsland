import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan

# Ordered native requests selected by the core. The host copies identifiers;
# it never synthesizes progress or accepts a partial batch.
type Command is Data:
  Command{invocation: Nat, request: Nat, primitive: Json.Primitive}
type Token is Data:
  Token{invocation: Nat, request: Nat, value: String}
type Scheduled is Data:
  Scheduled{request: Nat, command: Command}
type Observed is Data:
  Observed{request: Nat, token: Token}

def select(
  parts: List<&2, Plan.Piece>,
  +invocation: Nat,
  +request: Nat
) -> List<&2, Command>:
  match parts:
    case []: []
    case Plan.LiteralPiece{_} <> tail: select(tail, invocation, request)
    case Plan.PrimitivePiece{value} <> tail:
      Command{invocation, request, value} <> select(tail, invocation, Nat.add(1n, request))

def schedule(commands: List<&2, Command>, +request: Nat) -> List<&2, Scheduled>:
  match commands:
    case []: []
    case command <> tail:
      Scheduled{request, command} <> schedule(tail, Nat.add(1n, request))

def prepend(
  value: String,
  rest: Maybe<&2, List<&2, String>>
) -> Maybe<&2, List<&2, String>>:
  match rest:
    case None{}: None{}
    case Some{rest}: Some{value <> rest}

def same(+invocation: Nat, +request: Nat, other_invocation: Nat, other_request: Nat) -> Bool:
  Bool.and(Nat.is_eq(invocation, other_invocation), Nat.is_eq(request, other_request))

def accept(
  expected: List<&2, Command>,
  observed: List<&2, Token>
) -> Maybe<&2, List<&2, String>>:
  match expected observed:
    case Nil{} Nil{}: Some{[]}
    case Con{Command{invocation, request, _}, commands}
      Con{Token{other_invocation, other_request, value}, tokens}:
      Bool.pick(
        Maybe<&2, List<&2, String>>,
        same(invocation, request, other_invocation, other_request),
        prepend(value, accept(commands, tokens)),
        None{}
      )
    case _ _: None{}

def prepend_token(
  token: Token,
  rest: Maybe<&2, List<&2, Token>>
) -> Maybe<&2, List<&2, Token>>:
  match rest:
    case None{}: None{}
    case Some{rest}: Some{token <> rest}

def strip_outer(
  expected: List<&2, Scheduled>,
  observed: List<&2, Observed>
) -> Maybe<&2, List<&2, Token>>:
  match expected observed:
    case Nil{} Nil{}: Some{[]}
    case Con{Scheduled{request, _}, commands} Con{Observed{other_request, token}, tokens}:
      Bool.pick(
        Maybe<&2, List<&2, Token>>,
        Nat.is_eq(request, other_request),
        prepend_token(token, strip_outer(commands, tokens)),
        None{}
      )
    case _ _: None{}

# Keep literal boundaries and raw token values. Concatenation belongs to the
# next guarded machine advance, never to reply acceptance or group commit.
def bind(
  parts: List<&2, Plan.Piece>,
  tokens: List<&2, String>
) -> Maybe<&2, List<&2, String>>:
  match parts tokens:
    case Nil{} Nil{}: Some{[]}
    case Con{Plan.LiteralPiece{value}, tail} _: prepend(value, bind(tail, tokens))
    case Con{Plan.PrimitivePiece{_}, tail} Con{value, rest}: prepend(value, bind(tail, rest))
    case _ _: None{}

def main() -> Unit:
  Unit{}
