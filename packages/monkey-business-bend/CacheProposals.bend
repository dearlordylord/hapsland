# Unapproved declarations under #176; not checked/falsified/proved yet.
import Base
import ./CacheScenario.bend as Cache
import ./SharingScenario.bend as Sharing
import ./FreshnessScenario.bend as Freshness
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/ReuseState.bend as ReuseState

law refusal_never_retains_speculation:
  for +state: Cache.State
  for payload: Cache.Payload
  for entry: Maybe<&2,ReuseState.Entry>
  {Cache.retain_checked(state,payload,entry,False{}) == state : Cache.State}

law absent_cached_command_never_authorizes_payload:
  for payload: Maybe<&2,Cache.Payload>
  for entry: Maybe<&2,ReuseState.Entry>
  {Cache.hit_checked(payload,entry,False{}) == None{} : Maybe<&2,Cache.Payload>}

law exact_cache_provenance:
  for +id: Nat
  for +key: Sharing.Key
  for +scope: Freshness.Scope
  for +bytes: Nat
  for +outcome: C.RequestOutcome
  {Cache.same_offer(Cache.Offer{id,key,scope,bytes,outcome},Cache.Offer{id,key,scope,bytes,outcome}) == True{} : Bool}
