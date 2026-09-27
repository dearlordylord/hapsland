import Base

# Advicing is the wider hook-to-advice flow. This slice models items during
# Jeview: the part where Jev evaluates them and returns findings.
# There is no stored Jev-result state between Jeview and pending advice.
type Jeview is Data:
  AtJev{item: Nat}

type PendingAdvice is Data:
  AdvicePending{item: Nat}

def receive_finding(jeview: Jeview) -> PendingAdvice:
  match jeview:
    case AtJev{item}:
      AdvicePending{item}

# The second item is carried through unchanged when the first gets a finding.
def receive_finding_with_other(first: Jeview, other: Jeview) -> PendingAdvice & Jeview:
  (receive_finding(first), other)
