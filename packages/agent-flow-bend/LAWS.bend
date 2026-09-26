import Base
import ./Review.bend as Review

# A finding for an item being reviewed by Jev completes that review and
# produces pending advice for the same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Review.receive_finding(Review.Reviewing{item}) == Review.Pending{item} : Review.PendingAdvice}
