import Base
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJsonBatch.bend as Batch

# Draft for designated reviewer approval. No proof bindings yet.
# Typed values here are Strings; raw non-string JS identity/coercion is an
# additional obligation of the actual emitted consumer, not this proof domain.

def primitives(parts: List<&2, Plan.Piece>) -> List<&2, Json.Primitive>:
  match parts:
    case []: []
    case Plan.LiteralPiece{_} <> rest: primitives(rest)
    case Plan.PrimitivePiece{value} <> rest: value <> primitives(rest)

def enumerate(
  values: List<&2, Json.Primitive>,
  +invocation: Nat,
  +first: Nat
) -> List<&2, Batch.Command>:
  match values:
    case []: []
    case value <> rest:
      Batch.Command{invocation, first, value} <> enumerate(rest, invocation, Nat.add(1n, first))

# Every primitive, including object keys and null, gets its original logical ID.
law selection_exact:
  for +parts: List<&2, Plan.Piece>
  for +invocation: Nat
  for +first: Nat
  {
    Batch.select(parts, invocation, first) == enumerate(primitives(parts), invocation, first)
    : List<&2, Batch.Command>
  }

# Splitting the plan cannot reset IDs or reorder native commands.
law selection_composition:
  for +prefix: List<&2, Plan.Piece>
  for +suffix: List<&2, Plan.Piece>
  for +invocation: Nat
  for +first: Nat
  {
    Batch.select(List.append(&2, Plan.Piece, prefix, suffix), invocation, first)
    == List.append(&2, Batch.Command,
      Batch.select(prefix, invocation, first),
      Batch.select(suffix, invocation,
        Nat.add(first, List.length(&2, Json.Primitive, primitives(prefix)))))
    : List<&2, Batch.Command>
  }

# The outer namespace is assigned in Bend, preserving complete inner commands.
law schedule_empty:
  for first: Nat
  {Batch.schedule([], first) == [] : List<&2, Batch.Scheduled>}

law schedule_cons:
  for +command: Batch.Command
  for +rest: List<&2, Batch.Command>
  for +first: Nat
  {
    Batch.schedule(command <> rest, first)
    == Batch.Scheduled{first, command} <> Batch.schedule(rest, Nat.add(1n, first))
    : List<&2, Batch.Scheduled>
  }

law schedule_composition:
  for +prefix: List<&2, Batch.Command>
  for +suffix: List<&2, Batch.Command>
  for +first: Nat
  {
    Batch.schedule(List.append(&2, Batch.Command, prefix, suffix), first)
    == List.append(&2, Batch.Scheduled,
      Batch.schedule(prefix, first),
      Batch.schedule(suffix, Nat.add(first, List.length(&2, Batch.Command, prefix))))
    : List<&2, Batch.Scheduled>
  }

# Independent whole-list validation; do not call Batch.same or Batch.accept.
# Expected streams are arbitrary: matching duplicate expected IDs are permitted.
# Uniqueness/reordering consequences apply to select-generated expectations.
def inner_matches(expected: List<&2, Batch.Command>, observed: List<&2, Batch.Token>) -> Bool:
  match expected observed:
    case Nil{} Nil{}: True{}
    case Con{Batch.Command{invocation, request, _}, commands}
      Con{Batch.Token{other_invocation, other_request, _}, tokens}:
      Bool.and(Nat.is_eq(invocation, other_invocation),
        Bool.and(Nat.is_eq(request, other_request), inner_matches(commands, tokens)))
    case _ _: False{}

def token_values(tokens: List<&2, Batch.Token>) -> List<&2, String>:
  match tokens:
    case []: []
    case Batch.Token{_, _, value} <> tail: value <> token_values(tail)

# Success iff every ID and the complete length match; return exactly the values.
law acceptance_exact:
  for +expected: List<&2, Batch.Command>
  for +observed: List<&2, Batch.Token>
  {
    Batch.accept(expected, observed)
    == Bool.pick(Maybe<&2, List<&2, String>>, inner_matches(expected, observed),
      Some{token_values(observed)}, None{})
    : Maybe<&2, List<&2, String>>
  }

# Outer validation deliberately does not inspect or rewrite inner tokens.
def outer_matches(expected: List<&2, Batch.Scheduled>, observed: List<&2, Batch.Observed>) -> Bool:
  match expected observed:
    case Nil{} Nil{}: True{}
    case Con{Batch.Scheduled{request, _}, commands}
      Con{Batch.Observed{other_request, _}, tokens}:
      Bool.and(Nat.is_eq(request, other_request), outer_matches(commands, tokens))
    case _ _: False{}

def inner_tokens(observed: List<&2, Batch.Observed>) -> List<&2, Batch.Token>:
  match observed:
    case []: []
    case Batch.Observed{_, token} <> tail: token <> inner_tokens(tail)

# Exact outer IDs/cardinality, preserving even malformed inner IDs for accept.
law stripping_exact:
  for +expected: List<&2, Batch.Scheduled>
  for +observed: List<&2, Batch.Observed>
  {
    Batch.strip_outer(expected, observed)
    == Bool.pick(Maybe<&2, List<&2, Batch.Token>>, outer_matches(expected, observed),
      Some{inner_tokens(observed)}, None{})
    : Maybe<&2, List<&2, Batch.Token>>
  }

# Positional substitution over the unchanged token list, independent of bind's
# consuming cursor. The default is unobservable when exact cardinality holds.
def substituted(
  parts: List<&2, Plan.Piece>,
  +tokens: List<&2, String>,
  +index: Nat
) -> List<&2, String>:
  match parts:
    case []: []
    case Plan.LiteralPiece{value} <> tail: value <> substituted(tail, tokens, index)
    case Plan.PrimitivePiece{_} <> tail:
      Maybe.default(&2, String, List.get(&2, String, tokens, index), "") <>
        substituted(tail, tokens, Nat.add(1n, index))

# Preserve every literal boundary and token value; short and extra input refuse.
law binding_exact:
  for +parts: List<&2, Plan.Piece>
  for +tokens: List<&2, String>
  {
    Batch.bind(parts, tokens)
    == Bool.pick(
      Maybe<&2, List<&2, String>>,
      Nat.is_eq(
        List.length(&2, Json.Primitive, primitives(parts)),
        List.length(&2, String, tokens)
      ),
      Some{substituted(parts, tokens, 0n)},
      None{}
    )
    : Maybe<&2, List<&2, String>>
  }

def main() -> Unit:
  Unit{}
