import Base
import ./core.bend as Core

# Approved by delegated Astra review on 2026-10-08. Installation-workflows.md limits
# guided verification to three separately approved checks; ADR 0004 owns consent.
def command_spec(phase: Core.Phase) -> Core.Command:
  match phase:
    case Core.VerifyLoading{}: Core.VerifyLoadCommand{}
    case Core.VerifyChecking{}: Core.VerifyCheckCommand{}
    case Core.VerifyEnteringKey{}: Core.VerifyInputCommand{}
    case Core.VerifySavingKey{}: Core.VerifySaveCommand{}
    case _: Core.VerifyNoCommand{}

law command_exact:
  for +phase: Core.Phase
  {Core.command(phase) == command_spec(phase) : Core.Command}

law maximum_exact:
  {Core.max_checks() == 3n : Nat}

def source_present(source: Core.Source) -> Bool:
  match source:
    case Core.VerifyMissingSource{}: False{}
    case _: True{}

def source_saved(source: Core.Source) -> Bool:
  match source:
    case Core.VerifySavedSource{}: True{}
    case _: False{}

def source_replaceable(source: Core.Source) -> Bool:
  match source:
    case Core.VerifySavedSource{}: True{}
    case Core.VerifyFileSource{}: True{}
    case _: False{}

def result_recoverable(result: Core.CheckResult) -> Bool:
  match result:
    case Core.VerifyRejected{}: True{}
    case Core.VerifyForbidden{}: True{}
    case _: False{}

def transition_spec(phase: Core.Phase, action: Core.Action, attempts: Nat, +source: Core.Source,
    ready: Bool, result: Core.CheckResult, yes: Bool, stored: Bool) -> Core.Plan:
  match phase action:
    case Core.VerifyReplacementApproval{} Core.VerifyBack{}: Core.VerifyAdvance{
      Core.VerifyRecovery{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyApproval{} Core.VerifyBack{}:
      Bool.pick(
        Core.Plan,
        Nat.is_gt(attempts, 0n),
        Core.VerifyAdvance{Core.VerifyRecovery{}, Core.VerifyNoPatch{}},
        Core.VerifyHold{}
      )
    case Core.VerifyApproval{} Core.VerifyExit{}: Core.VerifyAdvance{
      Core.VerifyCancelled{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyRecovery{} Core.VerifyExit{}: Core.VerifyAdvance{
      Core.VerifyCancelled{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyReplacementApproval{} Core.VerifyExit{}: Core.VerifyAdvance{
      Core.VerifyCancelled{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyLoading{} Core.VerifyLoadFailed{}: Core.VerifyAdvance{
      Core.VerifyDone{},
      Core.VerifyUnavailablePatch{}
    }
    case Core.VerifyLoading{} Core.VerifyLoaded{}:
      Core.VerifyAdvance{
        Bool.pick(
          Core.Phase,
          Bool.and(ready, Nat.is_lt(attempts, 3n)),
          Core.VerifyApproval{},
          Core.VerifyDone{}
        ),
        Core.VerifyLoadedPatch{}
      }
    case Core.VerifyApproval{} Core.VerifyApprove{}:
      Bool.pick(
        Core.Plan,
        Nat.is_lt(attempts, 3n),
        Bool.pick(
          Core.Plan,
          yes,
          Core.VerifyAdvance{Core.VerifyChecking{}, Core.VerifyAttemptPatch{}},
          Core.VerifyAdvance{Core.VerifyDone{}, Core.VerifyNoPatch{}}
        ),
        Core.VerifyHold{}
      )
    case Core.VerifyChecking{} Core.VerifyObserved{}:
      Bool.pick(
        Core.Plan,
        source_present(source),
        Core.VerifyAdvance{
          Bool.pick(
            Core.Phase,
            Bool.and(
              result_recoverable(result),
              Bool.and(source_replaceable(source), Nat.is_lt(attempts, 3n))
            ),
            Core.VerifyRecovery{},
            Core.VerifyDone{}
          ),
          Core.VerifyObservationPatch{}
        },
        Core.VerifyHold{}
      )
    case Core.VerifyRecovery{} Core.VerifyRecheck{}: Core.VerifyAdvance{
      Core.VerifyLoading{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyRecovery{} Core.VerifyReplace{}:
      Bool.pick(
        Core.Plan,
        source_saved(source),
        Core.VerifyAdvance{Core.VerifyReplacementApproval{}, Core.VerifyNoPatch{}},
        Core.VerifyHold{}
      )
    case Core.VerifyReplacementApproval{} Core.VerifyApproveReplacement{}:
      Core.VerifyAdvance{
        Bool.pick(Core.Phase, yes, Core.VerifyEnteringKey{}, Core.VerifyRecovery{}),
        Core.VerifyNoPatch{}
      }
    case Core.VerifyEnteringKey{} Core.VerifyEntered{}: Core.VerifyAdvance{
      Core.VerifySavingKey{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifyEnteringKey{} Core.VerifyInputEnded{}: Core.VerifyAdvance{
      Core.VerifyCancelled{},
      Core.VerifyNoPatch{}
    }
    case Core.VerifySavingKey{} Core.VerifyStored{}:
      Core.VerifyAdvance{
        Bool.pick(Core.Phase, stored, Core.VerifyLoading{}, Core.VerifyDone{}),
        Core.VerifyStoragePatch{}
      }
    case _ _: Core.VerifyHold{}

law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +attempts: Nat
  for +source: Core.Source
  for +ready: Bool
  for +result: Core.CheckResult
  for +yes: Bool
  for +stored: Bool
  {
    Core.step(phase, action, current, attempts, source, ready, result, yes, stored)
    == Bool.pick(
      Core.Plan,
      current,
      transition_spec(phase, action, attempts, source, ready, result, yes, stored),
      Core.VerifyHold{}
    )
    : Core.Plan
  }

# No count at or above three can authorize another paid check, even with Yes.
law exhausted_cannot_check:
  for +extra: Nat
  for +current: Bool
  for +yes: Bool
  {
    Core.step(
      Core.VerifyApproval{},
      Core.VerifyApprove{},
      current,
      (3n + extra : Nat),
      Core.VerifySavedSource{},
      True{},
      Core.VerifyRejected{},
      yes,
      True{}
    )
    == Core.VerifyHold{}
    : Core.Plan
  }

# Astra-approved finite specialization; native state and observations retain exact counts.
law attempt_bucket_exact:
  for +attempts: Nat
  {Core.attempt_bucket(attempts) == Nat.min(attempts, 3n) : Nat}

law saturated_step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +extra: Nat
  for +current: Bool
  for +source: Core.Source
  for +ready: Bool
  for +result: Core.CheckResult
  for +yes: Bool
  for +stored: Bool
  {Core.step(phase, action, current, (3n + extra : Nat), source, ready, result, yes, stored) ==
    Core.step(phase, action, current, 3n, source, ready, result, yes, stored) : Core.Plan}
