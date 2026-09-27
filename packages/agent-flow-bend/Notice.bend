import Base

# The adapter retains exact cooldown keys and timestamps. This policy decides
# whether an observed operational failure may emit or refresh a notice. A
# positive remaining duration means the existing key is still cooling down.
type Action is Data:
  Suppress{}
  Refresh{}
  RejectFull{}
  Create{}

def decide(remaining: Maybe<&2, Nat>, count: Nat, maximum: Nat) -> Action:
  match remaining:
    case Some{duration}:
      Bool.pick(Action, Nat.is_gt(duration, 0n), Suppress{}, Refresh{})
    case None{}:
      Bool.pick(Action, Nat.is_ge(count, maximum), RejectFull{}, Create{})

type Advance is Data:
  Suppressed{count: Nat}
  RejectedFull{}
  CreateKey{}
  CreatePending{count: Nat}
  MergePending{count: Nat}
  KeepLeased{}

def bounded_add.result(left: Nat, right: Nat, maximum: Nat, over: Bool) -> Nat:
  match over:
    case True{}:
      maximum
    case False{}:
      (left + right : Nat)

def bounded_add(+left: Nat, +right: Nat, +maximum: Nat) -> Nat:
  bounded_add.result(left, right, maximum,
    Nat.is_gt(right, (maximum - left : Nat)))

def refresh.leased(count: Nat, suppressed: Nat, maximum: Nat, leased: Bool) -> Advance:
  match leased:
    case True{}:
      KeepLeased{}
    case False{}:
      MergePending{bounded_add(count, suppressed, maximum)}

def refresh(pending: Maybe<&2, Nat>, leased: Bool, suppressed: Nat,
    maximum: Nat) -> Advance:
  match pending:
    case None{}:
      CreatePending{suppressed}
    case Some{count}:
      refresh.leased(count, suppressed, maximum, leased)

def advance.action(action: Action, suppressed: Nat,
    pending: Maybe<&2, Nat>, leased: Bool, maximum: Nat) -> Advance:
  match action:
    case Suppress{}:
      Suppressed{bounded_add(suppressed, 1n, maximum)}
    case RejectFull{}:
      RejectedFull{}
    case Create{}:
      CreateKey{}
    case Refresh{}:
      refresh(pending, leased, suppressed, maximum)

def advance(remaining: Maybe<&2, Nat>, count: Nat, maximum: Nat,
    suppressed: Nat, pending: Maybe<&2, Nat>, leased: Bool,
    max_count: Nat) -> Advance:
  advance.action(decide(remaining, count, maximum), suppressed, pending, leased, max_count)

def main() -> Action:
  decide(Some{10n}, 1n, 64n)
