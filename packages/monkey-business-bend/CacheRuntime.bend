import Base
import ../agent-flow-bend/Canonical.bend as C
import ./CacheScenario.bend as Cache
import ./SharingScenario.bend as Sharing

# The payload is retained only after an actual commit. Pending offers preserve
# original source and reservation facts through metadata, never cached outcomes
# inferred from a host key. Canonical owns entry capacity, eviction and touch.
type Pending is Data:
  Pending{offer: Cache.Offer, entry_limit: Nat, byte_limit: Nat, reservation: Maybe<&2,Nat>}
type State is Data:
  State{cache: Cache.State, pending: List<&2,Pending>}
type Feedback is Data:
  Feedback{state: State, events: List<&2,C.CanonicalEvent>}

def initial() -> State:
  State{Cache.initial(),[]}

def cache(state: State) -> Cache.State:
  match state:
    case State{cache,_}: cache

def key_id(state: State, key: Sharing.SharingKey) -> Maybe<&2,Nat>:
  Cache.key_id(cache(state),key)

def hit(state: State, canonical: C.State, id: Nat, commands: List<&2,C.Command>) -> Maybe<&2,Cache.Payload>:
  Cache.hit(cache(state),canonical,id,commands)

def existing_removed(state: State, before: C.State, commands: List<&2,C.Command>) -> Feedback:
  match state:
    case State{cache,pending}: existing_feedback(pending,Cache.feedback(cache,before,commands))

def existing_feedback(pending: List<&2,Pending>, feedback: Cache.Feedback) -> Feedback:
  match feedback:
    case Cache.Feedback{cache,releases}: Feedback{State{cache,pending},releases}

# No pending offer becomes a payload just because a reservation was granted.
def retained(state: State, canonical: C.State, offer: Cache.Offer, reservation: Nat, commands: List<&2,C.Command>) -> State:
  match state:
    case State{cache,pending}: State{Cache.retain(cache,canonical,offer,reservation,commands),pending}
