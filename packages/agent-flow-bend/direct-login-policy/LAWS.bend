import Base
import ./core.bend as Core

# Approved as written by delegated Astra on 2026-10-08. Installation-workflows.md owns direct
# credential-stdin automation; ADR 0004 owns safe models and Effect interpreters.
def command_spec(phase: Core.Phase) -> Core.Command:
  match phase:
    case Core.DirectLoginCheckingStore{}: Core.DirectLoginProbe{}
    case Core.DirectLoginEnteringKey{}: Core.DirectLoginInput{}
    case Core.DirectLoginSavingKey{}: Core.DirectLoginSave{}
    case Core.DirectLoginDone{}: Core.DirectLoginNoCommand{}
    case Core.DirectLoginCancelled{}: Core.DirectLoginNoCommand{}

law command_exact:
  for +phase: Core.Phase
  {Core.command(phase) == command_spec(phase) : Core.Command}

def checking_spec(action: Core.Action, available: Bool) -> Core.Plan:
  match action:
    case Core.DirectLoginChecked{}:
      Bool.pick(Core.Plan, available,
        Core.DirectLoginAdvance{Core.DirectLoginEnteringKey{}, Core.DirectLoginAvailabilityPatch{}},
        Core.DirectLoginAdvance{Core.DirectLoginDone{}, Core.DirectLoginAvailabilityPatch{}})
    case Core.DirectLoginExit{}:
      Core.DirectLoginAdvance{Core.DirectLoginCancelled{}, Core.DirectLoginNoPatch{}}
    case _: Core.DirectLoginHold{}

def entering_spec(action: Core.Action) -> Core.Plan:
  match action:
    case Core.DirectLoginEntered{}:
      Core.DirectLoginAdvance{Core.DirectLoginSavingKey{}, Core.DirectLoginNoPatch{}}
    case Core.DirectLoginInputEnded{}:
      Core.DirectLoginAdvance{Core.DirectLoginCancelled{}, Core.DirectLoginNoPatch{}}
    case Core.DirectLoginExit{}:
      Core.DirectLoginAdvance{Core.DirectLoginCancelled{}, Core.DirectLoginNoPatch{}}
    case _: Core.DirectLoginHold{}

def saving_spec(action: Core.Action) -> Core.Plan:
  match action:
    case Core.DirectLoginObserved{}:
      Core.DirectLoginAdvance{Core.DirectLoginDone{}, Core.DirectLoginStoragePatch{}}
    case _: Core.DirectLoginHold{}

def transition_spec(phase: Core.Phase, action: Core.Action, available: Bool) -> Core.Plan:
  match phase:
    case Core.DirectLoginCheckingStore{}: checking_spec(action, available)
    case Core.DirectLoginEnteringKey{}: entering_spec(action)
    case Core.DirectLoginSavingKey{}: saving_spec(action)
    case Core.DirectLoginDone{}: Core.DirectLoginHold{}
    case Core.DirectLoginCancelled{}: Core.DirectLoginHold{}

law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +available: Bool
  {
    Core.step(phase, action, current, available)
    == Bool.pick(
      Core.Plan,
      current,
      transition_spec(phase, action, available),
      Core.DirectLoginHold{}
    )
    : Core.Plan
  }
