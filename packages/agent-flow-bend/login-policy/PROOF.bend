import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.command_exact(phase):
  match phase:
    case Core.LoginSelectingDestination{}: {==}
    case Core.LoginPreparingTarget{}: {==}
    case Core.LoginEnteringKey{}: {==}
    case Core.LoginConfirmingSave{}: {==}
    case Core.LoginSavingKey{}: {==}
    case Core.LoginCheckingActive{}: {==}
    case Core.LoginDone{}: {==}
    case Core.LoginCancelled{}: {==}

def Laws.step_exact(phase, action, current, matched, blocked, yes, stale):
  match phase action current:
    case Core.LoginSelectingDestination{} Core.LoginSelect{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginSelect{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginEntered{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginEntered{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginApproved{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginApproved{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginObserved{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginObserved{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginBack{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginBack{} True{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginExit{} False{}: {==}
    case Core.LoginSelectingDestination{} Core.LoginExit{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginSelect{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginSelect{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginEntered{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginEntered{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginApproved{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginApproved{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginObserved{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginObserved{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginBack{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginBack{} True{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginExit{} False{}: {==}
    case Core.LoginPreparingTarget{} Core.LoginExit{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginSelect{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginSelect{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginEntered{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginEntered{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginApproved{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginApproved{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginObserved{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginObserved{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginBack{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginBack{} True{}: {==}
    case Core.LoginEnteringKey{} Core.LoginExit{} False{}: {==}
    case Core.LoginEnteringKey{} Core.LoginExit{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginSelect{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginSelect{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginEntered{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginEntered{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginApproved{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginApproved{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginObserved{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginObserved{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginBack{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginBack{} True{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginExit{} False{}: {==}
    case Core.LoginConfirmingSave{} Core.LoginExit{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginSelect{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginSelect{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginEntered{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginEntered{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginApproved{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginApproved{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginObserved{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginObserved{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginBack{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginBack{} True{}: {==}
    case Core.LoginSavingKey{} Core.LoginExit{} False{}: {==}
    case Core.LoginSavingKey{} Core.LoginExit{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginSelect{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginSelect{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginEntered{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginEntered{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginApproved{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginApproved{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginObserved{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginObserved{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginBack{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginBack{} True{}: {==}
    case Core.LoginCheckingActive{} Core.LoginExit{} False{}: {==}
    case Core.LoginCheckingActive{} Core.LoginExit{} True{}: {==}
    case Core.LoginDone{} Core.LoginSelect{} False{}: {==}
    case Core.LoginDone{} Core.LoginSelect{} True{}: {==}
    case Core.LoginDone{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginDone{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginDone{} Core.LoginEntered{} False{}: {==}
    case Core.LoginDone{} Core.LoginEntered{} True{}: {==}
    case Core.LoginDone{} Core.LoginApproved{} False{}: {==}
    case Core.LoginDone{} Core.LoginApproved{} True{}: {==}
    case Core.LoginDone{} Core.LoginObserved{} False{}: {==}
    case Core.LoginDone{} Core.LoginObserved{} True{}: {==}
    case Core.LoginDone{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginDone{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginDone{} Core.LoginBack{} False{}: {==}
    case Core.LoginDone{} Core.LoginBack{} True{}: {==}
    case Core.LoginDone{} Core.LoginExit{} False{}: {==}
    case Core.LoginDone{} Core.LoginExit{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginSelect{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginSelect{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginPrepared{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginPrepared{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginEntered{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginEntered{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginApproved{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginApproved{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginObserved{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginObserved{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginActiveObserved{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginActiveObserved{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginBack{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginBack{} True{}: {==}
    case Core.LoginCancelled{} Core.LoginExit{} False{}: {==}
    case Core.LoginCancelled{} Core.LoginExit{} True{}: {==}
