import Base

# Native maps semantic subjects and canonical inputs to positive numeric IDs.
# Only source-free identities and member counts are retained here.
type Entry is Data:
  Entry{subject: Nat, input: Nat, generation: Nat, members: Nat}

type State is Data:
  State{entries: List<&2, Entry>, next_generation: Nat}

type Registration is Data:
  Reused{state: State, generation: Nat}
  Replaced{state: State, generation: Nat}

def initial() -> State:
  State{Nil{}, 1n}

def same_subject(subject: Nat, entry: Entry) -> Bool:
  match entry:
    case Entry{candidate, _, _, _}: Nat.is_eq(subject, candidate)

def find(+subject: Nat, entries: List<&2, Entry>) -> Maybe<&2, Entry>:
  match entries:
    case Nil{}: None{}
    case +entry <> rest:
      Bool.pick(Maybe<&2, Entry>, same_subject(subject, entry), Some{entry}, find(subject, rest))

def keep_entry(entry: Entry, tail: List<&2, Entry>, remove: Bool) -> List<&2, Entry>:
  match remove:
    case True{}: tail
    case False{}: entry <> tail

def without(+subject: Nat, entries: List<&2, Entry>) -> List<&2, Entry>:
  match entries:
    case Nil{}: Nil{}
    case +entry <> rest:
      keep_entry(entry, without(subject, rest), same_subject(subject, entry))

def register_found(state: State, +subject: Nat, +input: Nat,
    add_member: Bool, found: Maybe<&2, Entry>) -> Registration:
  match state:
    case State{+entries, +next_generation}:
      match found:
        case Some{Entry{_, old_input, +generation, +members}}:
          +updated = Bool.pick(Nat, add_member, (members + 1n : Nat), members)
          Bool.pick(Registration, Nat.is_eq(old_input, input),
            Reused{State{Entry{subject, input, generation, updated} <> without(subject, entries),
              next_generation}, generation},
            Replaced{State{Entry{subject, input, next_generation, 1n} <>
              without(subject, entries), (next_generation + 1n : Nat)}, next_generation})
        case None{}:
          Replaced{State{Entry{subject, input, next_generation, 1n} <> entries,
            (next_generation + 1n : Nat)}, next_generation}

def register(+state: State, +subject: Nat, input: Nat, add_member: Bool) -> Registration:
  match state:
    case State{entries, _}:
      register_found(state, subject, input, add_member, find(subject, entries))

def release_found(state: State, +subject: Nat, generation: Nat,
    found: Maybe<&2, Entry>) -> State:
  match state:
    case State{+entries, +next_generation}:
      match found:
        case Some{Entry{_, input, +current, +members}}:
          Bool.pick(State, Nat.is_eq(current, generation),
            Bool.pick(State, Nat.is_lt(1n, members),
              State{Entry{subject, input, current, (members - 1n : Nat)} <>
                without(subject, entries), next_generation},
              State{without(subject, entries), next_generation}), state)
        case None{}: state

def release(+state: State, +subject: Nat, generation: Nat) -> State:
  match state:
    case State{entries, _}:
      release_found(state, subject, generation, find(subject, entries))

def current_found(input: Nat, generation: Nat, found: Maybe<&2, Entry>) -> Bool:
  match found:
    case Some{Entry{_, retained_input, retained_generation, _}}:
      Bool.and(Nat.is_eq(input, retained_input), Nat.is_eq(generation, retained_generation))
    case None{}: False{}

def current(state: State, subject: Nat, input: Nat, generation: Nat) -> Bool:
  match state:
    case State{entries, _}:
      current_found(input, generation, find(subject, entries))

def generation_found(found: Maybe<&2, Entry>) -> Nat:
  match found:
    case Some{Entry{_, _, current, _}}: current
    case None{}: 0n

def generation(state: State, subject: Nat) -> Nat:
  match state:
    case State{entries, _}:
      generation_found(find(subject, entries))

def count(state: State) -> Nat:
  match state:
    case State{entries, _}:
      List.length(&2, Entry, entries)

def superseded_found(candidate: Nat, found: Maybe<&2, Entry>) -> Bool:
  match found:
    case Some{Entry{_, _, current, _}}: Nat.is_lt(candidate, current)
    case None{}: False{}

def superseded(state: State, +subject: Nat, candidate_subject: Nat,
    candidate: Nat) -> Bool:
  match state:
    case State{entries, _}:
      Bool.and(Nat.is_eq(subject, candidate_subject),
        superseded_found(candidate, find(subject, entries)))
