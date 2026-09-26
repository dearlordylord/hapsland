import Base

# Advicing is the wider hook-to-advice flow. This first slice models one item
# during its Jeview: the part where Jev evaluates it and returns a finding.
# There is no stored Jev-result state between Jeview and pending advice.
type Jeview is Data:
  AtJev{item: Nat}

type PendingAdvice is Data:
  AdvicePending{item: Nat}

def receive_finding(jeview: Jeview) -> PendingAdvice:
  match jeview:
    case AtJev{item}:
      AdvicePending{item}
