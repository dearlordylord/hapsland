import Base

# Admission policy retains unit facts and checks collection authority.
type Reason is Data:
  Backend{}
  Credential{}
  Capacity{}
  Stale{}
  Lost{}
  Expired{}

type CollectGate is Data:
  CollectProceed{}
  CollectUnavailable{reason: Reason}

type FinalAuthority is Data:
  FinalProceed{}
  FinalRelease{}

type JoinedState is Data:
  JoinedPending{}
  JoinedClear{}
  JoinedFinding{}
  JoinedUnavailable{}

type JoinedDisposition is Data:
  KeepJoined{}
  SetJoinedClear{}
  SetJoinedFinding{}
  SetJoinedUnavailable{}
  SetJoinedLost{}

def joined.route(state: JoinedState, +has_revision: Bool,
    has_advice_id: Bool) -> JoinedDisposition:
  match state:
    case JoinedUnavailable{}:
      SetJoinedUnavailable{}
    case JoinedPending{}:
      Bool.pick(JoinedDisposition, has_revision, KeepJoined{}, SetJoinedLost{})
    case JoinedClear{}:
      Bool.pick(JoinedDisposition, has_revision, SetJoinedClear{}, SetJoinedLost{})
    case JoinedFinding{}:
      Bool.pick(JoinedDisposition, Bool.and(has_revision, has_advice_id),
        SetJoinedFinding{}, SetJoinedLost{})

def joined_disposition(state: JoinedState, stale_unavailable: Bool,
    has_revision: Bool, has_advice_id: Bool) -> JoinedDisposition:
  Bool.pick(JoinedDisposition, stale_unavailable, KeepJoined{},
    joined.route(state, has_revision, has_advice_id))

type UnitStage is Data:
  UnitPending{}
  UnitClear{}
  UnitFinding{delivered: Bool}
  UnitUnavailable{}

type UnitEvent is Data:
  Revise{}
  ClearResult{}
  FindingResult{}
  FailUnit{}
  MarkDelivered{}

type UnitStep is Data:
  UnitGranted{stage: UnitStage}
  UnitDenied{stage: UnitStage}

def unit.initial() -> UnitStage:
  UnitPending{}

def unit.revise(stage: UnitStage) -> UnitStep:
  match stage:
    case UnitPending{}:
      UnitGranted{UnitPending{}}
    case _:
      UnitDenied{stage}

def unit.result(stage: UnitStage, finding: Bool) -> UnitStep:
  match stage:
    case UnitUnavailable{}:
      UnitDenied{stage}
    case _:
      UnitGranted{Bool.pick(UnitStage, finding, UnitFinding{False{}}, UnitClear{})}

def unit.delivered(stage: UnitStage) -> UnitStep:
  match stage:
    case UnitFinding{_}:
      UnitGranted{UnitFinding{True{}}}
    case _:
      UnitDenied{stage}

def unit.step(+stage: UnitStage, event: UnitEvent) -> UnitStep:
  match event:
    case Revise{}:
      unit.revise(stage)
    case ClearResult{}:
      unit.result(stage, False{})
    case FindingResult{}:
      unit.result(stage, True{})
    case FailUnit{}:
      UnitGranted{UnitUnavailable{}}
    case MarkDelivered{}:
      unit.delivered(stage)

# Expiry and current credential authority guard collection independently of work outcome.
def collect_gate(expired: Bool, credential_valid: Bool) -> CollectGate:
  Bool.pick(CollectGate, expired, CollectUnavailable{Expired{}},
    Bool.pick(CollectGate, Bool.not(credential_valid),
      CollectUnavailable{Credential{}}, CollectProceed{}))

# A block-mode ticket cannot hand off its leased selection after opt-in is revoked.
def final_authority(admitted_block: Bool, current_block: Bool) -> FinalAuthority:
  Bool.pick(FinalAuthority, Bool.and(admitted_block, Bool.not(current_block)),
    FinalRelease{}, FinalProceed{})

def main() -> CollectGate:
  collect_gate(False{}, True{})
