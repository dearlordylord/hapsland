import Base

# Native canonical input equality is an identity fact. Bend decides whether
# the current revision gains another member or a new revision supersedes it.
type Registration is Data:
  Reuse{}
  Replace{}

def register(has_current: Bool, same_input: Bool) -> Registration:
  Bool.pick(Registration, Bool.and(has_current, same_input), Reuse{}, Replace{})

# Subject and generation are source-free resident IDs. A new generation
# invalidates only records for the same canonical subject.
def superseded(candidate_subject: Nat, target_subject: Nat,
    candidate_generation: Nat, current_generation: Nat) -> Bool:
  Bool.and(Nat.is_eq(candidate_subject, target_subject),
    Bool.not(Nat.is_eq(candidate_generation, current_generation)))

def main() -> Bool:
  superseded(1n, 1n, 1n, 2n)
