import Base

# Source-free collection readiness and ordering.
type Order is Data:
  Before{}
  Equal{}
  After{}

type CredentialDisposition is Data:
  RetainAdvice{}
  RetireAdvice{}

def credential_disposition(same_scope: Bool,
    generation_valid: Bool) -> CredentialDisposition:
  Bool.pick(CredentialDisposition, Bool.and(same_scope, Bool.not(generation_valid)),
    RetireAdvice{}, RetainAdvice{})

def order(+left_sequence: Nat, +right_sequence: Nat) -> Order:
  Bool.pick(Order, Nat.is_lt(left_sequence, right_sequence), Before{},
    Bool.pick(Order, Nat.is_gt(left_sequence, right_sequence), After{}, Equal{}))

def eligible(stop_deciding: Bool, edit_complete: Bool) -> Bool:
  Bool.or(stop_deciding, edit_complete)

def expired(elapsed: Nat, lifetime: Nat) -> Bool:
  Nat.is_ge(elapsed, lifetime)

def main() -> Bool:
  eligible(False{}, True{})
