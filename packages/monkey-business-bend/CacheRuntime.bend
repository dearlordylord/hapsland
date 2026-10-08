import Base
import ../agent-flow-bend/Canonical.bend as C
import ./CacheScenario.bend as Cache
import ../agent-flow-bend/ReuseState.bend as Reuse
import ./SharingScenario.bend as Sharing
import ./FreshnessScenario.bend as Freshness
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/Ledger.bend as Ledger

# The payload is retained only after an actual commit. Pending offers preserve
# original source and reservation facts through metadata, never cached outcomes
# inferred from a host key. Canonical owns entry capacity, eviction and touch.
type Pending is Data:
  Pending{
    offer: Cache.Offer,
    entry_limit: Nat,
    byte_limit: Nat,
    reservation: Maybe<&2, Nat>,
    stage: Stage
  }
type SourceCapture is Data:
  SourceCapture{offer: Cache.Offer, binding: Freshness.Binding}
type Config is Data:
  Config{enabled: Bool, entry_limit: Nat, byte_limit: Nat}
type State is Data:
  State{
    cache: Cache.State,
    pending: List<&2, Pending>,
    sources: List<&2, SourceCapture>,
    config: Config
  }
type Feedback is Data:
  Feedback{state: State, events: List<&2, C.CanonicalEvent>}


type Stage is Data:
  PrepareStage{}
  ReserveStage{}
  CommitStage{}
type Fact is Data:
  Fact{offer: Cache.Offer, entry_limit: Nat, byte_limit: Nat,
    stage: Stage, reservation: Maybe<&2, Nat>, event: C.CanonicalEvent}
type Published is Data:
  Published{state: State, facts: List<&2, Fact>, releases: List<&2, C.CanonicalEvent>}


def initial() -> State:
  State{Cache.initial(), [], [], Config{False{}, 8n, 131072n}}

def cache(state: State) -> Cache.State:
  match state:
    case State{cache, _, _, _}: cache

def key_id(state: State, key: Sharing.SharingKey) -> Maybe<&2, Nat>:
  Cache.key_id(cache(state), key)

def hit(
  state: State,
  canonical: C.State,
  id: Nat,
  outputs: List<&2, C.Output>
) -> Maybe<&2, Cache.Payload>:
  match state:
    case State{cache, _, _, _}: Cache.hit(cache, canonical, id, outputs)

# A terminal cache attempt ends the completed evaluation claim. This does not
# retire retained advice: its actual Canonical work/charge remains authoritative.
def existing_feedback(
  pending: List<&2, Pending>,
  sources: List<&2, SourceCapture>,
  config: Config,
  feedback: Cache.Feedback
) -> Feedback:
  match feedback:
    case Cache.Feedback{cache, releases}: Feedback{State{cache, pending, sources, config}, releases}

def existing_removed(state: State, before: C.State, outputs: List<&2, C.Output>) -> Feedback:
  match state:
    case State{cache, pending, sources, config}: existing_feedback(
      pending,
      sources,
      config,
      Cache.feedback(cache, before, outputs)
    )

# No pending offer becomes a payload just because a reservation was granted.
def retained(
  state: State,
  canonical: C.State,
  offer: Cache.Offer,
  reservation: Nat,
  outputs: List<&2, C.Output>
) -> State:
  match state:
    case State{cache, pending, sources, config}: State{
      Cache.retain(cache, canonical, offer, reservation, outputs),
      pending,
      sources,
      config
    }

# Preserve identity only while the actual canonical entry still matches.
def lookup_payload(id: Nat, payload: Maybe<&2, Cache.Payload>) -> Maybe<&2, Nat>:
  match payload:
    case Some{_}: Some{id}
    case None{}: None{}

def lookup_live(cache: Cache.State, canonical: C.State, found: Maybe<&2, Nat>) -> Maybe<&2, Nat>:
  match found:
    case None{}: None{}
    case Some{+id}: lookup_payload(
      id,
      Cache.hit_checked(
        Cache.lookup(cache, id),
        Cache.cached_lookup(Collection.reuse_state(C.collection_of(canonical)), id),
        True{}
      )
    )

def lookup_key(+state: State, canonical: C.State, key: Sharing.SharingKey) -> Maybe<&2, Nat>:
  lookup_live(cache(state), canonical, Cache.key_id(cache(state), key))


# Only the original private metadata payload carries this context through a
# physical queue. A raw ReserveCapacity has no fact and cannot advance offers.
def pending_offer(value: Pending) -> Cache.Offer:
  match value:
    case Pending{offer, _, _, _, _}: offer

def pending_known(items: List<&2, Pending>, +offer: Cache.Offer) -> Bool:
  match items:
    case Nil{}: False{}
    case head <> tail: Cache.same_offer(pending_offer(head), offer) || pending_known(tail, offer)

def begun(
  state: State,
  +offer: Cache.Offer,
  +entry_limit: Nat,
  +byte_limit: Nat,
  allowed: Bool
) -> Published:
  match state allowed:
    case State{cache, pending, sources, config} True{}:
      Published{
        State{
          cache,
          Pending{offer, entry_limit, byte_limit, None{}, PrepareStage{}} <> pending,
          sources,
          config
        },
        [
          Fact{
            offer,
            entry_limit,
            byte_limit,
            PrepareStage{},
            None{},
            Cache.prepare(offer, entry_limit, byte_limit)
          }
        ],
        []
      }
    case _ False{}: Published{state, [], []}

def begin(+state: State, +offer: Cache.Offer, entry_limit: Nat, byte_limit: Nat) -> Published:
  match state:
    case State{_, pending, _, _}:
      begun(
        state,
        offer,
        entry_limit,
        byte_limit,
        Cache.valid(offer) && Bool.not(pending_known(pending, offer))
      )

def removed_pending(remove: Bool, head: Pending, tail: List<&2, Pending>) -> List<&2, Pending>:
  match remove:
    case True{}: tail
    case False{}: head <> tail

def remove_offer(items: List<&2, Pending>, +offer: Cache.Offer) -> List<&2, Pending>:
  match items:
    case Nil{}: []
    case +head <> tail:
      removed_pending(Cache.same_offer(pending_offer(head), offer), head, remove_offer(tail, offer))

def completed_pending(state: State, offer: Cache.Offer) -> State:
  match state:
    case State{cache, pending, sources, config}: State{
      cache,
      remove_offer(pending, offer),
      sources,
      config
    }

def prepared(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case Nil{}: False{}
    case C.EventEstablished{C.CachePrepared{_}} <> _: True{}
    case _ <> tail: prepared(tail)

def advanced_pending(
  state: State,
  +offer: Cache.Offer,
  entry_limit: Nat,
  byte_limit: Nat,
  reservation: Maybe<&2, Nat>,
  stage: Stage
) -> State:
  match state:
    case State{cache, pending, sources, config}:
      State{
        cache,
        Pending{offer, entry_limit, byte_limit, reservation, stage} <> remove_offer(pending, offer),
        sources,
        config
      }

def terminal_claim(offer: Cache.Offer) -> List<&2, C.CanonicalEvent>:
  match offer:
    case Cache.Offer{id, _, _, _, C.RequestClear{}}: [C.ReuseRelease{id}]
    case Cache.Offer{id, _, _, _, C.RequestFinding{}}: [C.ReuseRelease{id}]
    case _: []
def prepare_feedback(
  state: State,
  +offer: Cache.Offer,
  +entry_limit: Nat,
  +byte_limit: Nat,
  accepted: Bool
) -> Published:
  match accepted:
    case True{}: Published{
      advanced_pending(state, offer, entry_limit, byte_limit, None{}, ReserveStage{}),
      [Fact{offer, entry_limit, byte_limit, ReserveStage{}, None{}, Cache.reserve(offer)}],
      []
    }
    case False{}: Published{completed_pending(state, offer), [], terminal_claim(offer)}

def reservation(outputs: List<&2, C.Output>) -> Maybe<&2, Nat>:
  match outputs:
    case Nil{}: None{}
    case C.EventEstablished{C.CapacityGranted{id, _}} <> _: Some{id}
    case _ <> tail: reservation(tail)

def reserve_feedback(
  state: State,
  +offer: Cache.Offer,
  +entry_limit: Nat,
  +byte_limit: Nat,
  found: Maybe<&2, Nat>
) -> Published:
  match found:
    case None{}: Published{completed_pending(state, offer), [], terminal_claim(offer)}
    case Some{+id}:
      Published{
        advanced_pending(state, offer, entry_limit, byte_limit, Some{id}, CommitStage{}),
        [
          Fact{
            offer,
            entry_limit,
            byte_limit,
            CommitStage{},
            Some{id},
            Cache.commit(offer, id, entry_limit, byte_limit)
          }
        ],
        []
      }

def commit_released(
  state: State,
  +offer: Cache.Offer,
  events: List<&2, C.CanonicalEvent>
) -> Published:
  Published{
    completed_pending(state, offer),
    [],
    List.append(&2, C.CanonicalEvent, events, terminal_claim(offer))
  }

def commit_feedback(
  +state: State,
  +before: C.State,
  after: C.State,
  +offer: Cache.Offer,
  +id: Nat,
  +outputs: List<&2, C.Output>
) -> Published:
  commit_released(
    retained(state, after, offer, id, outputs),
    offer,
    Cache.refused_release(before, offer, id, outputs)
  )

def feedback_unchecked(
  state: State,
  before: C.State,
  after: C.State,
  fact: Fact,
  +outputs: List<&2, C.Output>
) -> Published:
  match fact:
    case Fact{offer, entry_limit, byte_limit, PrepareStage{}, _, _}:
      prepare_feedback(state, offer, entry_limit, byte_limit, prepared(outputs))
    case Fact{offer, entry_limit, byte_limit, ReserveStage{}, _, _}:
      reserve_feedback(state, offer, entry_limit, byte_limit, reservation(outputs))
    case Fact{offer, _, _, CommitStage{}, Some{id}, _}:
      commit_feedback(state, before, after, offer, id, outputs)
    case _: Published{state, [], []}

def same_stage(left: Stage, right: Stage) -> Bool:
  match left right:
    case PrepareStage{} PrepareStage{}: True{}
    case ReserveStage{} ReserveStage{}: True{}
    case CommitStage{} CommitStage{}: True{}
    case _ _: False{}

def same_reservation(left: Maybe<&2, Nat>, right: Maybe<&2, Nat>) -> Bool:
  match left right:
    case None{} None{}: True{}
    case Some{id} Some{other}: Nat.is_eq(id, other)
    case _ _: False{}

def fact_known(items: List<&2, Pending>, +fact: Fact) -> Bool:
  match items fact:
    case Nil{} _: False{}
    case Pending{offer, entries, bytes, reservation, stage} <> tail Fact{
      +original,
      +entry_limit,
      +byte_limit,
      +phase,
      +reserved,
      +event
    }:
      (Cache.same_offer(offer, original) && Nat.is_eq(entries, entry_limit) && Nat.is_eq(
        bytes,
        byte_limit
      ) && same_stage(stage, phase) && same_reservation(reservation, reserved)) ||
        fact_known(tail, Fact{original, entry_limit, byte_limit, phase, reserved, event})

def fact_event_valid(fact: Fact) -> Bool:
  match fact:
    case Fact{
      Cache.Offer{+id, _, _, +bytes, _},
      +entries,
      +limit,
      PrepareStage{},
      None{},
      C.CachePrepare{other, size, entry_limit, byte_limit}
    }:
      Nat.is_eq(id, other) && Nat.is_eq(bytes, size) && Nat.is_eq(entries, entry_limit) && Nat.is_eq(
        limit,
        byte_limit
      )
    case Fact{
      Cache.Offer{_, Sharing.SharingKey{partition, _}, _, bytes, _},
      _,
      _,
      ReserveStage{},
      None{},
      C.ReserveCapacity{owner, size, Ledger.StoredResult{}}
    }:
      Nat.is_eq(partition, owner) && Nat.is_eq(bytes, size)
    case Fact{
      Cache.Offer{id, Sharing.SharingKey{partition, _}, _, bytes, _},
      entries,
      limit,
      CommitStage{},
      Some{reservation},
      C.CacheCommit{other, owner, size, charge, entry_limit, byte_limit}
    }:
      Nat.is_eq(id, other) && Nat.is_eq(partition, owner) && Nat.is_eq(bytes, size) && Nat.is_eq(
        reservation,
        charge
      ) && Nat.is_eq(entries, entry_limit) && Nat.is_eq(limit, byte_limit)
    case _: False{}

def valid_fact(state: State, +fact: Fact) -> Bool:
  match state:
    case State{_, pending, _, _}: fact_known(pending, fact) && fact_event_valid(fact)


def source_capture(state: State, offer: Cache.Offer, binding: Freshness.Binding) -> State:
  match state:
    case State{cache, pending, sources, config}: State{
      cache,
      pending,
      SourceCapture{offer, binding} <> sources,
      config
    }

def current_found(found: Maybe<&2, Bool>) -> Bool:
  match found:
    case Some{current}: current
    case None{}: False{}

def feedback_guarded(
  allowed: Bool,
  state: State,
  before: C.State,
  after: C.State,
  fact: Fact,
  outputs: List<&2, C.Output>
) -> Published:
  match allowed:
    case True{}: feedback_unchecked(state, before, after, fact, outputs)
    case False{}: Published{state, [], []}

def feedback_fact(
  +state: State,
  before: C.State,
  after: C.State,
  +fact: Fact,
  outputs: List<&2, C.Output>
) -> Published:
  feedback_guarded(valid_fact(state, fact), state, before, after, fact, outputs)

def capture_published(
  published: Published,
  offer: Cache.Offer,
  binding: Freshness.Binding
) -> Published:
  match published:
    case Published{state, Nil{}, releases}: Published{state, [], releases}
    case Published{state, facts, releases}: Published{
      source_capture(state, offer, binding),
      facts,
      releases
    }

def begin_source(
  +state: State,
  +offer: Cache.Offer,
  binding: Freshness.Binding,
  entries: Nat,
  bytes: Nat
) -> Published:
  capture_published(begin(state, offer, entries, bytes), offer, binding)

def fact_event(fact: Fact) -> C.CanonicalEvent:
  match fact:
    case Fact{_, _, _, _, _, event}: event

def source_bindings(items: List<&2, SourceCapture>) -> List<&2, Freshness.Binding>:
  match items:
    case Nil{}: []
    case SourceCapture{_, binding} <> tail: binding <> source_bindings(tail)

def bindings(state: State) -> List<&2, Freshness.Binding>:
  match state:
    case State{_, _, sources, _}: source_bindings(sources)

def current_payload_found(
  offer: Cache.Offer,
  payload: Maybe<&2, Cache.Payload>,
  entry: Maybe<&2, Reuse.Entry>
) -> Bool:
  match payload entry:
    case Some{+payload} Some{entry}: Cache.same_offer(offer, Cache.payload_offer(payload)) && Cache.entry_matches(
      payload,
      entry
    )
    case _ _: False{}

def current_payload(+offer: Cache.Offer, cache: Cache.State, canonical: C.State) -> Bool:
  current_payload_found(
    offer,
    Cache.lookup(cache, Cache.offer_id(offer)),
    Cache.cached_lookup(Collection.reuse_state(C.collection_of(canonical)), Cache.offer_id(offer))
  )

def source_retained(
  +offer: Cache.Offer,
  pending: List<&2, Pending>,
  cache: Cache.State,
  canonical: C.State
) -> Bool:
  pending_known(pending, offer) || current_payload(offer, cache, canonical)

def source_kept(
  keep: Bool,
  capture: SourceCapture,
  tail: List<&2, SourceCapture>
) -> List<&2, SourceCapture>:
  match keep:
    case True{}: capture <> tail
    case False{}: tail

def retained_sources(
  items: List<&2, SourceCapture>,
  +pending: List<&2, Pending>,
  +cache: Cache.State,
  +canonical: C.State
) -> List<&2, SourceCapture>:
  match items:
    case Nil{}: []
    case SourceCapture{+offer, +binding} <> tail:
      source_kept(
        source_retained(offer, pending, cache, canonical),
        SourceCapture{offer, binding},
        retained_sources(tail, pending, cache, canonical)
      )

def retain(state: State, canonical: C.State) -> State:
  match state:
    case State{+cache, +pending, sources, config}: State{
      cache,
      pending,
      retained_sources(sources, pending, cache, canonical),
      config
    }

def reference_scopes(items: List<&2, Freshness.Binding>) -> List<&2, Freshness.Scope>:
  match items:
    case Nil{}: []
    case Freshness.Binding{scope, _, _} <> tail: scope <> reference_scopes(tail)

def references(state: State) -> List<&2, Freshness.Scope>:
  reference_scopes(bindings(state))

def binding_scope(binding: Freshness.Binding) -> Freshness.Scope:
  match binding:
    case Freshness.Binding{scope, _, _}: scope

def inserted_source(
  binding: Freshness.Binding,
  known: Maybe<&2, Freshness.Binding>,
  existing: List<&2, Freshness.Binding>
) -> List<&2, Freshness.Binding>:
  match known:
    case None{}: binding <> existing
    case Some{_}: existing

def inserted_sources(
  items: List<&2, Freshness.Binding>,
  +existing: List<&2, Freshness.Binding>
) -> List<&2, Freshness.Binding>:
  match items:
    case Nil{}: existing
    case +binding <> tail: inserted_source(
      binding,
      Freshness.lookup(existing, binding_scope(binding)),
      inserted_sources(tail, existing)
    )

def restored_sources(state: Freshness.State, cache: State) -> Freshness.State:
  match state:
    case Freshness.State{items}: Freshness.State{inserted_sources(bindings(cache), items)}

def configure(state: State, enabled: Bool, entries: Nat, bytes: Nat) -> State:
  match state:
    case State{cache, pending, sources, _}: State{
      cache,
      pending,
      sources,
      Config{enabled, entries, bytes}
    }

def begin_configured(+state: State, +offer: Cache.Offer, binding: Freshness.Binding) -> Published:
  match state:
    case State{_, _, _, Config{True{}, entries, bytes}}: begin_source(
      state,
      offer,
      binding,
      entries,
      bytes
    )
    case _: Published{state, [], []}


type Departed is Data:
  Departed{pending: List<&2, Pending>, releases: List<&2, C.CanonicalEvent>}

def cache_entries(reuse: Reuse.State) -> List<&2, Reuse.Entry>:
  match reuse:
    case Reuse.State{_, entries}: entries
def departed_release(
  +canonical: C.State,
  offer: Cache.Offer,
  reservation: Maybe<&2, Nat>
) -> List<&2, C.CanonicalEvent>:
  match offer reservation:
    case Cache.Offer{_, Sharing.SharingKey{+partition, _}, _, +bytes, _} Some{+id}:
      Cache.refused_release_checked(
        C.cache_charge_valid(
          Ledger.find(id, Cache.ledger_charges(canonical)),
          partition,
          bytes
        ) && Bool.not(
          Cache.owns_reservation(
            cache_entries(Collection.reuse_state(C.collection_of(canonical))),
            id
          )
        ),
        id
      )
    case _ None{}: []

def departure_matches(scope: Freshness.Scope, partition: Nat, lifetime: Nat) -> Bool:
  match scope:
    case Freshness.Scope{p, l, _, _}: Nat.is_eq(p, partition) && Nat.is_eq(l, lifetime)

def departed_selected(
  head: Pending,
  offer: Cache.Offer,
  reservation: Maybe<&2, Nat>,
  canonical: C.State,
  pending: List<&2, Pending>,
  releases: List<&2, C.CanonicalEvent>,
  remove: Bool
) -> Departed:
  match remove:
    case True{}: Departed{
      pending,
      List.append(&2, C.CanonicalEvent, departed_release(canonical, offer, reservation), releases)
    }
    case False{}: Departed{head <> pending, releases}

def departed_item(
  +head: Pending,
  +canonical: C.State,
  partition: Nat,
  lifetime: Nat,
  tail: Departed
) -> Departed:
  match head tail:
    case Pending{+offer, _, _, +reservation, _} Departed{pending, releases}:
      departed_selected(
        head,
        offer,
        reservation,
        canonical,
        pending,
        releases,
        departure_matches(Cache.original(offer), partition, lifetime)
      )

def departed_pending(
  items: List<&2, Pending>,
  +canonical: C.State,
  +partition: Nat,
  +lifetime: Nat
) -> Departed:
  match items:
    case Nil{}: Departed{[], []}
    case +head <> tail:
      departed_item(
        head,
        canonical,
        partition,
        lifetime,
        departed_pending(tail, canonical, partition, lifetime)
      )

def departure_state(state: State, departed: Departed) -> Feedback:
  match state departed:
    case State{cache, _, sources, config} Departed{pending, releases}: Feedback{
      State{cache, pending, sources, config},
      releases
    }

def departure(+state: State, canonical: C.State, partition: Nat, lifetime: Nat) -> Feedback:
  match state:
    case State{_, pending, _, _}: departure_state(
      state,
      departed_pending(pending, canonical, partition, lifetime)
    )
