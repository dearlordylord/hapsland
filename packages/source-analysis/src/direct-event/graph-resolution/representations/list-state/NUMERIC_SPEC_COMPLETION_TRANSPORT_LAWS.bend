import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_COMPLETION.bend as Complete

# Exact full reference and recursive sequencing completion transports.
# Smaller-fuel contracts refer to actual Spec.interpret, never arbitrary callbacks.
# This complete nonrecursive branch cannot exhaust recursive fuel.
law omitted_completes:
  for +state: Spec.State
  for +name: Core.Label
  for +reason: Core.Omission
  {Complete.reference_success(Spec.omitted(state, name, reason)) == True{} : Bool}

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# This complete nonrecursive branch cannot exhaust recursive fuel.
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

# The actual result wrapper preserves completion, including explicit failures.
law expanded_result_success_exact:
  for +result: Spec.Build
  for +symbol: Core.Label
  {
    Complete.reference_success(Spec.expanded_result(result, symbol))
    == Measure.successful_build(result)
    : Bool
  }

# The actual result wrapper preserves completion, including explicit failures.
law prepend_success_exact:
  for +result: Spec.ReferencesResult
  for +reference: Spec.TreeReference
  {
    Measure.successful_references(Spec.prepend(result, reference))
    == Measure.successful_references(result)
    : Bool
  }

# The actual result wrapper preserves completion, including explicit failures.
law tree_result_success_exact:
  for +result: Spec.ReferencesResult
  for +owner: Nat
  for +artifact: Nat
  {
    Measure.successful_build(Spec.tree_result(result, owner, artifact))
    == Measure.successful_references(result)
    : Bool
  }

# The full branch completes under the actual selected-child allowance.
law child_or_cycle_completes:
  for +fuel: Nat
  for +already_seen: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for seen: {Spec.seen(state, Core.declaration_identity(declaration)) == already_seen : Bool}
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law local_allowed_completes:
  for +fuel: Nat
  for +permit: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law local_budget_completes:
  for +fuel: Nat
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.local_budget(
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law local_kind_completes:
  for +fuel: Nat
  for +valid: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +declaration: Core.Declaration
  for selected: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law local_conflict_completes:
  for +fuel: Nat
  for +imported: Maybe<&2, Core.ImportBinding>
  for +declaration: Core.Declaration
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for selected: {
    Spec.find_declaration(facts, symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law choose_local_completes:
  for +fuel: Nat
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for selected: {
    local
    == Spec.find_declaration(facts, symbol, expected)
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.choose_local(
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
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law ordinary_found_completes:
  for +fuel: Nat
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for selected: {
    local
    == Spec.find_declaration(facts, symbol, expected)
    : Maybe<&2, Core.Declaration>
  }
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.ordinary_found(
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
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law ordinary_completes:
  for +fuel: Nat
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.ordinary(
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law named_completes:
  for +fuel: Nat
  for +target_id: Maybe<&2, Nat>
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law by_kind_completes:
  for +fuel: Nat
  for +kind: Core.ReferenceKind
  for +target_id: Maybe<&2, Nat>
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.by_kind(
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
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# The full branch completes under the actual selected-child allowance.
law reference_completes:
  for +fuel: Nat
  for +reference: Core.Reference
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for enough: {Nat.is_le(Complete.allowance(facts, state), fuel) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  {Complete.reference_success(Spec.reference(
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.build_child(Spec.interpret(fuel))
      )) == True{} : Bool}

# Head completion and the exact sibling-request bound are composed through actual state.
law after_reference_completes:
  for +fuel: Nat
  for +result: Spec.ReferenceResult
  for +tail: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for success: {Complete.reference_success(result) == True{} : Bool}
  for enough: {
    Nat.is_le(
      Measure.request_rank(
        Spec.ReferencesRequest{
          tail,
          facts,
          path,
          owner,
          index,
          depth,
          Member.reference_state(result)
        }
      ),
      fuel
    )
    == True{}
    : Bool
  }
  for sibling_contract: Complete.contract(fuel)
  {
    Measure.successful_references(
      Spec.after_reference(
        result,
        Spec.references_sibling(tail, facts, path, owner, index, depth, Spec.interpret(fuel))
      )
    )
    == True{}
    : Bool
  }

# Entire child/sibling dispatch completes using predecessor-fuel contracts.
law references_completes:
  for +fuel: Nat
  for +items: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for enough: {
    Nat.is_le(
      Measure.request_rank(Spec.ReferencesRequest{items, facts, path, owner, index, depth, state}),
      (1n + fuel : Nat)
    )
    == True{}
    : Bool
  }
  for child_contract: Complete.contract(fuel)
  for sibling_contract: Complete.contract(fuel)
  {
    Measure.successful_references(
      Spec.references(
        items,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.interpret(fuel),
        Spec.interpret(fuel)
      )
    )
    == True{}
    : Bool
  }

# Root lookup witness retains prior-visited reentry and the actual selected declaration.
law walk_declaration_completes:
  for +fuel: Nat
  for +found: Maybe<&2, Core.Declaration>
  for +facts: Core.Facts
  for +path: Nat
  for +name: Core.Label
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for +depth: Nat
  for selected: {
    found
    == Spec.find_declaration(facts, name, expected)
    : Maybe<&2, Core.Declaration>
  }
  for enough: {
    Nat.is_le(
      Measure.request_rank(Spec.Request{facts, path, name, expected, depth, state}),
      (1n + fuel : Nat)
    )
    == True{}
    : Bool
  }
  for child_contract: Complete.contract(fuel)
  {
    Measure.successful_build(
      Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))
    )
    == True{}
    : Bool
  }

# Full request dispatch closes the predecessor step for the whole interpreter.
law dispatch_completes:
  for +fuel: Nat
  for +request: Spec.Request
  for enough: {Nat.is_le(Measure.request_rank(request), (1n + fuel : Nat)) == True{} : Bool}
  for child_contract: Complete.contract(fuel)
  for sibling_contract: Complete.contract(fuel)
  {
    Measure.successful(Spec.dispatch(request, Spec.interpret(fuel), Spec.interpret(fuel)))
    == True{}
    : Bool
  }
