import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_COMPLETION.bend as Complete

# Isolated exact approved nonrecursive completion and result transports.
law omitted_completes:
for +state: Spec.State
  for +name: Core.Label
  for +reason: Core.Omission
  {Complete.reference_success(Spec.omitted(state, name, reason)) == True{} : Bool}

def omitted_completes(state, name, reason):
  {==}

law queue_completes:
for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +imported: Core.ImportBinding
  {Complete.reference_success(
      Spec.queue(state, path, symbol, owner, index, depth, expected, imported)
    ) == True{} : Bool}

def queue_completes(state, path, symbol, owner, index, depth, expected, imported):
  match imported:
    case Core.ImportBinding{import_path, name, type_only, composite}: {==}

law imported_kind_completes:
for +expected: Core.ExpectedKind
  for +type_only: Bool
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +imported: Core.ImportBinding
  {Complete.reference_success(
      Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
    ) == True{} : Bool}

def imported_kind_completes(
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
    case Core.AnyKind{} flag: queue_completes(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.AnyKind{},
      imported
    )
    case Core.TypeKind{} flag: queue_completes(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.TypeKind{},
      imported
    )
    case Core.FunctionKind{} False{}: queue_completes(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.FunctionKind{},
      imported
    )
    case Core.FunctionKind{} True{}: {==}

law unresolved_or_import_completes:
for +found: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {Complete.reference_success(
      Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected)
    ) == True{} : Bool}

def unresolved_or_import_completes(found, state, path, symbol, owner, index, depth, expected):
  match found:
    case None{}: {==}
    case Some{Core.ImportBinding{+import_path, +name, +type_only, +composite}}:
      imported_kind_completes(
        expected,
        type_only,
        state,
        path,
        symbol,
        owner,
        index,
        depth,
        Core.ImportBinding{import_path, name, type_only, composite}
      )

law import_budget_completes:
for +permit: Bool
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  {Complete.reference_success(
      Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected)
    ) == True{} : Bool}

def import_budget_completes(permit, imported, state, path, symbol, owner, index, depth, expected):
  match permit:
    case False{}: {==}
    case True{}: unresolved_or_import_completes(
      imported,
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected
    )

law bundle_queue_completes:
for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +handle: Nat
  {Complete.reference_success(
      Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle)
    ) == True{} : Bool}

def bundle_queue_completes(state, path, symbol, owner, index, depth, expected, handle):
  {==}

law bundle_finish_completes:
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
  {Complete.reference_success(
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
    ) == True{} : Bool}

def bundle_finish_completes(
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
    case False{} flag: {==}
    case True{} True{}: {==}
    case True{} False{}: {==}

law bundle_budget_completes:
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
  {Complete.reference_success(
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
    ) == True{} : Bool}

def bundle_budget_completes(
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
  bundle_finish_completes(
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

law bundle_seen_completes:
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
  {Complete.reference_success(
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
    ) == True{} : Bool}

def bundle_seen_completes(
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
  bundle_budget_completes(
    Spec.bundle_work(already_seen, Spec.target(state, path, identity)),
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

law bundle_admission_completes:
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
  {Complete.reference_success(
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
    ) == True{} : Bool}

def bundle_admission_completes(
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
    case False{}: {==}
    case True{}: bundle_seen_completes(
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

law bundle_found_completes:
for +found: Maybe<&2, Core.Declaration>
  for +identity: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  {Complete.reference_success(
      Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth)
    ) == True{} : Bool}

def bundle_found_completes(found, identity, expected, state, path, symbol, owner, index, depth):
  match found:
    case None{}: {==}
    case Some{Core.Declaration{+handle, +actual_id, +function, +bundled, _}}:
      bundle_admission_completes(
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

law expanded_result_success_exact:
for +result: Spec.Build
  for +symbol: Core.Label
  {
    Complete.reference_success(Spec.expanded_result(result, symbol))
    == Measure.successful_build(result)
    : Bool
  }

def expanded_result_success_exact(result, symbol):
  match result:
    case Spec.Missing{state}: {==}
    case Spec.Built{state, tree}: {==}
    case Spec.InsufficientBound{state}: {==}

law prepend_success_exact:
for +result: Spec.ReferencesResult
  for +reference: Spec.TreeReference
  {
    Measure.successful_references(Spec.prepend(result, reference))
    == Measure.successful_references(result)
    : Bool
  }

def prepend_success_exact(result, reference):
  match result:
    case Spec.ReferencesResult{state, references}: {==}
    case Spec.ReferencesFailure{state}: {==}

law tree_result_success_exact:
for +result: Spec.ReferencesResult
  for +owner: Nat
  for +artifact: Nat
  {
    Measure.successful_build(Spec.tree_result(result, owner, artifact))
    == Measure.successful_references(result)
    : Bool
  }

def tree_result_success_exact(result, owner, artifact):
  match result:
    case Spec.ReferencesResult{state, references}: {==}
    case Spec.ReferencesFailure{state}: {==}
