import Base
import ./CanonicalResolverOwner.bend as O
import ./DeliveryOwnerSpecification.bend as S

# Six statements approved by the owner on 2026-10-17 at ce04c4a1; proofs pending.
# Temporary exact correspondence: at whole delivery acceptance, move retained
# semantic properties to Canonical laws and delete these equations/specs/proofs.
# Exact pure lifecycle of the connected Collect -> Prepare -> Finalize family.
# Native pointer custody, cleanup retries, masking and physical lifetime checks
# remain real-consumer obligations; these equations pin the actions they execute.
# First-match lookup/state replacement/shared cross-family reconciliation are
# explicit common primitives of the specification, not independently proved here.

# Collection alone creates the root operation. Includes zero/occupied next IDs,
# all context fields, input identity, initial phase and exact Launch publication.
law collection_launch_exact:
  for +state: O.State
  for +context: O.DeliveryContext
  for +input: Nat
  {
    O.launch_collection(state, context, input)
    == S.launch_collection(state, context, input)
    : O.Step
  }

# Exact issued-stage authority, immutable receipt fields and one-shot claim.
# Changed/missing/cancelled/already-claimed receipts cannot issue another Launch.
law receipt_claim_exact:
  for +state: O.State
  for +receipt: O.DeliveryReceipt
  { O.claim_delivery(state, receipt) == S.claim_delivery(state, receipt) : O.Step }

# Includes empty selection, preservation of Collect's selection through Prepare,
# generation/phase/lease refusals, successor publication and final AcceptResult.
# No arbitrary-State uniqueness claim: successor IDs follow the stored counter.
law delivery_completion_exact:
  for +state: O.State
  for +invocation: Nat
  for +generation: Nat
  for +result: Nat
  for +selection: O.DeliverySelection
  {
    O.complete_delivery(state, invocation, generation, result, selection)
    == S.complete_delivery(state, invocation, generation, result, selection)
    : O.Step
  }

# Neither the generic launch nor generic terminal entry can bypass the family.
# The explicit head is the selected child; its tail/canonical state are arbitrary.
law delivery_no_bypass:
  for +state: O.State
  for +operation: Nat
  for +origin: Nat
  for +context: O.DeliveryContext
  for +permission: O.DeliveryPermission
  for +input: Nat
  for +invocation: Nat
  for +generation: Nat
  for +handle: Nat
  for +phase: O.Phase
  for +pending: Maybe<&2, Nat>
  for +lease: Maybe<&2, O.Lease>
  for +parent: Maybe<&2, O.Parent>
  for +attempt_generation: Nat
  for +result: Nat
  {
    O.launch(state, O.DeliveryScope{operation, origin, context, permission, input}, handle)
    == O.Rejected{state, O.NotPreparing{}} : O.Step
  } & {
    O.terminal(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation,
      attempt_generation,
      result
    )
    == O.Rejected{
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.WrongPhase{}
    }
    : O.Step
  }

# Entire delivery child provider cycle: install -> lease issuance -> live permit
# -> resume/cleanup. Includes issued-but-unclaimed stages, stale generations,
# pending/request/lease mismatches, cancelled children and malformed parents.
# Exact equations retain current semantics: completion correlates its lease and
# request; generation is fenced by install/permit, not an invented completion arg.
law delivery_provider_cycle_exact:
  for +state: O.State
  for +operation: Nat
  for +origin: Nat
  for +context: O.DeliveryContext
  for +permission: O.DeliveryPermission
  for +input: Nat
  for +invocation: Nat
  for +generation: Nat
  for +handle: Nat
  for +phase: O.Phase
  for +pending: Maybe<&2, Nat>
  for +lease: Maybe<&2, O.Lease>
  for +parent: Maybe<&2, O.Parent>
  for +attempt_generation: Nat
  for +new_handle: Nat
  for +request: Nat
  for +lease_id: Nat
  for +reply: Nat
  {
    O.install(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation,
      attempt_generation,
      new_handle,
      request
    )
    == S.install_delivery(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      attempt_generation,
      new_handle,
      request
    )
    : O.Step
  } & {
    O.provider_start(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation
    )
    == S.provider_start(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : O.Step
  } & {
    O.provider_live(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation,
      attempt_generation,
      lease_id,
      request
    )
    == S.provider_live(
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      invocation,
      attempt_generation,
      lease_id,
      request
    )
    : Bool
  } & {
    O.provider_completed(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation,
      lease_id,
      request,
      reply
    )
    == S.provider_completed(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      },
      lease_id,
      request,
      reply
    )
    : O.Step
  }

# Cancellation retains an outstanding lease for its cleanup and retires the
# current handle. Non-active cancellation refuses; shared invalidation runs
# after this exact local action, including when the child was only issued.
law delivery_cancellation_exact:
  for +state: O.State
  for +operation: Nat
  for +origin: Nat
  for +context: O.DeliveryContext
  for +permission: O.DeliveryPermission
  for +input: Nat
  for +invocation: Nat
  for +generation: Nat
  for +handle: Nat
  for +phase: O.Phase
  for +pending: Maybe<&2, Nat>
  for +lease: Maybe<&2, O.Lease>
  for +parent: Maybe<&2, O.Parent>
  {
    O.cancel(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      invocation
    )
    == S.cancel_delivery(
      S.state_with(
        state,
        O.Child{
          O.DeliveryScope{operation, origin, context, permission, input},
          invocation,
          generation,
          handle,
          phase,
          pending,
          lease,
          parent
        }
      ),
      O.Child{
        O.DeliveryScope{operation, origin, context, permission, input},
        invocation,
        generation,
        handle,
        phase,
        pending,
        lease,
        parent
      }
    )
    : O.Step
  }

def main() -> Unit:
  Unit{}
