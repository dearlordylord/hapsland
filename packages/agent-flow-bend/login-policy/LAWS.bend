import Base
import ./core.bend as Core

# Approved by delegated Astra review on 2026-10-08; see login-law-approval.json.
def command_spec(phase: Core.Phase) -> Core.Command:
  match phase:
    case Core.LoginSelectingDestination{}: Core.LoginChoose{}
    case Core.LoginPreparingTarget{}: Core.LoginPrepare{}
    case Core.LoginEnteringKey{}: Core.LoginInput{}
    case Core.LoginConfirmingSave{}: Core.LoginConfirm{}
    case Core.LoginSavingKey{}: Core.LoginSave{}
    case Core.LoginCheckingActive{}: Core.LoginReadActive{}
    case Core.LoginDone{}: Core.LoginNoCommand{}
    case Core.LoginCancelled{}: Core.LoginNoCommand{}

# Exact command mapping makes terminal states command-free.
law command_exact:
  for +phase: Core.Phase
  {Core.command(phase) == command_spec(phase) : Core.Command}

def transition_spec(phase: Core.Phase, action: Core.Action, matched: Bool,
    blocked: Bool, yes: Bool, stale: Bool) -> Core.Plan:
  match phase action:
    case Core.LoginDone{} _: Core.LoginHold{}
    case Core.LoginCancelled{} _: Core.LoginHold{}
    case Core.LoginSavingKey{} Core.LoginExit{}: Core.LoginHold{}
    case Core.LoginCheckingActive{} Core.LoginExit{}: Core.LoginHold{}
    case _ Core.LoginExit{}: Core.LoginAdvance{Core.LoginCancelled{}, Core.LoginNoPatch{}}
    case Core.LoginEnteringKey{} Core.LoginBack{}: Core.LoginReset{}
    case Core.LoginConfirmingSave{} Core.LoginBack{}: Core.LoginReset{}
    case Core.LoginSelectingDestination{} Core.LoginSelect{}: Core.LoginAdvance{
      Core.LoginPreparingTarget{},
      Core.LoginDestinationPatch{}
    }
    case Core.LoginPreparingTarget{} Core.LoginPrepared{}:
      Bool.pick(
        Core.Plan,
        blocked,
        Core.LoginReset{},
        Core.LoginAdvance{Core.LoginEnteringKey{}, Core.LoginProposalPatch{}}
      )
    case Core.LoginEnteringKey{} Core.LoginEntered{}:
      Bool.pick(
        Core.Plan,
        matched,
        Core.LoginAdvance{Core.LoginConfirmingSave{}, Core.LoginNoPatch{}},
        Core.LoginHold{}
      )
    case Core.LoginConfirmingSave{} Core.LoginApproved{}:
      Bool.pick(
        Core.Plan,
        matched,
        Bool.pick(
          Core.Plan,
          yes,
          Core.LoginAdvance{Core.LoginSavingKey{}, Core.LoginNoPatch{}},
          Core.LoginAdvance{Core.LoginCancelled{}, Core.LoginNoPatch{}}
        ),
        Core.LoginHold{}
      )
    case Core.LoginSavingKey{} Core.LoginObserved{}:
      Bool.pick(
        Core.Plan,
        stale,
        Core.LoginAdvance{Core.LoginPreparingTarget{}, Core.LoginNoPatch{}},
        Core.LoginAdvance{Core.LoginCheckingActive{}, Core.LoginStoragePatch{}}
      )
    case Core.LoginCheckingActive{} Core.LoginActiveObserved{}: Core.LoginAdvance{
      Core.LoginDone{},
      Core.LoginActivePatch{}
    }
    case _ _: Core.LoginHold{}

# Exact transition characterization pins revision/callback fencing, consent,
# proposal correlation, protected owner operations, reset and native payload patches.
law step_exact:
  for +phase: Core.Phase
  for +action: Core.Action
  for +current: Bool
  for +matched: Bool
  for +blocked: Bool
  for +yes: Bool
  for +stale: Bool
  {Core.step(phase, action, current, matched, blocked, yes, stale) ==
    Bool.pick(Core.Plan, current,
      transition_spec(phase, action, matched, blocked, yes, stale), Core.LoginHold{}) : Core.Plan}
