import Base
import ../CollectionHandoff.bend as Root
import ../Handoff.bend as Handoff
import ./DeliveryTrace.bend as Trace
import ./DeliveryExecution.bend as Execution
import ./RootSpecification.bend as RootSpec
import ./FinalizeSpecification.bend as FinalSpec

# DRAFT whole-flow laws for owner review; no proofs are claimed or authorized.
# Native IO/physical identity/cleanup and Canonical receipt custody retain their
# own obligations. Ordered requests include nested Collection/F/R commands.
# Root events additionally preserve the exact atomic-group boundary.

# A request preserves gate expiry/discard/allow order, both Collection passes,
# eligibility/fitting/handoff effects, response decode, reservation and report.
law request_trace_exact:
  for +invocation: Nat
  for +input: Root.RootInput
  for +replies: List<&2, Root.RootReply>
  {
    Execution.run_root(replies, Root.initial(invocation, input))
    == RootSpec.run_root(replies, RootSpec.root_spec_initial(invocation, input))
    : Trace.RootTrace
  }

# Local/direct collection retains the same complete Collection algorithm while
# decoding directly, without introducing transport finish/report effects.
law direct_trace_exact:
  for +invocation: Nat
  for +composed: Bool
  for +turn_end: Bool
  for +replies: List<&2, Root.RootReply>
  {
    Execution.run_root(replies, Root.direct_initial(invocation, composed, turn_end))
    == RootSpec.run_root(replies, RootSpec.root_spec_direct_initial(invocation, composed, turn_end))
    : Trace.RootTrace
  }

# Every finite edit observation tape preserves fresh passes, partition matching,
# expiry short-circuit and polling. Await/timeout/lost/empty stay distinct.
# This is not a promise that arbitrary external work eventually completes.
law edit_trace_exact:
  for +invocation: Nat
  for +partition: String
  for +replies: List<&2, Root.RootReply>
  {
    Execution.run_root(replies, Root.edit_initial(invocation, partition))
    == RootSpec.run_root(replies, RootSpec.root_spec_edit_initial(invocation, partition))
    : Trace.RootTrace
  }

# Final status shares the edit predicate but cannot acquire polling, start a new
# pass, or accept an edit timeout/lost response in a non-polling status phase.
law status_trace_exact:
  for +invocation: Nat
  for +partition: String
  for +replies: List<&2, Root.RootReply>
  {
    Execution.run_root(replies, Root.status_initial(invocation, partition))
    == RootSpec.run_root(replies, RootSpec.root_spec_status_initial(invocation, partition))
    : Trace.RootTrace
  }

# F authorization, refitting, contents-before-findings, response decode and
# transport canWrite/R reconciliation form one exact ordered finalization.
law finalization_trace_exact:
  for +invocation: Nat
  for +transport: Bool
  for +input: Handoff.FInput
  for +replies: List<&2, Handoff.DReply>
  {
    Execution.run_finalize(replies, Handoff.delivery_finalize_initial(invocation, transport, input))
    == FinalSpec.run_finalize(
      replies,
      FinalSpec.delivery_finalize_spec_initial(invocation, transport, input)
    )
    : Trace.FinalizeTrace
  }

# Provisional finish reservation preserves selection/binding and all refusal
# branches; terminal replies remain unused rather than creating another effect.
law finish_reservation_trace_exact:
  for +invocation: Nat
  for +input: Handoff.RInput
  for +replies: List<&2, Handoff.RReply>
  {
    Execution.run_reconcile(replies, Handoff.reserve_finish_initial(invocation, input))
    == FinalSpec.run_reconcile(replies, FinalSpec.reserve_finish_spec_initial(invocation, input))
    : Trace.ReconcileTrace
  }

def main() -> Unit:
  Unit{}
