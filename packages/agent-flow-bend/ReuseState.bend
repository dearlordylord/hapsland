import Base

# Numeric evaluation and partition identities only. Cached payloads, requests,
# source-derived keys, credentials, clocks, and reservations remain native.
type Claim is Data:
  Claim{id: Nat, attached: Bool}

type Entry is Data:
  Entry{id: Nat, partition: Nat, bytes: Nat, reservation: Nat}

type State is Data:
  State{claims: List<&2, Claim>, cache: List<&2, Entry>}

type Route is Data:
  JoinAdvice{state: State}
  JoinPending{state: State}
  JoinClaimed{state: State}
  Cached{state: State}
  Own{state: State}

type Plan is Data:
  Already{state: State}
  Reject{state: State}
  Prepared{state: State, evicted: List<&2, Nat>}

type Decision is Data:
  Granted{state: State}
  Refused{state: State}

type Discard is Data:
  Discarded{state: State, ids: List<&2, Nat>}

def initial() -> State:
  State{Nil{}, Nil{}}

def claim_id(claim: Claim) -> Nat:
  match claim:
    case Claim{id, _}: id

def entry_id(entry: Entry) -> Nat:
  match entry:
    case Entry{id, _, _, _}: id

def entry_partition(entry: Entry) -> Nat:
  match entry:
    case Entry{_, partition, _, _}: partition

def entry_reservation(entry: Entry) -> Nat:
  match entry:
    case Entry{_, _, _, reservation}: reservation

def find_reservation(+reservation: Nat, cache: List<&2, Entry>) -> Bool:
  match cache:
    case Nil{}: False{}
    case +entry <> rest:
      Bool.or(Nat.is_eq(reservation, entry_reservation(entry)),
        find_reservation(reservation, rest))

def find_claim(+id: Nat, claims: List<&2, Claim>) -> Maybe<&2, Claim>:
  match claims:
    case Nil{}: None{}
    case +claim <> rest:
      Bool.pick(Maybe<&2, Claim>, Nat.is_eq(id, claim_id(claim)),
        Some{claim}, find_claim(id, rest))

def find_entry(+id: Nat, cache: List<&2, Entry>) -> Maybe<&2, Entry>:
  match cache:
    case Nil{}: None{}
    case +entry <> rest:
      Bool.pick(Maybe<&2, Entry>, Nat.is_eq(id, entry_id(entry)),
        Some{entry}, find_entry(id, rest))

def keep_claim(claim: Claim, tail: List<&2, Claim>, remove: Bool) -> List<&2, Claim>:
  match remove:
    case True{}: tail
    case False{}: claim <> tail

def without_claim(+id: Nat, claims: List<&2, Claim>) -> List<&2, Claim>:
  match claims:
    case Nil{}: Nil{}
    case +claim <> rest:
      keep_claim(claim, without_claim(id, rest), Nat.is_eq(id, claim_id(claim)))

def keep_entry(entry: Entry, tail: List<&2, Entry>, remove: Bool) -> List<&2, Entry>:
  match remove:
    case True{}: tail
    case False{}: entry <> tail

def without_entry(+id: Nat, cache: List<&2, Entry>) -> List<&2, Entry>:
  match cache:
    case Nil{}: Nil{}
    case +entry <> rest:
      keep_entry(entry, without_entry(id, rest), Nat.is_eq(id, entry_id(entry)))

def route_cache_found(state: State, +id: Nat, found: Maybe<&2, Entry>) -> Route:
  match state found:
    case State{claims, cache} Some{entry}:
      Cached{State{claims, List.append(&2, Entry, without_entry(id, cache),
        entry <> Nil{})}}
    case State{claims, cache} None{}:
      Own{State{Claim{id, False{}} <> claims, cache}}

def route_cache(state: State, +id: Nat) -> Route:
  match state:
    case State{_, +cache}: route_cache_found(state, id, find_entry(id, cache))

def route_claim(state: State, +id: Nat, found: Maybe<&2, Claim>) -> Route:
  match found:
    case Some{Claim{_, True{}}}: JoinPending{state}
    case Some{Claim{_, False{}}}: JoinClaimed{state}
    case None{}: route_cache(state, id)

def route(state: State, +id: Nat, live_advice: Bool) -> Route:
  match state live_advice:
    case _ True{}: JoinAdvice{state}
    case State{+claims, _} False{}: route_claim(state, id, find_claim(id, claims))

def claim(+state: State, +id: Nat) -> Decision:
  match state:
    case State{+claims, +cache}:
      Bool.pick(Decision, Maybe.is_none(&2, Claim, find_claim(id, claims)),
        Granted{State{Claim{id, False{}} <> claims, cache}}, Refused{state})

def attach_found(state: State, +id: Nat, found: Maybe<&2, Claim>) -> Decision:
  match state found:
    case State{claims, cache} Some{_}:
      Granted{State{Claim{id, True{}} <> without_claim(id, claims), cache}}
    case _ None{}: Refused{state}

def attach(state: State, +id: Nat) -> Decision:
  match state:
    case State{+claims, _}: attach_found(state, id, find_claim(id, claims))

def release(state: State, id: Nat) -> State:
  match state:
    case State{claims, cache}: State{without_claim(id, claims), cache}

def route_cache_only_found(state: State, +id: Nat, found: Maybe<&2, Entry>) -> Route:
  match state found:
    case State{claims, cache} Some{entry}:
      Cached{State{claims, List.append(&2, Entry, without_entry(id, cache),
        entry <> Nil{})}}
    case _ None{}: Own{state}

def route_cache_only(state: State, +id: Nat) -> Route:
  match state:
    case State{_, +cache}: route_cache_only_found(state, id, find_entry(id, cache))

def touch(state: State, id: Nat) -> Route:
  route_cache_only(state, id)

def cache_bytes(cache: List<&2, Entry>) -> Nat:
  match cache:
    case Nil{}: 0n
    case Entry{_, _, bytes, _} <> rest: (bytes + cache_bytes(rest) : Nat)

def evict_for(+cache: List<&2, Entry>, +incoming: Nat, +entry_limit: Nat,
    +byte_limit: Nat, +evicted: List<&2, Nat>) -> Discard:
  match cache:
    case Nil{}: Discarded{State{Nil{}, Nil{}}, evicted}
    case Entry{id, _, _, _} <> rest:
      Bool.pick(Discard,
        Bool.or(Nat.is_ge(List.length(&2, Entry, cache), entry_limit),
          Nat.is_gt((cache_bytes(cache) + incoming : Nat), byte_limit)),
        evict_for(rest, incoming, entry_limit, byte_limit,
          List.append(&2, Nat, evicted, id <> Nil{})),
        Discarded{State{Nil{}, cache}, evicted})

def prepared_after_eviction(claims: List<&2, Claim>, result: Discard) -> Plan:
  match result:
    case Discarded{State{_, remaining}, ids}:
      Prepared{State{claims, remaining}, ids}

def prepare_missing(state: State, incoming: Nat, entry_limit: Nat,
    byte_limit: Nat, oversized: Bool) -> Plan:
  match state oversized:
    case _ True{}: Reject{state}
    case State{claims, cache} False{}:
      prepared_after_eviction(claims,
        evict_for(cache, incoming, entry_limit, byte_limit, Nil{}))

def prepare_decision(state: State, +incoming: Nat, entry_limit: Nat,
    +byte_limit: Nat, found: Maybe<&2, Entry>) -> Plan:
  match found:
    case Some{_}: Already{state}
    case None{}:
      prepare_missing(state, incoming, entry_limit, byte_limit,
        Nat.is_gt(incoming, byte_limit))

def prepare(state: State, +id: Nat, incoming: Nat, entry_limit: Nat,
    byte_limit: Nat) -> Plan:
  match state:
    case State{_, +cache}:
      prepare_decision(state, incoming, entry_limit, byte_limit, find_entry(id, cache))

def commit(+state: State, +id: Nat, +partition: Nat, +bytes: Nat,
    +reservation: Nat, entry_limit: Nat, byte_limit: Nat) -> Decision:
  match state:
    case State{claims, +cache}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(id, 0n),
        Bool.and(Nat.is_gt(partition, 0n),
          Bool.and(Nat.is_gt(reservation, 0n),
            Bool.and(Maybe.is_none(&2, Entry, find_entry(id, cache)),
              Bool.and(Bool.not(find_reservation(reservation, cache)),
                Bool.and(Nat.is_lt(List.length(&2, Entry, cache), entry_limit),
                  Nat.is_le((cache_bytes(cache) + bytes : Nat), byte_limit))))))),
        Granted{State{claims, List.append(&2, Entry, cache,
          Entry{id, partition, bytes, reservation} <> Nil{})}}, Refused{state})

def discard_choice(entry: Entry, result: Discard, selected: Bool) -> Discard:
  match entry result selected:
    case Entry{id, _, _, _} Discarded{State{_, kept}, ids} True{}:
      Discarded{State{Nil{}, kept}, id <> ids}
    case Entry{_, _, _, _} Discarded{State{_, kept}, ids} False{}:
      Discarded{State{Nil{}, entry <> kept}, ids}

def discard_partition(cache: List<&2, Entry>, +partition: Nat) -> Discard:
  match cache:
    case Nil{}: Discarded{State{Nil{}, Nil{}}, Nil{}}
    case +entry <> rest:
      discard_choice(entry, discard_partition(rest, partition),
        Nat.is_eq(entry_partition(entry), partition))

def discard_with_claims(claims: List<&2, Claim>, result: Discard) -> Discard:
  match result:
    case Discarded{State{_, kept}, ids}:
      Discarded{State{claims, kept}, ids}

def discard(state: State, partition: Nat) -> Discard:
  match state:
    case State{claims, cache}:
      discard_with_claims(claims, discard_partition(cache, partition))

def entry_ids(cache: List<&2, Entry>) -> List<&2, Nat>:
  match cache:
    case Nil{}: Nil{}
    case Entry{id, _, _, _} <> rest: id <> entry_ids(rest)

def clear(state: State) -> Discard:
  match state:
    case State{_, cache}: Discarded{initial(), entry_ids(cache)}
