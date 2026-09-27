import Base
import ./Round.bend as Round

# Per-output-token write status. The finding lease in Handoff.bend separately
# enforces one live writer per finding and one terminal background reoffer.
type Surface is Data:
  Edit{}
  Background{}
  Stop{}

type Phase is Data:
  Reserved{}
  Authorized{}
  Submitted{}
  Uncertain{}

type Step is Data:
  Granted{phase: Phase}
  Denied{phase: Phase}

# A submission needs a live round. A background writer cannot enter while
# Stop owns the barrier, and an existing token needs its Stop finish permit.
def existing_token_allowed(surface: Surface, existing_token: Bool,
    finish_permit: Bool) -> Bool:
  match surface:
    case Stop{}:
      Bool.or(Bool.not(existing_token), finish_permit)
    case _:
      Bool.not(existing_token)

def submission_allowed(round: Round.Round, surface: Surface,
    existing_token: Bool, finish_permit: Bool) -> Bool:
  match round:
    case Round.Round{_, live, _, _, _, barrier, deciding, _}:
      match surface:
        case Background{}:
          Bool.and(live, Bool.and(existing_token_allowed(surface, existing_token, finish_permit),
            Bool.and(Bool.not(barrier), Bool.not(deciding))))
        case Stop{}:
          Bool.and(live, existing_token_allowed(surface, existing_token, finish_permit))
        case Edit{}:
          Bool.and(live, existing_token_allowed(surface, existing_token, finish_permit))

# Legacy Stop collection predates the finish permit protocol.
def legacy_stop_allowed(round: Round.Round) -> Bool:
  match round:
    case Round.Round{_, live, _, _, _, _, deciding, _}:
      Bool.and(live, Bool.not(deciding))

def transition(current: Phase, requested: Phase) -> Step:
  match current:
    case Reserved{}:
      match requested:
        case Authorized{}:
          Granted{Authorized{}}
        case _:
          Denied{Reserved{}}
    case Authorized{}:
      match requested:
        case Submitted{}:
          Granted{Submitted{}}
        case Uncertain{}:
          Granted{Uncertain{}}
        case _:
          Denied{Authorized{}}
    case _:
      Denied{current}

def expired(phase: Phase, elapsed: Nat, lifetime: Nat) -> Bool:
  match phase:
    case Authorized{}:
      Nat.is_ge(elapsed, lifetime)
    case _:
      False{}

def background_reofferable(phase: Phase, surface: Surface) -> Bool:
  match phase:
    case Submitted{}:
      match surface:
        case Background{}:
          True{}
        case _:
          False{}
    case Uncertain{}:
      match surface:
        case Background{}:
          True{}
        case _:
          False{}
    case _:
      False{}

def main() -> Step:
  transition(Authorized{}, Uncertain{})
