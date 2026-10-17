import Base
import ./CanonicalResolverOwner.bend as O
import ./EvaluationAdviceSpecification.bend as S

# Owner approved 2026-10-17 ("нормально продолжай"); whole law not yet proved. One exact Evaluation -> Advice transfer.
# Exact live lease, EvaluationSettled, same operation, first matching PendingFinding
# and no prior claim determine birth: exact TailNew scope/origin/input/action and
# parent=None. Cleanup/wrong authority/duplicates refuse. Cancellation is composed
# with the same arbitrary remaining children; already-transferred tails have no
# dependency on the cancelled origin. Reuse existing tail guarantees after birth.
# Lookups, mechanical replacement and cross-family reconciliation are explicit
# common primitives; native pointer identity and atomic advice/receipt publication
# are real IO obligations. No arbitrary-state global allocator uniqueness claim.
# Maintain with this Owner API; transfer current guarantees and delete obsolete
# equations/specifications/proofs when replaced, including superseded TS shims.

def with_child(state: O.State, child: O.Child) -> O.State:
  match state:
    case O.State{canon, next, lease, rest}: O.State{canon, next, lease, child <> rest}

def transfer(+state: O.State, +child: O.Child, +invocation: Nat, +generation: Nat,
  +lease: Nat, +request: Nat, +operation: Nat, +input: Nat) -> Type:
  {
    O.handoff_advice(
      with_child(state, child),
      invocation,
      generation,
      lease,
      request,
      operation,
      input
    )
    == S.handoff_evaluation(
      with_child(state, child),
      invocation,
      generation,
      lease,
      request,
      operation,
      input
    )
    : O.Step
  }
  & { O.cancel(with_child(state, child), invocation)
    == S.cancel_evaluation(with_child(state, child), invocation) : O.Step }

law evaluation_advice_transfer_exact:
  for +state: O.State
  for +context: O.EvaluationContext
  for +custody_operation: Nat
  for +origin: Nat
  for +permission: O.EvaluationPermission
  for +invocation: Nat
  for +epoch: Nat
  for +handle: Nat
  for +phase: O.Phase
  for +pending: Maybe<&2, Nat>
  for +held_lease: Maybe<&2, O.Lease>
  for +ancestor: Maybe<&2, O.Parent>
  for +generation: Nat
  for +lease: Nat
  for +request: Nat
  for +operation: Nat
  for +input: Nat
  transfer(
    state,
    O.Child{
      O.EvaluationScope{custody_operation, context, permission},
      invocation,
      epoch,
      handle,
      phase,
      pending,
      held_lease,
      ancestor
    },
    invocation,
    generation,
    lease,
    request,
    operation,
    input
  )
  & transfer(
    state,
    O.Child{
      O.EvaluationCleanupScope{custody_operation, origin, context, permission},
      invocation,
      epoch,
      handle,
      phase,
      pending,
      held_lease,
      ancestor
    },
    invocation,
    generation,
    lease,
    request,
    operation,
    input
  )
