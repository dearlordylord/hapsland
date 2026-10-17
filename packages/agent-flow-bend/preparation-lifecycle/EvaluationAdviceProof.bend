import Base
import ../../../vendor/bendlib/packages/bend-mathlib/bool.bend as B
import ../../../vendor/bendlib/packages/bend-mathlib/nat.bend as N
import ./CanonicalResolverOwner.bend as O
import ./EvaluationAdviceSpecification.bend as S
import ../Canonical.bend as C

# Supporting proofs of the approved evaluation_advice_transfer_exact law.
# Arbitrary child lists and opaque IDs; no new state representation. Common
# lookup/reconciliation and native IO limits remain those stated in the law.
# Maintain with that API; transfer guarantees and delete on replacement.

def pending_exact(+found: Maybe<&2, C.Work>) -> {O.advice_birth(found) == S.pending(found) : Bool}:
  match found:
    case None{}: {==}
    case Some{C.Work{_, _, _, _, _, C.AwaitingSourceRead{}, _}}: {==}
    case Some{C.Work{_, _, _, _, _, C.SourceReading{}, _}}: {==}
    case Some{C.Work{_, _, _, _, _, C.Preparing{}, _}}: {==}
    case Some{C.Work{_, _, _, _, _, C.Reviewing{}, _}}: {==}
    case Some{C.Work{_, _, _, _, _, C.AtJev{}, _}}: {==}
    case Some{C.Work{_, _, _, _, _, C.PendingFinding{_}, _}}: {==}

def pending_work_exact(+state: O.State, +p: Nat, +l: Nat, +r: Nat, +operation: Nat) -> {
  O.advice_operation_live(O.state_canonical(state), p, l, r, operation)
  == S.pending_work(state, p, l, r, operation)
  : Bool
}:
  match state:
    case O.State{C.State{_, _, work, _, _, _, _, _, _}, _, _, _}:
      pending_exact(C.find_work(p, l, r, operation, work))

def claimed_exact(+p: Nat, +l: Nat, +r: Nat, +operation: Nat, +origin: Nat, +own: Nat,
  +permission: O.EvaluationPermission, +rest: List<&2, O.Child>) -> {
    O.advice_claimed(
      operation,
      O.EvaluationScope{origin, O.EvaluationContext{p, l, r, own}, permission},
      rest
    )
    == S.claimed(p, l, r, operation, rest)
    : Bool
  }:
  match rest:
    case Nil{}: {==}
    case O.Child{O.EvaluationCleanupScope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.EvaluationDispatchScope{_, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.EvaluationScope{_, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.DeliveryScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.SettingsScope{_}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.FreshnessScope{_}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.Scope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.SourceScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.AfterSourceScope{_, _, _, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.PreparationScope{_, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.RetainingScope{_, _, _, _, _}, _, _, _, _, _, _, _} <> tail: claimed_exact(
      p,
      l,
      r,
      operation,
      origin,
      own,
      permission,
      tail
    )
    case O.Child{O.AdviceTailScope{+q, +m, +t, +other, _, _}, _, _, _, _, _, _, _} <> tail:
      %claimed_exact(p, l, r, operation, origin, own, permission, tail) : {
        O.advice_claimed(
          operation,
          O.EvaluationScope{origin, O.EvaluationContext{p, l, r, own}, permission},
          rest
        )
        == Bool.or(
          Bool.and(
            Nat.is_eq(p, q),
            Bool.and(Nat.is_eq(l, m), Bool.and(Nat.is_eq(r, t), Nat.is_eq(operation, other)))
          ),
          _
        )
        : Bool
      }
      {==}

def birth_exact(
  +valid: Bool,
  +state: O.State,
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +origin: Nat,
  +operation: Nat,
  +input: Nat
) -> {
  O.advice_handoff_allowed(valid, state, p, l, r, origin, operation, input)
  == S.birth(valid, state, p, l, r, origin, operation, input) : O.Step
}:
  match valid state:
    case False{} _: {==}
    case True{} O.State{_, _, _, _}: {==}

def handoff_condition_exact(
  +state: O.State,
  +origin: Nat,
  +p: Nat,
  +l: Nat,
  +r: Nat,
  +own: Nat,
  +operation: Nat,
  +input: Nat
) -> {
  O.evaluation_advice_handoff(state, origin, O.EvaluationContext{p, l, r, own}, operation, input)
  == S.birth(
    Bool.and(
      Nat.is_eq(own, operation),
      Bool.and(
        S.pending_work(state, p, l, r, operation),
        Bool.not(S.claimed(p, l, r, operation, S.children(state)))
      )
    ),
    state,
    p,
    l,
    r,
    origin,
    operation,
    input
  )
  : O.Step
}:
  match state:
    case O.State{+canon, _, _, +rest}:
      %pending_work_exact(state, p, l, r, operation) : {
        O.evaluation_advice_handoff(
          state,
          origin,
          O.EvaluationContext{p, l, r, own},
          operation,
          input
        )
        == S.birth(
          Bool.and(
            Nat.is_eq(own, operation),
            Bool.and(_, Bool.not(S.claimed(p, l, r, operation, rest)))
          ),
          state,
          p,
          l,
          r,
          origin,
          operation,
          input
        )
        : O.Step
      }
      %claimed_exact(p, l, r, operation, origin, own, O.EvaluationSettled{}, rest) : {
        O.evaluation_advice_handoff(
          state,
          origin,
          O.EvaluationContext{p, l, r, own},
          operation,
          input
        )
        == S.birth(
          Bool.and(
            Nat.is_eq(own, operation),
            Bool.and(O.advice_operation_live(canon, p, l, r, operation), Bool.not(_))
          ),
          state,
          p,
          l,
          r,
          origin,
          operation,
          input
        )
        : O.Step
      }
      birth_exact(
        Bool.and(
          Nat.is_eq(own, operation),
          Bool.and(
            O.advice_operation_live(canon, p, l, r, operation),
            Bool.not(
              O.advice_claimed(
                operation,
                O.EvaluationScope{origin, O.EvaluationContext{p, l, r, own}, O.EvaluationSettled{}},
                rest
              )
            )
          )
        ),
        state,
        p,
        l,
        r,
        origin,
        operation,
        input
      )

def selected_root_exact(
  +state: O.State,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>,
  +operation: Nat,
  +input: Nat
) -> {
  O.advice_handoff_child(
    state,
    Some{
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    operation,
    input
  )
  == S.selected(
    state,
    Some{
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    operation,
    input
  )
  : O.Step
}:
  match context phase permission lease:
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildInstalling{} O.EvaluationSettled{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildReady{} O.EvaluationSettled{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAwaiting{} O.EvaluationSettled{} Some{_}: handoff_condition_exact(
      state,
      inv,
      p,
      l,
      r,
      own,
      operation,
      input
    )
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildResuming{} O.EvaluationSettled{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildAccepted{} O.EvaluationSettled{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationUnissued{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationUnissued{} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationIssued{_} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationIssued{_} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationAtProvider{_, _} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationAtProvider{_, _} Some{_}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationSettled{} None{}: {==}
    case O.EvaluationContext{p, l, r, own} O.ChildCancelled{} O.EvaluationSettled{} Some{_}: {==}

def selected_cleanup_exact(
  +state: O.State,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +origin: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>,
  +operation: Nat,
  +input: Nat
) -> {
  O.advice_handoff_child(
    state,
    Some{
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    operation,
    input
  )
  == S.selected(
    state,
    Some{
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    },
    operation,
    input
  )
  : O.Step
}:
  {==}

def retire_exact(+inv: Nat, +handle: Nat) -> {
  O.retire(inv, handle) == S.retire(inv, handle) : List<&2, O.Action>
}:
  match handle:
    case 0n: {==}
    case 1n++value:
      %N.add_comm(value, 1n) : {
        O.RetireHandle{inv, Nat.add(value, 1n)} <> Nil{}
        == O.RetireHandle{inv, _} <> Nil{} : List<&2, O.Action>
      }
      {==}

def cancel_root_exact(
  +state: O.State,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +origin: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.cancel_scope(
    state,
    O.Child{
      O.EvaluationScope{custody, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    O.EvaluationScope{custody, context, permission}
  )
  == S.cancel_child(
    state,
    O.Child{
      O.EvaluationScope{custody, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : O.Step
}:
  match phase:
    case O.ChildInstalling{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildInstalling{},
            pending,
            lease,
            parent
          },
          O.EvaluationScope{custody, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildReady{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildReady{},
            pending,
            lease,
            parent
          },
          O.EvaluationScope{custody, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAwaiting{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            pending,
            lease,
            parent
          },
          O.EvaluationScope{custody, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildResuming{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildResuming{},
            pending,
            lease,
            parent
          },
          O.EvaluationScope{custody, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def cancel_cleanup_exact(
  +state: O.State,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +origin: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.cancel_scope(
    state,
    O.Child{
      O.EvaluationCleanupScope{custody, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    O.EvaluationCleanupScope{custody, origin, context, permission}
  )
  == S.cancel_child(
    state,
    O.Child{
      O.EvaluationCleanupScope{custody, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    }
  )
  : O.Step
}:
  match phase:
    case O.ChildInstalling{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildInstalling{},
            pending,
            lease,
            parent
          },
          O.EvaluationCleanupScope{custody, origin, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildReady{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildReady{},
            pending,
            lease,
            parent
          },
          O.EvaluationCleanupScope{custody, origin, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAwaiting{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            pending,
            lease,
            parent
          },
          O.EvaluationCleanupScope{custody, origin, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildResuming{}:
      %retire_exact(inv, handle) : {
        O.cancel_scope(
          state,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildResuming{},
            pending,
            lease,
            parent
          },
          O.EvaluationCleanupScope{custody, origin, context, permission}
        )
        == O.reconcile_cancel(
          O.updated(
            state,
            O.ChildUpdate{
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                0n,
                O.ChildCancelled{},
                None{},
                lease,
                parent
              },
              O.CancelChild{inv, handle} <> _
            }
          )
        )
        : O.Step
      }
      {==}
    case O.ChildAccepted{}: {==}
    case O.ChildCancelled{}: {==}

def find_head_exact(+child: O.Child, +tail: List<&2, O.Child>) -> {
  O.find(O.child_invocation(child), child <> tail) == Some{child} : Maybe<&2, O.Child>
}:
  match child:
    case O.Child{_, +inv, _, _, _, _, _, _}:
      %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
        Bool.pick(Maybe<&2, O.Child>, _, Some{child}, O.find(inv, tail))
        == Some{child}
        : Maybe<&2, O.Child>
      }
      {==}

def cancel_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +child: O.Child,
  found: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.cancel_scope(state, child, O.child_scope_value(child))
    == S.cancel_child(state, child)
    : O.Step
  }
) -> {
  O.cancel(state, inv) == S.cancel_evaluation(state, inv) : O.Step
}:
  match state:
    case O.State{_, _, _, _}:
        %Equal.sym(
          Maybe<&2, O.Child>,
          O.find(inv, O.state_children(state)),
          Some{child},
          found_right
        ) : {
          O.cancel_found(state, O.find(inv, O.state_children(state)))
          == S.cancel_found(state, _)
          : O.Step
        }
        %Equal.sym(Maybe<&2, O.Child>, O.find(inv, O.state_children(state)), Some{child}, found) : {
          O.cancel_found(state, _) == S.cancel_found(state, Some{child}) : O.Step
        }
        selected

def cancel_root_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +origin: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.cancel(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv
  )
  == S.cancel_evaluation(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv
  )
  : O.Step
}:
  cancel_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationScope{custody, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      rest
    ),
    cancel_root_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        } <> rest
      },
      context,
      phase,
      permission,
      lease,
      custody,
      origin,
      inv,
      epoch,
      handle,
      pending,
      parent
    )
  )

def cancel_cleanup_entry_exact(
  +canon: C.State,
  +next: Nat,
  +next_lease: Nat,
  +rest: List<&2, O.Child>,
  +context: O.EvaluationContext,
  +phase: O.Phase,
  +permission: O.EvaluationPermission,
  +lease: Maybe<&2, O.Lease>,
  +custody: Nat,
  +origin: Nat,
  +inv: Nat,
  +epoch: Nat,
  +handle: Nat,
  +pending: Maybe<&2, Nat>,
  +parent: Maybe<&2, O.Parent>
) -> {
  O.cancel(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv
  )
  == S.cancel_evaluation(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv
  )
  : O.Step
}:
  cancel_lookup_exact(
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      } <> rest
    },
    inv,
    O.Child{
      O.EvaluationCleanupScope{custody, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      lease,
      parent
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      rest
    ),
    cancel_cleanup_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          lease,
          parent
        } <> rest
      },
      context,
      phase,
      permission,
      lease,
      custody,
      origin,
      inv,
      epoch,
      handle,
      pending,
      parent
    )
  )

def current_root_awaiting_exact(+custody: Nat, +inv: Nat, +epoch: Nat,
  +context: O.EvaluationContext, +permission: O.EvaluationPermission, +origin: Nat,
  +handle: Nat, +pending: Maybe<&2, Nat>, +lease: Maybe<&2, O.Lease>) -> {
    O.evaluation_current(
      custody,
      inv,
      epoch,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          pending,
          lease,
          None{}
        }
      }
    )
    == Nat.is_eq(custody, inv)
    : Bool
  }:
  %Equal.sym(Bool, Nat.is_eq(custody, custody), True{}, N.is_eq_refl(custody)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, Bool.and(Nat.is_eq(inv, inv),
      Bool.and(Nat.is_eq(epoch, epoch), True{})))) == Nat.is_eq(custody, inv) : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, Bool.and(Nat.is_eq(epoch, epoch), True{})))
      == Nat.is_eq(custody, inv) : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(epoch, epoch), True{}, N.is_eq_refl(epoch)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, True{})) == Nat.is_eq(custody, inv) : Bool
  }
  B.and_true(Nat.is_eq(custody, inv))

def current_cleanup_awaiting_exact(+custody: Nat, +inv: Nat, +epoch: Nat,
  +context: O.EvaluationContext, +permission: O.EvaluationPermission, +origin: Nat,
  +handle: Nat, +pending: Maybe<&2, Nat>, +lease: Maybe<&2, O.Lease>) -> {
    O.evaluation_current(
      custody,
      inv,
      epoch,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          pending,
          lease,
          None{}
        }
      }
    )
    == Nat.is_eq(custody, inv)
    : Bool
  }:
  %Equal.sym(Bool, Nat.is_eq(custody, custody), True{}, N.is_eq_refl(custody)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, Bool.and(Nat.is_eq(inv, inv),
      Bool.and(Nat.is_eq(epoch, epoch), True{})))) == Nat.is_eq(custody, inv) : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, Bool.and(Nat.is_eq(epoch, epoch), True{})))
      == Nat.is_eq(custody, inv) : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(epoch, epoch), True{}, N.is_eq_refl(epoch)) : {
    Bool.and(Nat.is_eq(custody, inv), Bool.and(_, True{})) == Nat.is_eq(custody, inv) : Bool
  }
  B.and_true(Nat.is_eq(custody, inv))

def permit_join_exact(+a: Bool, +b: Bool) -> {
  Bool.and(a, Bool.and(b, True{})) == Bool.and(b, a) : Bool
}:
  match a b:
    case True{} True{}: {==}
    case True{} False{}: {==}
    case False{} True{}: {==}
    case False{} False{}: {==}

def permit_root_awaiting_exact(+canon: C.State, +rest: List<&2, O.Child>,
  +custody: Nat, +inv: Nat, +epoch: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +handle: Nat,
  +pending: Nat, +id: Nat, +leased: Nat, +generation: Nat, +lease: Nat, +request: Nat) -> {
    O.provider_permit_found(
      canon,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      } <> rest,
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    : Bool
  }:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      } <> rest
    ),
    Some{
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      }
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      },
      rest
    )
  ) : {
      Bool.and(
        O.provider_permit_matches(
          inv,
          generation,
          lease,
          request,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending},
            Some{O.Lease{id, leased}},
            None{}
          }
        ),
        Bool.and(O.evaluation_current(custody, inv, epoch, _), True{})
      )
      == S.permit(
        inv,
        generation,
        lease,
        request,
        Some{
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending},
            Some{O.Lease{id, leased}},
            None{}
          }
        }
      )
      : Bool
    }
  %Equal.sym(
    Bool,
    O.evaluation_current(
      custody,
      inv,
      epoch,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    ),
    Nat.is_eq(custody, inv),
    current_root_awaiting_exact(
      custody,
      inv,
      epoch,
      context,
      permission,
      origin,
      handle,
      Some{pending},
      Some{O.Lease{id, leased}}
    )
  ) : {
        Bool.and(
          O.provider_permit_matches(
            inv,
            generation,
            lease,
            request,
            O.Child{
              O.EvaluationScope{custody, context, permission},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending},
              Some{O.Lease{id, leased}},
              None{}
            }
          ),
          Bool.and(_, True{})
        )
        == S.permit(
          inv,
          generation,
          lease,
          request,
          Some{
            O.Child{
              O.EvaluationScope{custody, context, permission},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending},
              Some{O.Lease{id, leased}},
              None{}
            }
          }
        )
        : Bool
      }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(
      Bool.and(
        _,
        Bool.and(
          Nat.is_eq(generation, epoch),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      ),
      Bool.and(Nat.is_eq(custody, inv), True{})
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(
      Bool.and(
        Nat.is_eq(generation, epoch),
        Bool.and(
          Nat.is_eq(lease, id),
          Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
        )
      ),
      Bool.and(Nat.is_eq(custody, inv), True{})
    )
    == Bool.and(
      _,
      Bool.and(
        Nat.is_eq(custody, inv),
        Bool.and(
          Nat.is_eq(generation, epoch),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      )
    )
    : Bool
  }
  permit_join_exact(Bool.and(Nat.is_eq(generation, epoch), Bool.and(Nat.is_eq(lease, id),
    Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased)))), Nat.is_eq(custody, inv))

def permit_cleanup_awaiting_exact(+canon: C.State, +rest: List<&2, O.Child>,
  +custody: Nat, +inv: Nat, +epoch: Nat, +context: O.EvaluationContext,
  +permission: O.EvaluationPermission, +origin: Nat, +handle: Nat,
  +pending: Nat, +id: Nat, +leased: Nat, +generation: Nat, +lease: Nat, +request: Nat) -> {
    O.provider_permit_found(
      canon,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      } <> rest,
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    : Bool
  }:
  %Equal.sym(
    Maybe<&2, O.Child>,
    O.find(
      inv,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      } <> rest
    ),
    Some{
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      }
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        O.ChildAwaiting{},
        Some{pending},
        Some{O.Lease{id, leased}},
        None{}
      },
      rest
    )
  ) : {
      Bool.and(
        O.provider_permit_matches(
          inv,
          generation,
          lease,
          request,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending},
            Some{O.Lease{id, leased}},
            None{}
          }
        ),
        Bool.and(O.evaluation_current(custody, inv, epoch, _), True{})
      )
      == S.permit(
        inv,
        generation,
        lease,
        request,
        Some{
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending},
            Some{O.Lease{id, leased}},
            None{}
          }
        }
      )
      : Bool
    }
  %Equal.sym(
    Bool,
    O.evaluation_current(
      custody,
      inv,
      epoch,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    ),
    Nat.is_eq(custody, inv),
    current_cleanup_awaiting_exact(
      custody,
      inv,
      epoch,
      context,
      permission,
      origin,
      handle,
      Some{pending},
      Some{O.Lease{id, leased}}
    )
  ) : {
        Bool.and(
          O.provider_permit_matches(
            inv,
            generation,
            lease,
            request,
            O.Child{
              O.EvaluationCleanupScope{custody, origin, context, permission},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending},
              Some{O.Lease{id, leased}},
              None{}
            }
          ),
          Bool.and(_, True{})
        )
        == S.permit(
          inv,
          generation,
          lease,
          request,
          Some{
            O.Child{
              O.EvaluationCleanupScope{custody, origin, context, permission},
              inv,
              epoch,
              handle,
              O.ChildAwaiting{},
              Some{pending},
              Some{O.Lease{id, leased}},
              None{}
            }
          }
        )
        : Bool
      }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(
      Bool.and(
        _,
        Bool.and(
          Nat.is_eq(generation, epoch),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      ),
      Bool.and(Nat.is_eq(custody, inv), True{})
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          O.ChildAwaiting{},
          Some{pending},
          Some{O.Lease{id, leased}},
          None{}
        }
      }
    )
    : Bool
  }
  %Equal.sym(Bool, Nat.is_eq(inv, inv), True{}, N.is_eq_refl(inv)) : {
    Bool.and(
      Bool.and(
        Nat.is_eq(generation, epoch),
        Bool.and(
          Nat.is_eq(lease, id),
          Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
        )
      ),
      Bool.and(Nat.is_eq(custody, inv), True{})
    )
    == Bool.and(
      _,
      Bool.and(
        Nat.is_eq(custody, inv),
        Bool.and(
          Nat.is_eq(generation, epoch),
          Bool.and(
            Nat.is_eq(lease, id),
            Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased))
          )
        )
      )
    )
    : Bool
  }
  permit_join_exact(Bool.and(Nat.is_eq(generation, epoch), Bool.and(Nat.is_eq(lease, id),
    Bool.and(Nat.is_eq(request, pending), Nat.is_eq(pending, leased)))), Nat.is_eq(custody, inv))

def permit_root_found_exact(+phase: O.Phase, +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>, +ancestor: Maybe<&2, O.Parent>,
  +canon: C.State, +rest: List<&2, O.Child>, +custody: Nat, +inv: Nat, +epoch: Nat,
  +context: O.EvaluationContext, +permission: O.EvaluationPermission, +origin: Nat,
  +handle: Nat, +generation: Nat, +lease: Nat, +request: Nat) -> {
    O.provider_permit_found(
      canon,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      } <> rest,
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        }
      }
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        }
      }
    )
    : Bool
  }:
  match phase pending held ancestor:

    case O.ChildInstalling{} _ _ _: {==}

    case O.ChildReady{} _ _ _: {==}

    case O.ChildResuming{} _ _ _: {==}

    case O.ChildAccepted{} _ _ _: {==}

    case O.ChildCancelled{} _ _ _: {==}

    case O.ChildAwaiting{} None{} _ _: {==}
    case O.ChildAwaiting{} Some{_} None{} _: {==}
    case O.ChildAwaiting{} Some{pending_id} Some{O.Lease{id, leased}} None{}:
      permit_root_awaiting_exact(canon, rest, custody, inv, epoch, context, permission, origin,
        handle, pending_id, id, leased, generation, lease, request)
    case O.ChildAwaiting{} Some{pending_id} Some{O.Lease{id, leased}} Some{O.Parent{a, b, c}}:
      %Equal.sym(
        Maybe<&2, O.Child>,
        O.find(
          inv,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          } <> rest
        ),
        Some{
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          }
        },
        find_head_exact(
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          },
          rest
        )
      ) : {
          Bool.and(
            O.provider_permit_matches(
              inv,
              generation,
              lease,
              request,
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                handle,
                O.ChildAwaiting{},
                Some{pending_id},
                Some{O.Lease{id, leased}},
                Some{O.Parent{a, b, c}}
              }
            ),
            Bool.and(
              O.evaluation_current(custody, inv, epoch, _),
              O.parent_live(
                Some{O.Parent{a, b, c}},
                O.Child{
                  O.EvaluationScope{custody, context, permission},
                  inv,
                  epoch,
                  handle,
                  O.ChildAwaiting{},
                  Some{pending_id},
                  Some{O.Lease{id, leased}},
                  Some{O.Parent{a, b, c}}
                } <> rest
              )
            )
          )
          == False{}
          : Bool
        }
      B.and_false(
        O.provider_permit_matches(
          inv,
          generation,
          lease,
          request,
          O.Child{
            O.EvaluationScope{custody, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          }
        )
      )

def permit_cleanup_found_exact(+phase: O.Phase, +pending: Maybe<&2, Nat>,
  +held: Maybe<&2, O.Lease>, +ancestor: Maybe<&2, O.Parent>,
  +canon: C.State, +rest: List<&2, O.Child>, +custody: Nat, +inv: Nat, +epoch: Nat,
  +context: O.EvaluationContext, +permission: O.EvaluationPermission, +origin: Nat,
  +handle: Nat, +generation: Nat, +lease: Nat, +request: Nat) -> {
    O.provider_permit_found(
      canon,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      } <> rest,
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        }
      }
    )
    == S.permit(
      inv,
      generation,
      lease,
      request,
      Some{
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        }
      }
    )
    : Bool
  }:
  match phase pending held ancestor:

    case O.ChildInstalling{} _ _ _: {==}

    case O.ChildReady{} _ _ _: {==}

    case O.ChildResuming{} _ _ _: {==}

    case O.ChildAccepted{} _ _ _: {==}

    case O.ChildCancelled{} _ _ _: {==}

    case O.ChildAwaiting{} None{} _ _: {==}
    case O.ChildAwaiting{} Some{_} None{} _: {==}
    case O.ChildAwaiting{} Some{pending_id} Some{O.Lease{id, leased}} None{}:
      permit_cleanup_awaiting_exact(canon, rest, custody, inv, epoch, context, permission, origin,
        handle, pending_id, id, leased, generation, lease, request)
    case O.ChildAwaiting{} Some{pending_id} Some{O.Lease{id, leased}} Some{O.Parent{a, b, c}}:
      %Equal.sym(
        Maybe<&2, O.Child>,
        O.find(
          inv,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          } <> rest
        ),
        Some{
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          }
        },
        find_head_exact(
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          },
          rest
        )
      ) : {
          Bool.and(
            O.provider_permit_matches(
              inv,
              generation,
              lease,
              request,
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                handle,
                O.ChildAwaiting{},
                Some{pending_id},
                Some{O.Lease{id, leased}},
                Some{O.Parent{a, b, c}}
              }
            ),
            Bool.and(
              O.evaluation_current(custody, inv, epoch, _),
              O.parent_live(
                Some{O.Parent{a, b, c}},
                O.Child{
                  O.EvaluationCleanupScope{custody, origin, context, permission},
                  inv,
                  epoch,
                  handle,
                  O.ChildAwaiting{},
                  Some{pending_id},
                  Some{O.Lease{id, leased}},
                  Some{O.Parent{a, b, c}}
                } <> rest
              )
            )
          )
          == False{}
          : Bool
        }
      B.and_false(
        O.provider_permit_matches(
          inv,
          generation,
          lease,
          request,
          O.Child{
            O.EvaluationCleanupScope{custody, origin, context, permission},
            inv,
            epoch,
            handle,
            O.ChildAwaiting{},
            Some{pending_id},
            Some{O.Lease{id, leased}},
            Some{O.Parent{a, b, c}}
          }
        )
      )

def permit_lookup_exact(
  +state: O.State,
  +inv: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +child: O.Child,
  found: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {
    O.provider_permit_found(
      O.state_canonical(state),
      O.state_children(state),
      inv,
      generation,
      lease,
      request,
      Some{child}
    )
    == S.permit(inv, generation, lease, request, Some{child})
    : Bool
  }
) -> {
  O.provider_live(state, inv, generation, lease, request)
  == S.permit(inv, generation, lease, request, O.find(inv, S.children(state))) : Bool
}:
  match state:
    case O.State{_, _, _, _}:
      %Equal.sym(
        Maybe<&2, O.Child>,
        O.find(inv, O.state_children(state)),
        Some{child},
        found_right
      ) : {
        O.provider_live(state, inv, generation, lease, request)
        == S.permit(inv, generation, lease, request, _)
        : Bool
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, O.state_children(state)), Some{child}, found) : {
        O.provider_permit_found(
          O.state_canonical(state),
          O.state_children(state),
          inv,
          generation,
          lease,
          request,
          _
        )
        == S.permit(inv, generation, lease, request, Some{child})
        : Bool
      }
      selected

def handoff_checked_exact(+valid: Bool, +state: O.State, +inv: Nat, +operation: Nat, +input: Nat,
  +child: O.Child,
  found: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  found_right: {O.find(inv, O.state_children(state)) == Some{child} : Maybe<&2, O.Child>},
  selected: {O.advice_handoff_child(state, Some{child}, operation, input)
    == S.selected(state, Some{child}, operation, input) : O.Step}) -> {
  O.handoff_advice_checked(valid, state, inv, operation, input)
  == S.allowed(valid, state, inv, operation, input) : O.Step
}:
  match valid state:
    case False{} _: {==}
    case True{} O.State{_, _, _, _}:
      %Equal.sym(
        Maybe<&2, O.Child>,
        O.find(inv, O.state_children(state)),
        Some{child},
        found_right
      ) : {
        O.advice_handoff_child(state, O.find(inv, O.state_children(state)), operation, input)
        == S.selected(state, _, operation, input) : O.Step
      }
      %Equal.sym(Maybe<&2, O.Child>, O.find(inv, O.state_children(state)), Some{child}, found) : {
        O.advice_handoff_child(state, _, operation, input)
        == S.selected(state, Some{child}, operation, input) : O.Step
      }
      selected

def handoff_root_entry_exact(+canon: C.State, +next: Nat, +next_lease: Nat,
  +rest: List<&2, O.Child>, +context: O.EvaluationContext, +phase: O.Phase,
  +permission: O.EvaluationPermission, +held: Maybe<&2, O.Lease>, +custody: Nat,
  +origin: Nat, +inv: Nat, +epoch: Nat, +handle: Nat, +pending: Maybe<&2, Nat>,
  +ancestor: Maybe<&2, O.Parent>, +generation: Nat, +lease: Nat, +request: Nat,
  +operation: Nat, +input: Nat) -> {
    O.handoff_advice(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      operation,
      input
    )
    == S.handoff_evaluation(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      operation,
      input
    )
    : O.Step
  }:
  %Equal.sym(
    Bool,
    O.provider_live(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request
    ),
    S.permit(
      inv,
      generation,
      lease,
      request,
      O.find(
        inv,
        S.children(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{custody, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              ancestor
            } <> rest
          }
        )
      )
    ),
    permit_lookup_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      find_head_exact(
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        },
        rest
      ),
      find_head_exact(
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        },
        rest
      ),
      permit_root_found_exact(
        phase,
        pending,
        held,
        ancestor,
        canon,
        rest,
        custody,
        inv,
        epoch,
        context,
        permission,
        origin,
        handle,
        generation,
        lease,
        request
      )
    )
  ) : {
          O.handoff_advice_checked(
            _,
            O.State{
              canon,
              next,
              next_lease,
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                ancestor
              } <> rest
            },
            inv,
            operation,
            input
          )
          == S.allowed(
            S.permit(
              inv,
              generation,
              lease,
              request,
              O.find(
                inv,
                S.children(
                  O.State{
                    canon,
                    next,
                    next_lease,
                    O.Child{
                      O.EvaluationScope{custody, context, permission},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    } <> rest
                  }
                )
              )
            ),
            O.State{
              canon,
              next,
              next_lease,
              O.Child{
                O.EvaluationScope{custody, context, permission},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                ancestor
              } <> rest
            },
            inv,
            operation,
            input
          )
          : O.Step
        }
  handoff_checked_exact(
    S.permit(
      inv,
      generation,
      lease,
      request,
      O.find(
        inv,
        S.children(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationScope{custody, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              ancestor
            } <> rest
          }
        )
      )
    ),
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      } <> rest
    },
    inv,
    operation,
    input,
    O.Child{
      O.EvaluationScope{custody, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      ancestor
    },
    find_head_exact(
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationScope{custody, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      rest
    ),
    selected_root_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationScope{custody, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      context,
      phase,
      permission,
      held,
      custody,
      inv,
      epoch,
      handle,
      pending,
      ancestor,
      operation,
      input
    )
  )

def handoff_cleanup_entry_exact(+canon: C.State, +next: Nat, +next_lease: Nat,
  +rest: List<&2, O.Child>, +context: O.EvaluationContext, +phase: O.Phase,
  +permission: O.EvaluationPermission, +held: Maybe<&2, O.Lease>, +custody: Nat,
  +origin: Nat, +inv: Nat, +epoch: Nat, +handle: Nat, +pending: Maybe<&2, Nat>,
  +ancestor: Maybe<&2, O.Parent>, +generation: Nat, +lease: Nat, +request: Nat,
  +operation: Nat, +input: Nat) -> {
    O.handoff_advice(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      operation,
      input
    )
    == S.handoff_evaluation(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      operation,
      input
    )
    : O.Step
  }:
  %Equal.sym(
    Bool,
    O.provider_live(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request
    ),
    S.permit(
      inv,
      generation,
      lease,
      request,
      O.find(
        inv,
        S.children(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{custody, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              ancestor
            } <> rest
          }
        )
      )
    ),
    permit_lookup_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      inv,
      generation,
      lease,
      request,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      find_head_exact(
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        },
        rest
      ),
      find_head_exact(
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        },
        rest
      ),
      permit_cleanup_found_exact(
        phase,
        pending,
        held,
        ancestor,
        canon,
        rest,
        custody,
        inv,
        epoch,
        context,
        permission,
        origin,
        handle,
        generation,
        lease,
        request
      )
    )
  ) : {
          O.handoff_advice_checked(
            _,
            O.State{
              canon,
              next,
              next_lease,
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                ancestor
              } <> rest
            },
            inv,
            operation,
            input
          )
          == S.allowed(
            S.permit(
              inv,
              generation,
              lease,
              request,
              O.find(
                inv,
                S.children(
                  O.State{
                    canon,
                    next,
                    next_lease,
                    O.Child{
                      O.EvaluationCleanupScope{custody, origin, context, permission},
                      inv,
                      epoch,
                      handle,
                      phase,
                      pending,
                      held,
                      ancestor
                    } <> rest
                  }
                )
              )
            ),
            O.State{
              canon,
              next,
              next_lease,
              O.Child{
                O.EvaluationCleanupScope{custody, origin, context, permission},
                inv,
                epoch,
                handle,
                phase,
                pending,
                held,
                ancestor
              } <> rest
            },
            inv,
            operation,
            input
          )
          : O.Step
        }
  handoff_checked_exact(
    S.permit(
      inv,
      generation,
      lease,
      request,
      O.find(
        inv,
        S.children(
          O.State{
            canon,
            next,
            next_lease,
            O.Child{
              O.EvaluationCleanupScope{custody, origin, context, permission},
              inv,
              epoch,
              handle,
              phase,
              pending,
              held,
              ancestor
            } <> rest
          }
        )
      )
    ),
    O.State{
      canon,
      next,
      next_lease,
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      } <> rest
    },
    inv,
    operation,
    input,
    O.Child{
      O.EvaluationCleanupScope{custody, origin, context, permission},
      inv,
      epoch,
      handle,
      phase,
      pending,
      held,
      ancestor
    },
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      rest
    ),
    find_head_exact(
      O.Child{
        O.EvaluationCleanupScope{custody, origin, context, permission},
        inv,
        epoch,
        handle,
        phase,
        pending,
        held,
        ancestor
      },
      rest
    ),
    selected_cleanup_exact(
      O.State{
        canon,
        next,
        next_lease,
        O.Child{
          O.EvaluationCleanupScope{custody, origin, context, permission},
          inv,
          epoch,
          handle,
          phase,
          pending,
          held,
          ancestor
        } <> rest
      },
      context,
      phase,
      permission,
      held,
      custody,
      origin,
      inv,
      epoch,
      handle,
      pending,
      ancestor,
      operation,
      input
    )
  )

def main() -> Unit:
  Unit{}
