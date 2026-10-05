import Base

# Availability can recover without rotating the frozen issuance authority.
type Capture is Data:
  Capture{operation: Nat, generation: Nat}

type State is Data:
  State{available: Bool, generation: Nat, issued: List<&2, Capture>}

def initial() -> State:
  State{True{}, 1n, Nil{}}

def availability(state: State, available: Bool) -> State:
  match state:
    case State{_, generation, issued}: State{available, generation, issued}

def rotate(state: State) -> State:
  match state:
    case State{available, generation, issued}: State{available, (generation + 1n : Nat), issued}

def authorized(state: State, issued_generation: Nat) -> Bool:
  match state:
    case State{available, generation, _}: available && Nat.is_eq(generation, issued_generation)

def configure(state: State, available: Bool, generation: Nat) -> State:
  match state:
    case State{_, _, issued}: State{available, generation, issued}

def lookup(items: List<&2, Capture>, +operation: Nat) -> Maybe<&2, Nat>:
  match items:
    case Nil{}: None{}
    case Capture{candidate, generation} <> tail:
      Bool.pick(Maybe<&2, Nat>, Nat.is_eq(candidate, operation), Some{generation}, lookup(tail, operation))

def capture_found(found: Maybe<&2, Nat>, +state: State, operation: Nat) -> State:
  match found state:
    case None{} State{available, +generation, issued}: State{available, generation, Capture{operation, generation} <> issued}
    case Some{_} _: state

# Operation identities are allocated uniquely by actual Canonical. Duplicate
# issuance observations preserve the original generation rather than recapture.
def capture(+state: State, +operation: Nat) -> State:
  match state:
    case State{_, _, issued}: capture_found(lookup(issued, operation), state, operation)

def captured(state: State, operation: Nat) -> Maybe<&2, Nat>:
  match state:
    case State{_, _, issued}: lookup(issued, operation)

def generation_found(current: Nat, found: Maybe<&2, Nat>) -> Bool:
  match found:
    case None{}: False{}
    case Some{generation}: Nat.is_eq(current, generation)

# This is the generation fact, independent of temporary availability. Canonical
# separately consumes availability at admission and final handoff boundaries.
def matches(state: State, operation: Nat) -> Bool:
  match state:
    case State{_, generation, issued}: generation_found(generation, lookup(issued, operation))
