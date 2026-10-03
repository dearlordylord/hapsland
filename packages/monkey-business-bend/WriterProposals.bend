# Unapproved finite primitive proposals under #176. Source-only declarations:
# no falsification, kernel proof, runtime or available-progress claim yet.
import Base
import ./WriterScenario.bend as W
import ./CollectionScenario.bend as Response
import ../agent-flow-bend/Canonical.bend as C

# For every finite original capture list, a refused claim preserves all members
# and their immutable response/clock facts. A trigger does not acquire a lease.
law refused_claim_preserves_membership:
  for +writers: List<&2,W.Capture>
  for +managed: List<&2,Response.Scope>
  for capture: W.Capture
  {W.retain(W.State{writers,managed},capture,False{}) == W.State{writers,managed} : W.State}

# A refused release cannot consume someone else's retained waiter. This is an
# exact feedback law, not a claim that all releases ought to be refused.
law refused_release_preserves_membership:
  for +writers: List<&2,W.Capture>
  for +managed: List<&2,Response.Scope>
  for target: W.Target
  {W.removed(W.State{writers,managed},target,False{}) == W.State{writers,managed} : W.State}

# For every original scope/token and arbitrary clocks, expiry sampling keeps
# its original claim time and lease length. Canonical owns >= at equality.
law original_claim_clock:
  for +partition: Nat
  for lifetime: Nat
  for round: Nat
  for +token: Nat
  for +started: Nat
  for +duration: Nat
  for capacity: Nat
  for response_id: Nat
  for response: Response.Response
  for +now: Nat
  {W.expire_capture(Some{W.Capture{W.Target{partition,lifetime,round,token},started,duration,capacity,response_id,response}},now) == [C.CollectionExpireBackground{partition,token,(now - started : Nat),duration}] : List<&2,C.CanonicalEvent>}
