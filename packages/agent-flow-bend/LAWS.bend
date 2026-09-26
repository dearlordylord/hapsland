import Base
import ./Advicing.bend as Advicing

# A Jev finding ends the item's Jeview and produces pending advice for the
# same item in one transition.
law finding_enters_pending_advice:
  for item: Nat
  {Advicing.receive_finding(Advicing.AtJev{item}) == Advicing.AdvicePending{item} : Advicing.PendingAdvice}
