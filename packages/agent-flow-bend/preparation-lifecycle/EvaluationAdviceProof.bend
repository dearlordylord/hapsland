import Base
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

def main() -> Unit:
  Unit{}
