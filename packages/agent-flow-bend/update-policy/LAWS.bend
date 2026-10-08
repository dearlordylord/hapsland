import Base
import ./core.bend as Core

# Approved by delegated Astra review on 2026-10-08; see update-law-approval.json.
def command_spec(phase: Core.Phase, agent_present: Bool, digest_present: Bool) -> Core.Command:
  match phase:
    case Core.UpdateDiscovering{}: Core.UpdateDiscoverCommand{}
    case Core.UpdateTargeting{}: Core.UpdateTargetCommand{}
    case Core.UpdatePreviewing{}: Bool.pick(
      Core.Command,
      agent_present,
      Core.UpdatePreviewCommand{},
      Core.UpdateNoCommand{}
    )
    case Core.UpdateApplying{}: Bool.pick(
      Core.Command,
      Bool.and(agent_present, digest_present),
      Core.UpdateApplyCommand{},
      Core.UpdateNoCommand{}
    )
    case Core.UpdateActivating{}: Bool.pick(
      Core.Command,
      agent_present,
      Core.UpdateActivateCommand{},
      Core.UpdateNoCommand{}
    )
    case _: Core.UpdateNoCommand{}

def transition_spec(
  phase: Core.Phase,
  action: Core.Action,
  unique: Bool,
  nonempty: Bool,
  matched: Bool,
  valid_digest: Bool,
  more: Bool,
  proposals: Bool,
  pending: Bool,
  approvals_match: Bool,
  yes: Bool,
  return_preview: Bool
) -> Core.Plan:
  match phase action:
    case Core.UpdateApproval{} Core.UpdateBack{}: Core.UpdateAdvance{
      Core.UpdateReview{},
      Core.UpdateNoPatch{}
    }
    case Core.UpdateReview{} Core.UpdateExit{}: Core.UpdateAdvance{
      Core.UpdateCancelled{},
      Core.UpdateSkippedPatch{}
    }
    case Core.UpdateApproval{} Core.UpdateExit{}: Core.UpdateAdvance{
      Core.UpdateCancelled{},
      Core.UpdateSkippedPatch{}
    }
    case Core.UpdateDiscovering{} Core.UpdateDiscovered{}: Bool.pick(
      Core.Plan,
      unique,
      Core.UpdateAdvance{
        Bool.pick(Core.Phase, nonempty, Core.UpdateTargeting{}, Core.UpdateDone{}),
        Core.UpdateDiscoveredPatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdateTargeting{} Core.UpdateTargeted{}: Core.UpdateAdvance{
      Core.UpdatePreviewing{},
      Core.UpdateNoPatch{}
    }
    case Core.UpdatePreviewing{} Core.UpdateProposalPreviewed{}: Bool.pick(
      Core.Plan,
      Bool.and(matched, valid_digest),
      Core.UpdateAdvance{
        Bool.pick(
          Core.Phase,
          more,
          Core.UpdatePreviewing{},
          Bool.pick(Core.Phase, proposals, Core.UpdateReview{}, Core.UpdateDone{})
        ),
        Core.UpdatePreviewProposalPatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdatePreviewing{} Core.UpdateCurrentPreviewed{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{Core.UpdateActivating{}, Core.UpdateCurrentPreviewPatch{}},
      Core.UpdateHold{}
    )
    case Core.UpdatePreviewing{} Core.UpdateFailedPreviewed{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(
          Core.Phase,
          more,
          Core.UpdatePreviewing{},
          Bool.pick(Core.Phase, proposals, Core.UpdateReview{}, Core.UpdateDone{})
        ),
        Core.UpdatePreviewOutcomePatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdatePreviewing{} Core.UpdateBusyPreviewed{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(
          Core.Phase,
          more,
          Core.UpdatePreviewing{},
          Bool.pick(Core.Phase, proposals, Core.UpdateReview{}, Core.UpdateDone{})
        ),
        Core.UpdatePreviewOutcomePatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdatePreviewing{} Core.UpdateIndeterminatePreviewed{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(
          Core.Phase,
          more,
          Core.UpdatePreviewing{},
          Bool.pick(Core.Phase, proposals, Core.UpdateReview{}, Core.UpdateDone{})
        ),
        Core.UpdatePreviewOutcomePatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdateReview{} Core.UpdateContinue{}: Core.UpdateAdvance{
      Core.UpdateApproval{},
      Core.UpdateNoPatch{}
    }
    case Core.UpdateApproval{} Core.UpdateApprove{}: Bool.pick(
      Core.Plan,
      approvals_match,
      Bool.pick(
        Core.Plan,
        yes,
        Core.UpdateAdvance{Core.UpdateApplying{}, Core.UpdateBeginApplyPatch{}},
        Core.UpdateAdvance{Core.UpdateDone{}, Core.UpdateSkippedPatch{}}
      ),
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdateUpdatedObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{Core.UpdateActivating{}, Core.UpdateObservedActivatePatch{}},
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdateCurrentObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{Core.UpdateActivating{}, Core.UpdateObservedActivatePatch{}},
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdatePartialObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{Core.UpdateActivating{}, Core.UpdateObservedActivatePatch{}},
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdateBusyObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(Core.Phase, pending, Core.UpdateApplying{}, Core.UpdateDone{}),
        Core.UpdateObservedApplyPatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdateIndeterminateObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(Core.Phase, pending, Core.UpdateApplying{}, Core.UpdateDone{}),
        Core.UpdateObservedApplyPatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdateApplying{} Core.UpdateFailedObserved{}: Bool.pick(
      Core.Plan,
      matched,
      Core.UpdateAdvance{
        Bool.pick(Core.Phase, pending, Core.UpdateApplying{}, Core.UpdateDone{}),
        Core.UpdateObservedApplyPatch{}
      },
      Core.UpdateHold{}
    )
    case Core.UpdateActivating{} Core.UpdateActivated{}: Bool.pick(
      Core.Plan,
      matched,
      Bool.pick(
        Core.Plan,
        return_preview,
        Core.UpdateAdvance{
          Bool.pick(
            Core.Phase,
            more,
            Core.UpdatePreviewing{},
            Bool.pick(Core.Phase, proposals, Core.UpdateReview{}, Core.UpdateDone{})
          ),
          Core.UpdateActivatedPreviewPatch{}
        },
        Core.UpdateAdvance{
          Bool.pick(Core.Phase, pending, Core.UpdateApplying{}, Core.UpdateDone{}),
          Core.UpdateActivatedApplyPatch{}
        }
      ),
      Core.UpdateHold{}
    )
    case _ _: Core.UpdateHold{}


# Exact commands prevent applying without a current agent and nonempty digest.
law command_exact:
  for +phase: Core.Phase
  for +agent_present: Bool
  for +digest_present: Bool
  {
    Core.command(phase, agent_present, digest_present)
    == command_spec(phase, agent_present, digest_present)
    : Core.Command
  }

# Exact transitions pin grouped consent, correlation, preview/apply continuation, activation, navigation and selected native patches.
law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +unique: Bool
  for +nonempty: Bool
  for +matched: Bool
  for +valid_digest: Bool
  for +more: Bool
  for +proposals: Bool
  for +pending: Bool
  for +approvals_match: Bool
  for +yes: Bool
  for +return_preview: Bool
  {
    Core.step(
      phase,
      action,
      current,
      unique,
      nonempty,
      matched,
      valid_digest,
      more,
      proposals,
      pending,
      approvals_match,
      yes,
      return_preview
    )
    == Bool.pick(
      Core.Plan,
      current,
      transition_spec(
        phase,
        action,
        unique,
        nonempty,
        matched,
        valid_digest,
        more,
        proposals,
        pending,
        approvals_match,
        yes,
        return_preview
      ),
      Core.UpdateHold{}
    )
    : Core.Plan
  }
