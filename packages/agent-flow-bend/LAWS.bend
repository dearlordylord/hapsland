import Base
import ./Advicing.bend as Advicing

# A Jev finding ends the item's Jeview and produces pending advice for the
# same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Advicing.receive_finding(Advicing.AtJev{item}) == Advicing.AdvicePending{item} : Advicing.PendingAdvice}

# A finding for the first item leaves the second item in Jeview unchanged.
law finding_preserves_other_jeview:
  for item: Nat
  for other: Nat
  {Advicing.receive_finding_with_other(
    Advicing.AtJev{item}, Advicing.AtJev{other}
  ) == (
    Advicing.AdvicePending{item}, Advicing.AtJev{other}
  ) : Advicing.PendingAdvice & Advicing.Jeview}
