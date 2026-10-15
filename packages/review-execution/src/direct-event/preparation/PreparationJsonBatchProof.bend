import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/traversal/INTERPRETER_NAT_FACTS.bend as Nats
import ./PreparationJsonBatchLaws.bend as Laws
import ./CanonicalJsonBatchProof.bend as ReferenceProof
import ./CanonicalJsonBatchLaws.bend as Reference
import ./CanonicalJsonBatch.bend as Batch
import ./CanonicalJsonPlan.bend as Plan
import ./CanonicalJson.bend as Json
import ./CanonicalJsonPlanValidation.bend as Validation
import ./FrozenInput.bend as Input
import ./PreparationFinalization.bend as Top
import ../../../../source-artifacts/src/direct-event/value/Value.bend as Value

# Named literal falsification claims complement the actual emitted 60-case consumer.
def finite_wrong_tree() -> {
  Input.resume(
    Input.ExportJson{Input.State{7n, 9n, Input.FlattenWork{Value.ProductNull{}, Value.ProductBool{True{}}}}, Value.ProductBool{True{}}},
    Input.Planned{7n, 9n, [Plan.PrimitiveOperation{Json.NullPrimitive{}}]})
  == Input.InvalidReply{} : Input.Step}:
  {==}

def finite_first_header() -> {
  Input.batch_selected(7n, 9n, Value.ProductNull{}, [], [Batch.Command{7n, 10n, Json.NullPrimitive{}}])
  == Input.SerializeBatch{Input.State{7n, 10n, Input.BatchWork{Value.ProductNull{}, [], [Batch.Command{7n, 10n, Json.NullPrimitive{}}]}}, [Batch.Command{7n, 10n, Json.NullPrimitive{}}]} : Input.Step}:
  {==}

def Laws.export_exact(invocation, request, frame, identity):
  {==}

def refuse_false(header: Bool, selected: Input.Step) -> {
  Bool.pick(Input.Step, Bool.and(header, False{}), selected, Input.InvalidReply{})
  == Input.InvalidReply{} : Input.Step}:
  match header:
    case False{}: {==}
    case True{}: {==}

def Laws.wrong_tree_refused(invocation, request, input, value, operations, rejected):
  %Equal.sym(Bool, Validation.validate(operations, value), False{}, rejected):
    {Bool.pick(Input.Step, Bool.and(Input.same(invocation, request, invocation, request), _),
      Input.planned(invocation, request, input, Plan.compile(operations)), Input.InvalidReply{})
      == Input.InvalidReply{} : Input.Step}
  refuse_false(Input.same(invocation, request, invocation, request), Input.planned(invocation, request, input, Plan.compile(operations)))

def Laws.first_request_exact(invocation, request, input, parts, first, rest):
  {==}

def token_length(+tokens: List<&2, Batch.Token>) -> {
  List.length(&2, String, Reference.token_values(tokens))
  == List.length(&2, Batch.Token, tokens) : Nat}:
  match tokens:
    case []: {==}
    case Batch.Token{_, _, _} <> rest:
      Equal.cong(Nat, Nat, length => Nat.add(1n, length),
        List.length(&2, String, Reference.token_values(rest)),
        List.length(&2, Batch.Token, rest), token_length(rest))

def accepted_choice(+matched: Bool, +invocation: Nat, +request: Nat,
  +input: Value.ProductValue, +parts: List<&2, Plan.Piece>, +values: List<&2, String>) -> {
  Input.accepted_tokens(invocation, request, input, parts,
    Bool.pick(Maybe<&2, List<&2, String>>, matched, Some{values}, None{}))
  == Bool.pick(Input.Step, matched,
    Input.assembled(invocation, request, input, Batch.bind(parts, values)),
    Input.InvalidReply{}) : Input.Step}:
  match matched:
    case False{}: {==}
    case True{}: {==}

def assembled_choice(+matched: Bool, +invocation: Nat, +request: Nat,
  +input: Value.ProductValue, +values: List<&2, String>) -> {
  Input.assembled(invocation, request, input,
    Bool.pick(Maybe<&2, List<&2, String>>, matched, Some{values}, None{}))
  == Bool.pick(Input.Step, matched,
    Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input, values}}},
    Input.InvalidReply{}) : Input.Step}:
  match matched:
    case False{}: {==}
    case True{}: {==}

def combined_choice(+a: Bool, +b: Bool, +c: Bool, +d: Bool, +result: Input.Step) -> {
  Bool.pick(Input.Step, Bool.and(a, b),
    Bool.pick(Input.Step, c, Bool.pick(Input.Step, d, result, Input.InvalidReply{}),
      Input.InvalidReply{}), Input.InvalidReply{})
  == Bool.pick(Input.Step, Bool.and(a, Bool.and(b, Bool.and(c, d))), result,
    Input.InvalidReply{}) : Input.Step}:
  match a b c d:
    case False{} _ _ _: {==}
    case True{} False{} _ _: {==}
    case True{} True{} False{} _: {==}
    case True{} True{} True{} False{}: {==}
    case True{} True{} True{} True{}: {==}

def bound_exact(+invocation: Nat, +request: Nat, +input: Value.ProductValue,
  +parts: List<&2, Plan.Piece>, +tokens: List<&2, Batch.Token>) -> {
  Input.assembled(invocation, request, input, Batch.bind(parts, Reference.token_values(tokens)))
  == Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
    List.length(&2, Batch.Token, tokens)),
    Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
      Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) : Input.Step}:
  %token_length(tokens):
    {Input.assembled(invocation, request, input, Batch.bind(parts, Reference.token_values(tokens)))
    == Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), _),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) : Input.Step}
  %Equal.sym(Maybe<&2, List<&2, String>>, Batch.bind(parts, Reference.token_values(tokens)),
    Bool.pick(Maybe<&2, List<&2, String>>,
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, String, Reference.token_values(tokens))),
      Some{Reference.substituted(parts, Reference.token_values(tokens), 0n)}, None{}),
    Reference.binding_exact(parts, Reference.token_values(tokens))):
    {Input.assembled(invocation, request, input, _)
    == Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
      List.length(&2, String, Reference.token_values(tokens))),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) : Input.Step}
  assembled_choice(Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
    List.length(&2, String, Reference.token_values(tokens))), invocation, request, input,
    Reference.substituted(parts, Reference.token_values(tokens), 0n))

def accepted_exact(+invocation: Nat, +request: Nat, +input: Value.ProductValue,
  +parts: List<&2, Plan.Piece>, +commands: List<&2, Batch.Command>,
  +tokens: List<&2, Batch.Token>) -> {
  Input.accepted_tokens(invocation, request, input, parts, Batch.accept(commands, tokens))
  == Bool.pick(Input.Step, Reference.inner_matches(commands, tokens),
    Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
      List.length(&2, Batch.Token, tokens)),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
      Input.InvalidReply{}), Input.InvalidReply{}) : Input.Step}:
  %Equal.sym(Maybe<&2, List<&2, String>>, Batch.accept(commands, tokens),
    Bool.pick(Maybe<&2, List<&2, String>>, Reference.inner_matches(commands, tokens),
      Some{Reference.token_values(tokens)}, None{}), Reference.acceptance_exact(commands, tokens)):
    {Input.accepted_tokens(invocation, request, input, parts, _)
    == Bool.pick(Input.Step, Reference.inner_matches(commands, tokens),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
        Input.InvalidReply{}), Input.InvalidReply{}) : Input.Step}
  Equal.trans(Input.Step,
    Input.accepted_tokens(invocation, request, input, parts,
      Bool.pick(Maybe<&2, List<&2, String>>, Reference.inner_matches(commands, tokens),
        Some{Reference.token_values(tokens)}, None{})),
    Bool.pick(Input.Step, Reference.inner_matches(commands, tokens),
      Input.assembled(invocation, request, input, Batch.bind(parts, Reference.token_values(tokens))),
      Input.InvalidReply{}),
    Bool.pick(Input.Step, Reference.inner_matches(commands, tokens),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
        Input.InvalidReply{}), Input.InvalidReply{}),
    accepted_choice(Reference.inner_matches(commands, tokens), invocation, request, input,
      parts, Reference.token_values(tokens)),
    Equal.cong(Input.Step, Input.Step,
      step => Bool.pick(Input.Step, Reference.inner_matches(commands, tokens), step, Input.InvalidReply{}),
      Input.assembled(invocation, request, input, Batch.bind(parts, Reference.token_values(tokens))),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}),
      bound_exact(invocation, request, input, parts, tokens)))

def Laws.batch_resume_exact(invocation, request, received_invocation, received_request,
  input, parts, first, rest, tokens):
  %Equal.sym(Nat, Nat.sub(List.length(&2, Batch.Command, rest), 0n),
    List.length(&2, Batch.Command, rest), Nats.sub_zero(List.length(&2, Batch.Command, rest))):
    {Bool.pick(Input.Step, Input.same(invocation, request, received_invocation, received_request),
      Input.accepted_tokens(invocation, Nat.add(request, _), input, parts, Batch.accept(first <> rest, tokens)),
      Input.InvalidReply{})
    == Bool.pick(Input.Step, Bool.and(Nat.is_eq(invocation, received_invocation),
      Bool.and(Nat.is_eq(request, received_request), Bool.and(
        Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
          List.length(&2, Batch.Token, tokens))))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
      Input.InvalidReply{}) : Input.Step}
  %Equal.sym(Input.Step,
    Input.accepted_tokens(invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      input, parts, Batch.accept(first <> rest, tokens)),
    Bool.pick(Input.Step, Reference.inner_matches(first <> rest, tokens),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
          Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
        Input.InvalidReply{}), Input.InvalidReply{}),
    accepted_exact(invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      input, parts, first <> rest, tokens)):
    {Bool.pick(Input.Step, Input.same(invocation, request, received_invocation, received_request), _ ,
      Input.InvalidReply{})
    == Bool.pick(Input.Step, Bool.and(Nat.is_eq(invocation, received_invocation),
      Bool.and(Nat.is_eq(request, received_request), Bool.and(
        Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
          List.length(&2, Batch.Token, tokens))))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
      Input.InvalidReply{}) : Input.Step}
  combined_choice(Nat.is_eq(invocation, received_invocation), Nat.is_eq(request, received_request),
    Reference.inner_matches(first <> rest, tokens),
    Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
      List.length(&2, Batch.Token, tokens)),
    Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens), 0n)}}})

def Laws.assembly_advance_exact(invocation, request, input, parts):
  {==}

def Laws.outer_export_exact(unit, state, value):
  {==}

def main() -> Unit:
  Unit{}
