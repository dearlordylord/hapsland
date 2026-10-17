import Base
import ./CanonicalResolverOwner.bend as O
import ./EvaluationOwnerSpecification.bend as S
import ../Canonical.bend as C

# Owner approved 2026-10-17 ("нормально продолжай"); whole law not yet proved. One complete ownership contract.
# Exact public state/outputs/actions/refusals for Evaluation, Dispatch and cleanup.
# Canonical step, first-match lookups, mechanical replacement, bounded generic
# parent ancestry and non-Evaluation invalidation are explicitly shared; this
# does not prove those primitives, native IO/drain/Cause or pointer custody.
# Evaluation invalidation, lease/parent/request/permission decisions are independent.
# No arbitrary-state global allocator uniqueness: use the stored counter exactly.
# Generic terminal intentionally accepts ordinary EvaluationSettled; cleanup and
# Dispatch cannot bypass specialized completion. Cleanup forbids clear/finding;
# other cleanup settlements force current=False even if the input says True.
# Maintain with this Owner API; transfer current lifecycle guarantees and delete
# obsolete equations/specifications/proofs on replacement, including TS shims.

# Assertion abbreviations only, not additional laws, state types or a new runner.
# Each family is placed first; the original arbitrary tail (including duplicate
# IDs, malformed ancestors and unrelated families) is preserved.
def with_child(state: O.State, child: O.Child) -> O.State:
  match state:
    case O.State{canon, next, lease, rest}: O.State{canon, next, lease, child <> rest}

def child_scope(child: O.Child) -> O.Scope:
  match child:
    case O.Child{scope, _, _, _, _, _, _, _}: scope

def family_cycle(
  +state: O.State,
  +child: O.Child,
  +invocation: Nat,
  +generation: Nat,
  +lease: Nat,
  +request: Nat,
  +handle: Nat,
  +reply: Nat,
  +prior_outputs: List<&2, C.Output>,
  +prior_actions: List<&2, O.Action>
) -> Type:
  { O.install(with_child(state, child), invocation, generation, handle, request)
    == S.install(with_child(state, child), invocation, generation, handle, request) : O.Step }
  & { O.provider_start(with_child(state, child), invocation)
    == S.provider_start(with_child(state, child), invocation) : O.Step }
  & { O.provider_live(with_child(state, child), invocation, generation, lease, request)
    == S.provider_live(with_child(state, child), invocation, generation, lease, request) : Bool }
  & { O.provider_completed(with_child(state, child), invocation, lease, request, reply)
    == S.provider_completed(with_child(state, child), invocation, lease, request, reply) : O.Step }
  & { O.cancel(with_child(state, child), invocation)
    == S.cancel(with_child(state, child), invocation) : O.Step }
  & { O.terminal(with_child(state, child), invocation, generation, reply)
    == S.terminal(with_child(state, child), invocation, generation, reply) : O.Step }
  & { O.launch(with_child(state, child), child_scope(child), handle)
    == S.launch(with_child(state, child), child_scope(child), handle) : O.Step }
  & {
    O.launch_nested(with_child(state, child), O.Parent{invocation, generation, request}, handle)
    == S.launch_nested(with_child(state, child), O.Parent{invocation, generation, request}, handle)
    : O.Step
  }
  & { O.child_live(S.canonical(state), S.children(with_child(state, child)), child)
    == S.live(with_child(state, child), child) : Bool }
  & { O.invalidate(S.canonical(state), S.children(with_child(state, child)), child)
    == S.invalidate(with_child(state, child), child) : O.ChildUpdate }
  & { O.reconcile_cancel(O.Advanced{with_child(state, child), prior_outputs, prior_actions})
    == S.reconcile(O.Advanced{with_child(state, child), prior_outputs, prior_actions}) : O.Step }

# All specialized entries quantify over arbitrary complete State, not only a
# pre-selected child. This includes unknown IDs, wrong scope and all refusals.
def specific_entries(+state: O.State, +context: O.EvaluationContext, +parent: O.Parent,
  +invocation: Nat, +generation: Nat, +lease: Nat, +request: Nat,
  +handle: Nat, +result: Nat, +facts: O.EvaluationFacts, +outcome: C.RequestOutcome,
  +current: Bool, +success: Bool, +origin: Nat) -> Type:
  {
    O.launch_evaluation(state, context, handle)
    == S.launch_evaluation(state, context, handle)
    : O.Step
  }
  & { O.evaluation_ready(state, invocation, generation, lease, request, facts)
    == S.evaluation_ready(state, invocation, generation, lease, request, facts) : O.Step }
  & { O.install_evaluation_provider(state, invocation, generation, handle, request)
    == S.install_evaluation_provider(state, invocation, generation, handle, request) : O.Step }
  & { O.launch_evaluation_dispatch(state, parent, handle)
    == S.launch_evaluation_dispatch(state, parent, handle) : O.Step }
  & { O.evaluation_start_request(state, invocation, generation, lease, request)
    == S.evaluation_start_request(state, invocation, generation, lease, request) : O.Step }
  & { O.complete_evaluation_dispatch(state, invocation, generation, result, success)
    == S.complete_evaluation_dispatch(state, invocation, generation, result, success) : O.Step }
  & {
    O.evaluation_settle(state, invocation, generation, lease, request, outcome, current)
    == S.evaluation_settle(state, invocation, generation, lease, request, outcome, current)
    : O.Step
  }
  & { O.launch_evaluation_cleanup(state, origin, handle)
    == S.launch_evaluation_cleanup(state, origin, handle) : O.Step }
  & { O.complete_evaluation(state, invocation, generation, result)
    == S.complete_evaluation(state, invocation, generation, result) : O.Step }

law evaluation_owner_exact:
  for +state: O.State
  for +context: O.EvaluationContext
  for +parent: O.Parent
  for +operation: Nat
  for +origin: Nat
  for +permission: O.EvaluationPermission
  for +jev: Nat
  for +invocation: Nat
  for +epoch: Nat
  for +old_handle: Nat
  for +phase: O.Phase
  for +pending: Maybe<&2, Nat>
  for +held_lease: Maybe<&2, O.Lease>
  for +ancestor: Maybe<&2, O.Parent>
  for +generation: Nat
  for +lease: Nat
  for +request: Nat
  for +handle: Nat
  for +result: Nat
  for +facts: O.EvaluationFacts
  for +outcome: C.RequestOutcome
  for +current: Bool
  for +success: Bool
  for +prior_outputs: List<&2, C.Output>
  for +prior_actions: List<&2, O.Action>
  specific_entries(
    state,
    context,
    parent,
    invocation,
    generation,
    lease,
    request,
    handle,
    result,
    facts,
    outcome,
    current,
    success,
    origin
  )
  & family_cycle(
    state,
    O.Child{
      O.EvaluationScope{operation, context, permission},
      invocation,
      epoch,
      old_handle,
      phase,
      pending,
      held_lease,
      ancestor
    },
    invocation,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  )
  & family_cycle(
    state,
    O.Child{
      O.EvaluationCleanupScope{operation, origin, context, permission},
      invocation,
      epoch,
      old_handle,
      phase,
      pending,
      held_lease,
      ancestor
    },
    invocation,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  )
  & family_cycle(
    state,
    O.Child{
      O.EvaluationDispatchScope{operation, context, jev},
      invocation,
      epoch,
      old_handle,
      phase,
      pending,
      held_lease,
      ancestor
    },
    invocation,
    generation,
    lease,
    request,
    handle,
    result,
    prior_outputs,
    prior_actions
  )
