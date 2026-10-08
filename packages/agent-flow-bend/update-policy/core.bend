import Base

# Source-free update planning. Native owners retain payloads, identities and effects.
type Phase is Data:
  UpdateDiscovering{}
  UpdateTargeting{}
  UpdatePreviewing{}
  UpdateReview{}
  UpdateApproval{}
  UpdateApplying{}
  UpdateActivating{}
  UpdateDone{}
  UpdateCancelled{}

type Action is Data:
  UpdateDiscovered{}
  UpdateTargeted{}
  UpdateProposalPreviewed{}
  UpdateCurrentPreviewed{}
  UpdateFailedPreviewed{}
  UpdateBusyPreviewed{}
  UpdateIndeterminatePreviewed{}
  UpdateContinue{}
  UpdateApprove{}
  UpdateUpdatedObserved{}
  UpdateCurrentObserved{}
  UpdatePartialObserved{}
  UpdateBusyObserved{}
  UpdateIndeterminateObserved{}
  UpdateFailedObserved{}
  UpdateActivated{}
  UpdateBack{}
  UpdateExit{}

type Patch is Data:
  UpdateNoPatch{}
  UpdateDiscoveredPatch{}
  UpdatePreviewProposalPatch{}
  UpdatePreviewOutcomePatch{}
  UpdateCurrentPreviewPatch{}
  UpdateSkippedPatch{}
  UpdateBeginApplyPatch{}
  UpdateObservedApplyPatch{}
  UpdateObservedActivatePatch{}
  UpdateActivatedPreviewPatch{}
  UpdateActivatedApplyPatch{}

type Command is Data:
  UpdateDiscoverCommand{}
  UpdateTargetCommand{}
  UpdatePreviewCommand{}
  UpdateApplyCommand{}
  UpdateActivateCommand{}
  UpdateNoCommand{}

type Plan is Data:
  UpdateHold{}
  UpdateAdvance{phase: Phase, patch: Patch}

def command(phase: Phase, agent_present: Bool, digest_present: Bool) -> Command:
  match phase:
    case UpdateDiscovering{}: UpdateDiscoverCommand{}
    case UpdateTargeting{}: UpdateTargetCommand{}
    case UpdatePreviewing{}: Bool.pick(
      Command,
      agent_present,
      UpdatePreviewCommand{},
      UpdateNoCommand{}
    )
    case UpdateApplying{}: Bool.pick(
      Command,
      Bool.and(agent_present, digest_present),
      UpdateApplyCommand{},
      UpdateNoCommand{}
    )
    case UpdateActivating{}: Bool.pick(
      Command,
      agent_present,
      UpdateActivateCommand{},
      UpdateNoCommand{}
    )
    case _: UpdateNoCommand{}

def current_step(
  phase: Phase,
  action: Action,
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
) -> Plan:
  match phase action:
    case UpdateApproval{} UpdateBack{}: UpdateAdvance{UpdateReview{}, UpdateNoPatch{}}
    case UpdateReview{} UpdateExit{}: UpdateAdvance{UpdateCancelled{}, UpdateSkippedPatch{}}
    case UpdateApproval{} UpdateExit{}: UpdateAdvance{UpdateCancelled{}, UpdateSkippedPatch{}}
    case UpdateDiscovering{} UpdateDiscovered{}: Bool.pick(
      Plan,
      unique,
      UpdateAdvance{
        Bool.pick(Phase, nonempty, UpdateTargeting{}, UpdateDone{}),
        UpdateDiscoveredPatch{}
      },
      UpdateHold{}
    )
    case UpdateTargeting{} UpdateTargeted{}: UpdateAdvance{UpdatePreviewing{}, UpdateNoPatch{}}
    case UpdatePreviewing{} UpdateProposalPreviewed{}: Bool.pick(
      Plan,
      Bool.and(matched, valid_digest),
      UpdateAdvance{
        Bool.pick(
          Phase,
          more,
          UpdatePreviewing{},
          Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})
        ),
        UpdatePreviewProposalPatch{}
      },
      UpdateHold{}
    )
    case UpdatePreviewing{} UpdateCurrentPreviewed{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{UpdateActivating{}, UpdateCurrentPreviewPatch{}},
      UpdateHold{}
    )
    case UpdatePreviewing{} UpdateFailedPreviewed{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(
          Phase,
          more,
          UpdatePreviewing{},
          Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})
        ),
        UpdatePreviewOutcomePatch{}
      },
      UpdateHold{}
    )
    case UpdatePreviewing{} UpdateBusyPreviewed{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(
          Phase,
          more,
          UpdatePreviewing{},
          Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})
        ),
        UpdatePreviewOutcomePatch{}
      },
      UpdateHold{}
    )
    case UpdatePreviewing{} UpdateIndeterminatePreviewed{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(
          Phase,
          more,
          UpdatePreviewing{},
          Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})
        ),
        UpdatePreviewOutcomePatch{}
      },
      UpdateHold{}
    )
    case UpdateReview{} UpdateContinue{}: UpdateAdvance{UpdateApproval{}, UpdateNoPatch{}}
    case UpdateApproval{} UpdateApprove{}: Bool.pick(
      Plan,
      approvals_match,
      Bool.pick(
        Plan,
        yes,
        UpdateAdvance{UpdateApplying{}, UpdateBeginApplyPatch{}},
        UpdateAdvance{UpdateDone{}, UpdateSkippedPatch{}}
      ),
      UpdateHold{}
    )
    case UpdateApplying{} UpdateUpdatedObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{UpdateActivating{}, UpdateObservedActivatePatch{}},
      UpdateHold{}
    )
    case UpdateApplying{} UpdateCurrentObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{UpdateActivating{}, UpdateObservedActivatePatch{}},
      UpdateHold{}
    )
    case UpdateApplying{} UpdatePartialObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{UpdateActivating{}, UpdateObservedActivatePatch{}},
      UpdateHold{}
    )
    case UpdateApplying{} UpdateBusyObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(Phase, pending, UpdateApplying{}, UpdateDone{}),
        UpdateObservedApplyPatch{}
      },
      UpdateHold{}
    )
    case UpdateApplying{} UpdateIndeterminateObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(Phase, pending, UpdateApplying{}, UpdateDone{}),
        UpdateObservedApplyPatch{}
      },
      UpdateHold{}
    )
    case UpdateApplying{} UpdateFailedObserved{}: Bool.pick(
      Plan,
      matched,
      UpdateAdvance{
        Bool.pick(Phase, pending, UpdateApplying{}, UpdateDone{}),
        UpdateObservedApplyPatch{}
      },
      UpdateHold{}
    )
    case UpdateActivating{} UpdateActivated{}: Bool.pick(
      Plan,
      matched,
      Bool.pick(
        Plan,
        return_preview,
        UpdateAdvance{
          Bool.pick(
            Phase,
            more,
            UpdatePreviewing{},
            Bool.pick(Phase, proposals, UpdateReview{}, UpdateDone{})
          ),
          UpdateActivatedPreviewPatch{}
        },
        UpdateAdvance{
          Bool.pick(Phase, pending, UpdateApplying{}, UpdateDone{}),
          UpdateActivatedApplyPatch{}
        }
      ),
      UpdateHold{}
    )
    case _ _: UpdateHold{}

def step(
  phase: Phase,
  action: Action,
  current: Bool,
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
) -> Plan:
  Bool.pick(
    Plan,
    current,
    current_step(
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
    UpdateHold{}
  )
