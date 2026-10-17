import Base
import ./CanonicalResolverOwner.bend as O
import ./EVALUATION_ADVICE_LAWS.bend as Laws
import ./EvaluationAdviceProof.bend as P

# Complete approved transfer law: exact public handoff and cancellation for both
# Evaluation scopes, arbitrary child tails, IDs and malformed prior states.
# Native atomic publication and shared reconciliation remain the law's explicit
# boundaries. Maintain with this API; transfer guarantees and delete on replacement.

def Laws.evaluation_advice_transfer_exact(state, context, custody_operation, origin,
  permission, invocation, epoch, handle, phase, pending, held_lease, ancestor,
  generation, lease, request, operation, input):
  match state:
    case O.State{canon, next, next_lease, rest}:
      (
        (
          P.handoff_root_entry_exact(canon, next, next_lease, rest, context, phase, permission,
            held_lease, custody_operation, origin, invocation, epoch, handle, pending, ancestor,
            generation, lease, request, operation, input),
          P.cancel_root_entry_exact(canon, next, next_lease, rest, context, phase, permission,
            held_lease, custody_operation, origin, invocation, epoch, handle, pending, ancestor)
        ),
        (
          P.handoff_cleanup_entry_exact(canon, next, next_lease, rest, context, phase, permission,
            held_lease, custody_operation, origin, invocation, epoch, handle, pending, ancestor,
            generation, lease, request, operation, input),
          P.cancel_cleanup_entry_exact(canon, next, next_lease, rest, context, phase, permission,
            held_lease, custody_operation, origin, invocation, epoch, handle, pending, ancestor)
        )
      )

def main() -> Unit:
  Unit{}
