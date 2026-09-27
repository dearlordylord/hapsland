import Base

# The resident owns one virtual turn chain per exact advicee. Native marker and
# output-token strings stay in the adapter; positive token IDs are exact maps.
type Round is Data:
  Round{generation: Nat, active: Bool, closed_at: Nat, continuations: Nat,
    stop_token: Nat, barrier: Bool, deciding: Bool, output_reserved: Bool}

type Step is Data:
  Granted{state: Round}
  Denied{state: Round}

def initial() -> Round:
  Round{1n, True{}, 0n, 0n, 0n, False{}, False{}, False{}}

def max_continuations() -> Nat:
  4n

def active(state: Round, generation: Nat) -> Bool:
  match state:
    case Round{own, live, _, _, _, _, _, _}:
      Bool.and(live, Nat.is_eq(own, generation))

def budget(state: Round) -> Bool:
  match state:
    case Round{_, live, _, count, _, _, _, _}:
      Bool.and(live, Nat.is_lt(count, max_continuations()))

def begin_stop(+state: Round, +token: Nat) -> Step:
  match state:
    case Round{generation, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, Bool.and(live, Bool.and(Nat.is_eq(owner, 0n), Nat.is_gt(token, 0n))),
        Granted{Round{generation, live, closed_at, count, token, False{}, False{}, False{}}},
        Denied{state})

def owns_stop(state: Round, +token: Nat) -> Bool:
  match state:
    case Round{_, live, _, _, owner, _, deciding, _}:
      Bool.and(live, Bool.and(Nat.is_gt(token, 0n),
        Bool.and(Nat.is_eq(owner, token), Bool.not(deciding))))

def begin_decision(+state: Round, +token: Nat) -> Step:
  match state:
    case Round{generation, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, owns_stop(state, token),
        Granted{Round{generation, live, closed_at, count, owner, barrier, True{}, output}},
        Denied{state})

def consume(+state: Round) -> Step:
  match state:
    case Round{generation, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, budget(state),
        Granted{Round{generation, live, closed_at, (count + 1n : Nat), owner,
          Bool.or(barrier, Nat.is_gt(owner, 0n)), deciding, output}},
        Denied{state})

def reserve_output(+state: Round, +token: Nat) -> Step:
  match state:
    case Round{generation, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, Bool.and(live, Bool.and(deciding, Bool.and(Nat.is_eq(owner, token),
          Bool.and(Nat.is_gt(token, 0n), Bool.and(Bool.not(output), budget(state)))))),
        Granted{Round{generation, live, closed_at, (count + 1n : Nat), owner,
          True{}, deciding, True{}}},
        Denied{state})

def finish_stop(+state: Round, +token: Nat, close: Bool, at: Nat) -> Step:
  match state:
    case Round{generation, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, Bool.and(Nat.is_gt(token, 0n), Nat.is_eq(owner, token)),
        Granted{Bool.pick(Round, close,
          Round{generation, False{}, at, count, 0n, False{}, False{}, False{}},
          Round{generation, live, closed_at, count, 0n, False{}, False{}, False{}})},
        Denied{state})

def reopen(+state: Round, +generation: Nat) -> Step:
  match state:
    case Round{current, live, closed_at, count, owner, barrier, deciding, output}:
      Bool.pick(Step, Bool.and(Bool.not(live), Nat.is_eq(generation, (current + 1n : Nat))),
        Granted{Round{generation, True{}, closed_at, 0n, 0n, False{}, False{}, False{}}},
        Denied{state})

def main() -> Step:
  begin_stop(initial(), 1n)
