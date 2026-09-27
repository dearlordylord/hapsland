import Base

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
