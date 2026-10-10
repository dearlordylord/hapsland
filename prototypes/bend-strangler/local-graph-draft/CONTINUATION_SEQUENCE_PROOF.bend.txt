import Base
import ./core.bend as Core
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION.bend as Continuation
import ./CONTINUATION_CHILD_PROOF.bend as Child
import ./CONTINUATION_PREFIX_PROOF.bend as Prefix

# Full ordered head/sibling composition at predecessor fuel; failures are kept.
def after_tail(
  tail: Spec.Flat,
  state: Spec.State,
  next: Continuation.Progress -> Relation.Observation,
  progress: Continuation.Progress
) -> Relation.Observation:
  match progress:
    case Continuation.Progress{_, prefix}: Continuation.after_flat(tail, state, prefix, next)

def after_join_exact(
  +head: Spec.Flat,
  +tail: Spec.Flat,
  +head_state: Spec.State,
  +state: Spec.State,
  +prefix: Spec.Flat,
  next: Continuation.Progress -> Relation.Observation
) -> {
      Continuation.after_flat(Spec.flat_join(head, tail), state, prefix, next)
      == Continuation.after_flat(head, head_state, prefix, after_tail(tail, state, next))
      : Relation.Observation
    }:
  match head tail:
    case Spec.FlatFailure{} Spec.FlatFailure{}: {==}
    case Spec.FlatFailure{} Spec.Flat{_, _}: {==}
    case Spec.Flat{_, _} Spec.FlatFailure{}: {==}
    case Spec.Flat{+hn, +hs} Spec.Flat{+tn, +ts}:
      Equal.cong(
        Spec.Flat,
        Relation.Observation,
        Child.continue_flat(state, next),
        Spec.flat_join(prefix, Spec.flat_join(Spec.Flat{hn, hs}, Spec.Flat{tn, ts})),
        Spec.flat_join(Spec.flat_join(prefix, Spec.Flat{hn, hs}), Spec.Flat{tn, ts}),
        Equal.sym(
          Spec.Flat,
          Spec.flat_join(Spec.flat_join(prefix, Spec.Flat{hn, hs}), Spec.Flat{tn, ts}),
          Spec.flat_join(prefix, Spec.flat_join(Spec.Flat{hn, hs}, Spec.Flat{tn, ts})),
          Prefix.join_associative(prefix, Spec.Flat{hn, hs}, Spec.Flat{tn, ts})
        )
      )

def after_sibling(
  result: Spec.DispatchResult,
  owner: Nat,
  index: Nat,
  fuel: Nat,
  next: Continuation.Progress -> Relation.Observation,
  progress: Continuation.Progress
) -> Relation.Observation:
  match progress:
    case Continuation.Progress{_, prefix}:
      Continuation.after_references(result, owner, index, prefix, fuel, next)

def failed_sibling(+head: Spec.Flat, +head_state: Spec.State, +state: Spec.State,
    +prefix: Spec.Flat, +owner: Nat, +index: Nat, +fuel: Nat,
    next: Continuation.Progress -> Relation.Observation) -> {
      Relation.Failed{}
      == Continuation.after_flat(
        head,
        head_state,
        prefix,
        after_sibling(Spec.ListResult{Spec.ReferencesFailure{state}}, owner, index, fuel, next)
      )
      : Relation.Observation
    }:
  match head:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _}: {==}

def sibling_join_exact(
  +head: Spec.Flat,
  +state: Spec.State,
  +references: List<&2, Spec.TreeReference>,
  +head_state: Spec.State,
  +prefix: Spec.Flat,
  +owner: Nat,
  +index: Nat,
  +fuel: Nat,
  next: Continuation.Progress -> Relation.Observation
) -> {
      Continuation.after_flat(
        Spec.flat_join(head, Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references})),
        state,
        prefix,
        next
      )
      == Continuation.after_flat(
        head,
        head_state,
        prefix,
        after_sibling(
          Spec.ListResult{Spec.ReferencesResult{state, references}},
          owner,
          index,
          fuel,
          next
        )
      )
      : Relation.Observation
    }:
  match head:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{nodes, slots}:
      after_join_exact(
        Spec.Flat{nodes, slots},
        Spec.flatten(fuel, Spec.FlattenReferences{owner, index, references}),
        head_state,
        state,
        prefix,
        next
      )

def prepend_exact(+result: Spec.ReferencesResult, +reference: Spec.TreeReference,
    +fuel: Nat, +owner: Nat, +index: Nat, +head_state: Spec.State, +prefix: Spec.Flat,
    next: Continuation.Progress -> Relation.Observation) -> {
      Continuation.after_references(
        Spec.ListResult{Spec.prepend(result, reference)},
        owner,
        index,
        prefix,
        (1n + fuel : Nat),
        next
      )
      == Continuation.after_flat(
        Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
        head_state,
        prefix,
        after_sibling(Spec.ListResult{result}, owner, (index + 1n : Nat), fuel, next)
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ReferencesFailure{state}:
      failed_sibling(
        Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
        head_state,
        state,
        prefix,
        owner,
        (index + 1n : Nat),
        fuel,
        next
      )
    case Spec.ReferencesResult{+state, +references}:
      sibling_join_exact(
        Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
        state,
        references,
        head_state,
        prefix,
        owner,
        (index + 1n : Nat),
        fuel,
        next
      )

def wrong_sibling(+head: Spec.Flat, +head_state: Spec.State, +prefix: Spec.Flat,
    +build: Spec.Build, +owner: Nat, +index: Nat, +fuel: Nat,
    next: Continuation.Progress -> Relation.Observation) -> {
  Relation.Failed{} == Continuation.after_flat(head, head_state, prefix,
    after_sibling(Spec.BuildResult{build}, owner, index, fuel, next)) : Relation.Observation
}:
  match head:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _}: {==}

def dispatch_prepend_exact(+result: Spec.DispatchResult, +reference: Spec.TreeReference,
    +fuel: Nat, +owner: Nat, +index: Nat, +head_state: Spec.State, +prefix: Spec.Flat,
    next: Continuation.Progress -> Relation.Observation) -> {
      Continuation.after_references(
        Spec.ListResult{Spec.prepend(Spec.as_references(result), reference)},
        owner,
        index,
        prefix,
        (1n + fuel : Nat),
        next
      )
      == Continuation.after_flat(
        Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
        head_state,
        prefix,
        after_sibling(result, owner, (index + 1n : Nat), fuel, next)
      )
      : Relation.Observation
    }:
  match result:
    case Spec.BuildResult{Spec.Missing{state}}:
      wrong_sibling(Spec.flat_head(reference, owner, index, Spec.flatten(fuel)), head_state, prefix,
        Spec.Missing{state}, owner, (index + 1n : Nat), fuel, next)
    case Spec.BuildResult{Spec.Built{state, tree}}:
      wrong_sibling(Spec.flat_head(reference, owner, index, Spec.flatten(fuel)), head_state, prefix,
        Spec.Built{state, tree}, owner, (index + 1n : Nat), fuel, next)
    case Spec.BuildResult{Spec.InsufficientBound{state}}:
      wrong_sibling(Spec.flat_head(reference, owner, index, Spec.flatten(fuel)), head_state, prefix,
        Spec.InsufficientBound{state}, owner, (index + 1n : Nat), fuel, next)
    case Spec.ListResult{result}: prepend_exact(
      result,
      reference,
      fuel,
      owner,
      index,
      head_state,
      prefix,
      next
    )

def tail_dispatch(fuel: Nat, items: List<&2, Core.Reference>, facts: Core.Facts,
    path: String, owner: Nat, index: Nat, depth: Nat, state: Spec.State) -> Spec.DispatchResult:
  Spec.interpret(fuel, Spec.ReferencesRequest{items, facts, path, owner, index, depth, state})

def tail_references(fuel: Nat, items: List<&2, Core.Reference>, facts: Core.Facts,
    path: String, owner: Nat, index: Nat, depth: Nat, state: Spec.State) -> Spec.ReferencesResult:
  Spec.as_references(tail_dispatch(fuel, items, facts, path, owner, index, depth, state))

def tail_state_exact(+flat: Spec.Flat, +state: Spec.State, +prefix: Spec.Flat,
    +fuel: Nat, +items: List<&2, Core.Reference>, +facts: Core.Facts, +path: String,
    +owner: Nat, +index: Nat, +depth: Nat, +parents: List<&2, Core.Frame>) -> {
      Continuation.after_flat(
        flat,
        state,
        prefix,
        after_sibling(
          tail_dispatch(fuel, items, facts, path, owner, index, depth, state),
          owner,
          index,
          fuel,
          Continuation.resume(parents, facts, path, fuel)
        )
      )
      == Continuation.after_flat(
        flat,
        state,
        prefix,
        Continuation.resume(Core.Frame{owner, depth, index, items} <> parents, facts, path, fuel)
      )
      : Relation.Observation
    }:
  match flat:
    case Spec.FlatFailure{}: {==}
    case Spec.Flat{_, _}: {==}

def reference_sequence(
  +result: Spec.ReferenceResult,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  +depth: Nat,
  +items: List<&2, Core.Reference>,
  +facts: Core.Facts,
  +path: String,
  +parents: List<&2, Core.Frame>,
  +prefix: Spec.Flat
) -> {
      Continuation.after_references(
        Spec.ListResult{
          Spec.after_reference(
            result,
            tail_references(fuel, items, facts, path, owner, (index + 1n : Nat), depth)
          )
        },
        owner,
        index,
        prefix,
        (1n + fuel : Nat),
        Continuation.resume(parents, facts, path, fuel)
      )
      == Child.reference_next(
        result,
        fuel,
        owner,
        index,
        prefix,
        Continuation.resume(
          Core.Frame{owner, depth, (index + 1n : Nat), items} <> parents,
          facts,
          path,
          fuel
        )
      )
      : Relation.Observation
    }:
  match result:
    case Spec.ReferenceFailure{_}: {==}
    case Spec.ReferenceResult{+state, +reference}:
      Equal.trans(
        Relation.Observation,
        Continuation.after_references(
          Spec.ListResult{
            Spec.prepend(
              tail_references(fuel, items, facts, path, owner, (index + 1n : Nat), depth, state),
              reference
            )
          },
          owner,
          index,
          prefix,
          (1n + fuel : Nat),
          Continuation.resume(parents, facts, path, fuel)
        ),
        Continuation.after_flat(
          Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
          state,
          prefix,
          after_sibling(
            tail_dispatch(fuel, items, facts, path, owner, (index + 1n : Nat), depth, state),
            owner,
            (index + 1n : Nat),
            fuel,
            Continuation.resume(parents, facts, path, fuel)
          )
        ),
        Child.reference_next(
          Spec.ReferenceResult{state, reference},
          fuel,
          owner,
          index,
          prefix,
          Continuation.resume(
            Core.Frame{owner, depth, (index + 1n : Nat), items} <> parents,
            facts,
            path,
            fuel
          )
        ),
        dispatch_prepend_exact(
          tail_dispatch(fuel, items, facts, path, owner, (index + 1n : Nat), depth, state),
          reference,
          fuel,
          owner,
          index,
          state,
          prefix,
          Continuation.resume(parents, facts, path, fuel)
        ),
        tail_state_exact(
          Spec.flat_head(reference, owner, index, Spec.flatten(fuel)),
          state,
          prefix,
          fuel,
          items,
          facts,
          path,
          owner,
          (index + 1n : Nat),
          depth,
          parents
        )
      )
