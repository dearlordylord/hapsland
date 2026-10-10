import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./INTERPRETER_MEASURE.bend as Measure
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./INTERPRETER_FLATTEN_PROOF.bend as Flat
import ./INTERPRETER_ORDER_PROOF.bend as Order

# Actual nonrecursive outcomes of the independent classifier. These proofs are
# internal to whole reference completion, not separate accepted frontier laws.
def omitted_leaf(+state: Spec.State, +symbol: String, +reason: Core.Omission) -> {
  C.leaf(Spec.omitted(state, symbol, reason)) == True{} : Bool
}:
  {==}

def queue_leaf(+state: Spec.State, +path: String, +symbol: String,
    +owner: Nat, +index: Nat, +depth: Nat, +expected: Core.ExpectedKind,
    +imported: Core.ImportBinding) -> {
  C.leaf(Spec.queue(state, path, symbol, owner, index, depth, expected, imported)) == True{} : Bool
}:
  match imported:
    case Core.ImportBinding{import_path, name, type_only}: {==}

def imported_kind_leaf(+expected: Core.ExpectedKind, +type_only: Bool,
    +state: Spec.State, +path: String, +symbol: String, +owner: Nat, +index: Nat,
    +depth: Nat, +imported: Core.ImportBinding) -> {
      C.leaf(
        Spec.imported_kind(expected, type_only, state, path, symbol, owner, index, depth, imported)
      )
      == True{}
      : Bool
    }:
  match expected type_only:
    case Core.FunctionKind{} True{}: {==}
    case Core.FunctionKind{} False{}: queue_leaf(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.FunctionKind{},
      imported
    )
    case Core.TypeKind{} True{}: queue_leaf(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.TypeKind{},
      imported
    )
    case Core.TypeKind{} False{}: queue_leaf(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.TypeKind{},
      imported
    )
    case Core.AnyKind{} True{}: queue_leaf(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.AnyKind{},
      imported
    )
    case Core.AnyKind{} False{}: queue_leaf(
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      Core.AnyKind{},
      imported
    )

def unresolved_or_import_leaf(+found: Maybe<&2, Core.ImportBinding>, +state: Spec.State,
    +path: String, +symbol: String, +owner: Nat, +index: Nat, +depth: Nat,
    +expected: Core.ExpectedKind) -> {
  C.leaf(Spec.unresolved_or_import(found, state, path, symbol, owner, index, depth, expected))
    == True{} : Bool
}:
  match found:
    case None{}: {==}
    case Some{Core.ImportBinding{+import_path, +name, +type_only}}:
      imported_kind_leaf(expected, type_only, state, path, symbol, owner, index, depth,
        Core.ImportBinding{import_path, name, type_only})

def import_budget_leaf(+permit: Bool, +imported: Maybe<&2, Core.ImportBinding>,
    +state: Spec.State, +path: String, +symbol: String, +owner: Nat, +index: Nat,
    +depth: Nat, +expected: Core.ExpectedKind) -> {
  C.leaf(Spec.import_budget(permit, imported, state, path, symbol, owner, index, depth, expected))
    == True{} : Bool
}:
  match permit:
    case False{}: {==}
    case True{}: unresolved_or_import_leaf(
      imported,
      state,
      path,
      symbol,
      owner,
      index,
      depth,
      expected
    )

def bundle_queue_leaf(+state: Spec.State, +path: String, +symbol: String,
    +owner: Nat, +index: Nat, +depth: Nat, +expected: Core.ExpectedKind, +handle: Nat) -> {
      C.leaf(Spec.bundle_queue(state, path, symbol, owner, index, depth, expected, handle))
      == True{}
      : Bool
    }:
  {==}

def bundle_finish_leaf(+permit: Bool, +already_seen: Bool, +state: Spec.State,
    +path: String, +symbol: String, +owner: Nat, +index: Nat, +depth: Nat,
    +expected: Core.ExpectedKind, +handle: Nat, +identity: String) -> {
  C.leaf(Spec.bundle_finish(permit, already_seen, state, path, symbol, owner, index,
    depth, expected, handle, identity)) == True{} : Bool
}:
  match permit already_seen:
    case False{} _: {==}
    case True{} True{}: {==}
    case True{} False{}: {==}

def bundle_budget_leaf(+state: Spec.State, +already_seen: Bool,
    +path: String, +symbol: String, +owner: Nat, +index: Nat, +depth: Nat,
    +expected: Core.ExpectedKind, +handle: Nat, +identity: String) -> {
  C.leaf(Spec.bundle_budget(state, already_seen, path, symbol, owner, index,
    depth, expected, handle, identity)) == True{} : Bool
}:
  bundle_finish_leaf(Spec.allowed(state, path), already_seen, state, path, symbol,
    owner, index, depth, expected, handle, identity)

def bundle_seen_leaf(+already_seen: Bool, +state: Spec.State, +path: String,
    +symbol: String, +owner: Nat, +index: Nat, +depth: Nat,
    +expected: Core.ExpectedKind, +handle: Nat, +identity: String) -> {
  C.leaf(Spec.bundle_seen(already_seen, state, path, symbol, owner, index,
    depth, expected, handle, identity)) == True{} : Bool
}:
  bundle_budget_leaf(Spec.bundle_work(already_seen, Spec.target(state, path, identity)),
    already_seen, path, symbol, owner, index, depth, expected, handle, identity)

def bundle_admission_leaf(+valid: Bool, +state: Spec.State, +path: String,
    +symbol: String, +owner: Nat, +index: Nat, +depth: Nat,
    +expected: Core.ExpectedKind, +handle: Nat, +identity: String) -> {
  C.leaf(Spec.bundle_admission(valid, state, path, symbol, owner, index,
    depth, expected, handle, identity)) == True{} : Bool
}:
  match valid:
    case False{}: {==}
    case True{}: bundle_seen_leaf(Spec.seen(state, identity), state, path, symbol,
      owner, index, depth, expected, handle, identity)

def bundle_found_leaf(+found: Maybe<&2, Core.Declaration>, +identity: String,
    +expected: Core.ExpectedKind, +state: Spec.State, +path: String,
    +symbol: String, +owner: Nat, +index: Nat, +depth: Nat) -> {
  C.leaf(Spec.bundle_found(found, identity, expected, state, path, symbol, owner, index, depth))
    == True{} : Bool
}:
  match found:
    case None{}: {==}
    case Some{Core.Declaration{handle, +actual_id, function, bundled, _}}:
      bundle_admission_leaf(Bool.and(bundled, Bool.and(String.eq(identity, actual_id),
        Spec.matches(expected, function))), state, path, symbol, owner, index, depth,
        expected, handle, actual_id)

def leaf_complete(+fuel: Nat, +owner: Nat, +index: Nat, +result: Spec.ReferenceResult,
    leaf: {C.leaf(result) == True{} : Bool}) -> {
  C.reference_complete(fuel, owner, index, result) == True{} : Bool
}:
  match result:
    case Spec.ReferenceResult{state, Spec.TreeReference{symbol, Spec.Included{identity}}}: {==}
    case Spec.ReferenceResult{state, Spec.TreeReference{symbol, Spec.Omitted{reason, target}}}: {==}
    case Spec.ReferenceResult{+state, Spec.TreeReference{+symbol, Spec.Expanded{+tree}}}:
      Empty.absurd(
        {
          C.reference_complete(
            fuel,
            owner,
            index,
            Spec.ReferenceResult{state, Spec.TreeReference{symbol, Spec.Expanded{tree}}}
          )
          == True{}
          : Bool
        },
        Order.internal_false_ne_true(leaf)
      )
    case Spec.ReferenceFailure{state}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(leaf))

def expanded_complete(+fuel: Nat, +owner: Nat, +index: Nat, +symbol: String,
    +result: Spec.Build, complete: {C.build_complete(fuel, result) == True{} : Bool}) -> {
  C.reference_complete(fuel, owner, index, Spec.expanded_result(result, symbol)) == True{} : Bool
}:
  match result:
    case Spec.Missing{state}: {==}
    case Spec.Built{state, Spec.Tree{+address, +artifact, +references}}:
      Flat.slot_complete(
        Spec.flatten(fuel, Spec.FlattenTree{Spec.Tree{address, artifact, references}}),
        owner,
        index,
        symbol,
        Core.Expanded{address},
        complete
      )
    case Spec.InsufficientBound{state}:
      Empty.absurd({False{} == True{} : Bool}, Order.internal_false_ne_true(complete))
