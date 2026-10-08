import Base

# Direct stdin login; keys, observations and revision tokens remain native.
type Phase is Data:
  DirectLoginCheckingStore{}
  DirectLoginEnteringKey{}
  DirectLoginSavingKey{}
  DirectLoginDone{}
  DirectLoginCancelled{}

type Action is Data:
  DirectLoginChecked{}
  DirectLoginEntered{}
  DirectLoginInputEnded{}
  DirectLoginObserved{}
  DirectLoginExit{}

type Patch is Data:
  DirectLoginNoPatch{}
  DirectLoginAvailabilityPatch{}
  DirectLoginStoragePatch{}

type Command is Data:
  DirectLoginProbe{}
  DirectLoginInput{}
  DirectLoginSave{}
  DirectLoginNoCommand{}

type Plan is Data:
  DirectLoginHold{}
  DirectLoginAdvance{phase: Phase, patch: Patch}

def command(phase: Phase) -> Command:
  match phase:
    case DirectLoginCheckingStore{}: DirectLoginProbe{}
    case DirectLoginEnteringKey{}: DirectLoginInput{}
    case DirectLoginSavingKey{}: DirectLoginSave{}
    case _: DirectLoginNoCommand{}

def current_step(phase: Phase, action: Action, available: Bool) -> Plan:
  match phase action:
    case DirectLoginCheckingStore{} DirectLoginChecked{}:
      Bool.pick(Plan, available,
        DirectLoginAdvance{DirectLoginEnteringKey{}, DirectLoginAvailabilityPatch{}},
        DirectLoginAdvance{DirectLoginDone{}, DirectLoginAvailabilityPatch{}})
    case DirectLoginCheckingStore{} DirectLoginExit{}:
      DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}
    case DirectLoginEnteringKey{} DirectLoginEntered{}:
      DirectLoginAdvance{DirectLoginSavingKey{}, DirectLoginNoPatch{}}
    case DirectLoginEnteringKey{} DirectLoginInputEnded{}:
      DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}
    case DirectLoginEnteringKey{} DirectLoginExit{}:
      DirectLoginAdvance{DirectLoginCancelled{}, DirectLoginNoPatch{}}
    case DirectLoginSavingKey{} DirectLoginObserved{}:
      DirectLoginAdvance{DirectLoginDone{}, DirectLoginStoragePatch{}}
    case _ _: DirectLoginHold{}

def step(phase: Phase, action: Action, current: Bool, available: Bool) -> Plan:
  Bool.pick(Plan, current, current_step(phase, action, available), DirectLoginHold{})
