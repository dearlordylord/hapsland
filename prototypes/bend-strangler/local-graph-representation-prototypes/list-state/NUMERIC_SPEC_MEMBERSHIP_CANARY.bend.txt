import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member

# Finite runtime transport surface; no unfilled law or proof import.
def replace_budget_visited_exact(+state: Spec.State, +budget: Core.Budget) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.replace_budget(state, budget))
     

def reference_depth_visited_exact(+state: Spec.State, +depth: Nat) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.reference_depth(state, depth))
     

def local_work_visited_exact(+state: Spec.State) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.local_work(state))

def target_visited_exact(+state: Spec.State, +path: Nat, +identity: Nat) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.target(state, path, identity))
     

def pending_visited_exact(+state: Spec.State, +item: Core.Pending) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.pending(state, item))

def bundle_work_visited_exact(+already_seen: Bool, +state: Spec.State) -> Own.Dictionary<Bool>:
  Measure.visited(Spec.bundle_work(already_seen, state))
     

def omitted_visited_exact(
  +state: Spec.State,
  +name: Core.Label,
  +reason: Core.Omission
) -> Own.Dictionary<Bool>:
  Member.reference_visited(Spec.omitted(state, name, reason))
     

def queue_visited_exact(
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +imported: Core.ImportBinding
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.queue(state, path, symbol, owner, index, depth, expected, imported)
      )
     

def imported_kind_visited_exact(
  +expected: Core.ExpectedKind,
  +type_only: Bool,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +imported: Core.ImportBinding
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
      )
     

def unresolved_or_import_visited_exact(
  +found: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected)
      )
     

def import_budget_visited_exact(
  +permit: Bool,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected)
      )
     

def bundle_queue_visited_exact(
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle)
      )
     

def bundle_finish_visited_exact(
  +permit: Bool,
  +already_seen: Bool,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: Nat
) -> Own.Dictionary<Bool>:
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
     

def bundle_budget_visited_exact(
  +state: Spec.State,
  +already_seen: Bool,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: Nat
) -> Own.Dictionary<Bool>:
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
     

def bundle_seen_visited_exact(
  +already_seen: Bool,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: Nat
) -> Own.Dictionary<Bool>:
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
     

def bundle_admission_visited_exact(
  +valid: Bool,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat,
  +identity: Nat
) -> Own.Dictionary<Bool>:
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
     

def bundle_found_visited_exact(
  +found: Maybe<&2, Core.Declaration>,
  +identity: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat
) -> Own.Dictionary<Bool>:
  Member.reference_visited(
        Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth)
      )
     

def enter_preserves_member(+state: Spec.State, +path: Nat, +identity: Nat, +query: Nat) -> Bool:
  Member.member(Spec.enter(state, path, identity), query)

def expanded_result_state_exact(+result: Spec.Build, +symbol: Core.Label) -> Spec.State:
  Member.reference_state(Spec.expanded_result(result, symbol))
     

def prepend_state_exact(
  +result: Spec.ReferencesResult,
  +reference: Spec.TreeReference
) -> Spec.State:
  Measure.references_state(Spec.prepend(result, reference))
     

def as_build_state_exact(+result: Spec.DispatchResult) -> Spec.State:
  Measure.build_state(Spec.as_build(result))

def as_references_state_exact(+result: Spec.DispatchResult) -> Spec.State:
  Measure.references_state(Spec.as_references(result))
     

def tree_result_state_exact(
  +result: Spec.ReferencesResult,
  +owner: Nat,
  +artifact: Nat
) -> Spec.State:
  Measure.build_state(Spec.tree_result(result, owner, artifact))
     

def insufficient_state_exact(+request: Spec.Request) -> Spec.State:
  Measure.result_state(Spec.insufficient(request))

def child_or_cycle_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +already_seen: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: Nat
) -> Bool:
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
     

def local_allowed_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +permit: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: Nat
) -> Bool:
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
     

def local_budget_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: Nat
) -> Bool:
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
     

def local_kind_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +valid: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +identity: Nat
) -> Bool:
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
     

def local_conflict_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +imported: Maybe<&2, Core.ImportBinding>,
  +declaration: Core.Declaration,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
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
     

def choose_local_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
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
     

def ordinary_found_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
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
     

def ordinary_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State
) -> Bool:
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
     

def named_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +target_id: Maybe<&2, Nat>,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State
) -> Bool:
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
     

def by_kind_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +kind: Core.ReferenceKind,
  +target_id: Maybe<&2, Nat>,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State
) -> Bool:
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
     

def reference_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +reference: Core.Reference,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State
) -> Bool:
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
     

def after_reference_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +result: Spec.ReferenceResult,
  +tail: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat
) -> Bool:
  Member.member(
        Measure.references_state(
          Spec.after_reference(
            result,
            Spec.references_sibling(tail, facts, path, owner, index, depth, Spec.interpret(fuel))
          )
        ),
        query
      )
     

def references_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State
) -> Bool:
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
     

def walk_declaration_preserves_member(
  +fuel: Nat,
  +query: Nat,
  +found: Maybe<&2, Core.Declaration>,
  +facts: Core.Facts,
  +path: Nat,
  +state: Spec.State,
  +depth: Nat
) -> Bool:
  Member.member(
        Measure.build_state(
          Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))
        ),
        query
      )
     

def dispatch_preserves_member(+fuel: Nat, +query: Nat, +request: Spec.Request) -> Bool:
  Member.result_member(Spec.dispatch(request, Spec.interpret(fuel), Spec.interpret(fuel)), query)
     
