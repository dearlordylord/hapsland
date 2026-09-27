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

def main() -> Action:
  decide(Some{10n}, 1n, 64n)
