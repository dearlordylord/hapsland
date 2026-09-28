import Base

# Exact Stop output ownership. Native tokens and work IDs are mapped to Nat
# before entry; no host payload or source content is retained here.
type Phase is Data:
  Reserved{}
  Authorized{}
  Submitted{}
  Failed{}
  Uncertain{}

type Slot is Data:
  Slot{group: Nat, round: Nat, attempt: Nat, token: Nat,
    selected: List<&2, Nat>, phase: Phase}

type Counter is Data:
  Counter{group: Nat, round: Nat, used: Nat}

type State is Data:
  State{slots: List<&2, Slot>, counters: List<&2, Counter>}

type Decision is Data:
  Granted{state: State}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}}

def count(+group: Nat, +round: Nat, counters: List<&2, Counter>) -> Nat:
  match counters:
    case Nil{}:
      0n
    case Counter{candidate_group, candidate_round, used} <> rest:
      Bool.pick(Nat, Bool.and(Nat.is_eq(group, candidate_group),
        Nat.is_eq(round, candidate_round)), used, count(group, round, rest))

def has_group(+group: Nat, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(group, candidate_group), has_group(group, rest))

def keep_counter(item: Counter, rest: List<&2, Counter>, remove: Bool) -> List<&2, Counter>:
  match remove:
    case True{}: rest
    case False{}: item <> rest

def without_counter(+group: Nat, +round: Nat,
    counters: List<&2, Counter>) -> List<&2, Counter>:
  match counters:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Counter{candidate_group, candidate_round, _}:
          keep_counter(item, without_counter(group, round, rest),
            Bool.and(Nat.is_eq(group, candidate_group),
              Nat.is_eq(round, candidate_round)))

def set_count(state: State, +group: Nat, +round: Nat, used: Nat) -> State:
  match state:
    case State{slots, counters}:
      State{slots, Counter{group, round, used} <>
        without_counter(group, round, counters)}

def same_selected(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left:
    case Nil{}:
      match right:
        case Nil{}: True{}
        case _: False{}
    case head <> tail:
      match right:
        case Nil{}: False{}
        case other <> rest:
          Bool.and(Nat.is_eq(head, other), same_selected(tail, rest))

def reserve(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>) -> Decision:
  match state:
    case State{slots, counters}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(Nat.is_gt(group, 0n),
        Bool.and(Nat.is_gt(round, 0n), Bool.and(Nat.is_gt(attempt, 0n),
          Bool.and(Nat.is_gt(token, 0n), Bool.and(Bool.not(has_group(group, slots)),
            Bool.and(Nat.is_lt(used, 4n),
              Bool.and(Nat.is_gt(List.length(&2, Nat, selected), 0n),
                Nat.is_le(List.length(&2, Nat, selected), 5n)))))))),
        Granted{set_count(State{Slot{group, round, attempt, token,
          selected, Reserved{}} <> slots, counters}, group, round, (used + 1n : Nat))},
        Denied{state})

def slot_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
        Bool.and(Nat.is_eq(round, candidate_round),
          Bool.and(Nat.is_eq(attempt, candidate_attempt),
            Nat.is_eq(token, candidate_token)))),
        slot_owned(group, round, attempt, token, rest))

def reserved_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, phase} <> rest:
      match phase:
        case Reserved{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Nat.is_eq(token, candidate_token)))),
            reserved_owned(group, round, attempt, token, rest))
        case _:
          reserved_owned(group, round, attempt, token, rest)

def keep_slot(item: Slot, rest: List<&2, Slot>, remove: Bool) -> List<&2, Slot>:
  match remove:
    case True{}: rest
    case False{}: item <> rest

def without_slot(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> List<&2, Slot>:
  match slots:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Slot{candidate_group, candidate_round, candidate_attempt,
            candidate_token, _, _}:
          keep_slot(item, without_slot(group, round, attempt, token, rest),
            Bool.and(Nat.is_eq(group, candidate_group),
              Bool.and(Nat.is_eq(round, candidate_round),
                Bool.and(Nat.is_eq(attempt, candidate_attempt),
                  Nat.is_eq(token, candidate_token)))))

def release(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat) -> Decision:
  match state:
    case State{slots, counters}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(reserved_owned(group, round, attempt, token, slots),
        Nat.is_gt(used, 0n)),
        Granted{set_count(State{without_slot(group, round, attempt, token, slots),
          counters}, group, round, (used - 1n : Nat))}, Denied{state})

def update_slot(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, +phase: Phase, items: List<&2, Slot>) -> List<&2, Slot>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> +rest:
      match item:
        case Slot{candidate_group, candidate_round, candidate_attempt,
            candidate_token, _, _}:
          Bool.pick(List<&2, Slot>,
            Bool.and(Nat.is_eq(group, candidate_group),
              Bool.and(Nat.is_eq(round, candidate_round),
                Bool.and(Nat.is_eq(attempt, candidate_attempt),
                  Nat.is_eq(token, candidate_token)))),
            Slot{group, round, attempt, token, selected, phase} <> rest,
            item <> update_slot(group, round, attempt, token, selected, phase, rest))

def authorizable(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, candidate_selected, phase} <> rest:
      match phase:
        case Reserved{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Bool.and(Nat.is_eq(token, candidate_token),
                  same_selected(selected, candidate_selected))))),
            authorizable(group, round, attempt, token, selected, rest))
        case _:
          authorizable(group, round, attempt, token, selected, rest)

def authorize(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>) -> Decision:
  match state:
    case State{slots, counters}:
      Bool.pick(Decision,
        authorizable(group, round, attempt, token, selected, slots),
        Granted{State{update_slot(group, round, attempt, token,
          selected, Authorized{}, slots), counters}}, Denied{state})

def terminal_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, candidate_selected, phase} <> rest:
      match phase:
        case Authorized{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Bool.and(Nat.is_eq(token, candidate_token),
                  same_selected(selected, candidate_selected))))),
            terminal_owned(group, round, attempt, token, selected, rest))
        case _:
          terminal_owned(group, round, attempt, token, selected, rest)

def terminal(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>, phase: Phase) -> Decision:
  match state:
    case State{slots, counters}:
      Bool.pick(Decision, terminal_owned(group, round, attempt, token, selected, slots),
        Granted{State{update_slot(group, round, attempt, token,
          selected, phase, slots), counters}}, Denied{state})

def durable_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, phase} <> rest:
      match phase:
        case Reserved{}:
          durable_owned(group, round, attempt, token, rest)
        case _:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Nat.is_eq(token, candidate_token)))),
            durable_owned(group, round, attempt, token, rest))

def end(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat) -> Decision:
  match state:
    case State{slots, counters}:
      Bool.pick(Decision, durable_owned(group, round, attempt, token, slots),
        Granted{State{without_slot(group, round, attempt, token, slots), counters}},
        Denied{state})

def consume(+state: State, +group: Nat, +round: Nat) -> Decision:
  match state:
    case State{_, counters}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(Nat.is_gt(group, 0n),
        Bool.and(Nat.is_gt(round, 0n), Nat.is_lt(used, 4n))),
        Granted{set_count(state, group, round, (used + 1n : Nat))},
        Denied{state})

def main() -> Decision:
  reserve(initial(), 1n, 1n, 1n, 1n, 1n <> Nil{})
