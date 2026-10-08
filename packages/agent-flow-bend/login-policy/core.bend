import Base

# Source-free navigation; native payloads, keys and revision tokens stay in the host.
type Phase is Data:
  LoginSelectingDestination{}
  LoginPreparingTarget{}
  LoginEnteringKey{}
  LoginConfirmingSave{}
  LoginSavingKey{}
  LoginCheckingActive{}
  LoginDone{}
  LoginCancelled{}

type Action is Data:
  LoginSelect{}
  LoginPrepared{}
  LoginEntered{}
  LoginApproved{}
  LoginObserved{}
  LoginActiveObserved{}
  LoginBack{}
  LoginExit{}

type Patch is Data:
  LoginNoPatch{}
  LoginDestinationPatch{}
  LoginProposalPatch{}
  LoginStoragePatch{}
  LoginActivePatch{}

type Command is Data:
  LoginChoose{}
  LoginPrepare{}
  LoginInput{}
  LoginConfirm{}
  LoginSave{}
  LoginReadActive{}
  LoginNoCommand{}

type Plan is Data:
  LoginHold{}
  LoginReset{}
  LoginAdvance{phase: Phase, patch: Patch}

def command(phase: Phase) -> Command:
  match phase:
    case LoginSelectingDestination{}: LoginChoose{}
    case LoginPreparingTarget{}: LoginPrepare{}
    case LoginEnteringKey{}: LoginInput{}
    case LoginConfirmingSave{}: LoginConfirm{}
    case LoginSavingKey{}: LoginSave{}
    case LoginCheckingActive{}: LoginReadActive{}
    case LoginDone{}: LoginNoCommand{}
    case LoginCancelled{}: LoginNoCommand{}

def current_step(phase: Phase, action: Action, matched: Bool,
    blocked: Bool, yes: Bool, stale: Bool) -> Plan:
  match phase action:
    case LoginDone{} _: LoginHold{}
    case LoginCancelled{} _: LoginHold{}
    case LoginSavingKey{} LoginExit{}: LoginHold{}
    case LoginCheckingActive{} LoginExit{}: LoginHold{}
    case _ LoginExit{}: LoginAdvance{LoginCancelled{}, LoginNoPatch{}}
    case LoginEnteringKey{} LoginBack{}: LoginReset{}
    case LoginConfirmingSave{} LoginBack{}: LoginReset{}
    case LoginSelectingDestination{} LoginSelect{}: LoginAdvance{
      LoginPreparingTarget{},
      LoginDestinationPatch{}
    }
    case LoginPreparingTarget{} LoginPrepared{}:
      Bool.pick(Plan, blocked, LoginReset{}, LoginAdvance{LoginEnteringKey{}, LoginProposalPatch{}})
    case LoginEnteringKey{} LoginEntered{}:
      Bool.pick(Plan, matched, LoginAdvance{LoginConfirmingSave{}, LoginNoPatch{}}, LoginHold{})
    case LoginConfirmingSave{} LoginApproved{}:
      Bool.pick(
        Plan,
        matched,
        Bool.pick(
          Plan,
          yes,
          LoginAdvance{LoginSavingKey{}, LoginNoPatch{}},
          LoginAdvance{LoginCancelled{}, LoginNoPatch{}}
        ),
        LoginHold{}
      )
    case LoginSavingKey{} LoginObserved{}:
      Bool.pick(
        Plan,
        stale,
        LoginAdvance{LoginPreparingTarget{}, LoginNoPatch{}},
        LoginAdvance{LoginCheckingActive{}, LoginStoragePatch{}}
      )
    case LoginCheckingActive{} LoginActiveObserved{}: LoginAdvance{LoginDone{}, LoginActivePatch{}}
    case _ _: LoginHold{}

def step(phase: Phase, action: Action, current: Bool, matched: Bool,
    blocked: Bool, yes: Bool, stale: Bool) -> Plan:
  Bool.pick(Plan, current, current_step(phase, action, matched, blocked, yes, stale), LoginHold{})
