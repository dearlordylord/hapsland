import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./FUEL_COHERENCE.bend as Coherence
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./INTERPRETER_ORDER_PROOF.bend as Order

def build_completed(result: Spec.Build) -> Bool:
  match result:
    case Spec.InsufficientBound{_}: False{}
    case _: True{}

def reference_completed(result: Spec.ReferenceResult) -> Bool:
  match result:
    case Spec.ReferenceFailure{_}: False{}
    case Spec.ReferenceResult{_, _}: True{}

def references_completed(result: Spec.ReferencesResult) -> Bool:
  match result:
    case Spec.ReferencesFailure{_}: False{}
    case Spec.ReferencesResult{_, _}: True{}

def contract(+left: Nat, +right: Nat) -> Type:
  @+next: Spec.Request ->
    {Coherence.completed(Spec.interpret(left, next)) == True{} : Bool} ->
    {Coherence.completed(Spec.interpret(right, next)) == True{} : Bool} ->
    {Spec.interpret(left, next) == Spec.interpret(right, next) : Spec.DispatchResult}

def expanded_input_completed(+result: Spec.Build, +symbol: String,
    complete: {reference_completed(Spec.expanded_result(result, symbol)) == True{} : Bool}) -> {
  build_completed(result) == True{} : Bool
}:
  match result:
    case Spec.Built{_, _}: {==}
    case Spec.Missing{_}: {==}
    case Spec.InsufficientBound{_}: complete

def as_build_input_completed(+result: Spec.DispatchResult,
    complete: {build_completed(Spec.as_build(result)) == True{} : Bool}) -> {
  Coherence.completed(result) == True{} : Bool
}:
  match result:
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: complete
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: complete

def child_build_equal(+left: Nat, +right: Nat, +request: Spec.Request,
    left_complete: {build_completed(C.build_child(left, request)) == True{} : Bool},
    right_complete: {build_completed(C.build_child(right, request)) == True{} : Bool},
    child: contract(left, right)) -> {
  C.build_child(left, request) == C.build_child(right, request) : Spec.Build
}:
  Equal.cong(Spec.DispatchResult, Spec.Build, Spec.as_build,
    Spec.interpret(left, request), Spec.interpret(right, request),
    child(request, as_build_input_completed(Spec.interpret(left, request), left_complete),
      as_build_input_completed(Spec.interpret(right, request), right_complete)))

def expanded_equal(
  +left: Nat,
  +right: Nat,
  +request: Spec.Request,
  +symbol: String,
  left_complete: {
    reference_completed(Spec.expanded_result(C.build_child(left, request), symbol))
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(Spec.expanded_result(C.build_child(right, request), symbol))
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
  Spec.expanded_result(C.build_child(left, request), symbol)
    == Spec.expanded_result(C.build_child(right, request), symbol) : Spec.ReferenceResult
}:
  Equal.cong(Spec.Build, Spec.ReferenceResult, value => Spec.expanded_result(value, symbol),
    C.build_child(left, request), C.build_child(right, request),
    child_build_equal(left, right, request,
      expanded_input_completed(C.build_child(left, request), symbol, left_complete),
      expanded_input_completed(C.build_child(right, request), symbol, right_complete), child))

def child_or_cycle_equal(
  +left: Nat,
  +right: Nat,
  +already_seen: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: String,
  left_complete: {
    reference_completed(
      Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
      == Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match already_seen:
    case True{}: {==}
    case False{}:
      expanded_equal(
        left,
        right,
        Spec.Request{facts, path, symbol, expected, (depth + 1n : Nat), state},
        symbol,
        left_complete,
        right_complete,
        child
      )

def local_allowed_equal(
  +left: Nat,
  +right: Nat,
  +permit: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: String,
  left_complete: {
    reference_completed(
      Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
      == Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match permit:
    case False{}: {==}
    case True{}:
      child_or_cycle_equal(
        left,
        right,
        Spec.seen(state, identity),
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        left_complete,
        right_complete,
        child
      )

def local_budget_equal(
  +left: Nat,
  +right: Nat,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: String,
  left_complete: {
    reference_completed(
      Spec.local_budget(state, facts, path, symbol, depth, expected, identity, C.build_child(left))
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.local_budget(state, facts, path, symbol, depth, expected, identity, C.build_child(right))
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.local_budget(state, facts, path, symbol, depth, expected, identity, C.build_child(left))
      == Spec.local_budget(
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  local_allowed_equal(
    left,
    right,
    Spec.allowed(state, path),
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    left_complete,
    right_complete,
    child
  )

def local_kind_equal(
  +left: Nat,
  +right: Nat,
  +valid: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: String,
  left_complete: {
    reference_completed(
      Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(left)
      )
      == Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match valid:
    case False{}: {==}
    case True{}:
      local_budget_equal(
        left,
        right,
        Spec.local_work(state),
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        left_complete,
        right_complete,
        child
      )

def local_conflict_equal(
  +left: Nat,
  +right: Nat,
  +imported: Maybe<&2, Core.ImportBinding>,
  +declaration: Core.Declaration,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  left_complete: {
    reference_completed(
      Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        C.build_child(left)
      )
      == Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match imported declaration:
    case Some{_} _: {==}
    case None{} Core.Declaration{_, +identity, +function, _, _}:
      local_kind_equal(
        left,
        right,
        Spec.matches(expected, function),
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        left_complete,
        right_complete,
        child
      )

def choose_local_equal(
  +left: Nat,
  +right: Nat,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  left_complete: {
    reference_completed(
      Spec.choose_local(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.choose_local(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.choose_local(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(left)
      )
      == Spec.choose_local(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match local:
    case Some{+declaration}:
      local_conflict_equal(
        left,
        right,
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        left_complete,
        right_complete,
        child
      )
    case None{}: {==}

def ordinary_found_equal(
  +left: Nat,
  +right: Nat,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  left_complete: {
    reference_completed(
      Spec.ordinary_found(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.ordinary_found(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.ordinary_found(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(left)
      )
      == Spec.ordinary_found(
        local,
        imported,
        state,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  choose_local_equal(left, right, local, imported,
    Spec.target(state, path, Spec.identity_key(local, imported, path, symbol)),
    facts, path, symbol, owner, index, depth, expected, left_complete, right_complete, child)

def ordinary_equal(
  +left: Nat,
  +right: Nat,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  left_complete: {
    reference_completed(
      Spec.ordinary(facts, path, symbol, owner, index, depth, expected, state, C.build_child(left))
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.ordinary(facts, path, symbol, owner, index, depth, expected, state, C.build_child(right))
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.ordinary(facts, path, symbol, owner, index, depth, expected, state, C.build_child(left))
      == Spec.ordinary(
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  ordinary_found_equal(left, right, Spec.find_declaration(facts, symbol, expected),
    Spec.find_import(facts, symbol), state, facts, path, symbol, owner, index, depth,
    expected, left_complete, right_complete, child)

def named_equal(
  +left: Nat,
  +right: Nat,
  +target_id: Maybe<&2, String>,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  left_complete: {
    reference_completed(
      Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(left)
      )
      == Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match target_id:
    case None{}:
      ordinary_equal(
        left,
        right,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        left_complete,
        right_complete,
        child
      )
    case Some{_}: {==}

def by_kind_equal(
  +left: Nat,
  +right: Nat,
  +kind: Core.ReferenceKind,
  +target_id: Maybe<&2, String>,
  +facts: Core.Facts,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  left_complete: {
    reference_completed(
      Spec.by_kind(
        kind,
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(left)
      )
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.by_kind(
        kind,
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(right)
      )
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.by_kind(
        kind,
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(left)
      )
      == Spec.by_kind(
        kind,
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        C.build_child(right)
      )
      : Spec.ReferenceResult
    }:
  match kind:
    case Core.Unsupported{}: {==}
    case Core.Named{}:
      named_equal(left, right, target_id, facts, path, symbol, owner, index, depth,
        expected, state, left_complete, right_complete, child)

def reference_equal(
  +left: Nat,
  +right: Nat,
  +reference: Core.Reference,
  +facts: Core.Facts,
  +path: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State,
  left_complete: {
    reference_completed(
      Spec.reference(reference, facts, path, owner, index, depth, state, C.build_child(left))
    )
    == True{}
    : Bool
  },
  right_complete: {
    reference_completed(
      Spec.reference(reference, facts, path, owner, index, depth, state, C.build_child(right))
    )
    == True{}
    : Bool
  },
  child: contract(left, right)
) -> {
      Spec.reference(reference, facts, path, owner, index, depth, state, C.build_child(left))
      == Spec.reference(reference, facts, path, owner, index, depth, state, C.build_child(right))
      : Spec.ReferenceResult
    }:
  match reference:
    case Core.Reference{+kind, +symbol, +expected, +target_id}:
      by_kind_equal(
        left,
        right,
        kind,
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        Spec.reference_depth(state, (depth + 1n : Nat)),
        left_complete,
        right_complete,
        child
      )

