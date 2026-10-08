import Base
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/ReuseState.bend as Reuse
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/Ledger.bend as Ledger
import ./SharingScenario.bend as Sharing
import ./FreshnessScenario.bend as Freshness

# Retained source-free results only. Canonical owns admission, LRU and ledger;
# Sharing owns current members, physical callbacks and live advice. No TTL.
# Its interned key must carry the actual resident reuse namespace (work and
# captured credential generation) plus prepared.identity, while partition is
# the logical ledger owner. Credential generation is not semantic input content.
type Offer is Data:
  Offer{id: Nat, key: Sharing.SharingKey, original: Freshness.Scope,
    bytes: Nat, outcome: C.RequestOutcome}
type Payload is Data:
  Payload{offer: Offer, reservation: Nat}
type State is Data:
  State{payloads: List<&2, Payload>}
type Feedback is Data:
  Feedback{state: State, releases: List<&2, C.CanonicalEvent>}

def initial() -> State:
  State{[]}

def offer_id(offer: Offer) -> Nat:
  match offer:
    case Offer{id, _, _, _, _}: id

def offer_partition(offer: Offer) -> Nat:
  match offer:
    case Offer{_, Sharing.SharingKey{partition, _}, _, _, _}: partition

def payload_id(payload: Payload) -> Nat:
  match payload:
    case Payload{offer, _}: offer_id(offer)

def same_outcome(left: C.RequestOutcome, right: C.RequestOutcome) -> Bool:
  match left right:
    case C.NeverSent{} C.NeverSent{}: True{}
    case C.RequestClear{} C.RequestClear{}: True{}
    case C.RequestFinding{} C.RequestFinding{}: True{}
    case C.RequestBackendFailure{} C.RequestBackendFailure{}: True{}
    case C.RequestTimeout{} C.RequestTimeout{}: True{}
    case C.RequestInterrupted{} C.RequestInterrupted{}: True{}
    case _ _: False{}

def same_offer(left: Offer, right: Offer) -> Bool:
  match left right:
    case Offer{id, key, original, bytes, outcome} Offer{other, other_key, scope, size, result}:
      Nat.is_eq(id, other) && Sharing.same_key(key, other_key) &&
        Freshness.same(original, scope) && Nat.is_eq(bytes, size) && same_outcome(outcome, result)

def successful(outcome: C.RequestOutcome) -> Bool:
  match outcome:
    case C.RequestFinding{}: True{}
    case C.RequestClear{}: True{}
    case _: False{}

def valid(offer: Offer) -> Bool:
  match offer:
    case Offer{
      id,
      Sharing.SharingKey{+partition, prepared},
      Freshness.Scope{owner, lifetime, round, operation},
      _,
      outcome
    }:
      Nat.is_gt(id, 0n) && Nat.is_gt(partition, 0n) && Nat.is_gt(prepared, 0n) && Nat.is_eq(
        partition,
        owner
      ) && Nat.is_gt(lifetime, 0n) && Nat.is_gt(round, 0n) && Nat.is_gt(operation, 0n) && successful(
        outcome
      )

def choose(found: Bool, payload: Payload, rest: Maybe<&2, Payload>) -> Maybe<&2, Payload>:
  match found:
    case True{}: Some{payload}
    case False{}: rest

def find(items: List<&2, Payload>, +id: Nat) -> Maybe<&2, Payload>:
  match items:
    case Nil{}: None{}
    case +head <> tail: choose(Nat.is_eq(payload_id(head), id), head, find(tail, id))

def lookup(state: State, id: Nat) -> Maybe<&2, Payload>:
  match state:
    case State{items}: find(items, id)

def key_lookup(items: List<&2, Payload>, +key: Sharing.SharingKey) -> Maybe<&2, Payload>:
  match items:
    case Nil{}: None{}
    case +head <> tail:
      match head:
        case Payload{Offer{_, other, _, _, _}, _}: choose(
          Sharing.same_key(key, other),
          head,
          key_lookup(tail, key)
        )

# Lookup only supplies an existing id for Canonical.ReuseRoute/Touch. It is not
# a cache hit. Delivery must require actual ReuseCacheHit plus exact live entry.
def found_id(found: Maybe<&2, Payload>) -> Maybe<&2, Nat>:
  match found:
    case Some{Payload{offer, _}}: Some{offer_id(offer)}
    case None{}: None{}

def key_id(state: State, key: Sharing.SharingKey) -> Maybe<&2, Nat>:
  match state:
    case State{items}: found_id(key_lookup(items, key))

def entry_matches(payload: Payload, entry: Reuse.Entry) -> Bool:
  match payload entry:
    case Payload{Offer{id, Sharing.SharingKey{partition, _}, _, bytes, _}, reservation} Reuse.Entry{
      other,
      owner,
      size,
      charge
    }:
      Nat.is_eq(id, other) && Nat.is_eq(partition, owner) && Nat.is_eq(bytes, size) && Nat.is_eq(
        reservation,
        charge
      )

def cached(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.EventEstablished{C.ReuseCacheHit{}} <> _: True{}
    case _ <> tail: cached(tail)

def hit_matching(payload: Payload, allowed: Bool) -> Maybe<&2, Payload>:
  match allowed:
    case True{}: Some{payload}
    case False{}: None{}

def hit_checked(
  payload: Maybe<&2, Payload>,
  entry: Maybe<&2, Reuse.Entry>,
  accepted: Bool
) -> Maybe<&2, Payload>:
  match payload entry accepted:
    case Some{+payload} Some{entry} True{}:
      hit_matching(payload, entry_matches(payload, entry))
    case _ _ _: None{}

def cached_lookup(state: Reuse.State, id: Nat) -> Maybe<&2, Reuse.Entry>:
  match state:
    case Reuse.State{_, entries}: Reuse.find_entry(id, entries)

def absent(found: Maybe<&2, Payload>) -> Bool:
  match found:
    case None{}: True{}
    case Some{_}: False{}

def hit(
  state: State,
  canonical: C.State,
  +id: Nat,
  outputs: List<&2, C.Output>
) -> Maybe<&2, Payload>:
  hit_checked(
    lookup(state, id),
    cached_lookup(Collection.reuse_state(C.collection_of(canonical)), id),
    cached(outputs)
  )

def prepare(offer: Offer, entry_limit: Nat, byte_limit: Nat) -> C.CanonicalEvent:
  match offer:
    case Offer{id, _, _, bytes, _}: C.CachePrepare{id, bytes, entry_limit, byte_limit}

def reserve(offer: Offer) -> C.CanonicalEvent:
  match offer:
    case Offer{_, Sharing.SharingKey{partition, _}, _, bytes, _}: C.ReserveCapacity{
      partition,
      bytes,
      Ledger.StoredResult{}
    }

def commit(offer: Offer, reservation: Nat, entry_limit: Nat, byte_limit: Nat) -> C.CanonicalEvent:
  match offer:
    case Offer{id, Sharing.SharingKey{partition, _}, _, bytes, _}:
      C.CacheCommit{id, partition, bytes, reservation, entry_limit, byte_limit}

def committed(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.EventEstablished{C.CacheCommitted{}} <> _: True{}
    case _ <> tail: committed(tail)

# The actual post-commit entry must match the immutable offered identity and
# original reservation; no speculative payload is observable before commit.
def retained_allowed(items: List<&2, Payload>, payload: Payload, allowed: Bool) -> State:
  match allowed:
    case True{}: State{List.append(&2, Payload, items, [payload])}
    case False{}: State{items}

def payload_offer(payload: Payload) -> Offer:
  match payload:
    case Payload{offer, _}: offer

def retain_checked(
  state: State,
  +payload: Payload,
  entry: Maybe<&2, Reuse.Entry>,
  accepted: Bool
) -> State:
  match state entry accepted:
    case State{+items} Some{entry} True{}:
      retained_allowed(
        items,
        payload,
        entry_matches(
          payload,
          entry
        ) && valid(payload_offer(payload)) && absent(find(items, payload_id(payload)))
      )
    case state _ _: state

def retain(
  state: State,
  canonical: C.State,
  +offer: Offer,
  reservation: Nat,
  outputs: List<&2, C.Output>
) -> State:
  retain_checked(
    state,
    Payload{offer, reservation},
    cached_lookup(Collection.reuse_state(C.collection_of(canonical)), offer_id(offer)),
    committed(outputs)
  )

def remove_if(found: Bool, payload: Payload, rest: List<&2, Payload>) -> List<&2, Payload>:
  match found:
    case True{}: rest
    case False{}: payload <> rest

def remove(items: List<&2, Payload>, +id: Nat) -> List<&2, Payload>:
  match items:
    case Nil{}: []
    case +head <> tail: remove_if(Nat.is_eq(payload_id(head), id), head, remove(tail, id))

def release_entry(entry: Maybe<&2, Reuse.Entry>) -> List<&2, C.CanonicalEvent>:
  match entry:
    case Some{Reuse.Entry{_, _, _, reservation}}: [C.ReleaseCapacity{reservation}]
    case None{}: []

def dropped_tail(before: Reuse.State, id: Nat, feedback: Feedback) -> Feedback:
  match feedback:
    case Feedback{state, releases}:
      Feedback{
        state,
        List.append(&2, C.CanonicalEvent, release_entry(cached_lookup(before, id)), releases)
      }

def drop_ids(ids: List<&2, Nat>, state: State, +before: Reuse.State) -> Feedback:
  match ids state:
    case Nil{} State{items}: Feedback{State{items}, []}
    case +id <> tail State{items}:
      dropped_tail(before, id, drop_ids(tail, State{remove(items, id)}, before))

# Call with the actual pre-command canonical state. Payloads and charges are
# removed only for ids returned by real CachePrepared/CacheDiscarded, never
# because a host key or clock says an entry ought to disappear.
def feedback(state: State, +before: C.State, outputs: List<&2, C.Output>) -> Feedback:
  match outputs:
    case Nil{}: Feedback{state, []}
    case C.EventEstablished{C.CachePrepared{ids}} <> _: drop_ids(
      ids,
      state,
      Collection.reuse_state(C.collection_of(before))
    )
    case C.EventEstablished{C.CacheDiscarded{ids}} <> _: drop_ids(
      ids,
      state,
      Collection.reuse_state(C.collection_of(before))
    )
    case _ <> tail: feedback(state, before, tail)

# A concurrent refused commit releases its newly reserved charge, never the
# old cache owner. Caller processes each actual commit feedback once.
def refused(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.PolicyDecided{C.ReuseRefused{}} <> _: True{}
    case _ <> tail: refused(tail)

def owns_reservation(items: List<&2, Reuse.Entry>, +reservation: Nat) -> Bool:
  match items:
    case Nil{}: False{}
    case Reuse.Entry{_, _, _, charge} <> tail: Nat.is_eq(charge, reservation) || owns_reservation(
      tail,
      reservation
    )

def refused_release_checked(eligible: Bool, reservation: Nat) -> List<&2, C.CanonicalEvent>:
  match eligible:
    case True{}: [C.ReleaseCapacity{reservation}]
    case False{}: []

def ledger_charges(state: C.State) -> List<&2, Ledger.Charge>:
  match state:
    case C.State{Ledger.Ledger{_, _, charges}, _, _, _, _, _, _, _, _}: charges

def refused_entries(
  +before: C.State,
  partition: Nat,
  bytes: Nat,
  +reservation: Nat,
  outputs: List<&2, C.Output>,
  reuse: Reuse.State
) -> List<&2, C.CanonicalEvent>:
  match reuse:
    case Reuse.State{_, entries}:
      refused_release_checked(
        refused(
          outputs
        ) && C.cache_charge_valid(
          Ledger.find(reservation, ledger_charges(before)),
          partition,
          bytes
        ) && Bool.not(owns_reservation(entries, reservation)),
        reservation
      )

def refused_release(
  +before: C.State,
  offer: Offer,
  +reservation: Nat,
  outputs: List<&2, C.Output>
) -> List<&2, C.CanonicalEvent>:
  match offer:
    case Offer{_, Sharing.SharingKey{partition, _}, _, bytes, _}:
      refused_entries(
        before,
        partition,
        bytes,
        reservation,
        outputs,
        Collection.reuse_state(C.collection_of(before))
      )

def original(offer: Offer) -> Freshness.Scope:
  match offer:
    case Offer{_, _, original, _, _}: original
