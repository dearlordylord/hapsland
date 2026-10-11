import Base
import ./AttachmentTransactionContract.bend as Contract
import ./AttachmentFrameView.bend as V
import ./AttachmentPhaseView.bend as Phase
import ./AttachmentBoundaryView.bend as B
import ./ActualAttachmentPhaseProjection.bend as ActualReady
import ./ReferenceAttachmentPhaseProjection.bend as ReferenceReady
import ./ActualAttachmentFrameProjection.bend as ActualFrame
import ./AttachmentStagedReferenceProjection.bend as Staged
import ./ActualAttachmentBoundaryProjection.bend as ActualBoundary
import ./ReferenceAttachmentBoundaryProjection.bend as ReferenceBoundaryView
import ./AttachmentReferenceBoundary.bend as ReferenceBoundary
import ./AttachmentHistory.bend as History
import ../Types.bend as T
import ../State.bend as S
import ../Loop.bend as Loop
import ../Machine.bend as Machine
import ../Attach.bend as Attach
import ../Environment.bend as E
import ../ExpansionSpecification.bend as X
import ../ExpansionDriverSpecification.bend as D

# DRAFT: one complete attachment transaction, not a provider/scheduler law.
# Successful ready projections are internal relational premises to be derived
# from whole entry execution. External resolver inputs are not restricted here.
# No successful materialization, selected query or accepted reply is assumed.
# The existential conclusion requires real Some observations on both sides.
# Reply includes arbitrary correlation, variant, bytes and exception ownership.
# World already contains provider effects; this pure law neither creates those
# effects nor erases scheduler cancellation stutters between pure transitions.
law attachment_transaction_exact:
  for ~World: Data
  for +actual: T.ResolverState
  for +reference: D.State
  for +child: X.Child
  for +phase: Phase.Phase
  for +history: V.History
  for +child_history: Phase.ChildHistory
  for +previous: Nat
  for +reply: T.Reply
  for +world: E.WorldState<World>
  for actual_ready: {
    ActualReady.project(actual, history, child_history) == Some{phase} : Maybe<&2, Phase.Phase>
  }
  for reference_ready: {
    ReferenceReady.project(reference, child, history, child_history)
    == Some{phase}
    : Maybe<&2, Phase.Phase>
  }
  # Actual Attach.built_allowed installs plan_budget before measurement;
  # reference X.guarded/retain_budget establishes the same retained budget.
  # This exact internal coherence is derived at entry, never imposed on raw
  # ResolverInput or replaced with a partial Boolean map comparison.
  for budget_coherent: {
    Contract.phase_frame_budget(phase) == Contract.phase_child_budget(phase) : V.Budget
  }
  Contract.conclusion(World, actual, reference, child, phase, history, previous, reply, world)

def main() -> Unit:
  Unit{}
