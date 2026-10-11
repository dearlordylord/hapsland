import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member

# Supporting transports for the full interpreter law, not migration frontiers.

# The actual state operation preserves the complete raw visited dictionary.
law replace_budget_visited_exact:
  for +state: Spec.State
  for +budget: Core.Budget
  {
    Measure.visited(Spec.replace_budget(state, budget))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

# The actual state operation preserves the complete raw visited dictionary.
law reference_depth_visited_exact:
  for +state: Spec.State
  for +depth: Nat
  {
    Measure.visited(Spec.reference_depth(state, depth))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

# The actual state operation preserves the complete raw visited dictionary.
law local_work_visited_exact:
  for +state: Spec.State
  {
    Measure.visited(Spec.local_work(state)) == Measure.visited(state) : Own.Dictionary<Bool>
  }

# The actual state operation preserves the complete raw visited dictionary.
law target_visited_exact:
  for +state: Spec.State
  for +path: Nat
  for +identity: Nat
  {
    Measure.visited(Spec.target(state, path, identity))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

# The actual state operation preserves the complete raw visited dictionary.
law pending_visited_exact:
  for +state: Spec.State
  for +item: Core.Pending
  {
    Measure.visited(Spec.pending(state, item)) == Measure.visited(state) : Own.Dictionary<Bool>
  }

# The actual state operation preserves the complete raw visited dictionary.
law bundle_work_visited_exact:
  for +already_seen: Bool
  for +state: Spec.State
  {
    Measure.visited(Spec.bundle_work(already_seen, state))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
law omitted_visited_exact:
  for +state: Spec.State
  for +name: Core.Label
  for +reason: Core.Omission
  {
    Member.reference_visited(Spec.omitted(state, name, reason))
    == Measure.visited(state)
    : Own.Dictionary<Bool>
  }

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# The complete nonrecursive reference dispatch retains the exact visited dictionary.
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

# Entering an actual node retains every prior membership, including raw duplicate visited keys.
law enter_preserves_member:
  for +state: Spec.State
  for +path: Nat
  for +identity: Nat
  for +query: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  {
    Member.member(Spec.enter(state, path, identity), query) == True{} : Bool
  }

# The actual result wrapper preserves the complete state, including partial failures.
law expanded_result_state_exact:
  for +result: Spec.Build
  for +symbol: Core.Label
  {
    Member.reference_state(Spec.expanded_result(result, symbol))
    == Measure.build_state(result)
    : Spec.State
  }

# The actual result wrapper preserves the complete state, including partial failures.
law prepend_state_exact:
  for +result: Spec.ReferencesResult
  for +reference: Spec.TreeReference
  {
    Measure.references_state(Spec.prepend(result, reference))
    == Measure.references_state(result)
    : Spec.State
  }

# The actual result wrapper preserves the complete state, including partial failures.
law as_build_state_exact:
  for +result: Spec.DispatchResult
  {
    Measure.build_state(Spec.as_build(result)) == Measure.result_state(result) : Spec.State
  }

# The actual result wrapper preserves the complete state, including partial failures.
law as_references_state_exact:
  for +result: Spec.DispatchResult
  {
    Measure.references_state(Spec.as_references(result))
    == Measure.result_state(result)
    : Spec.State
  }

# The actual result wrapper preserves the complete state, including partial failures.
law tree_result_state_exact:
  for +result: Spec.ReferencesResult
  for +owner: Nat
  for +artifact: Nat
  {
    Measure.build_state(Spec.tree_result(result, owner, artifact))
    == Measure.references_state(result)
    : Spec.State
  }

# The actual result wrapper preserves the complete state, including partial failures.
law insufficient_state_exact:
  for +request: Spec.Request
  {
    Measure.result_state(Spec.insufficient(request)) == Measure.request_state(request) : Spec.State
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law child_or_cycle_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +already_seen: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law local_allowed_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +permit: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law local_budget_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_budget(
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law local_kind_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +valid: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law local_conflict_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +imported: Maybe<&2, Core.ImportBinding>
  for +declaration: Core.Declaration
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law choose_local_preserves_member:
  for +fuel: Nat
  for +query: Nat
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
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law ordinary_found_preserves_member:
  for +fuel: Nat
  for +query: Nat
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
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law ordinary_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.ordinary(
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law named_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +target_id: Maybe<&2, Nat>
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law by_kind_preserves_member:
  for +fuel: Nat
  for +query: Nat
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
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The full reference branch preserves prior membership using the actual smaller-fuel child interpreter.
law reference_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +reference: Core.Reference
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.reference(
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# Sibling interpretation starts from the complete state returned by the head, including failure.
law after_reference_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +result: Spec.ReferenceResult
  for +tail: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for present: {Member.reference_member(result, query) == True{} : Bool}
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.references_state(
        Spec.after_reference(
          result,
          Spec.references_sibling(tail, facts, path, owner, index, depth, Spec.interpret(fuel))
        )
      ),
      query
    )
    == True{}
    : Bool
  }

# The whole recursive dispatch composes child and sibling state preservation; contracts are strictly smaller-fuel results.
law references_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +items: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.references_state(
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
      ),
      query
    )
    == True{}
    : Bool
  }

# The whole recursive dispatch composes child and sibling state preservation; contracts are strictly smaller-fuel results.
law walk_declaration_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +found: Maybe<&2, Core.Declaration>
  for +facts: Core.Facts
  for +path: Nat
  for +state: Spec.State
  for +depth: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.build_state(
        Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

# The whole recursive dispatch composes child and sibling state preservation; contracts are strictly smaller-fuel results.
law dispatch_preserves_member:
  for +fuel: Nat
  for +query: Nat
  for +request: Spec.Request
  for present: {Member.request_member(request, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.result_member(Spec.dispatch(request, Spec.interpret(fuel), Spec.interpret(fuel)), query)
    == True{}
    : Bool
  }
