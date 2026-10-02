import Base

# Availability can recover without rotating the frozen issuance authority.
type State is Data:
  State{available: Bool, generation: Nat}

def initial() -> State:
  State{True{}, 1n}

def availability(state: State, available: Bool) -> State:
  match state:
    case State{_, generation}: State{available, generation}

def rotate(state: State) -> State:
  match state:
    case State{available, generation}: State{available, (generation + 1n : Nat)}

def authorized(state: State, issued_generation: Nat) -> Bool:
  match state:
    case State{available, generation}: available && Nat.is_eq(generation, issued_generation)
