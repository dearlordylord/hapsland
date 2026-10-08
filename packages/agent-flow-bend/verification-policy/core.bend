import Base

# Pure verification decisions. Keys, native identities and observations stay in the host.
type Phase is Data:
  VerifyLoading{}
  VerifyApproval{}
  VerifyChecking{}
  VerifyRecovery{}
  VerifyReplacementApproval{}
  VerifyEnteringKey{}
  VerifySavingKey{}
  VerifyDone{}
  VerifyCancelled{}

type Action is Data:
  VerifyLoadFailed{}
  VerifyLoaded{}
  VerifyApprove{}
  VerifyObserved{}
  VerifyRecheck{}
  VerifyReplace{}
  VerifyBack{}
  VerifyExit{}
  VerifyApproveReplacement{}
  VerifyEntered{}
  VerifyInputEnded{}
  VerifyStored{}

type Source is Data:
  VerifyMissingSource{}
  VerifySavedSource{}
  VerifyFileSource{}
  VerifyEnvironmentSource{}

type CheckResult is Data:
  VerifyAccepted{}
  VerifyRejected{}
  VerifyForbidden{}
  VerifyRateLimited{}
  VerifyUnconfirmed{}

type Patch is Data:
  VerifyNoPatch{}
  VerifyUnavailablePatch{}
  VerifyLoadedPatch{}
  VerifyAttemptPatch{}
  VerifyObservationPatch{}
  VerifyStoragePatch{}

type Plan is Data:
  VerifyHold{}
  VerifyAdvance{phase: Phase, patch: Patch}

type Command is Data:
  VerifyLoadCommand{}
  VerifyCheckCommand{}
  VerifyInputCommand{}
  VerifySaveCommand{}
  VerifyNoCommand{}

def max_checks() -> Nat:
  3n

def attempt_bucket(attempts: Nat) -> Nat:
  Nat.min(attempts, max_checks())

def command(phase: Phase) -> Command:
  match phase:
    case VerifyLoading{}: VerifyLoadCommand{}
    case VerifyChecking{}: VerifyCheckCommand{}
    case VerifyEnteringKey{}: VerifyInputCommand{}
    case VerifySavingKey{}: VerifySaveCommand{}
    case _: VerifyNoCommand{}

def source_present(source: Source) -> Bool:
  match source:
    case VerifyMissingSource{}: False{}
    case _: True{}

def source_saved(source: Source) -> Bool:
  match source:
    case VerifySavedSource{}: True{}
    case _: False{}

def source_replaceable(source: Source) -> Bool:
  match source:
    case VerifySavedSource{}: True{}
    case VerifyFileSource{}: True{}
    case _: False{}

def result_recoverable(result: CheckResult) -> Bool:
  match result:
    case VerifyRejected{}: True{}
    case VerifyForbidden{}: True{}
    case _: False{}

def current_step(phase: Phase, action: Action, attempts: Nat, +source: Source,
    ready: Bool, result: CheckResult, yes: Bool, stored: Bool) -> Plan:
  match phase action:
    case VerifyReplacementApproval{} VerifyBack{}: VerifyAdvance{VerifyRecovery{}, VerifyNoPatch{}}
    case VerifyApproval{} VerifyBack{}:
      Bool.pick(
        Plan,
        Nat.is_gt(attempts, 0n),
        VerifyAdvance{VerifyRecovery{}, VerifyNoPatch{}},
        VerifyHold{}
      )
    case VerifyApproval{} VerifyExit{}: VerifyAdvance{VerifyCancelled{}, VerifyNoPatch{}}
    case VerifyRecovery{} VerifyExit{}: VerifyAdvance{VerifyCancelled{}, VerifyNoPatch{}}
    case VerifyReplacementApproval{} VerifyExit{}: VerifyAdvance{VerifyCancelled{}, VerifyNoPatch{}}
    case VerifyLoading{} VerifyLoadFailed{}: VerifyAdvance{VerifyDone{}, VerifyUnavailablePatch{}}
    case VerifyLoading{} VerifyLoaded{}:
      VerifyAdvance{
        Bool.pick(
          Phase,
          Bool.and(ready, Nat.is_lt(attempts, max_checks())),
          VerifyApproval{},
          VerifyDone{}
        ),
        VerifyLoadedPatch{}
      }
    case VerifyApproval{} VerifyApprove{}:
      Bool.pick(
        Plan,
        Nat.is_lt(attempts, max_checks()),
        Bool.pick(
          Plan,
          yes,
          VerifyAdvance{VerifyChecking{}, VerifyAttemptPatch{}},
          VerifyAdvance{VerifyDone{}, VerifyNoPatch{}}
        ),
        VerifyHold{}
      )
    case VerifyChecking{} VerifyObserved{}:
      Bool.pick(
        Plan,
        source_present(source),
        VerifyAdvance{
          Bool.pick(
            Phase,
            Bool.and(
              result_recoverable(result),
              Bool.and(source_replaceable(source), Nat.is_lt(attempts, max_checks()))
            ),
            VerifyRecovery{},
            VerifyDone{}
          ),
          VerifyObservationPatch{}
        },
        VerifyHold{}
      )
    case VerifyRecovery{} VerifyRecheck{}: VerifyAdvance{VerifyLoading{}, VerifyNoPatch{}}
    case VerifyRecovery{} VerifyReplace{}:
      Bool.pick(
        Plan,
        source_saved(source),
        VerifyAdvance{VerifyReplacementApproval{}, VerifyNoPatch{}},
        VerifyHold{}
      )
    case VerifyReplacementApproval{} VerifyApproveReplacement{}:
      VerifyAdvance{Bool.pick(Phase, yes, VerifyEnteringKey{}, VerifyRecovery{}), VerifyNoPatch{}}
    case VerifyEnteringKey{} VerifyEntered{}: VerifyAdvance{VerifySavingKey{}, VerifyNoPatch{}}
    case VerifyEnteringKey{} VerifyInputEnded{}: VerifyAdvance{VerifyCancelled{}, VerifyNoPatch{}}
    case VerifySavingKey{} VerifyStored{}:
      VerifyAdvance{Bool.pick(Phase, stored, VerifyLoading{}, VerifyDone{}), VerifyStoragePatch{}}
    case _ _: VerifyHold{}

def step(phase: Phase, action: Action, current: Bool, attempts: Nat, source: Source,
    ready: Bool, result: CheckResult, yes: Bool, stored: Bool) -> Plan:
  Bool.pick(
    Plan,
    current,
    current_step(phase, action, attempts, source, ready, result, yes, stored),
    VerifyHold{}
  )
