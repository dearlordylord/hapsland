import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.command_exact(phase):
  match phase:
    case Core.VerifyLoading{}: {==}
    case Core.VerifyApproval{}: {==}
    case Core.VerifyChecking{}: {==}
    case Core.VerifyRecovery{}: {==}
    case Core.VerifyReplacementApproval{}: {==}
    case Core.VerifyEnteringKey{}: {==}
    case Core.VerifySavingKey{}: {==}
    case Core.VerifyDone{}: {==}
    case Core.VerifyCancelled{}: {==}

def Laws.maximum_exact():
  {==}

def Laws.step_exact(phase, action, current, attempts, source, ready, result, yes, stored):
  match phase action current:
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} True{}:
      match source result:
        case Core.VerifyMissingSource{} Core.VerifyAccepted{}: {==}
        case Core.VerifyMissingSource{} Core.VerifyRejected{}: {==}
        case Core.VerifyMissingSource{} Core.VerifyForbidden{}: {==}
        case Core.VerifyMissingSource{} Core.VerifyRateLimited{}: {==}
        case Core.VerifyMissingSource{} Core.VerifyUnconfirmed{}: {==}
        case Core.VerifySavedSource{} Core.VerifyAccepted{}: {==}
        case Core.VerifySavedSource{} Core.VerifyRejected{}: {==}
        case Core.VerifySavedSource{} Core.VerifyForbidden{}: {==}
        case Core.VerifySavedSource{} Core.VerifyRateLimited{}: {==}
        case Core.VerifySavedSource{} Core.VerifyUnconfirmed{}: {==}
        case Core.VerifyFileSource{} Core.VerifyAccepted{}: {==}
        case Core.VerifyFileSource{} Core.VerifyRejected{}: {==}
        case Core.VerifyFileSource{} Core.VerifyForbidden{}: {==}
        case Core.VerifyFileSource{} Core.VerifyRateLimited{}: {==}
        case Core.VerifyFileSource{} Core.VerifyUnconfirmed{}: {==}
        case Core.VerifyEnvironmentSource{} Core.VerifyAccepted{}: {==}
        case Core.VerifyEnvironmentSource{} Core.VerifyRejected{}: {==}
        case Core.VerifyEnvironmentSource{} Core.VerifyForbidden{}: {==}
        case Core.VerifyEnvironmentSource{} Core.VerifyRateLimited{}: {==}
        case Core.VerifyEnvironmentSource{} Core.VerifyUnconfirmed{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} True{}:
      match source:
        case Core.VerifyMissingSource{}: {==}
        case Core.VerifySavedSource{}: {==}
        case Core.VerifyFileSource{}: {==}
        case Core.VerifyEnvironmentSource{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} True{}: {==}

def Laws.exhausted_cannot_check(extra, current, yes):
  match extra current:
    case Zero{} False{}: {==}
    case Zero{} True{}: {==}
    case Succ{rest} False{}: {==}
    case Succ{rest} True{}: {==}

def Laws.attempt_bucket_exact(attempts):
  {==}

def Laws.saturated_step_exact(phase, action, extra, current, source, ready, result, yes, stored):
  match phase action extra current:
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyLoading{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyApproval{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyChecking{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyRecovery{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyReplacementApproval{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyEnteringKey{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifySavingKey{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyDone{} Core.VerifyStored{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoadFailed{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyLoaded{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApprove{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyObserved{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyRecheck{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyReplace{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyBack{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyExit{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyApproveReplacement{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyEntered{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyInputEnded{} Succ{rest} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} Zero{} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} Zero{} True{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} Succ{rest} False{}: {==}
    case Core.VerifyCancelled{} Core.VerifyStored{} Succ{rest} True{}: {==}
