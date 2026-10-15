import Base
import ./CanonicalJsonBatchLaws.bend as Laws
import ./CanonicalJsonBatch.bend as Batch
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJson.bend as Json
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as Nats

def Laws.selection_exact(parts, invocation, first):
  match parts:
    case []: {==}
    case Plan.LiteralPiece{_} <> tail: Laws.selection_exact(tail, invocation, first)
    case Plan.PrimitivePiece{value} <> tail:
      Equal.cong(List<&2, Batch.Command>, List<&2, Batch.Command>, rest => Batch.Command{
        invocation, first, value} <> rest,
        Batch.select(tail, invocation, Nat.add(1n, first)), Laws.enumerate(Laws.primitives(
          tail), invocation, Nat.add(1n, first)),
        Laws.selection_exact(tail, invocation, Nat.add(1n, first)))

def Laws.selection_composition(prefix, suffix, invocation, first):
  match prefix:
    case []:
      %Equal.sym(Nat, Nat.add(first, 0n), first, Nats.add_zero(first)):
        {Batch.select(suffix, invocation, first) == Batch.select(suffix, invocation,
          _) : List<&2, Batch.Command>}
      {==}
    case Plan.LiteralPiece{_} <> tail: Laws.selection_composition(tail, suffix, invocation, first)
    case Plan.PrimitivePiece{value} <> tail:
      %Equal.sym(Nat, Nat.add(first, Nat.add(1n, List.length(&2, Json.Primitive,
        Laws.primitives(tail)))), Nat.add(1n, Nat.add(first, List.length(&2, Json.Primitive,
        Laws.primitives(tail)))), Nats.add_succ(first, List.length(&2, Json.Primitive,
        Laws.primitives(tail)))):
        {Batch.Command{invocation, first, value} <> Batch.select(List.append(&2, Plan.Piece,
          tail, suffix), invocation, Nat.add(1n, first))
        == Batch.Command{invocation, first, value} <> List.append(&2, Batch.Command,
          Batch.select(tail, invocation, Nat.add(1n, first)), Batch.select(suffix, invocation,
          _)) : List<&2, Batch.Command>}
      Equal.cong(List<&2, Batch.Command>, List<&2, Batch.Command>, rest => Batch.Command{
        invocation, first, value} <> rest,
        Batch.select(List.append(&2, Plan.Piece, tail, suffix), invocation, Nat.add(1n, first)),
        List.append(&2, Batch.Command, Batch.select(tail, invocation, Nat.add(1n, first)),
          Batch.select(suffix, invocation, Nat.add(Nat.add(1n, first), List.length(&2,
          Json.Primitive, Laws.primitives(tail))))),
        Laws.selection_composition(tail, suffix, invocation, Nat.add(1n, first)))

def Laws.schedule_empty(first):
  {==}

def Laws.schedule_cons(command, rest, first):
  {==}

def Laws.schedule_composition(prefix, suffix, first):
  match prefix:
    case []:
      %Equal.sym(Nat, Nat.add(first, 0n), first, Nats.add_zero(first)):
        {Batch.schedule(suffix, first) == Batch.schedule(suffix, _) : List<&2, Batch.Scheduled>}
      {==}
    case command <> tail:
      %Equal.sym(Nat, Nat.add(first, Nat.add(1n, List.length(&2, Batch.Command, tail))),
        Nat.add(1n, Nat.add(first, List.length(&2, Batch.Command, tail))), Nats.add_succ(first,
        List.length(&2, Batch.Command, tail))):
        {Batch.Scheduled{first, command} <> Batch.schedule(List.append(&2, Batch.Command, tail,
          suffix), Nat.add(1n, first))
        == Batch.Scheduled{first, command} <> List.append(&2, Batch.Scheduled, Batch.schedule(
          tail, Nat.add(1n, first)), Batch.schedule(suffix, _)) : List<&2, Batch.Scheduled>}
      Equal.cong(List<&2, Batch.Scheduled>, List<&2, Batch.Scheduled>, rest => Batch.Scheduled{
        first, command} <> rest,
        Batch.schedule(List.append(&2, Batch.Command, tail, suffix), Nat.add(1n, first)),
        List.append(&2, Batch.Scheduled, Batch.schedule(tail, Nat.add(1n, first)),
          Batch.schedule(suffix, Nat.add(Nat.add(1n, first), List.length(&2, Batch.Command,
          tail)))),
        Laws.schedule_composition(tail, suffix, Nat.add(1n, first)))

def accept_choice(+invocation: Bool, +request: Bool, +tail: Bool, +value: String,
  +values: List<&2, String>) -> {
  Bool.pick(Maybe<&2, List<&2, String>>, Bool.and(invocation, request),
    Batch.prepend(value, Bool.pick(Maybe<&2, List<&2, String>>, tail, Some{values}, None{})),
      None{})
  == Bool.pick(Maybe<&2, List<&2, String>>, Bool.and(invocation, Bool.and(request, tail)), Some{
    value <> values}, None{})
  : Maybe<&2, List<&2, String>>
}:
  match invocation request tail:
    case False{} _ _: {==}
    case True{} False{} _: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def Laws.acceptance_exact(expected, observed):
  match expected observed:
    case Nil{} Nil{}: {==}
    case Nil{} Con{_, _}: {==}
    case Con{_, _} Nil{}: {==}
    case Con{Batch.Command{invocation, request, _}, commands} Con{Batch.Token{other_invocation,
      other_request, value}, tokens}:
      %Equal.sym(Maybe<&2, List<&2, String>>, Batch.accept(commands, tokens), Bool.pick(
        Maybe<&2, List<&2, String>>, Laws.inner_matches(commands, tokens), Some{
        Laws.token_values(tokens)}, None{}), Laws.acceptance_exact(commands, tokens)):
        {Bool.pick(Maybe<&2, List<&2, String>>, Batch.same(invocation, request,
          other_invocation, other_request), Batch.prepend(value, _), None{})
        == Bool.pick(Maybe<&2, List<&2, String>>, Bool.and(Nat.is_eq(invocation,
          other_invocation), Bool.and(Nat.is_eq(request, other_request), Laws.inner_matches(
          commands, tokens))), Some{value <> Laws.token_values(tokens)}, None{}) : Maybe<&2,
          List<&2, String>>}
      accept_choice(Nat.is_eq(invocation, other_invocation), Nat.is_eq(request, other_request),
        Laws.inner_matches(commands, tokens), value, Laws.token_values(tokens))

def outer_choice(+head: Bool, +tail: Bool, +token: Batch.Token, +tokens: List<&2,
  Batch.Token>) -> {
  Bool.pick(Maybe<&2, List<&2, Batch.Token>>, head,
    Batch.prepend_token(token, Bool.pick(Maybe<&2, List<&2, Batch.Token>>, tail, Some{tokens},
      None{})), None{})
  == Bool.pick(Maybe<&2, List<&2, Batch.Token>>, Bool.and(head, tail), Some{token <> tokens},
    None{})
  : Maybe<&2, List<&2, Batch.Token>>
}:
  match head tail:
    case False{} _: {==}
    case True{} False{}: {==}
    case True{} True{}: {==}

def Laws.stripping_exact(expected, observed):
  match expected observed:
    case Nil{} Nil{}: {==}
    case Nil{} Con{_, _}: {==}
    case Con{_, _} Nil{}: {==}
    case Con{Batch.Scheduled{request, _}, commands} Con{Batch.Observed{other_request, token},
      tokens}:
      %Equal.sym(Maybe<&2, List<&2, Batch.Token>>, Batch.strip_outer(commands, tokens),
        Bool.pick(Maybe<&2, List<&2, Batch.Token>>, Laws.outer_matches(commands, tokens), Some{
        Laws.inner_tokens(tokens)}, None{}), Laws.stripping_exact(commands, tokens)):
        {Bool.pick(Maybe<&2, List<&2, Batch.Token>>, Nat.is_eq(request, other_request),
          Batch.prepend_token(token, _), None{})
        == Bool.pick(Maybe<&2, List<&2, Batch.Token>>, Bool.and(Nat.is_eq(request,
          other_request), Laws.outer_matches(commands, tokens)), Some{
          token <> Laws.inner_tokens(tokens)}, None{}) : Maybe<&2, List<&2, Batch.Token>>}
      outer_choice(Nat.is_eq(request, other_request), Laws.outer_matches(commands, tokens),
        token, Laws.inner_tokens(tokens))

def substitution_shift(+parts: List<&2, Plan.Piece>, +head: String, +tokens: List<&2, String>,
  +index: Nat) -> {
  Laws.substituted(parts, head <> tokens, Nat.add(1n, index)) == Laws.substituted(parts, tokens,
    index) : List<&2, String>
}:
  match parts:
    case []: {==}
    case Plan.LiteralPiece{value} <> tail:
      Equal.cong(List<&2, String>, List<&2, String>, rest => value <> rest,
        Laws.substituted(tail, head <> tokens, Nat.add(1n, index)), Laws.substituted(tail,
          tokens, index), substitution_shift(tail, head, tokens, index))
    case Plan.PrimitivePiece{_} <> tail:
      Equal.cong(List<&2, String>, List<&2, String>, rest => Maybe.default(&2, String, List.get(
        &2, String, tokens, index), "") <> rest,
        Laws.substituted(tail, head <> tokens, Nat.add(1n, Nat.add(1n, index))),
          Laws.substituted(tail, tokens, Nat.add(1n, index)), substitution_shift(tail, head,
          tokens, Nat.add(1n, index)))

def binding_choice(+matched: Bool, +head: String, +tail: List<&2, String>) -> {
  Batch.prepend(head, Bool.pick(Maybe<&2, List<&2, String>>, matched, Some{tail}, None{}))
  == Bool.pick(Maybe<&2, List<&2, String>>, matched, Some{head <> tail}, None{}) : Maybe<&2,
    List<&2, String>>
}:
  match matched:
    case False{}: {==}
    case True{}: {==}

def Laws.binding_exact(parts, tokens):
  match parts tokens:
    case Nil{} Nil{}: {==}
    case Nil{} Con{_, _}: {==}
    case Con{Plan.LiteralPiece{value}, tail} _:
      %Equal.sym(Maybe<&2, List<&2, String>>, Batch.bind(tail, tokens), Bool.pick(Maybe<&2,
        List<&2, String>>, Nat.is_eq(List.length(&2, Json.Primitive, Laws.primitives(tail)),
        List.length(&2, String, tokens)), Some{Laws.substituted(tail, tokens, 0n)}, None{}),
        Laws.binding_exact(tail, tokens)):
        {Batch.prepend(value, _) == Bool.pick(Maybe<&2, List<&2, String>>, Nat.is_eq(
          List.length(&2, Json.Primitive, Laws.primitives(tail)), List.length(&2, String,
          tokens)), Some{value <> Laws.substituted(tail, tokens, 0n)}, None{}) : Maybe<&2,
          List<&2, String>>}
      binding_choice(Nat.is_eq(List.length(&2, Json.Primitive, Laws.primitives(tail)),
        List.length(&2, String, tokens)), value, Laws.substituted(tail, tokens, 0n))
    case Con{Plan.PrimitivePiece{_}, _} Nil{}: {==}
    case Con{Plan.PrimitivePiece{_}, tail} Con{value, rest}:
      %Equal.sym(List<&2, String>, Laws.substituted(tail, value <> rest, 1n), Laws.substituted(
        tail, rest, 0n), substitution_shift(tail, value, rest, 0n)):
        {Batch.prepend(value, Batch.bind(tail, rest))
        == Bool.pick(Maybe<&2, List<&2, String>>, Nat.is_eq(List.length(&2, Json.Primitive,
          Laws.primitives(tail)), List.length(&2, String, rest)), Some{value <> _}, None{
          }) : Maybe<&2, List<&2, String>>}
      %Equal.sym(Maybe<&2, List<&2, String>>, Batch.bind(tail, rest), Bool.pick(Maybe<&2,
        List<&2, String>>, Nat.is_eq(List.length(&2, Json.Primitive, Laws.primitives(tail)),
        List.length(&2, String, rest)), Some{Laws.substituted(tail, rest, 0n)}, None{}),
        Laws.binding_exact(tail, rest)):
        {Batch.prepend(value, _) == Bool.pick(Maybe<&2, List<&2, String>>, Nat.is_eq(
          List.length(&2, Json.Primitive, Laws.primitives(tail)), List.length(&2, String,
          rest)), Some{value <> Laws.substituted(tail, rest, 0n)}, None{}) : Maybe<&2, List<&2,
          String>>}
      binding_choice(Nat.is_eq(List.length(&2, Json.Primitive, Laws.primitives(tail)),
        List.length(&2, String, rest)), value, Laws.substituted(tail, rest, 0n))

def main() -> Unit:
  Unit{}
