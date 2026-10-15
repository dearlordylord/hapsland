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
    Input.ExportJson{Input.State{7n, 9n, Input.FlattenWork{Value.ProductNull{},
      Value.ProductBool{True{}}}}, Value.ProductBool{True{}}},
    Input.Planned{7n, 9n, [Plan.PrimitiveOperation{Json.NullPrimitive{}}]})
  == Input.InvalidReply{} : Input.Step}:
  {==}

def finite_first_header() -> {
  Input.batch_selected(7n, 9n, Value.ProductNull{}, [], [Batch.Command{7n, 10n,
    Json.NullPrimitive{}}])
  == Input.SerializeBatch{Input.State{7n, 10n, Input.BatchWork{Value.ProductNull{}, [],
    [Batch.Command{7n, 10n, Json.NullPrimitive{}}]}}, [Batch.Command{7n, 10n,
    Json.NullPrimitive{}}]} : Input.Step}:
  {==}

def Laws.export_resume_exact(invocation, request, input, value, displayed,
  received_invocation, received_request, operations):
  {==}

def Laws.planned_none_refused(invocation, request, input):
  {==}

def zero_binding(+parts: List<&2, Plan.Piece>, empty: {
  Reference.primitives(parts) == [] : List<&2, Json.Primitive>}) -> {
  Batch.bind(parts, []) == Some{Reference.substituted(parts, [], 0n)} : Maybe<&2, List<&2,
    String>>}:
  Equal.trans(Maybe<&2, List<&2, String>>,
    Batch.bind(parts, []),
    Bool.pick(Maybe<&2, List<&2, String>>,
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), 0n),
      Some{Reference.substituted(parts, [], 0n)}, None{}),
    Some{Reference.substituted(parts, [], 0n)}, Reference.binding_exact(parts, []),
    Equal.cong(Bool, Maybe<&2, List<&2, String>>,
      flag => Bool.pick(Maybe<&2, List<&2, String>>, flag,
        Some{Reference.substituted(parts, [], 0n)}, None{}),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), 0n), True{},
      Equal.cong(List<&2, Json.Primitive>, Bool,
        values => Nat.is_eq(List.length(&2, Json.Primitive, values), 0n),
        Reference.primitives(parts), [], empty)))

def enumerated_plan_exact(+invocation: Nat, +request: Nat, +input: Value.ProductValue,
  +parts: List<&2, Plan.Piece>, +primitives: List<&2, Json.Primitive>,
  matched: {Reference.primitives(parts) == primitives : List<&2, Json.Primitive>}) -> {
  Input.batch_selected(invocation, request, input, parts,
    Reference.enumerate(primitives, invocation, Nat.add(1n, request)))
  == Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, primitives), 0n),
    Input.Continue{Input.State{invocation, request, Input.AssemblyWork{
      input, Reference.substituted(parts, [], 0n)}}},
    Input.SerializeBatch{Input.State{invocation, Nat.add(1n, request), Input.BatchWork{
      input, parts, Reference.enumerate(primitives, invocation, Nat.add(1n, request))}},
      Reference.enumerate(primitives, invocation, Nat.add(1n, request))}) : Input.Step}:
  match primitives:
    case []:
      Equal.cong(Maybe<&2, List<&2, String>>, Input.Step,
        result => Input.assembled(invocation, request, input, result),
        Batch.bind(parts, []), Some{Reference.substituted(parts, [], 0n)}, zero_binding(parts,
          matched))
    case _ <> _: {==}

def Laws.planned_exact(invocation, request, input, parts):
  %Equal.sym(List<&2, Batch.Command>, Batch.select(parts, invocation, Nat.add(1n, request)),
    Reference.enumerate(Reference.primitives(parts), invocation, Nat.add(1n, request)),
    Reference.selection_exact(parts, invocation, Nat.add(1n, request))):
    {Input.batch_selected(invocation, request, input, parts, _)
    == Bool.pick(Input.Step,
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), 0n),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{
        input, Reference.substituted(parts, [], 0n)}}},
      Input.SerializeBatch{Input.State{invocation, Nat.add(1n, request), Input.BatchWork{
        input, parts, Reference.enumerate(Reference.primitives(parts), invocation, Nat.add(1n,
          request))}},
        Reference.enumerate(Reference.primitives(parts), invocation, Nat.add(1n, request))}) :
          Input.Step}
  enumerated_plan_exact(invocation, request, input, parts, Reference.primitives(parts), {==})

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
  refuse_false(Input.same(invocation, request, invocation, request), Input.planned(invocation,
    request, input, Plan.compile(operations)))

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
      Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) :
        Input.Step}:
  %token_length(tokens):
    {Input.assembled(invocation, request, input, Batch.bind(parts, Reference.token_values(tokens)))
    == Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
      _),
      Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) :
          Input.Step}
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
        Reference.substituted(parts, Reference.token_values(tokens), 0n)}}}, Input.InvalidReply{}) :
          Input.Step}
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
      Input.assembled(invocation, request, input, Batch.bind(parts,
        Reference.token_values(tokens))),
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
      step => Bool.pick(Input.Step, Reference.inner_matches(commands, tokens), step,
        Input.InvalidReply{}),
      Input.assembled(invocation, request, input, Batch.bind(parts,
        Reference.token_values(tokens))),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
            Input.InvalidReply{}),
      bound_exact(invocation, request, input, parts, tokens)))

def Laws.batch_resume_exact(invocation, request, received_invocation, received_request,
  input, parts, first, rest, tokens):
  %Equal.sym(Nat, Nat.sub(List.length(&2, Batch.Command, rest), 0n),
    List.length(&2, Batch.Command, rest), Nats.sub_zero(List.length(&2, Batch.Command, rest))):
    {Bool.pick(Input.Step, Input.same(invocation, request, received_invocation, received_request),
      Input.accepted_tokens(invocation, Nat.add(request, _), input, parts, Batch.accept(first <>
        rest, tokens)),
      Input.InvalidReply{})
    == Bool.pick(Input.Step, Bool.and(Nat.is_eq(invocation, received_invocation),
      Bool.and(Nat.is_eq(request, received_request), Bool.and(
        Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
          List.length(&2, Batch.Token, tokens))))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
          0n)}}},
      Input.InvalidReply{}) : Input.Step}
  %Equal.sym(Input.Step,
    Input.accepted_tokens(invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      input, parts, Batch.accept(first <> rest, tokens)),
    Bool.pick(Input.Step, Reference.inner_matches(first <> rest, tokens),
      Bool.pick(Input.Step, Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens)),
        Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command,
          rest)),
          Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
            0n)}}},
        Input.InvalidReply{}), Input.InvalidReply{}),
    accepted_exact(invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      input, parts, first <> rest, tokens)):
    {Bool.pick(Input.Step, Input.same(invocation, request, received_invocation, received_request), _
      ,
      Input.InvalidReply{})
    == Bool.pick(Input.Step, Bool.and(Nat.is_eq(invocation, received_invocation),
      Bool.and(Nat.is_eq(request, received_request), Bool.and(
        Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
          List.length(&2, Batch.Token, tokens))))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
          0n)}}},
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

# Additional named finite instances precede the newly approved universal proofs.
def finite_n0_empty() -> {
  Input.planned(7n, 9n, Value.ProductNull{}, Some{[]})
  == Input.Continue{Input.State{7n, 9n, Input.AssemblyWork{Value.ProductNull{}, []}}} : Input.Step}:
  {==}

def finite_n0_literals() -> {
  Input.planned(7n, 9n, Value.ProductNull{}, Some{[Plan.LiteralPiece{"["}, Plan.LiteralPiece{"]"}]})
  == Input.Continue{Input.State{7n, 9n, Input.AssemblyWork{Value.ProductNull{}, ["[", "]"]}}} :
    Input.Step}:
  {==}

def finite_unit() -> Top.UnitState:
  Top.UnitState{Top.State{Top.Invocation{3n, 5n}, 11n,
    Top.Context{"contract", "root.ts", "/repo", Value.ProductNull{}, [], [], [], []}, [], [], Top.Unprepared{}},
    Value.ProductNull{}, None{}, False{}, Value.ProductNull{}}

def finite_input() -> Input.Step:
  Input.SerializeBatch{Input.State{7n, 9n, Input.BatchWork{Value.ProductNull{},
    [Plan.PrimitivePiece{Json.NullPrimitive{}}], [Batch.Command{7n, 9n, Json.NullPrimitive{}}]}},
    [Batch.Command{7n, 9n, Json.NullPrimitive{}}]}

def finite_top_first() -> {
  Top.input_expose(finite_unit(), finite_input())
  == Top.JsonBatchRequest{Laws.unit_progress(finite_unit(), 1n), finite_input(),
    [Batch.Scheduled{12n, Batch.Command{7n, 9n, Json.NullPrimitive{}}}]} : Top.Step}:
  {==}

def finite_top_accept() -> {
  Top.resume(Top.input_expose(finite_unit(), finite_input()),
    Top.Reply{Top.Invocation{3n, 5n}, 12n,
      Top.BatchSerialized{[Batch.Observed{12n, Batch.Token{7n, 9n, "null"}}]}})
  == Top.Continue{Top.InputPhase{Laws.unit_progress(finite_unit(), 1n),
    Input.Continue{Input.State{7n, 9n, Input.AssemblyWork{Value.ProductNull{}, ["null"]}}}}} :
      Top.Step}:
  {==}

def finite_top_reject() -> {
  Top.resume(Top.input_expose(finite_unit(), finite_input()),
    Top.Reply{Top.Invocation{3n, 5n}, 12n,
      Top.BatchSerialized{[Batch.Observed{12n, Batch.Token{7n, 10n, "null"}}]}})
  == Top.InvalidReply{} : Top.Step}:
  {==}

def literal_selection(+strings: List<&2, String>, +invocation: Nat, +request: Nat) -> {
  Batch.select(Laws.literal_pieces(strings), invocation, request) == [] : List<&2, Batch.Command>}:
  match strings:
    case []: {==}
    case _ <> rest: literal_selection(rest, invocation, request)

def literal_binding(+strings: List<&2, String>) -> {
  Batch.bind(Laws.literal_pieces(strings), []) == Some{strings} : Maybe<&2, List<&2, String>>}:
  match strings:
    case []: {==}
    case value <> rest:
      Equal.cong(Maybe<&2, List<&2, String>>, Maybe<&2, List<&2, String>>,
        result => Batch.prepend(value, result), Batch.bind(Laws.literal_pieces(rest), []),
        Some{rest}, literal_binding(rest))

def Laws.empty_plan_uncharged(invocation, request, input, strings):
  %Equal.sym(List<&2, Batch.Command>, Batch.select(Laws.literal_pieces(strings), invocation,
    Nat.add(1n, request)),
    [], literal_selection(strings, invocation, Nat.add(1n, request))):
    {Input.batch_selected(invocation, request, input, Laws.literal_pieces(strings), _)
    == Input.Continue{Input.State{invocation, request, Input.AssemblyWork{input, strings}}} :
      Input.Step}
  Equal.cong(Maybe<&2, List<&2, String>>, Input.Step,
    result => Input.assembled(invocation, request, input, result),
    Batch.bind(Laws.literal_pieces(strings), []), Some{strings}, literal_binding(strings))

def Laws.outer_batch_first_exact(unit, state, first, rest):
  match unit:
    case Top.UnitState{Top.State{invocation, request, context, pending, reversed, cache},
      value, location, partial, fingerprints}:
      Equal.cong(Nat, Top.Step, count => Top.JsonBatchRequest{
        Top.UnitState{Top.State{invocation, count, context, pending, reversed, cache},
          value, location, partial, fingerprints}, Input.SerializeBatch{state, first <> rest},
        Batch.schedule(first <> rest, Nat.add(1n, request))},
        Nat.add(1n, request), Nat.add(request, 1n), Nats.add_comm(1n, request))

# Local reflexivity witness, the same induction as bend-mathlib Nat.is_eq_refl.
def same_nat(+value: Nat) -> {Nat.is_eq(value, value) == True{} : Bool}:
  match value:
    case 0n: {==}
    case 1n+rest: same_nat(rest)

def same_header(+invocation: Nat, +request: Nat, +step: Input.Step) -> {
  Bool.pick(Input.Step, Input.same(invocation, request, invocation, request), step,
    Input.InvalidReply{})
  == step : Input.Step}:
  %Equal.sym(Bool, Nat.is_eq(invocation, invocation), True{}, same_nat(invocation)):
    {Bool.pick(Input.Step, Bool.and(_, Nat.is_eq(request, request)), step, Input.InvalidReply{}) ==
      step : Input.Step}
  %Equal.sym(Bool, Nat.is_eq(request, request), True{}, same_nat(request)):
    {Bool.pick(Input.Step, _, step, Input.InvalidReply{}) == step : Input.Step}
  {==}

def scheduled_length(+commands: List<&2, Batch.Command>, +request: Nat) -> {
  List.length(&2, Batch.Scheduled, Batch.schedule(commands, request))
  == List.length(&2, Batch.Command, commands) : Nat}:
  match commands:
    case []: {==}
    case _ <> rest:
      Equal.cong(Nat, Nat, length => Nat.add(1n, length),
        List.length(&2, Batch.Scheduled, Batch.schedule(rest, Nat.add(1n, request))),
        List.length(&2, Batch.Command, rest), scheduled_length(rest, Nat.add(1n, request)))

def observed_length(+observations: List<&2, Batch.Observed>) -> {
  List.length(&2, Batch.Token, Reference.inner_tokens(observations))
  == List.length(&2, Batch.Observed, observations) : Nat}:
  match observations:
    case []: {==}
    case Batch.Observed{_, _} <> rest:
      Equal.cong(Nat, Nat, length => Nat.add(1n, length),
        List.length(&2, Batch.Token, Reference.inner_tokens(rest)),
        List.length(&2, Batch.Observed, rest), observed_length(rest))

def same_conditions(+invocation: Nat, +request: Nat, +condition: Bool) -> {
  Bool.and(Nat.is_eq(invocation, invocation), Bool.and(Nat.is_eq(request, request), condition))
  == condition : Bool}:
  %Equal.sym(Bool, Nat.is_eq(invocation, invocation), True{}, same_nat(invocation)):
    {Bool.and(_, Bool.and(Nat.is_eq(request, request), condition)) == condition : Bool}
  %Equal.sym(Bool, Nat.is_eq(request, request), True{}, same_nat(request)):
    {Bool.and(_, condition) == condition : Bool}
  {==}

def batch_reply(+invocation: Nat, +request: Nat, +input: Value.ProductValue,
  +parts: List<&2, Plan.Piece>, +first: Batch.Command, +rest: List<&2, Batch.Command>,
  +tokens: List<&2, Batch.Token>) -> {
  Input.resume(Input.SerializeBatch{Input.State{invocation, request,
    Input.BatchWork{input, parts, first <> rest}}, first <> rest},
    Input.SerializedBatch{invocation, request, tokens})
  == Bool.pick(Input.Step, Bool.and(Reference.inner_matches(first <> rest, tokens),
    Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
      List.length(&2, Batch.Token, tokens))),
    Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens), 0n)}}},
    Input.InvalidReply{}) : Input.Step}:
  Equal.trans(Input.Step,
    Input.resume(Input.SerializeBatch{Input.State{invocation, request,
      Input.BatchWork{input, parts, first <> rest}}, first <> rest},
      Input.SerializedBatch{invocation, request, tokens}),
    Bool.pick(Input.Step, Bool.and(Nat.is_eq(invocation, invocation),
      Bool.and(Nat.is_eq(request, request), Bool.and(Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
          List.length(&2, Batch.Token, tokens))))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
          0n)}}},
      Input.InvalidReply{}),
    Bool.pick(Input.Step, Bool.and(Reference.inner_matches(first <> rest, tokens),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)),
        List.length(&2, Batch.Token, tokens))),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
          0n)}}},
      Input.InvalidReply{}),
    Laws.batch_resume_exact(invocation, request, invocation, request, input, parts, first, rest,
      tokens),
    Equal.cong(Bool, Input.Step, condition => Bool.pick(Input.Step, condition,
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
        Input.AssemblyWork{input, Reference.substituted(parts, Reference.token_values(tokens),
          0n)}}},
      Input.InvalidReply{}),
      Bool.and(Nat.is_eq(invocation, invocation), Bool.and(Nat.is_eq(request, request),
        Bool.and(Reference.inner_matches(first <> rest, tokens),
          Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
            Batch.Token, tokens))))),
      Bool.and(Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
          Batch.Token, tokens))),
      same_conditions(invocation, request, Bool.and(Reference.inner_matches(first <> rest, tokens),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
          Batch.Token, tokens))))))

def tokens_choice(+invocation: Nat, +request: Nat, +input: Value.ProductValue, +parts: List<&2,
  Plan.Piece>, +commands: List<&2, Batch.Command>, +matched: Bool, +tokens: List<&2, Batch.Token>)
  -> {
  Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
    parts, commands}}, commands}, Bool.pick(Maybe<&2, List<&2, Batch.Token>>, matched, Some{tokens},
    None{}))
  == Bool.pick(Input.Step, matched, Top.batch_tokens(Input.SerializeBatch{Input.State{invocation,
    request, Input.BatchWork{input, parts, commands}}, commands}, Some{tokens}),
    Input.InvalidReply{}) : Input.Step}:
  match matched:
    case False{}: {==}
    case True{}: {==}

def batch_tokens_exact(+invocation: Nat, +request: Nat, +input: Value.ProductValue, +parts: List<&2,
  Plan.Piece>, +first: Batch.Command, +rest: List<&2, Batch.Command>, +schedule: List<&2,
  Batch.Scheduled>, +observations: List<&2, Batch.Observed>) -> {
  Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
    parts, first <> rest}}, first <> rest}, Batch.strip_outer(schedule, observations)) ==
    Bool.pick(Input.Step, Reference.outer_matches(schedule, observations), Bool.pick(Input.Step,
    Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
    Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
    Batch.Token, Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation,
    Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
    Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
    0n)}}}, Input.InvalidReply{}), Input.InvalidReply{}) : Input.Step}:
  %Equal.sym(Maybe<&2, List<&2, Batch.Token>>, Batch.strip_outer(schedule, observations),
    Bool.pick(Maybe<&2, List<&2, Batch.Token>>, Reference.outer_matches(schedule, observations),
      Some{Reference.inner_tokens(observations)}, None{}), Reference.stripping_exact(schedule,
      observations)):
    {Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
      parts, first <> rest}}, first <> rest}, _) == Bool.pick(Input.Step,
      Reference.outer_matches(schedule, observations), Bool.pick(Input.Step,
      Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
      Batch.Token, Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation,
      Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
      Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
      0n)}}}, Input.InvalidReply{}), Input.InvalidReply{}) : Input.Step}
  Equal.trans(Input.Step, Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request,
    Input.BatchWork{input, parts, first <> rest}}, first <> rest}, Bool.pick(Maybe<&2, List<&2,
    Batch.Token>>, Reference.outer_matches(schedule, observations),
    Some{Reference.inner_tokens(observations)}, None{})), Bool.pick(Input.Step,
    Reference.outer_matches(schedule, observations),
    Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
    parts, first <> rest}}, first <> rest}, Some{Reference.inner_tokens(observations)}),
    Input.InvalidReply{}), Bool.pick(Input.Step, Reference.outer_matches(schedule, observations),
    Bool.pick(Input.Step, Bool.and(Reference.inner_matches(first <> rest,
    Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
    Reference.primitives(parts)), List.length(&2, Batch.Token,
    Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation, Nat.add(request,
    List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input, Reference.substituted(parts,
    Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}, Input.InvalidReply{}),
    Input.InvalidReply{}),
    tokens_choice(invocation, request, input, parts, first <> rest,
      Reference.outer_matches(schedule, observations), Reference.inner_tokens(observations)),
    Equal.cong(Input.Step, Input.Step, value => Bool.pick(Input.Step,
      Reference.outer_matches(schedule, observations), value, Input.InvalidReply{}),
      Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
        parts, first <> rest}}, first <> rest}, Some{Reference.inner_tokens(observations)}),
        Bool.pick(Input.Step, Bool.and(Reference.inner_matches(first <> rest,
        Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
        Reference.primitives(parts)), List.length(&2, Batch.Token,
        Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation,
        Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
        0n)}}}, Input.InvalidReply{}),
      batch_reply(invocation, request, input, parts, first, rest,
        Reference.inner_tokens(observations))))

def accepted_choices(+unit: Top.UnitState, +count: Nat, +outer: Bool, +inner: Bool, +state:
  Input.State) -> {
  Top.batch_accepted(unit, count, Bool.pick(Input.Step, outer,
    Bool.pick(Input.Step, inner, Input.Continue{state}, Input.InvalidReply{}),
      Input.InvalidReply{}))
  == Bool.pick(Top.Step, Bool.and(outer, inner),
    Top.Continue{Top.InputPhase{Laws.unit_progress(unit, Nat.sub(count, 1n)),
      Input.Continue{state}}},
    Top.InvalidReply{}) : Top.Step}:
  match unit outer inner:
    case _ False{} _: {==}
    case _ True{} False{}: {==}
    case Top.UnitState{Top.State{_, _, _, _, _, _}, _, _, _, _} True{} True{}: {==}

def outer_choice(+header: Bool, +outer: Bool, +inner: Bool, +result: Top.Step) -> {
  Bool.pick(Top.Step, header, Bool.pick(Top.Step, Bool.and(outer, inner), result,
    Top.InvalidReply{}), Top.InvalidReply{})
  == Bool.pick(Top.Step, Bool.and(header, Bool.and(outer, inner)), result, Top.InvalidReply{}) :
    Top.Step}:
  match header outer inner:
    case False{} _ _: {==}
    case True{} False{} _: {==}
    case True{} True{} False{}: {==}
    case True{} True{} True{}: {==}

def whole_batch_exact(+unit: Top.UnitState, +received: Top.Invocation, +received_request: Nat,
  +invocation: Nat, +request: Nat, +input: Value.ProductValue, +parts: List<&2, Plan.Piece>, +first:
  Batch.Command, +rest: List<&2, Batch.Command>, +schedule: List<&2, Batch.Scheduled>,
  +observations: List<&2, Batch.Observed>) -> { Top.resume(Top.JsonBatchRequest{unit,
  Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input, parts, first <>
  rest}}, first <> rest}, schedule}, Top.Reply{received, received_request,
  Top.BatchSerialized{observations}}) == Bool.pick(Top.Step,
  Bool.and(Top.correlation(Top.unit_state(unit), received, received_request),
  Bool.and(Reference.outer_matches(schedule, observations), Bool.and(Reference.inner_matches(first
  <> rest, Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
  Reference.primitives(parts)), List.length(&2, Batch.Token,
  Reference.inner_tokens(observations)))))), Top.Continue{Top.InputPhase{Laws.unit_progress(unit,
  Nat.sub(List.length(&2, Batch.Scheduled, schedule), 1n)), Input.Continue{Input.State{invocation,
  Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
  Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
  0n)}}}}}, Top.InvalidReply{}) : Top.Step}:
  Equal.trans(Top.Step, Top.resume(Top.JsonBatchRequest{unit,
    Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input, parts, first <>
    rest}}, first <> rest}, schedule}, Top.Reply{received, received_request,
    Top.BatchSerialized{observations}}), Bool.pick(Top.Step, Top.correlation(Top.unit_state(unit),
    received, received_request), Top.batch_accepted(unit, List.length(&2, Batch.Scheduled,
    schedule), Bool.pick(Input.Step, Reference.outer_matches(schedule, observations),
    Bool.pick(Input.Step, Bool.and(Reference.inner_matches(first <> rest,
    Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
    Reference.primitives(parts)), List.length(&2, Batch.Token,
    Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation, Nat.add(request,
    List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input, Reference.substituted(parts,
    Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}, Input.InvalidReply{}),
    Input.InvalidReply{})), Top.InvalidReply{}), Bool.pick(Top.Step,
    Bool.and(Top.correlation(Top.unit_state(unit), received, received_request),
    Bool.and(Reference.outer_matches(schedule, observations), Bool.and(Reference.inner_matches(first
    <> rest, Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
    Reference.primitives(parts)), List.length(&2, Batch.Token,
    Reference.inner_tokens(observations)))))), Top.Continue{Top.InputPhase{Laws.unit_progress(unit,
    Nat.sub(List.length(&2, Batch.Scheduled, schedule), 1n)), Input.Continue{Input.State{invocation,
    Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
    Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
    0n)}}}}}, Top.InvalidReply{}),
    Equal.cong(Input.Step, Top.Step,
      value => Bool.pick(Top.Step, Top.correlation(Top.unit_state(unit), received,
        received_request), Top.batch_accepted(unit, List.length(&2, Batch.Scheduled, schedule),
        value), Top.InvalidReply{}),
      Top.batch_tokens(Input.SerializeBatch{Input.State{invocation, request, Input.BatchWork{input,
        parts, first <> rest}}, first <> rest}, Batch.strip_outer(schedule, observations)),
        Bool.pick(Input.Step, Reference.outer_matches(schedule, observations), Bool.pick(Input.Step,
        Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
        Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
        Batch.Token, Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation,
        Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
        0n)}}}, Input.InvalidReply{}), Input.InvalidReply{}),
      batch_tokens_exact(invocation, request, input, parts, first, rest, schedule, observations)),
    Equal.trans(Top.Step, Bool.pick(Top.Step, Top.correlation(Top.unit_state(unit), received,
      received_request), Top.batch_accepted(unit, List.length(&2, Batch.Scheduled, schedule),
      Bool.pick(Input.Step, Reference.outer_matches(schedule, observations), Bool.pick(Input.Step,
      Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
      Batch.Token, Reference.inner_tokens(observations)))), Input.Continue{Input.State{invocation,
      Nat.add(request, List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
      Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
      0n)}}}, Input.InvalidReply{}), Input.InvalidReply{})), Top.InvalidReply{}),
      Bool.pick(Top.Step, Top.correlation(Top.unit_state(unit), received, received_request),
      Bool.pick(Top.Step, Bool.and(Reference.outer_matches(schedule, observations),
      Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
      Batch.Token, Reference.inner_tokens(observations))))),
      Top.Continue{Top.InputPhase{Laws.unit_progress(unit, Nat.sub(List.length(&2, Batch.Scheduled,
      schedule), 1n)), Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2,
      Batch.Command, rest)), Input.AssemblyWork{input, Reference.substituted(parts,
      Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}}}, Top.InvalidReply{}),
      Top.InvalidReply{}), Bool.pick(Top.Step, Bool.and(Top.correlation(Top.unit_state(unit),
      received, received_request), Bool.and(Reference.outer_matches(schedule, observations),
      Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
      Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
      Batch.Token, Reference.inner_tokens(observations)))))),
      Top.Continue{Top.InputPhase{Laws.unit_progress(unit, Nat.sub(List.length(&2, Batch.Scheduled,
      schedule), 1n)), Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2,
      Batch.Command, rest)), Input.AssemblyWork{input, Reference.substituted(parts,
      Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}}}, Top.InvalidReply{}),
      Equal.cong(Top.Step, Top.Step, value => Bool.pick(Top.Step,
        Top.correlation(Top.unit_state(unit), received, received_request), value,
        Top.InvalidReply{}),
        Top.batch_accepted(unit, List.length(&2, Batch.Scheduled, schedule), Bool.pick(Input.Step,
          Reference.outer_matches(schedule, observations), Bool.pick(Input.Step,
          Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
          Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
          Batch.Token, Reference.inner_tokens(observations)))),
          Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command,
          rest)), Input.AssemblyWork{input, Reference.substituted(parts,
          Reference.token_values(Reference.inner_tokens(observations)), 0n)}}},
          Input.InvalidReply{}), Input.InvalidReply{})),
        Bool.pick(Top.Step, Bool.and(Reference.outer_matches(schedule, observations),
          Bool.and(Reference.inner_matches(first <> rest, Reference.inner_tokens(observations)),
          Nat.is_eq(List.length(&2, Json.Primitive, Reference.primitives(parts)), List.length(&2,
          Batch.Token, Reference.inner_tokens(observations))))),
          Top.Continue{Top.InputPhase{Laws.unit_progress(unit, Nat.sub(List.length(&2,
          Batch.Scheduled, schedule), 1n)), Input.Continue{Input.State{invocation, Nat.add(request,
          List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
          0n)}}}}}, Top.InvalidReply{}),
        accepted_choices(unit, List.length(&2, Batch.Scheduled, schedule),
          Reference.outer_matches(schedule, observations), Bool.and(Reference.inner_matches(first <>
          rest, Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
          Reference.primitives(parts)), List.length(&2, Batch.Token,
          Reference.inner_tokens(observations)))), Input.State{invocation, Nat.add(request,
          List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
          Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
          0n)}})),
      outer_choice(Top.correlation(Top.unit_state(unit), received, received_request),
        Reference.outer_matches(schedule, observations), Bool.and(Reference.inner_matches(first <>
        rest, Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
        Reference.primitives(parts)), List.length(&2, Batch.Token,
        Reference.inner_tokens(observations)))),
        Top.Continue{Top.InputPhase{Laws.unit_progress(unit, Nat.sub(List.length(&2,
        Batch.Scheduled, schedule), 1n)), Input.Continue{Input.State{invocation, Nat.add(request,
        List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input,
        Reference.substituted(parts, Reference.token_values(Reference.inner_tokens(observations)),
        0n)}}}}})))

def schedule_tail_length(+first: Batch.Command, +rest: List<&2, Batch.Command>, +request: Nat) -> {
  Nat.sub(List.length(&2, Batch.Scheduled, Batch.schedule(first <> rest, request)), 1n)
  == List.length(&2, Batch.Command, rest) : Nat}:
  Equal.trans(Nat,
    Nat.sub(List.length(&2, Batch.Scheduled, Batch.schedule(first <> rest, request)), 1n),
    Nat.sub(List.length(&2, Batch.Command, first <> rest), 1n),
    List.length(&2, Batch.Command, rest),
    Equal.cong(Nat, Nat, count => Nat.sub(count, 1n),
      List.length(&2, Batch.Scheduled, Batch.schedule(first <> rest, request)),
      List.length(&2, Batch.Command, first <> rest), scheduled_length(first <> rest, request)),
    Nats.sub_zero(List.length(&2, Batch.Command, rest)))

def correlation_exact(+unit: Top.UnitState, +received: Top.Invocation, +request: Nat) -> {
  Top.correlation(Top.unit_state(unit), received, request)
  == Laws.outer_header(unit, received, request) : Bool}:
  match unit received:
    case Top.UnitState{Top.State{Top.Invocation{_, _}, _, _, _, _, _}, _, _, _, _} Top.Invocation{_,
      _}: {==}

def Laws.outer_batch_resume_exact(unit, received, received_request, invocation, request,
  input, parts, first, rest, observations):
  %correlation_exact(unit, received, received_request):
    {Top.resume(Top.JsonBatchRequest{unit, Input.SerializeBatch{Input.State{invocation, request,
      Input.BatchWork{input, parts, first <> rest}}, first <> rest}, Batch.schedule(first <> rest,
      Laws.unit_request(unit))}, Top.Reply{received, received_request,
      Top.BatchSerialized{observations}}) == Bool.pick(Top.Step, Bool.and(_,
      Bool.and(Reference.outer_matches(Batch.schedule(first <> rest, Laws.unit_request(unit)),
      observations), Bool.and(Reference.inner_matches(first <> rest,
      Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
      Reference.primitives(parts)), List.length(&2, Batch.Observed, observations))))),
      Top.Continue{Top.InputPhase{Laws.unit_progress(unit, List.length(&2, Batch.Command, rest)),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      Input.AssemblyWork{input, Reference.substituted(parts,
      Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}}}, Top.InvalidReply{}) :
      Top.Step}
  %schedule_tail_length(first, rest, Laws.unit_request(unit)):
    {Top.resume(Top.JsonBatchRequest{unit, Input.SerializeBatch{Input.State{invocation, request,
      Input.BatchWork{input, parts, first <> rest}}, first <> rest}, Batch.schedule(first <> rest,
      Laws.unit_request(unit))}, Top.Reply{received, received_request,
      Top.BatchSerialized{observations}}) == Bool.pick(Top.Step,
      Bool.and(Top.correlation(Top.unit_state(unit), received, received_request),
      Bool.and(Reference.outer_matches(Batch.schedule(first <> rest, Laws.unit_request(unit)),
      observations), Bool.and(Reference.inner_matches(first <> rest,
      Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
      Reference.primitives(parts)), List.length(&2, Batch.Observed, observations))))),
      Top.Continue{Top.InputPhase{Laws.unit_progress(unit, _),
      Input.Continue{Input.State{invocation, Nat.add(request, List.length(&2, Batch.Command, rest)),
      Input.AssemblyWork{input, Reference.substituted(parts,
      Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}}}, Top.InvalidReply{}) :
      Top.Step}
  %observed_length(observations):
    {Top.resume(Top.JsonBatchRequest{unit, Input.SerializeBatch{Input.State{invocation, request,
      Input.BatchWork{input, parts, first <> rest}}, first <> rest}, Batch.schedule(first <> rest,
      Laws.unit_request(unit))}, Top.Reply{received, received_request,
      Top.BatchSerialized{observations}}) == Bool.pick(Top.Step,
      Bool.and(Top.correlation(Top.unit_state(unit), received, received_request),
      Bool.and(Reference.outer_matches(Batch.schedule(first <> rest, Laws.unit_request(unit)),
      observations), Bool.and(Reference.inner_matches(first <> rest,
      Reference.inner_tokens(observations)), Nat.is_eq(List.length(&2, Json.Primitive,
      Reference.primitives(parts)), _)))), Top.Continue{Top.InputPhase{Laws.unit_progress(unit,
      Nat.sub(List.length(&2, Batch.Scheduled, Batch.schedule(first <> rest,
      Laws.unit_request(unit))), 1n)), Input.Continue{Input.State{invocation, Nat.add(request,
      List.length(&2, Batch.Command, rest)), Input.AssemblyWork{input, Reference.substituted(parts,
      Reference.token_values(Reference.inner_tokens(observations)), 0n)}}}}}, Top.InvalidReply{}) :
      Top.Step}
  whole_batch_exact(unit, received, received_request, invocation, request, input, parts, first,
    rest,
    Batch.schedule(first <> rest, Laws.unit_request(unit)), observations)

def Laws.export_rejects_batch(state, value, invocation, request, tokens):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}
def Laws.export_rejects_digest(state, value, invocation, request, hash):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}
def Laws.batch_rejects_export(state, commands, invocation, request, operations):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}
def Laws.batch_rejects_digest(state, commands, invocation, request, hash):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}
def Laws.digest_rejects_export(state, text, invocation, request, operations):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}
def Laws.digest_rejects_batch(state, text, invocation, request, tokens):
  match state:
    case Input.State{_, _, Input.ProviderWork{_, _}}: {==}
    case Input.State{_, _, Input.FlattenWork{_, _}}: {==}
    case Input.State{_, _, Input.BatchWork{_, _, _}}: {==}
    case Input.State{_, _, Input.AssemblyWork{_, _}}: {==}
    case Input.State{_, _, Input.HashWork{_}}: {==}

# Literal falsification instances for the three final composition laws.
def finite_planned_none() -> {
  Input.planned(7n, 9n, Value.ProductNull{}, None{}) == Input.InvalidReply{} : Input.Step}:
  {==}

def finite_planned_two_requests() -> {
  Input.planned(7n, 9n, Value.ProductNull{}, Some{[
    Plan.PrimitivePiece{Json.NullPrimitive{}}, Plan.LiteralPiece{":"},
    Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}]})
  == Input.SerializeBatch{Input.State{7n, 10n, Input.BatchWork{Value.ProductNull{},
    [Plan.PrimitivePiece{Json.NullPrimitive{}}, Plan.LiteralPiece{":"},
      Plan.PrimitivePiece{Json.BoolPrimitive{False{}}}],
    [Batch.Command{7n, 10n, Json.NullPrimitive{}}, Batch.Command{7n, 11n,
      Json.BoolPrimitive{False{}}}]}},
    [Batch.Command{7n, 10n, Json.NullPrimitive{}}, Batch.Command{7n, 11n,
      Json.BoolPrimitive{False{}}}]} : Input.Step}:
  {==}

def finite_export_wrong_header() -> {
  Input.resume(Input.ExportJson{Input.State{7n, 9n, Input.FlattenWork{Value.ProductNull{},
    Value.ProductNull{}}},
    Value.ProductBool{True{}}}, Input.Planned{8n, 9n,
      [Plan.PrimitiveOperation{Json.NullPrimitive{}}]})
  == Input.InvalidReply{} : Input.Step}:
  {==}

def main() -> Unit:
  Unit{}
