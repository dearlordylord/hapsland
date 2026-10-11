import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./FUEL_COHERENCE.bend as Coherence
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./INTERPRET_COHERENCE_REFERENCE_PROOF.bend as Reference
import ./INTERPRETER_ORDER_PROOF.bend as Order

def as_references_input_completed(+result: Spec.DispatchResult,
    complete: {Reference.references_completed(Spec.as_references(result)) == True{} : Bool}) -> {
  Coherence.completed(result) == True{} : Bool
}:
  match result:
    case Spec.BuildResult{Spec.Built{_, _}}: {==}
    case Spec.BuildResult{Spec.Missing{_}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{_}}: complete
    case Spec.ListResult{Spec.ReferencesResult{_, _}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{_}}: complete

def references_result_equal(
  +left: Nat,
  +right: Nat,
  +request: Spec.Request,
  left_complete: {
    Reference.references_completed(Spec.as_references(Spec.interpret(left, request)))
    == True{}
    : Bool
  },
  right_complete: {
    Reference.references_completed(Spec.as_references(Spec.interpret(right, request)))
    == True{}
    : Bool
  },
  child: Reference.contract(left, right)
) -> {
      Spec.as_references(Spec.interpret(left, request))
      == Spec.as_references(Spec.interpret(right, request))
      : Spec.ReferencesResult
    }:
  Equal.cong(Spec.DispatchResult, Spec.ReferencesResult, Spec.as_references,
    Spec.interpret(left, request), Spec.interpret(right, request),
    child(request, as_references_input_completed(Spec.interpret(left, request), left_complete),
      as_references_input_completed(Spec.interpret(right, request), right_complete)))

def prepend_input_completed(
  +result: Spec.ReferencesResult,
  +reference: Spec.TreeReference,
  complete: {Reference.references_completed(Spec.prepend(result, reference)) == True{} : Bool}
) -> {
  Reference.references_completed(result) == True{} : Bool
}:
  match result:
    case Spec.ReferencesResult{_, _}: {==}
    case Spec.ReferencesFailure{_}: complete

def after_input_completed(
  +result: Spec.ReferenceResult,
  continue: Spec.State -> Spec.ReferencesResult,
  complete: {
    Reference.references_completed(Spec.after_reference(result, continue))
    == True{}
    : Bool
  }
) -> {
  Reference.reference_completed(result) == True{} : Bool
}:
  match result:
    case Spec.ReferenceResult{_, _}: {==}
    case Spec.ReferenceFailure{_}: complete

def continue_references(fuel: Nat, items: List<&2, Core.Reference>, facts: Core.Facts,
    path: String, owner: Nat, index: Nat, depth: Nat, state: Spec.State) -> Spec.ReferencesResult:
  Spec.as_references(Spec.interpret(fuel,
    Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}))

def prepend_reference(
  reference: Spec.TreeReference,
  result: Spec.ReferencesResult
) -> Spec.ReferencesResult:
  Spec.prepend(result, reference)

def after_at(
  fuel: Nat,
  items: List<&2, Core.Reference>,
  facts: Core.Facts,
  path: String,
  owner: Nat,
  index: Nat,
  depth: Nat,
  result: Spec.ReferenceResult
) -> Spec.ReferencesResult:
  Spec.after_reference(result, continue_references(fuel, items, facts, path, owner, index, depth))

def after_completed_at(fuel: Nat, items: List<&2, Core.Reference>, facts: Core.Facts,
    path: String, owner: Nat, index: Nat, depth: Nat, result: Spec.ReferenceResult) -> Bool:
  Reference.references_completed(after_at(fuel, items, facts, path, owner, index, depth, result))

def after_equal(+left: Nat, +right: Nat, +result: Spec.ReferenceResult,
    +items: List<&2, Core.Reference>, +facts: Core.Facts, +path: String,
    +owner: Nat, +index: Nat, +depth: Nat,
    left_complete: {Reference.references_completed(Spec.after_reference(result,
      continue_references(left, items, facts, path, owner, index, depth))) == True{} : Bool},
    right_complete: {Reference.references_completed(Spec.after_reference(result,
      continue_references(right, items, facts, path, owner, index, depth))) == True{} : Bool},
    sibling: Reference.contract(left, right)) -> {
  Spec.after_reference(result, continue_references(left, items, facts, path, owner, index, depth))
    == Spec.after_reference(
      result,
      continue_references(right, items, facts, path, owner, index, depth)
    )
    : Spec.ReferencesResult
}:
  match result:
    case Spec.ReferenceFailure{_}: {==}
    case Spec.ReferenceResult{+state, +reference}:
      +request = {Spec.ReferencesRequest{items, facts, path, owner, index, depth, state} : Spec.Request}
      Equal.cong(
        Spec.ReferencesResult,
        Spec.ReferencesResult,
        prepend_reference(reference),
        Spec.as_references(Spec.interpret(left, request)),
        Spec.as_references(Spec.interpret(right, request)),
        references_result_equal(
          left,
          right,
          request,
          prepend_input_completed(
            Spec.as_references(Spec.interpret(left, request)),
            reference,
            left_complete
          ),
          prepend_input_completed(
            Spec.as_references(Spec.interpret(right, request)),
            reference,
            right_complete
          ),
          sibling
        )
      )

def references_equal(
  +left: Nat,
  +right: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State,
  +left_complete: {
    Reference.references_completed(
      Spec.references(
        items,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.interpret(left),
        Spec.interpret(left)
      )
    )
    == True{}
    : Bool
  },
  +right_complete: {
    Reference.references_completed(
      Spec.references(
        items,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.interpret(right),
        Spec.interpret(right)
      )
    )
    == True{}
    : Bool
  },
  child: Reference.contract(left, right),
  sibling: Reference.contract(left, right)
) -> {
  Spec.references(
    items,
    facts,
    path,
    owner,
    index,
    depth,
    state,
    Spec.interpret(left),
    Spec.interpret(left)
  )
    == Spec.references(
      items,
      facts,
      path,
      owner,
      index,
      depth,
      state,
      Spec.interpret(right),
      Spec.interpret(right)
    )
    : Spec.ReferencesResult
}:
  match items:
    case []: {==}
    case +head <> +tail:
      +a = Spec.reference(head, facts, path, owner, index, depth, state, C.build_child(left))
      +b = Spec.reference(head, facts, path, owner, index, depth, state, C.build_child(right))
      +same = Reference.reference_equal(
        left,
        right,
        head,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        after_input_completed(
          a,
          continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth),
          left_complete
        ),
        after_input_completed(
          b,
          continue_references(right, tail, facts, path, owner, (index + 1n : Nat), depth),
          right_complete
        ),
        child
      )
      left_at_right = Equal.trans(
        Bool,
        Reference.references_completed(
          Spec.after_reference(
            b,
            continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
          )
        ),
        Reference.references_completed(
          Spec.after_reference(
            a,
            continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
          )
        ),
        True{},
        Equal.sym(
          Bool,
          Reference.references_completed(
            Spec.after_reference(
              a,
              continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
            )
          ),
          Reference.references_completed(
            Spec.after_reference(
              b,
              continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
            )
          ),
          Equal.cong(
            Spec.ReferenceResult,
            Bool,
            after_completed_at(left, tail, facts, path, owner, (index + 1n : Nat), depth),
            a,
            b,
            same
          )
        ),
        left_complete
      )
      Equal.trans(
        Spec.ReferencesResult,
        Spec.after_reference(
          a,
          continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
        ),
        Spec.after_reference(
          b,
          continue_references(left, tail, facts, path, owner, (index + 1n : Nat), depth)
        ),
        Spec.after_reference(
          b,
          continue_references(right, tail, facts, path, owner, (index + 1n : Nat), depth)
        ),
        Equal.cong(
          Spec.ReferenceResult,
          Spec.ReferencesResult,
          after_at(left, tail, facts, path, owner, (index + 1n : Nat), depth),
          a,
          b,
          same
        ),
        after_equal(
          left,
          right,
          b,
          tail,
          facts,
          path,
          owner,
          (index + 1n : Nat),
          depth,
          left_at_right,
          right_complete,
          sibling
        )
      )

def tree_input_completed(
  +result: Spec.ReferencesResult,
  +owner: Nat,
  +artifact: Nat,
  complete: {Reference.build_completed(Spec.tree_result(result, owner, artifact)) == True{} : Bool}
) -> {
      Reference.references_completed(result)
      == True{}
      : Bool
    }:
  match result:
    case Spec.ReferencesResult{_, _}: {==}
    case Spec.ReferencesFailure{_}: complete

def tree_at(owner: Nat, artifact: Nat, result: Spec.ReferencesResult) -> Spec.Build:
  Spec.tree_result(result, owner, artifact)

def walk_equal(
  +left: Nat,
  +right: Nat,
  +found: Maybe<&2, Core.Declaration>,
  +facts: Core.Facts,
  +path: String,
  +state: Spec.State,
  +depth: Nat,
  left_complete: {
    Reference.build_completed(
      Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(left))
    )
    == True{}
    : Bool
  },
  right_complete: {
    Reference.build_completed(
      Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(right))
    )
    == True{}
    : Bool
  },
  child: Reference.contract(left, right)
) -> {
  Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(left))
    == Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(right)) : Spec.Build
}:
  match found:
    case None{}: {==}
    case Some{Core.Declaration{+artifact, +identity, _, _, +children}}:
      +owner = Spec.address(state)
      +request = {Spec.ReferencesRequest{children, facts, path, owner, 0n, depth,
        Spec.enter(state, path, identity)} : Spec.Request}
      Equal.cong(
        Spec.ReferencesResult,
        Spec.Build,
        tree_at(owner, artifact),
        Spec.as_references(Spec.interpret(left, request)),
        Spec.as_references(Spec.interpret(right, request)),
        references_result_equal(
          left,
          right,
          request,
          tree_input_completed(
            Spec.as_references(Spec.interpret(left, request)),
            owner,
            artifact,
            left_complete
          ),
          tree_input_completed(
            Spec.as_references(Spec.interpret(right, request)),
            owner,
            artifact,
            right_complete
          ),
          child
        )
      )

def build_input_completed(+result: Spec.Build,
    complete: {Coherence.completed(Spec.BuildResult{result}) == True{} : Bool}) -> {
  Reference.build_completed(result) == True{} : Bool
}:
  match result:
    case Spec.Built{_, _}: {==}
    case Spec.Missing{_}: {==}
    case Spec.InsufficientBound{_}: complete

def list_input_completed(+result: Spec.ReferencesResult,
    complete: {Coherence.completed(Spec.ListResult{result}) == True{} : Bool}) -> {
  Reference.references_completed(result) == True{} : Bool
}:
  match result:
    case Spec.ReferencesResult{_, _}: {==}
    case Spec.ReferencesFailure{_}: complete

def wrap_build(value: Spec.Build) -> Spec.DispatchResult:
  Spec.BuildResult{value}

def wrap_list(value: Spec.ReferencesResult) -> Spec.DispatchResult:
  Spec.ListResult{value}

def dispatch_equal(
  +left: Nat,
  +right: Nat,
  +request: Spec.Request,
  left_complete: {Coherence.completed(Spec.interpret((1n + left : Nat), request)) == True{} : Bool},
  right_complete: {
    Coherence.completed(Spec.interpret((1n + right : Nat), request))
    == True{}
    : Bool
  },
  child: Reference.contract(left, right),
  sibling: Reference.contract(left, right)
) -> {
      Spec.interpret((1n + left : Nat), request)
      == Spec.interpret((1n + right : Nat), request)
      : Spec.DispatchResult
    }:
  match request:
    case Spec.Request{+facts, +path, +name, +expected, +depth, +state}:
      +found = Spec.find_declaration(facts, name, expected)
      Equal.cong(
        Spec.Build,
        Spec.DispatchResult,
        wrap_build,
        Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(left)),
        Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(right)),
        walk_equal(
          left,
          right,
          found,
          facts,
          path,
          state,
          depth,
          build_input_completed(
            Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(left)),
            left_complete
          ),
          build_input_completed(
            Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(right)),
            right_complete
          ),
          child
        )
      )
    case Spec.ReferencesRequest{+items, +facts, +path, +owner, +index, +depth, +state}:
      Equal.cong(
        Spec.ReferencesResult,
        Spec.DispatchResult,
        wrap_list,
        Spec.references(
          items,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.interpret(left),
          Spec.interpret(left)
        ),
        Spec.references(
          items,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.interpret(right),
          Spec.interpret(right)
        ),
        references_equal(
          left,
          right,
          items,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          list_input_completed(
            Spec.references(
              items,
              facts,
              path,
              owner,
              index,
              depth,
              state,
              Spec.interpret(left),
              Spec.interpret(left)
            ),
            left_complete
          ),
          list_input_completed(
            Spec.references(
              items,
              facts,
              path,
              owner,
              index,
              depth,
              state,
              Spec.interpret(right),
              Spec.interpret(right)
            ),
            right_complete
          ),
          child,
          sibling
        )
      )

def insufficient_completed(+request: Spec.Request) -> {
  Coherence.completed(Spec.insufficient(request)) == False{} : Bool
}:
  match request:
    case Spec.Request{_, _, _, _, _, _}: {==}
    case Spec.ReferencesRequest{_, _, _, _, _, _, _}: {==}

law completed_interpretations_equal:
  for +left_fuel: Nat
  for +right_fuel: Nat
  for +request: Spec.Request
  for left_complete: {
    Coherence.completed(Spec.interpret(left_fuel, request)) == True{} : Bool
  }
  for right_complete: {
    Coherence.completed(Spec.interpret(right_fuel, request)) == True{} : Bool
  }
  {Spec.interpret(left_fuel, request) == Spec.interpret(right_fuel, request) : Spec.DispatchResult}

def completed_interpretations_equal(left_fuel, right_fuel, request, left_complete, right_complete):
  match left_fuel right_fuel:
    case 0n +right:
      impossible = Equal.trans(
        Bool,
        False{},
        Coherence.completed(Spec.insufficient(request)),
        True{},
        Equal.sym(
          Bool,
          Coherence.completed(Spec.insufficient(request)),
          False{},
          insufficient_completed(request)
        ),
        left_complete
      )
      Empty.absurd(
        {Spec.interpret(0n, request) == Spec.interpret(right, request) : Spec.DispatchResult},
        Order.internal_false_ne_true(impossible)
      )
    case 1n++left 0n:
      impossible = Equal.trans(
        Bool,
        False{},
        Coherence.completed(Spec.insufficient(request)),
        True{},
        Equal.sym(
          Bool,
          Coherence.completed(Spec.insufficient(request)),
          False{},
          insufficient_completed(request)
        ),
        right_complete
      )
      Empty.absurd(
        {
          Spec.interpret((1n + left : Nat), request)
          == Spec.interpret(0n, request)
          : Spec.DispatchResult
        },
        Order.internal_false_ne_true(impossible)
      )
    case 1n++left 1n++right:
      dispatch_equal(left, right, request, left_complete, right_complete,
        next => complete_left => complete_right =>
          completed_interpretations_equal(left, right, next, complete_left, complete_right),
        next => complete_left => complete_right =>
          completed_interpretations_equal(left, right, next, complete_left, complete_right))
