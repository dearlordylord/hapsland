# Candidate laws only: original identity/cutoff facts, not universal liveness.
import Base
import ./StopScenario.bend as Stop
import ../agent-flow-bend/Canonical.bend as Canonical

# Every captured identity and time: polling never substitutes another lifetime,
# round or cutoff; the deadline predicate uses the original captured cutoff.
law poll_preserves_captured_scope:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for attempt: Nat
  for token: Nat
  for started: Nat
  for +cutoff: Nat
  for +now: Nat
  {Stop.poll(Stop.Capture{p,l,r,attempt,token,started,cutoff},now) ==
    Canonical.StopPolled{p,l,r,Nat.is_le(cutoff,now)} : Canonical.CanonicalEvent}
