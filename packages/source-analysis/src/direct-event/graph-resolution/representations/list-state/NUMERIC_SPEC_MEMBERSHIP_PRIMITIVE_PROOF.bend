import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./LAWS.bend as DictionaryLaws
import ./PROOF.bend as DictionaryProof
import ../../../../../../../vendor/bendlib/packages/bend-mathlib/bool.bend as BoolFacts

# Exact isolated statements from the approved transport owner.
law replace_budget_visited_exact:
for +state: Spec.State
  for +budget: Core.Budget
  {
    Measure.visited(Spec.replace_budget(state, budget))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def replace_budget_visited_exact(state, budget):
  match state:
    case Spec.State{visited, previous, address, pending}: {==}

law reference_depth_visited_exact:
for +state: Spec.State
  for +depth: Nat
  {
    Measure.visited(Spec.reference_depth(state, depth))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def reference_depth_visited_exact(state, depth):
  replace_budget_visited_exact(state, Spec.depth_budget(Spec.state_budget(state), depth))

law local_work_visited_exact:
for +state: Spec.State
  {
    Measure.visited(Spec.local_work(state)) == Measure.visited(state) : Own.Dictionary<Bool>
  }

def local_work_visited_exact(state):
  replace_budget_visited_exact(state, Spec.work_budget(Spec.state_budget(state)))

law target_visited_exact:
for +state: Spec.State
  for +path: Nat
  for +identity: Nat
  {
    Measure.visited(Spec.target(state, path, identity))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def target_visited_exact(state, path, identity):
  replace_budget_visited_exact(state, Spec.target_budget(Spec.state_budget(state), path, identity))

law pending_visited_exact:
for +state: Spec.State
  for +item: Core.Pending
  {
    Measure.visited(Spec.pending(state, item)) == Measure.visited(state) : Own.Dictionary<Bool>
  }

def pending_visited_exact(state, item):
  match state:
    case Spec.State{visited, budget, address, pending}: {==}

law bundle_work_visited_exact:
for +already_seen: Bool
  for +state: Spec.State
  {
    Measure.visited(Spec.bundle_work(already_seen, state))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def bundle_work_visited_exact(already_seen, state):
  match already_seen:
    case True{}: local_work_visited_exact(state)
    case False{}: {==}

law omitted_visited_exact:
for +state: Spec.State
  for +name: Core.Label
  for +reason: Core.Omission
  {
    Member.reference_visited(Spec.omitted(state, name, reason))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def omitted_visited_exact(state, name, reason):
  {==}

law enter_preserves_member:
for +state: Spec.State
  for +path: Nat
  for +identity: Nat
  for +query: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  {
    Member.member(Spec.enter(state, path, identity), query) == True{} : Bool
  }

def enter_preserves_member(state, path, identity, query, present):
  match state:
    case Spec.State{+visited, budget, address, pending}:
      %Equal.sym(Bool,
        Own.contains(Bool, Own.set(Bool, visited, identity, True{}), query),
        Bool.or(Nat.is_eq(query, identity), Own.contains(Bool, visited, query)),
        DictionaryLaws.insertion_membership_exact(Bool, visited, identity, query, True{})):
        {_ == True{} : Bool}
      %Equal.sym(Bool, Own.contains(Bool, visited, query), True{}, present):
        {Bool.or(Nat.is_eq(query, identity), _) == True{} : Bool}
      BoolFacts.or_true(Nat.is_eq(query, identity))

law expanded_result_state_exact:
for +result: Spec.Build
  for +symbol: Core.Label
  {
    Member.reference_state(Spec.expanded_result(result, symbol))
    == Measure.build_state(result)
    : Spec.State
  }

def expanded_result_state_exact(result, symbol):
  match result:
    case Spec.Missing{state}: {==}
    case Spec.Built{state, tree}: {==}
    case Spec.InsufficientBound{state}: {==}

law prepend_state_exact:
for +result: Spec.ReferencesResult
  for +reference: Spec.TreeReference
  {
    Measure.references_state(Spec.prepend(result, reference))
    == Measure.references_state(result)
    : Spec.State
  }

def prepend_state_exact(result, reference):
  match result:
    case Spec.ReferencesResult{state, references}: {==}
    case Spec.ReferencesFailure{state}: {==}

law as_build_state_exact:
for +result: Spec.DispatchResult
  {
    Measure.build_state(Spec.as_build(result)) == Measure.result_state(result) : Spec.State
  }

def as_build_state_exact(result):
  match result:
    case Spec.BuildResult{build}: {==}
    case Spec.ListResult{Spec.ReferencesResult{state, references}}: {==}
    case Spec.ListResult{Spec.ReferencesFailure{state}}: {==}

law as_references_state_exact:
for +result: Spec.DispatchResult
  {
    Measure.references_state(Spec.as_references(result))
    == Measure.result_state(result)
    : Spec.State
  }

def as_references_state_exact(result):
  match result:
    case Spec.ListResult{references}: {==}
    case Spec.BuildResult{Spec.Missing{state}}: {==}
    case Spec.BuildResult{Spec.Built{state, tree}}: {==}
    case Spec.BuildResult{Spec.InsufficientBound{state}}: {==}

law tree_result_state_exact:
for +result: Spec.ReferencesResult
  for +owner: Nat
  for +artifact: Nat
  {
    Measure.build_state(Spec.tree_result(result, owner, artifact))
    == Measure.references_state(result)
    : Spec.State
  }

def tree_result_state_exact(result, owner, artifact):
  match result:
    case Spec.ReferencesResult{state, references}: {==}
    case Spec.ReferencesFailure{state}: {==}

law insufficient_state_exact:
for +request: Spec.Request
  {
    Measure.result_state(Spec.insufficient(request)) == Measure.request_state(request) : Spec.State
  }

def insufficient_state_exact(request):
  match request:
    case Spec.Request{facts, path, name, expected, depth, state}: {==}
    case Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}: {==}

law queue_visited_exact:
for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +imported: Core.ImportBinding
  {
    Member.reference_visited(
      Spec.queue(state, path, symbol, owner, index, depth, expected, imported)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def queue_visited_exact(state, path, symbol, owner, index, depth, expected, imported):
  match imported:
    case Core.ImportBinding{+import_path, +name, type_only, composite}:
      +item = {Core.Pending{owner, index, path, Core.label_key(symbol), name, depth, expected, Core.Imported{import_path, name}} : Core.Pending}
      +queued = Spec.pending(state, item)
      Equal.trans(Own.Dictionary<Bool>,
        Member.reference_visited(Spec.omitted(queued, symbol, Core.Unavailable{})),
        Measure.visited(queued), Measure.visited(state),
        omitted_visited_exact(queued, symbol, Core.Unavailable{}),
        pending_visited_exact(state, item))

law imported_kind_visited_exact:
for +expected: Core.ExpectedKind
  for +type_only: Bool
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +imported: Core.ImportBinding
  {
    Member.reference_visited(
      Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def imported_kind_visited_exact(
  expected,
  type_only,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  imported
):
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

law unresolved_or_import_visited_exact:
for +found: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Member.reference_visited(
      Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def unresolved_or_import_visited_exact(found, state, path, symbol, owner, index, depth, expected):
  match found:
    case None{}: omitted_visited_exact(state, symbol, Core.Unresolved{})
    case Some{Core.ImportBinding{+import_path, +name, +type_only, +composite}}:
      imported_kind_visited_exact(expected, type_only, state, path, symbol, owner, index, depth,
        Core.ImportBinding{import_path, name, type_only, composite})

law import_budget_visited_exact:
for +permit: Bool
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {
    Member.reference_visited(
      Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def import_budget_visited_exact(
  permit,
  imported,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected
):
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

law bundle_queue_visited_exact:
for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  {
    Member.reference_visited(
      Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def bundle_queue_visited_exact(state, path, symbol, owner, index, depth, expected, handle):
  +item = {Core.Pending{owner, index, path, Core.label_key(symbol), Core.label_key(symbol), depth, expected, Core.BundledTarget{handle}} : Core.Pending}
  +queued = Spec.pending(state, item)
  Equal.trans(Own.Dictionary<Bool>,
    Member.reference_visited(Spec.omitted(queued, symbol, Core.Unavailable{})),
    Measure.visited(queued), Measure.visited(state),
    omitted_visited_exact(queued, symbol, Core.Unavailable{}),
    pending_visited_exact(state, item))

law bundle_finish_visited_exact:
for +permit: Bool
  for +already_seen: Bool
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  for +identity: Nat
  {
    Member.reference_visited(
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
    : Own.Dictionary<Bool>
  }

def bundle_finish_visited_exact(
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
):
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

law bundle_budget_visited_exact:
for +state: Spec.State
  for +already_seen: Bool
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  for +identity: Nat
  {
    Member.reference_visited(
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
    : Own.Dictionary<Bool>
  }

def bundle_budget_visited_exact(
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
):
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

law bundle_seen_visited_exact:
for +already_seen: Bool
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  for +identity: Nat
  {
    Member.reference_visited(
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
    : Own.Dictionary<Bool>
  }

def bundle_seen_visited_exact(
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
):
  +targeted = Spec.target(state, path, identity)
  +changed = Spec.bundle_work(already_seen, targeted)
  Equal.trans(
    Own.Dictionary<Bool>,
    Member.reference_visited(
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
      Own.Dictionary<Bool>,
      Measure.visited(changed),
      Measure.visited(targeted),
      Measure.visited(state),
      bundle_work_visited_exact(already_seen, targeted),
      target_visited_exact(state, path, identity)
    )
  )

law bundle_admission_visited_exact:
for +valid: Bool
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  for +identity: Nat
  {
    Member.reference_visited(
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
    : Own.Dictionary<Bool>
  }

def bundle_admission_visited_exact(
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
):
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

law bundle_found_visited_exact:
for +found: Maybe<&2, Core.Declaration>
  for +identity: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  {
    Member.reference_visited(
      Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth)
    )
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

def bundle_found_visited_exact(found, identity, expected, state, path, symbol, owner, index, depth):
  match found:
    case None{}: omitted_visited_exact(state, symbol, Core.UnsupportedTarget{})
    case Some{Core.Declaration{handle, +actual_id, function, bundled, references}}:
      bundle_admission_visited_exact(
        Bool.and(
          bundled,
          Bool.and(Nat.is_eq(identity, actual_id), Spec.matches(expected, function))
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
