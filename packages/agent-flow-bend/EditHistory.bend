import Base

# Resident-wide, bounded memory of completed native edit identities.
# The adapter maps native strings bijectively to opaque Nat values.
type Reason is Data:
  Consumed{}
  Released{}
  Expired{}
  Closed{}

type Completed is Data:
  Completed{tool: Nat, reason: Reason, reported: Bool}

type State is Data:
  State{entries: List<&2, Completed>}

type Lookup is Data:
  Absent{}
  Seen{reason: Reason, report: Bool}

type Record is Data:
  Recorded{state: State, evicted: Maybe<&2, Nat>}

def initial() -> State:
  State{Nil{}}

def count(state: State) -> Nat:
  match state:
    case State{entries}: List.length(&2, Completed, entries)

def lookup_entries(+tool: Nat, entries: List<&2, Completed>) -> Lookup:
  match entries:
    case Nil{}: Absent{}
    case Completed{current, reason, reported} <> rest:
      Bool.pick(Lookup, Nat.is_eq(tool, current),
        Seen{reason, Bool.not(reported)}, lookup_entries(tool, rest))

def lookup(+tool: Nat, state: State) -> Lookup:
  match state:
    case State{entries}: lookup_entries(tool, entries)

def mark_entries(+tool: Nat, entries: List<&2, Completed>) -> List<&2, Completed>:
  match entries:
    case Nil{}: Nil{}
    case Completed{+current, reason, reported} <> rest:
      Completed{current, reason, Bool.or(reported, Nat.is_eq(tool, current))} <>
        mark_entries(tool, rest)

def mark_reported(+tool: Nat, state: State) -> State:
  match state:
    case State{entries}: State{mark_entries(tool, entries)}

def record_entries(+tool: Nat, +reason: Reason, entries: List<&2, Completed>, size: Nat) -> Record:
  match entries:
    case Nil{}:
      Recorded{State{Completed{tool, reason, False{}} <> Nil{}}, None{}}
    case Completed{+oldest, +old_reason, +reported} <> +tail:
      Bool.pick(Record, Nat.is_lt(size, 1000n),
        Recorded{State{List.append(&2, Completed,
          Completed{oldest, old_reason, reported} <> tail,
          Completed{tool, reason, False{}} <> Nil{})}, None{}},
        Recorded{State{List.append(&2, Completed, tail,
          Completed{tool, reason, False{}} <> Nil{})}, Some{oldest}})

def record(+tool: Nat, reason: Reason, state: State) -> Record:
  match state:
    case State{+entries}:
      record_entries(tool, reason, entries, List.length(&2, Completed, entries))
