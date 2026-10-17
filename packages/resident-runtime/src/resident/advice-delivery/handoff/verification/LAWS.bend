import Base
import ../Handoff.bend as Handoff
import ./DeliveryTrace.bend as Trace
import ./DeliveryExecution.bend as Execution
import ./PrepareSpecification.bend as Specification

# DRAFT for owner approval: no proof bodies are authorized by this file.
# Temporary exact-correspondence checks for migration, not permanent product contracts.
# Cleanup: at whole delivery acceptance, move retained semantic properties to
# the delivery owner laws, then delete these internal-state equations/specs/proofs.
# Root, full Finalize/F/R and Canonical receipt laws remain separate obligations.

# Every reply tape preserves ordered local Prepare effects, exact final state
# and remaining replies; an exhausted Await is not successful completion.
law local_prepare_trace_exact:
  for +invocation: Nat
  for +advice: Bool
  for +replies: List<&2, Handoff.PReply>
  {
    Execution.run_prepare(replies, Handoff.prepare_initial(invocation, advice))
    == Specification.run_prepare(replies, Specification.prepare_spec_initial(invocation, advice))
    : Trace.PrepareTrace
  }

# IPC gate and barrier precede every Prepare, including an empty response.
law transport_prepare_trace_exact:
  for +invocation: Nat
  for +advice: Bool
  for +replies: List<&2, Handoff.PReply>
  {
    Execution.run_prepare(replies, Handoff.prepare_transport_initial(invocation, advice))
    == Specification.run_prepare(
      replies,
      Specification.prepare_spec_transport_initial(invocation, advice)
    )
    : Trace.PrepareTrace
  }

# A revalidation commit revises work/advice, preserves delivery-key order and
# duplicates, updates delivery and observes once; work refusal stops its suffix.
law revalidation_commit_trace_exact:
  for +invocation: Nat
  for +work: Bool
  for +replies: List<&2, Handoff.KReply>
  {
    Execution.run_commit(replies, Handoff.prepare_commit_initial(invocation, work))
    == Specification.run_commit(
      replies,
      Specification.prepare_spec_commit_initial(invocation, work)
    )
    : Trace.CommitTrace
  }

# Callbacks select the first matching eligible identity only if its partition
# owns the capture; absence stays distinct from a stale (false) validation.
law callback_member_exact:
  for +frame: Handoff.PFrame
  for +identity: Nat
  {
    Handoff.prepare_member(frame, identity)
    == Specification.prepare_spec_member(frame, identity)
    : Maybe<&2, Handoff.PItem>
  }

# Shared source capture keeps the first eligible root and original owner.
law callback_source_exact:
  for +frame: Handoff.PFrame
  for +root: Nat
  {
    Handoff.prepare_source(frame, root)
    == Specification.prepare_spec_source(frame, root)
    : Maybe<&2, Handoff.PItem>
  }

# Capture failure records the original partition without altering selected work.
law callback_unavailable_exact:
  for +frame: Handoff.PFrame
  for +partition: Nat
  {
    Handoff.prepare_unavailable(frame, partition)
    == Specification.prepare_spec_unavailable(frame, partition)
    : Handoff.PFrame
  }

# A prior allocation failure remains unavailable through later successful resizes.
law callback_capacity_exact:
  for +previous: Bool
  for +resized: Bool
  {
    Handoff.prepare_capacity(previous, resized)
    == Specification.prepare_spec_capacity(previous, resized)
    : Bool
  }

# Current commits, stale yields false, unavailable yields no result; a capacity
# refusal dominates all three statuses and never authorizes a commit.
law callback_validation_exact:
  for +unavailable: Bool
  for +validation: Handoff.PValidation
  {
    Handoff.prepare_validation(unavailable, validation)
    == Specification.prepare_spec_validation(unavailable, validation)
    : Handoff.PValidationRoute
  }

# Capture admission preserves the complete frame; refusal attributes its owner.
law callback_reservation_exact:
  for +resized: Bool
  for +frame: Handoff.PFrame
  for +partition: Nat
  {
    Handoff.prepare_reservation(resized, frame, partition)
    == Specification.prepare_spec_reservation(resized, frame, partition)
    : Handoff.PReservation
  }

def main() -> Unit:
  Unit{}
