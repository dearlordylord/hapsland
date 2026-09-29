import Base

# One live background writer per advicee partition. The adapter maps the
# runtime's opaque writer token to a positive Nat before calling this reducer.
type Waiter is Data:
  Waiter{owner: Nat}

type Step is Data:
  Granted{state: Waiter}
  Denied{state: Waiter}

def initial() -> Waiter:
  Waiter{0n}

def claim(+state: Waiter, +token: Nat, active: Bool, used: Nat, capacity: Nat) -> Step:
  match state:
    case Waiter{owner}:
      Bool.pick(Step, Bool.and(active, Bool.and(Nat.is_eq(owner, 0n),
        Bool.and(Nat.is_gt(token, 0n), Nat.is_lt(used, capacity)))),
        Granted{Waiter{token}}, Denied{state})

def release(+state: Waiter, +token: Nat) -> Step:
  match state:
    case Waiter{owner}:
      Bool.pick(Step, Bool.and(Nat.is_gt(token, 0n), Nat.is_eq(owner, token)),
        Granted{initial()}, Denied{state})

def expire(+state: Waiter, elapsed: Nat, lifetime: Nat) -> Waiter:
  match state:
    case Waiter{owner}:
      Bool.pick(Waiter, Bool.and(Nat.is_gt(owner, 0n),
        Nat.is_ge(elapsed, lifetime)), initial(), state)

def main() -> Step:
  claim(initial(), 1n, True{}, 0n, 64n)
