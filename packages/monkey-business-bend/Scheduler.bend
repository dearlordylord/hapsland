import Base

type Entry is Data:
  Entry{at: Nat, order: Nat}

def precedes(a: Entry, b: Entry) -> Bool:
  match a b:
    case Entry{+at, order} Entry{+bt, other}:
      Nat.is_lt(at, bt) || (Nat.is_eq(at, bt) && Nat.is_le(order, other))

def inserted(before: Bool, +entry: Entry, +head: Entry, tail: List<&2, Entry>, rest: List<&2, Entry>) -> List<&2, Entry>:
  match before:
    case True{}: entry <> head <> tail
    case False{}: head <> rest

def insert(queue: List<&2, Entry>, +entry: Entry) -> List<&2, Entry>:
  match queue:
    case Nil{}: [entry]
    case +head <> +tail: inserted(precedes(entry, head), entry, head, tail, insert(tail, entry))

type State is Data:
  State{queue: List<&2, Entry>, now: Nat}

type Taken is Data:
  Taken{state: State, entry: Maybe<&2, Entry>}

def initial() -> State:
  State{Nil{}, 0n}

def enqueue(state: State, at: Nat, order: Nat) -> State:
  match state:
    case State{queue, now}: State{insert(queue, Entry{at, order}), now}

def take_queue(queue: List<&2, Entry>, now: Nat) -> Taken:
  match queue:
    case Nil{}: Taken{State{Nil{}, now}, None{}}
    case Entry{+at, order} <> tail: Taken{State{tail, at}, Some{Entry{at, order}}}

def take(state: State) -> Taken:
  match state:
    case State{queue, now}: take_queue(queue, now)

def peek(state: State) -> Maybe<&2, Entry>:
  match state:
    case State{Nil{}, _}: None{}
    case State{head <> _, _}: Some{head}

def entries(state: State) -> List<&2, Entry>:
  match state:
    case State{queue, _}: queue

def retain(remove: Bool, entry: Entry, rest: List<&2, Entry>) -> List<&2, Entry>:
  match remove:
    case True{}: rest
    case False{}: entry <> rest

def cancel_one(entry: Entry, rest: List<&2, Entry>, +order: Nat) -> List<&2, Entry>:
  match entry:
    case Entry{at, +id}: retain(Nat.is_eq(id, order), Entry{at, id}, rest)

def cancel_queue(queue: List<&2, Entry>, +order: Nat) -> List<&2, Entry>:
  match queue:
    case Nil{}: Nil{}
    case head <> tail: cancel_one(head, cancel_queue(tail, order), order)

def cancel(state: State, order: Nat) -> State:
  match state:
    case State{queue, now}: State{cancel_queue(queue, order), now}
