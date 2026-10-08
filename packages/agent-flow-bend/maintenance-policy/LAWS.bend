import Base
import ./core.bend as Core

# Draft-time declaration: proposed laws awaiting Astra review; no proofs written then.
# Outcome: Astra approved both laws; see maintenance-law-approval.json.
def command_spec(
  phase: Core.Phase,
  agent_present: Bool,
  operation_present: Bool,
  digest_present: Bool
) -> Core.Command:
  match phase:
    case Core.MaintenanceDiscovering{}: Core.MaintenanceDiscoverCommand{}
    case Core.MaintenanceActivatingEmpty{}: Core.MaintenanceActivateEmptyCommand{}
    case Core.MaintenanceInspecting{}: Bool.pick(
      Core.Command,
      agent_present,
      Core.MaintenanceInspectCommand{},
      Core.MaintenanceNoCommand{}
    )
    case Core.MaintenanceActivating{}: Bool.pick(
      Core.Command,
      agent_present,
      Core.MaintenanceActivateCommand{},
      Core.MaintenanceNoCommand{}
    )
    case Core.MaintenancePreviewing{}: Bool.pick(
      Core.Command,
      Bool.and(agent_present, operation_present),
      Core.MaintenancePreviewCommand{},
      Core.MaintenanceNoCommand{}
    )
    case Core.MaintenanceApplying{}: Bool.pick(
      Core.Command,
      Bool.and(agent_present, Bool.and(operation_present, digest_present)),
      Core.MaintenanceApplyCommand{},
      Core.MaintenanceNoCommand{}
    )
    case _: Core.MaintenanceNoCommand{}

def next_phase(more: Bool) -> Core.Phase:
  Bool.pick(Core.Phase, more, Core.MaintenanceInspecting{}, Core.MaintenanceDone{})

def transition_spec(
  phase: Core.Phase,
  action: Core.Action,
  unique: Bool,
  nonempty: Bool,
  reinstall: Bool,
  valid_digest: Bool,
  digest_matches: Bool,
  yes: Bool,
  activate: Bool,
  more: Bool
) -> Core.Plan:
  match phase action:
    case Core.MaintenanceApproval{} Core.MaintenanceBack{}: Core.MaintenanceAdvance{
      Core.MaintenanceReview{},
      Core.MaintenanceNoPatch{}
    }
    case Core.MaintenanceReview{} Core.MaintenanceExit{}: Core.MaintenanceAdvance{
      Core.MaintenanceCancelled{},
      Core.MaintenanceSkipPendingPatch{}
    }
    case Core.MaintenanceApproval{} Core.MaintenanceExit{}: Core.MaintenanceAdvance{
      Core.MaintenanceCancelled{},
      Core.MaintenanceSkipPendingPatch{}
    }
    case Core.MaintenanceDiscovering{} Core.MaintenanceDiscovered{}: Bool.pick(
      Core.Plan,
      unique,
      Core.MaintenanceAdvance{
        Bool.pick(
          Core.Phase,
          nonempty,
          Core.MaintenanceInspecting{},
          Bool.pick(
            Core.Phase,
            reinstall,
            Core.MaintenanceActivatingEmpty{},
            Core.MaintenanceDone{}
          )
        ),
        Core.MaintenanceDiscoveredPatch{}
      },
      Core.MaintenanceHold{}
    )
    case Core.MaintenanceInspecting{} Core.MaintenanceFailed{}: Core.MaintenanceAdvance{
      next_phase(more),
      Core.MaintenanceFailedNextPatch{}
    }
    case Core.MaintenancePreviewing{} Core.MaintenanceFailed{}: Core.MaintenanceAdvance{
      next_phase(more),
      Core.MaintenanceFailedNextPatch{}
    }
    case Core.MaintenanceApplying{} Core.MaintenanceFailed{}: Core.MaintenanceAdvance{
      next_phase(more),
      Core.MaintenanceFailedNextPatch{}
    }
    case Core.MaintenanceInspecting{} Core.MaintenanceInspected{}: Core.MaintenanceAdvance{
      Core.MaintenancePreviewing{},
      Core.MaintenanceInspectedPatch{}
    }
    case Core.MaintenancePreviewing{} Core.MaintenanceProposalPreviewed{}: Bool.pick(
      Core.Plan,
      valid_digest,
      Core.MaintenanceAdvance{Core.MaintenanceReview{}, Core.MaintenanceDigestPatch{}},
      Core.MaintenanceHold{}
    )
    case Core.MaintenancePreviewing{} Core.MaintenanceOutcomePreviewed{}: Core.MaintenanceAdvance{
      next_phase(more),
      Core.MaintenanceOutcomeNextPatch{}
    }
    case Core.MaintenanceReview{} Core.MaintenanceContinue{}: Core.MaintenanceAdvance{
      Core.MaintenanceApproval{},
      Core.MaintenanceNoPatch{}
    }
    case Core.MaintenanceApproval{} Core.MaintenanceApprove{}: Bool.pick(
      Core.Plan,
      digest_matches,
      Bool.pick(
        Core.Plan,
        yes,
        Core.MaintenanceAdvance{Core.MaintenanceApplying{}, Core.MaintenanceNoPatch{}},
        Core.MaintenanceAdvance{next_phase(more), Core.MaintenanceSkippedNextPatch{}}
      ),
      Core.MaintenanceHold{}
    )
    case Core.MaintenanceApplying{} Core.MaintenanceObserved{}: Bool.pick(
      Core.Plan,
      activate,
      Core.MaintenanceAdvance{
        Core.MaintenanceActivating{},
        Core.MaintenanceObservedActivatePatch{}
      },
      Core.MaintenanceAdvance{next_phase(more), Core.MaintenanceObservedNextPatch{}}
    )
    case Core.MaintenanceActivating{} Core.MaintenanceActivated{}: Core.MaintenanceAdvance{
      next_phase(more),
      Core.MaintenanceActivatedNextPatch{}
    }
    case Core.MaintenanceActivatingEmpty{} Core.MaintenanceActivatedEmpty{}: Core.MaintenanceAdvance{
      Core.MaintenanceDone{},
      Core.MaintenanceEmptyActivationPatch{}
    }
    case _ _: Core.MaintenanceHold{}

law command_exact:
  for +phase: Core.Phase
  for +agent_present: Bool
  for +operation_present: Bool
  for +digest_present: Bool
  {
    Core.command(phase, agent_present, operation_present, digest_present)
    == command_spec(phase, agent_present, operation_present, digest_present)
    : Core.Command
  }

law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +unique: Bool
  for +nonempty: Bool
  for +reinstall: Bool
  for +valid_digest: Bool
  for +digest_matches: Bool
  for +yes: Bool
  for +activate: Bool
  for +more: Bool
  {
    Core.step(
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
    )
    == Bool.pick(
      Core.Plan,
      current,
      transition_spec(
        phase,
        action,
        unique,
        nonempty,
        reinstall,
        valid_digest,
        digest_matches,
        yes,
        activate,
        more
      ),
      Core.MaintenanceHold{}
    )
    : Core.Plan
  }
