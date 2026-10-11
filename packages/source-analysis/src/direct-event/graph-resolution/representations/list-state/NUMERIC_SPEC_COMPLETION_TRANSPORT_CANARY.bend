import Base
import ./Own.bend as Own
import ./core.bend as Core
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_COMPLETION.bend as Complete

# Finite actual expressions; higher-order completion contracts are not discharged by this canary.

def omitted_completes(+state: Spec.State, +name: Core.Label, +reason: Core.Omission) -> Bool:
  Complete.reference_success(Spec.omitted(state, name, reason))

def queue_completes(
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +imported: Core.ImportBinding
) -> Bool:
  Complete.reference_success(
      Spec.queue(state, path, symbol, owner, index, depth, expected, imported)
    )

def imported_kind_completes(
  +expected: Core.ExpectedKind,
  +type_only: Bool,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +imported: Core.ImportBinding
) -> Bool:
  Complete.reference_success(
      Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
    )

def unresolved_or_import_completes(
  +found: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
  Complete.reference_success(
      Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected)
    )

def import_budget_completes(
  +permit: Bool,
  +imported: Maybe<&2, Core.ImportBinding>,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
  Complete.reference_success(
      Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected)
    )

def bundle_queue_completes(
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +handle: Nat
) -> Bool:
  Complete.reference_success(
      Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle)
    )

def bundle_finish_completes(
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
) -> Bool:
  Complete.reference_success(
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

def bundle_budget_completes(
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
) -> Bool:
  Complete.reference_success(
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

def bundle_seen_completes(
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
) -> Bool:
  Complete.reference_success(
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

def bundle_admission_completes(
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
) -> Bool:
  Complete.reference_success(
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

def bundle_found_completes(
  +found: Maybe<&2, Core.Declaration>,
  +identity: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat
) -> Bool:
  Complete.reference_success(
      Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth)
    )

def expanded_result_success_exact(+result: Spec.Build, +symbol: Core.Label) -> Bool:
  Complete.reference_success(Spec.expanded_result(result, symbol))

def prepend_success_exact(+result: Spec.ReferencesResult, +reference: Spec.TreeReference) -> Bool:
  Measure.successful_references(Spec.prepend(result, reference))

def tree_result_success_exact(+result: Spec.ReferencesResult, +owner: Nat, +artifact: Nat) -> Bool:
  Measure.successful_build(Spec.tree_result(result, owner, artifact))

def child_or_cycle_completes(
  +fuel: Nat,
  +already_seen: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +declaration: Core.Declaration
) -> Bool:
  Complete.reference_success(Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      ))

def local_allowed_completes(
  +fuel: Nat,
  +permit: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +declaration: Core.Declaration
) -> Bool:
  Complete.reference_success(Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      ))

def local_budget_completes(
  +fuel: Nat,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +declaration: Core.Declaration
) -> Bool:
  Complete.reference_success(Spec.local_budget(
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      ))

def local_kind_completes(
  +fuel: Nat,
  +valid: Bool,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +declaration: Core.Declaration
) -> Bool:
  Complete.reference_success(Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Core.declaration_identity(declaration),
        Spec.build_child(Spec.interpret(fuel))
      ))

def local_conflict_completes(
  +fuel: Nat,
  +imported: Maybe<&2, Core.ImportBinding>,
  +declaration: Core.Declaration,
  +state: Spec.State,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> Bool:
  Complete.reference_success(Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Spec.build_child(Spec.interpret(fuel))
      ))

def choose_local_completes(
  +fuel: Nat,
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
  Complete.reference_success(Spec.choose_local(
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
      ))

def ordinary_found_completes(
  +fuel: Nat,
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
  Complete.reference_success(Spec.ordinary_found(
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
      ))

def ordinary_completes(
  +fuel: Nat,
  +facts: Core.Facts,
  +path: Nat,
  +symbol: Core.Label,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  +state: Spec.State
) -> Bool:
  Complete.reference_success(Spec.ordinary(
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ))

def named_completes(
  +fuel: Nat,
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
  Complete.reference_success(Spec.named(
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
      ))

def by_kind_completes(
  +fuel: Nat,
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
  Complete.reference_success(Spec.by_kind(
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
      ))

def reference_completes(
  +fuel: Nat,
  +reference: Core.Reference,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State
) -> Bool:
  Complete.reference_success(Spec.reference(
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ))

def after_reference_completes(
  +fuel: Nat,
  +result: Spec.ReferenceResult,
  +tail: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat
) -> Bool:
  Measure.successful_references(
      Spec.after_reference(
        result,
        Spec.references_sibling(tail, facts, path, owner, index, depth, Spec.interpret(fuel))
      )
    )

def references_completes(
  +fuel: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +state: Spec.State
) -> Bool:
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

def walk_declaration_completes(
  +fuel: Nat,
  +found: Maybe<&2, Core.Declaration>,
  +facts: Core.Facts,
  +path: Nat,
  +name: Core.Label,
  +expected: Core.ExpectedKind,
  +state: Spec.State,
  +depth: Nat
) -> Bool:
  Measure.successful_build(
      Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))
    )

def dispatch_completes(+fuel: Nat, +request: Spec.Request) -> Bool:
  Measure.successful(Spec.dispatch(request, Spec.interpret(fuel), Spec.interpret(fuel)))
