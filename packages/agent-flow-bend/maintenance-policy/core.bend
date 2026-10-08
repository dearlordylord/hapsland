import Base

# Source-free maintenance decisions; native owners retain payloads, identities and effects.
type Phase is Data:
  MaintenanceDiscovering{}
  MaintenanceInspecting{}
  MaintenancePreviewing{}
  MaintenanceReview{}
  MaintenanceApproval{}
  MaintenanceApplying{}
  MaintenanceActivating{}
  MaintenanceActivatingEmpty{}
  MaintenanceDone{}
  MaintenanceCancelled{}

type Action is Data:
  MaintenanceDiscovered{}
  MaintenanceInspected{}
  MaintenanceProposalPreviewed{}
  MaintenanceOutcomePreviewed{}
  MaintenanceContinue{}
  MaintenanceApprove{}
  MaintenanceObserved{}
  MaintenanceActivated{}
  MaintenanceActivatedEmpty{}
  MaintenanceBack{}
  MaintenanceExit{}
  MaintenanceFailed{}

type Patch is Data:
  MaintenanceNoPatch{}
  MaintenanceDiscoveredPatch{}
  MaintenanceInspectedPatch{}
  MaintenanceDigestPatch{}
  MaintenanceOutcomeNextPatch{}
  MaintenanceSkippedNextPatch{}
  MaintenanceObservedActivatePatch{}
  MaintenanceObservedNextPatch{}
  MaintenanceActivatedNextPatch{}
  MaintenanceEmptyActivationPatch{}
  MaintenanceSkipPendingPatch{}
  MaintenanceFailedNextPatch{}

type Command is Data:
  MaintenanceDiscoverCommand{}
  MaintenanceInspectCommand{}
  MaintenancePreviewCommand{}
  MaintenanceApplyCommand{}
  MaintenanceActivateCommand{}
  MaintenanceActivateEmptyCommand{}
  MaintenanceNoCommand{}

type Plan is Data:
  MaintenanceHold{}
  MaintenanceAdvance{phase: Phase, patch: Patch}

def command(
  phase: Phase,
  agent_present: Bool,
  operation_present: Bool,
  digest_present: Bool
) -> Command:
  match phase:
    case MaintenanceDiscovering{}: MaintenanceDiscoverCommand{}
    case MaintenanceActivatingEmpty{}: MaintenanceActivateEmptyCommand{}
    case MaintenanceInspecting{}: Bool.pick(
      Command,
      agent_present,
      MaintenanceInspectCommand{},
      MaintenanceNoCommand{}
    )
    case MaintenanceActivating{}: Bool.pick(
      Command,
      agent_present,
      MaintenanceActivateCommand{},
      MaintenanceNoCommand{}
    )
    case MaintenancePreviewing{}: Bool.pick(
      Command,
      Bool.and(agent_present, operation_present),
      MaintenancePreviewCommand{},
      MaintenanceNoCommand{}
    )
    case MaintenanceApplying{}: Bool.pick(
      Command,
      Bool.and(agent_present, Bool.and(operation_present, digest_present)),
      MaintenanceApplyCommand{},
      MaintenanceNoCommand{}
    )
    case _: MaintenanceNoCommand{}

def next_phase(more: Bool) -> Phase:
  Bool.pick(Phase, more, MaintenanceInspecting{}, MaintenanceDone{})

def current_step(
  phase: Phase,
  action: Action,
  unique: Bool,
  nonempty: Bool,
  reinstall: Bool,
  valid_digest: Bool,
  digest_matches: Bool,
  yes: Bool,
  activate: Bool,
  more: Bool
) -> Plan:
  match phase action:
    case MaintenanceApproval{} MaintenanceBack{}: MaintenanceAdvance{
      MaintenanceReview{},
      MaintenanceNoPatch{}
    }
    case MaintenanceReview{} MaintenanceExit{}: MaintenanceAdvance{
      MaintenanceCancelled{},
      MaintenanceSkipPendingPatch{}
    }
    case MaintenanceApproval{} MaintenanceExit{}: MaintenanceAdvance{
      MaintenanceCancelled{},
      MaintenanceSkipPendingPatch{}
    }
    case MaintenanceDiscovering{} MaintenanceDiscovered{}: Bool.pick(
      Plan,
      unique,
      MaintenanceAdvance{
        Bool.pick(
          Phase,
          nonempty,
          MaintenanceInspecting{},
          Bool.pick(Phase, reinstall, MaintenanceActivatingEmpty{}, MaintenanceDone{})
        ),
        MaintenanceDiscoveredPatch{}
      },
      MaintenanceHold{}
    )
    case MaintenanceInspecting{} MaintenanceFailed{}: MaintenanceAdvance{
      next_phase(more),
      MaintenanceFailedNextPatch{}
    }
    case MaintenancePreviewing{} MaintenanceFailed{}: MaintenanceAdvance{
      next_phase(more),
      MaintenanceFailedNextPatch{}
    }
    case MaintenanceApplying{} MaintenanceFailed{}: MaintenanceAdvance{
      next_phase(more),
      MaintenanceFailedNextPatch{}
    }
    case MaintenanceInspecting{} MaintenanceInspected{}: MaintenanceAdvance{
      MaintenancePreviewing{},
      MaintenanceInspectedPatch{}
    }
    case MaintenancePreviewing{} MaintenanceProposalPreviewed{}: Bool.pick(
      Plan,
      valid_digest,
      MaintenanceAdvance{MaintenanceReview{}, MaintenanceDigestPatch{}},
      MaintenanceHold{}
    )
    case MaintenancePreviewing{} MaintenanceOutcomePreviewed{}: MaintenanceAdvance{
      next_phase(more),
      MaintenanceOutcomeNextPatch{}
    }
    case MaintenanceReview{} MaintenanceContinue{}: MaintenanceAdvance{
      MaintenanceApproval{},
      MaintenanceNoPatch{}
    }
    case MaintenanceApproval{} MaintenanceApprove{}: Bool.pick(
      Plan,
      digest_matches,
      Bool.pick(
        Plan,
        yes,
        MaintenanceAdvance{MaintenanceApplying{}, MaintenanceNoPatch{}},
        MaintenanceAdvance{next_phase(more), MaintenanceSkippedNextPatch{}}
      ),
      MaintenanceHold{}
    )
    case MaintenanceApplying{} MaintenanceObserved{}: Bool.pick(
      Plan,
      activate,
      MaintenanceAdvance{MaintenanceActivating{}, MaintenanceObservedActivatePatch{}},
      MaintenanceAdvance{next_phase(more), MaintenanceObservedNextPatch{}}
    )
    case MaintenanceActivating{} MaintenanceActivated{}: MaintenanceAdvance{
      next_phase(more),
      MaintenanceActivatedNextPatch{}
    }
    case MaintenanceActivatingEmpty{} MaintenanceActivatedEmpty{}: MaintenanceAdvance{
      MaintenanceDone{},
      MaintenanceEmptyActivationPatch{}
    }
    case _ _: MaintenanceHold{}

def step(
  phase: Phase,
  action: Action,
  current: Bool,
  unique: Bool,
  nonempty: Bool,
  reinstall: Bool,
  valid_digest: Bool,
  digest_matches: Bool,
  yes: Bool,
  activate: Bool,
  more: Bool
) -> Plan:
  Bool.pick(
    Plan,
    current,
    current_step(
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
    MaintenanceHold{}
  )
