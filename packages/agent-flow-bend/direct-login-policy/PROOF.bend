import Base
import ./core.bend as Core
import ./LAWS.bend as Laws

def Laws.command_exact(phase):
  match phase:
    case Core.DirectLoginCheckingStore{}: {==}
    case Core.DirectLoginEnteringKey{}: {==}
    case Core.DirectLoginSavingKey{}: {==}
    case Core.DirectLoginDone{}: {==}
    case Core.DirectLoginCancelled{}: {==}

def Laws.step_exact(phase, action, current, available):
  match phase action current:
    case Core.DirectLoginCheckingStore{} Core.DirectLoginChecked{} False{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginChecked{} True{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginEntered{} False{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginEntered{} True{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginInputEnded{} False{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginInputEnded{} True{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginObserved{} False{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginObserved{} True{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginExit{} False{}: {==}
    case Core.DirectLoginCheckingStore{} Core.DirectLoginExit{} True{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginChecked{} False{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginChecked{} True{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginEntered{} False{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginEntered{} True{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginInputEnded{} False{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginInputEnded{} True{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginObserved{} False{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginObserved{} True{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginExit{} False{}: {==}
    case Core.DirectLoginEnteringKey{} Core.DirectLoginExit{} True{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginChecked{} False{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginChecked{} True{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginEntered{} False{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginEntered{} True{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginInputEnded{} False{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginInputEnded{} True{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginObserved{} False{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginObserved{} True{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginExit{} False{}: {==}
    case Core.DirectLoginSavingKey{} Core.DirectLoginExit{} True{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginChecked{} False{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginChecked{} True{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginEntered{} False{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginEntered{} True{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginInputEnded{} False{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginInputEnded{} True{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginObserved{} False{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginObserved{} True{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginExit{} False{}: {==}
    case Core.DirectLoginDone{} Core.DirectLoginExit{} True{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginChecked{} False{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginChecked{} True{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginEntered{} False{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginEntered{} True{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginInputEnded{} False{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginInputEnded{} True{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginObserved{} False{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginObserved{} True{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginExit{} False{}: {==}
    case Core.DirectLoginCancelled{} Core.DirectLoginExit{} True{}: {==}
