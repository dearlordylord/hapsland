import Base

# The adapter owns opaque cached results and their LRU order. Bend decides
# whether a new success fits and when the oldest reservation must be released.
type Admission is Data:
  Already{}
  Add{}
  Reject{}

def admit(existing: Bool, incoming_bytes: Nat, byte_limit: Nat) -> Admission:
  Bool.pick(Admission, existing, Already{},
    Bool.pick(Admission, Nat.is_gt(incoming_bytes, byte_limit), Reject{}, Add{}))

def evict(+entries: Nat, current_bytes: Nat, incoming_bytes: Nat,
    entry_limit: Nat, byte_limit: Nat) -> Bool:
  Bool.and(Nat.is_gt(entries, 0n),
    Bool.or(Nat.is_ge(entries, entry_limit),
      Nat.is_gt((current_bytes + incoming_bytes : Nat), byte_limit)))

def main() -> Bool:
  evict(8n, 100n, 20n, 8n, 128000n)
