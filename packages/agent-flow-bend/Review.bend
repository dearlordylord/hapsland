import Base

# One review item at the Jev reply boundary. These types deliberately have no
# stored Jev-result state: receiving a finding creates pending advice directly.
type JevReview is Data:
  Reviewing{item: Nat}

type PendingAdvice is Data:
  Pending{item: Nat}

def receive_finding(review: JevReview) -> PendingAdvice:
  match review:
    case Reviewing{item}:
      Pending{item}
