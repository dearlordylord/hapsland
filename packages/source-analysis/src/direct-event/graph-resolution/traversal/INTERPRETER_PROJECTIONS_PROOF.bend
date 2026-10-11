import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RANK.bend as Rank
import ./INTERPRETER_MEASURE.bend as Measure
import ../representations/list-state/PATRICIA_RELATION.bend as Patricia

# Internal projections for the approved entire-interpreter inventory theorem.
# They inspect actual String Spec operations; no alternate interpreter is defined.
def reference_state(result: Spec.ReferenceResult) -> Spec.State:
  match result:
    case Spec.ReferenceResult{state, _}: state
    case Spec.ReferenceFailure{state}: state

def reference_visited(result: Spec.ReferenceResult) -> Map<&2, Bool>:
  Measure.visited(reference_state(result))

def replace_budget_visited_exact(+state: Spec.State,
  +budget: Core.Budget) -> {
    Measure.visited(Spec.replace_budget(state, budget))
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match state:
    case Spec.State{visited, previous, address, pending}: {==}

def reference_depth_visited_exact(+state: Spec.State,
  +depth: Nat) -> {
    Measure.visited(Spec.reference_depth(state, depth))
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  replace_budget_visited_exact(state, Spec.depth_budget(Spec.state_budget(state), depth))

def local_work_visited_exact(+state: Spec.State) -> {
    Measure.visited(Spec.local_work(state)) == Measure.visited(state) : Map<&2, Bool>
  }:
  replace_budget_visited_exact(state, Spec.work_budget(Spec.state_budget(state)))

def target_visited_exact(+state: Spec.State,
  +path: String,
  +identity: String) -> {
    Measure.visited(Spec.target(state, path, identity))
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  replace_budget_visited_exact(state, Spec.target_budget(Spec.state_budget(state), path, identity))

def pending_visited_exact(+state: Spec.State,
  +item: Core.Pending) -> {
    Measure.visited(Spec.pending(state, item)) == Measure.visited(state) : Map<&2, Bool>
  }:
  match state:
    case Spec.State{visited, budget, address, pending}: {==}

def bundle_work_visited_exact(+already_seen: Bool,
  +state: Spec.State) -> {
    Measure.visited(Spec.bundle_work(already_seen, state))
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match already_seen:
    case True{}: local_work_visited_exact(state)
    case False{}: {==}

def omitted_visited_exact(+state: Spec.State,
  +name: String,
  +reason: Core.Omission) -> {
    reference_visited(Spec.omitted(state, name, reason))
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  {==}

def insufficient_visited_exact(+request: Spec.Request) -> {
  Measure.visited(Measure.result_state(Spec.insufficient(request)))
  == Measure.visited(Measure.request_state(request))
  : Map<&2, Bool>
}:
  match request:
    case Spec.Request{facts, path, name, expected, depth, state}: {==}
    case Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}: {==}

def queue_visited_exact(+state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +imported: Core.ImportBinding) -> {
    reference_visited(
      Spec.queue(state, path, symbol, owner, index, depth, expected, imported)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match imported:
    case Core.ImportBinding{+import_path, +name, type_only}:
      +item = {Core.Pending{owner, index, path, symbol, name, depth, expected, Core.Imported{import_path, name}} : Core.Pending}
      +queued = Spec.pending(state, item)
      Equal.trans(Map<&2, Bool>,
        reference_visited(Spec.omitted(queued, symbol, Core.Unavailable{})),
        Measure.visited(queued), Measure.visited(state),
        omitted_visited_exact(queued, symbol, Core.Unavailable{}),
        pending_visited_exact(state, item))

def imported_kind_visited_exact(+expected: Core.ExpectedKind,
  +type_only: Bool,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +imported: Core.ImportBinding) -> {
    reference_visited(
      Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match expected type_only:
    case Core.FunctionKind{} True{}: omitted_visited_exact(state, symbol, Core.UnsupportedTarget{})
    case Core.AnyKind{} flag: queue_visited_exact(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.AnyKind{},
      imported
    )
    case Core.TypeKind{} flag: queue_visited_exact(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.TypeKind{},
      imported
    )
    case Core.FunctionKind{} False{}: queue_visited_exact(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.FunctionKind{},
      imported
    )

def unresolved_or_import_visited_exact(+found: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
    reference_visited(
      Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match found:
    case None{}: omitted_visited_exact(state, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{+import_path, +name, +type_only}}:
      imported_kind_visited_exact(expected, type_only, state, path, symbol, owner, index, depth,
        Core.ImportBinding{import_path, name, type_only})

def import_budget_visited_exact(+permit: Bool,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind) -> {
    reference_visited(
      Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match permit:
    case False{}: omitted_visited_exact(state, symbol, Core.ReferenceLimit{})
    case True{}: unresolved_or_import_visited_exact(
      imported,
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected
    )

def bundle_queue_visited_exact(+state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat) -> {
    reference_visited(
      Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  +item = {Core.Pending{owner, index, path, symbol, symbol, depth, expected, Core.BundledTarget{handle}} : Core.Pending}
  +queued = Spec.pending(state, item)
  Equal.trans(Map<&2, Bool>,
    reference_visited(Spec.omitted(queued, symbol, Core.Unavailable{})),
    Measure.visited(queued), Measure.visited(state),
    omitted_visited_exact(queued, symbol, Core.Unavailable{}),
    pending_visited_exact(state, item))

def bundle_finish_visited_exact(+permit: Bool,
  +already_seen: Bool,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: String) -> {
    reference_visited(
      Spec.bundle_finish(
        permit,
        already_seen,
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        identity
      )
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match permit already_seen:
    case False{} seen: omitted_visited_exact(state, symbol, Core.ReferenceLimit{})
    case True{} True{}: {==}
    case True{} False{}: bundle_queue_visited_exact(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected,
      handle
    )

def bundle_budget_visited_exact(+state: Spec.State,
  +already_seen: Bool,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: String) -> {
    reference_visited(
      Spec.bundle_budget(
        state,
        already_seen,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        identity
      )
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  bundle_finish_visited_exact(
    Spec.allowed(state, path),
    already_seen,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def bundle_seen_visited_exact(+already_seen: Bool,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: String) -> {
    reference_visited(
      Spec.bundle_seen(
        already_seen,
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        identity
      )
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  +targeted = Spec.target(state, path, identity)
  +changed = Spec.bundle_work(already_seen, targeted)
  Equal.trans(
    Map<&2, Bool>,
    reference_visited(
      Spec.bundle_budget(
        changed,
        already_seen,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        identity
      )
    ),
    Measure.visited(changed),
    Measure.visited(state),
    bundle_budget_visited_exact(
      changed,
      already_seen,
      path,
      symbol,
      owner,
      index,
      depth,
      expected,
      handle,
      identity
    ),
    Equal.trans(
      Map<&2, Bool>,
      Measure.visited(changed),
      Measure.visited(targeted),
      Measure.visited(state),
      bundle_work_visited_exact(already_seen, targeted),
      target_visited_exact(state, path, identity)
    )
  )

def bundle_admission_visited_exact(+valid: Bool,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: String) -> {
    reference_visited(
      Spec.bundle_admission(
        valid,
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        identity
      )
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match valid:
    case False{}: omitted_visited_exact(state, symbol, Core.UnsupportedTarget{})
    case True{}: bundle_seen_visited_exact(
      Spec.seen(state, identity),
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected,
      handle,
      identity
    )

def bundle_found_visited_exact(+found: Maybe<&2, Core.Declaration>,
  +identity: String,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  +path: String,
  +symbol: String,
  +owner: Nat,
  +index: Nat,
  +depth: Nat) -> {
    reference_visited(
      Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth)
    )
    == Measure.visited(state)
    : Map<&2, Bool>
  }:
  match found:
    case None{}: omitted_visited_exact(state, symbol, Core.UnsupportedTarget{})
    case Some{Core.Declaration{handle, +actual_id, function, bundled, references}}:
      bundle_admission_visited_exact(
        Bool.and(
          bundled,
          Bool.and(String.eq(identity, actual_id), Spec.matches(expected, function))
        ),
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        handle,
        actual_id
      )


def expanded_dispatch_visited_exact(+result: Spec.DispatchResult, +symbol: String) -> {
  reference_visited(Spec.expanded_result(Spec.as_build(result), symbol))
  == Measure.visited(Measure.result_state(result))
  : Map<&2, Bool>
}:
  match result:
    case Spec.BuildResult{Spec.Missing{state}}: {==}
    case Spec.BuildResult{Spec.Built{state, tree}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{state}}: {==}
    case Spec.ListResult{Spec.ReferencesResult{state, references}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{state}}: {==}

def prepend_dispatch_visited_exact(
  +result: Spec.DispatchResult,
  +reference: Spec.TreeReference
) -> {
  Measure.visited(Measure.references_state(Spec.prepend(Spec.as_references(result), reference)))
  == Measure.visited(Measure.result_state(result))
  : Map<&2, Bool>
}:
  match result:
    case Spec.BuildResult{Spec.Missing{state}}: {==}
    case Spec.BuildResult{Spec.Built{state, tree}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{state}}: {==}
    case Spec.ListResult{Spec.ReferencesResult{state, references}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{state}}: {==}

def tree_dispatch_visited_exact(+result: Spec.DispatchResult, +owner: Nat, +artifact: Nat) -> {
  Measure.visited(
    Measure.build_state(Spec.tree_result(Spec.as_references(result), owner, artifact))
  )
  == Measure.visited(Measure.result_state(result))
  : Map<&2, Bool>
}:
  match result:
    case Spec.BuildResult{Spec.Missing{state}}: {==}
    case Spec.BuildResult{Spec.Built{state, tree}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{state}}: {==}
    case Spec.ListResult{Spec.ReferencesResult{state, references}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{state}}: {==}
