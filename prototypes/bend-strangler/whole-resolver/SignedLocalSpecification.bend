import Base
import ./Types.bend as T
import ./WholeObservation.bend as O
import ../local-graph-draft/core.bend as Local
import ../local-graph-draft/SPEC.bend as Recursive

# The original recursive SPEC and its Nat-domain laws remain unchanged.
# In the negative domain every recursive expansion/pending creation follows
# a permit that throws first. Only this linear pre-permit prefix is missing.
# Recursive.State carries structural state; signed work is retained separately
# and is converted at the actual permit boundary, never before traversal.
type State is Data:
  State{local: Recursive.State, graph_work: O.SignedNat}
type Build is Data:
  Missing{state: State}
  Built{state: State, tree: Recursive.Tree}
  EvaluationExhausted{state: State}
  TechnicalFailure{state: State, failure: T.TechnicalFailure}
type ReferenceResult is Data:
  ReferenceResult{state: State, reference: Recursive.TreeReference}
  PermitFailure{state: State, magnitude: Nat}
type ReferencesResult is Data:
  ReferencesResult{state: State, references: List<&2, Recursive.TreeReference>}
  ReferencesFailure{state: State, magnitude: Nat}

def local(state: State) -> Recursive.State:
  match state:
    case State{local, _}: local

def magnitude(state: State) -> Nat:
  match state:
    case State{_, O.Negative{magnitude}}: magnitude
    case _: 0n

def replace_local(state: State, local: Recursive.State) -> State:
  match state:
    case State{_, signed}: State{local, signed}

def with_work(budget: Local.Budget, work: Nat) -> Local.Budget:
  match budget:
    case Local.Budget{limits, targets, maximum, local, _, depth}:
      Local.Budget{limits, targets, maximum, local, work, depth}

def structural_state(+state: Recursive.State, work: Nat) -> Recursive.State:
  Recursive.replace_budget(state, with_work(Recursive.state_budget(state), work))

def omitted(state: State, +symbol: String) -> ReferenceResult:
  ReferenceResult{state,
    Recursive.TreeReference{symbol, Recursive.Omitted{Local.UnsupportedTarget{}, symbol}}}

def permit(+state: State) -> ReferenceResult:
  PermitFailure{state, magnitude(state)}

def charged(+state: State) -> State:
  replace_local(state, Recursive.local_work(local(state)))

def target(+state: State, path: String, identity: String) -> State:
  replace_local(state, Recursive.target(local(state), path, identity))

def ordinary_kind(valid: Bool, state: State, symbol: String) -> ReferenceResult:
  match valid:
    case False{}: omitted(state, symbol)
    case True{}: permit(charged(state))

def ordinary_local(found: Maybe<&2, Local.Declaration>,
    imported: Maybe<&2, Local.ImportBinding>, state: State,
    +expected: Local.ExpectedKind, symbol: String) -> ReferenceResult:
  match found imported:
    case None{} _: permit(state)
    case Some{_} Some{_}: omitted(state, symbol)
    case Some{Local.Declaration{_, _, function, _, _}} None{}:
      ordinary_kind(Recursive.matches(expected, function), state, symbol)

def ordinary_found(+found: Maybe<&2, Local.Declaration>,
    +imported: Maybe<&2, Local.ImportBinding>, state: State,
    +path: String, +symbol: String, expected: Local.ExpectedKind) -> ReferenceResult:
  ordinary_local(found, imported,
    target(state, path, Recursive.identity_key(found, imported, path, symbol)), expected, symbol)

def ordinary(+facts: Local.Facts, path: String, +symbol: String,
    +expected: Local.ExpectedKind, state: State) -> ReferenceResult:
  ordinary_found(Recursive.find_declaration(facts, symbol, expected),
    Recursive.find_import(facts, symbol), state, path, symbol, expected)

def bundle_seen(seen: Bool, state: State) -> ReferenceResult:
  match seen:
    case False{}: permit(state)
    case True{}: permit(charged(state))

def bundle_valid(valid: Bool, +state: State, path: String,
    symbol: String, +identity: String) -> ReferenceResult:
  match valid:
    case False{}: omitted(state, symbol)
    case True{}: bundle_seen(Recursive.seen(local(state), identity), target(state, path, identity))

def bundle(found: Maybe<&2, Local.Declaration>, +identity: String,
    +expected: Local.ExpectedKind, state: State, path: String, symbol: String) -> ReferenceResult:
  match found:
    case None{}: omitted(state, symbol)
    case Some{Local.Declaration{_, +actual, function, origin, _}}:
      bundle_valid(Bool.and(origin,
        Bool.and(String.eq(actual, identity), Recursive.matches(expected, function))),
        state, path, symbol, actual)

def named(target: Maybe<&2, String>, +facts: Local.Facts, path: String,
    symbol: String, expected: Local.ExpectedKind, state: State) -> ReferenceResult:
  match target:
    case None{}: ordinary(facts, path, symbol, expected, state)
    case Some{+identity}:
      bundle(Recursive.supporting(facts, identity), identity, expected, state, path, symbol)

def by_kind(kind: Local.ReferenceKind, target: Maybe<&2, String>, facts: Local.Facts,
    path: String, symbol: String, expected: Local.ExpectedKind, state: State) -> ReferenceResult:
  match kind:
    case Local.Unsupported{}: omitted(state, symbol)
    case Local.Named{}: named(target, facts, path, symbol, expected, state)

def reference(reference: Local.Reference, facts: Local.Facts, path: String,
    depth: Nat, +state: State) -> ReferenceResult:
  match reference:
    case Local.Reference{kind, symbol, expected, target}:
      by_kind(kind, target, facts, path, symbol, expected,
        replace_local(state, Recursive.reference_depth(local(state), (depth + 1n : Nat))))

def prepend(result: ReferencesResult,
    reference: Recursive.TreeReference) -> ReferencesResult:
  match result:
    case ReferencesResult{state, references}: ReferencesResult{state, reference <> references}
    case failed: failed

def after_reference(result: ReferenceResult,
    next: State -> ReferencesResult) -> ReferencesResult:
  match result:
    case PermitFailure{state, magnitude}: ReferencesFailure{state, magnitude}
    case ReferenceResult{state, reference}: prepend(next(state), reference)

def references(items: List<&2, Local.Reference>, +facts: Local.Facts,
    +path: String, +depth: Nat, state: State) -> ReferencesResult:
  match items:
    case []: ReferencesResult{state, []}
    case head <> tail:
      after_reference(reference(head, facts, path, depth, state),
        next => references(tail, facts, path, depth, next))

def built(result: ReferencesResult, address: Nat, artifact: Nat) -> Build:
  match result:
    case ReferencesResult{state, references}:
      Built{state, Recursive.Tree{address, artifact, references}}
    case ReferencesFailure{state, magnitude}:
      TechnicalFailure{state, T.NegativeGraphWork{magnitude}}

def negative_found(found: Maybe<&2, Local.Declaration>, +facts: Local.Facts,
    +path: String, depth: Nat, +state: State) -> Build:
  match found:
    case None{}: Missing{state}
    case Some{Local.Declaration{artifact, identity, _, _, children}}:
      built(references(children, facts, path, depth,
        replace_local(state, Recursive.enter(local(state), path, identity))),
        Recursive.address(local(state)), artifact)

def normal_result(result: Recursive.Build, work: O.SignedNat) -> Build:
  match result:
    case Recursive.Missing{state}: Missing{State{state, work}}
    case Recursive.Built{state, tree}: Built{State{state, work}, tree}
    case Recursive.InsufficientBound{state}: EvaluationExhausted{State{state, work}}

def nonnegative(fuel: Nat, +work: Nat, facts: Local.Facts, path: String,
    name: String, expected: Local.ExpectedKind, depth: Nat, state: Recursive.State) -> Build:
  normal_result(Recursive.as_build(Recursive.interpret(fuel,
    Recursive.Request{facts, path, name, expected, depth, structural_state(state, work)})),
    O.Nonnegative{work})

def build(fuel: Nat, work: O.SignedNat, +facts: Local.Facts, +path: String,
    name: String, +expected: Local.ExpectedKind, depth: Nat, state: Recursive.State) -> Build:
  match work:
    case O.Nonnegative{work}: nonnegative(fuel, work, facts, path, name, expected, depth, state)
    case O.Negative{0n}: nonnegative(fuel, 0n, facts, path, name, expected, depth, state)
    case O.Negative{1n++magnitude}:
      negative_found(Recursive.find_declaration(facts, name, expected), facts, path, depth,
        State{structural_state(state, 0n), O.Negative{(magnitude + 1n : Nat)}})

def main() -> Unit:
  Unit{}
