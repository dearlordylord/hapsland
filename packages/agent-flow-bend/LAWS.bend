import Base
import ./Advicing.bend as Advicing

# A Jev finding ends the item's Jeview and produces pending advice for the
# same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Advicing.receive_finding(Advicing.AtJev{item}) == Advicing.AdvicePending{item} : Advicing.PendingAdvice}

# A finding for the first value leaves the second Jeview value unchanged.
# This law allows both values to carry the same item ID.
law finding_preserves_second_value:
  for item: Nat
  for second_item: Nat
  {Advicing.receive_finding_with_second(
    Advicing.AtJev{item}, Advicing.AtJev{second_item}
  ) == (
    Advicing.AdvicePending{item}, Advicing.AtJev{second_item}
  ) : Advicing.PendingAdvice & Advicing.Jeview}
