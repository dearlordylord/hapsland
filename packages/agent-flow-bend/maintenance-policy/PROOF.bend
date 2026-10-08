import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

# ---- command_exact ----
def Laws.command_exact(phase, agent_present, operation_present, digest_present):
  match phase:
    case Core.MaintenanceDiscovering{}: {==}
    case Core.MaintenanceInspecting{}: {==}
    case Core.MaintenancePreviewing{}: {==}
    case Core.MaintenanceReview{}: {==}
    case Core.MaintenanceApproval{}: {==}
    case Core.MaintenanceApplying{}: {==}
    case Core.MaintenanceActivating{}: {==}
    case Core.MaintenanceActivatingEmpty{}: {==}
    case Core.MaintenanceDone{}: {==}
    case Core.MaintenanceCancelled{}: {==}

# ---- step_exact ----
def Laws.step_exact(
  phase,
  action,
  current,
  unique,
  nonempty,
  reinstall,
  valid_digest,
  digest_matches,
  yes,
  activate,
  more
):
  match phase action current:
    case Core.MaintenanceDiscovering{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceDiscovering{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceInspecting{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenancePreviewing{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceReview{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceApproval{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceApplying{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceActivating{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceDone{} Core.MaintenanceFailed{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceDiscovered{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceDiscovered{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceInspected{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceInspected{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceProposalPreviewed{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceProposalPreviewed{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceOutcomePreviewed{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceOutcomePreviewed{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceContinue{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceContinue{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceApprove{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceApprove{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceObserved{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceObserved{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceActivated{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceActivated{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceActivatedEmpty{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceActivatedEmpty{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceBack{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceBack{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceExit{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceExit{} True{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceFailed{} False{}: {==}
    case Core.MaintenanceCancelled{} Core.MaintenanceFailed{} True{}: {==}
