import Base
import ./Notice.bend as Notice

# Numeric key, notice, partition, group, reservation, and order identities only.
# Clock readings, source, credentials, output text, and host tokens stay native.
type Pending is Data:
  Pending{id: Nat, count: Nat, sequence: Nat, leased: Bool}

type Record is Data:
  Record{id: Nat, partition: Nat, group: Nat, reservation: Nat,
    suppressed: Nat, pending: Maybe<&2, Pending>}

type State is Data:
  State{records: List<&2, Record>}

type Advance is Data:
  Suppressed{state: State, count: Nat}
  RejectedFull{state: State}
  CreateKey{state: State}
  CreatePending{state: State, count: Nat}
  MergePending{state: State, count: Nat}
  KeepLeased{state: State}
  RefusedAdvance{state: State}

type Decision is Data:
  Granted{state: State}
  Refused{state: State}

type PruneResult is Data:
  Pruned{state: State, drop_lease: Bool, drop_pending: Bool, drop_key: Bool}
  PruneMissing{state: State}

def initial() -> State:
  State{Nil{}}

def record_id(record: Record) -> Nat:
  match record:
    case Record{id, _, _, _, _, _}: id

def pending_id(pending: Pending) -> Nat:
  match pending:
    case Pending{id, _, _, _}: id

def pending_sequence(pending: Pending) -> Nat:
  match pending:
    case Pending{_, _, sequence, _}: sequence

def find_record(+id: Nat, records: List<&2, Record>) -> Maybe<&2, Record>:
  match records:
    case Nil{}: None{}
    case +record <> rest:
      Bool.pick(Maybe<&2, Record>, Nat.is_eq(id, record_id(record)),
        Some{record}, find_record(id, rest))

def without_choice(record: Record, tail: List<&2, Record>, hit: Bool) -> List<&2, Record>:
  match hit:
    case True{}: tail
    case False{}: record <> tail

def without(+id: Nat, records: List<&2, Record>) -> List<&2, Record>:
  match records:
    case Nil{}: Nil{}
    case +record <> rest:
      without_choice(record, without(id, rest), Nat.is_eq(id, record_id(record)))

def pending_count(pending: Maybe<&2, Pending>) -> Maybe<&2, Nat>:
  match pending:
    case Some{Pending{_, count, _, _}}: Some{count}
    case None{}: None{}

def pending_leased(pending: Maybe<&2, Pending>) -> Bool:
  match pending:
    case Some{Pending{_, _, _, leased}}: leased
    case None{}: False{}

def replace(state: State, +record: Record) -> State:
  match state:
    case State{records}: State{record <> without(record_id(record), records)}

def advance_applied(state: State, record: Record, action: Notice.Advance,
    proposed: Nat, sequence: Nat) -> Advance:
  match record action:
    case Record{id, partition, group, reservation, _, pending} Notice.Suppressed{+count}:
      Suppressed{replace(state, Record{id, partition, group, reservation, count, pending}), count}
    case _ Notice.RejectedFull{}: RejectedFull{state}
    case _ Notice.CreateKey{}: RefusedAdvance{state}
    case Record{id, partition, group, reservation, _, _} Notice.CreatePending{+count}:
      CreatePending{replace(state, Record{id, partition, group, reservation, 0n,
        Some{Pending{proposed, count, sequence, False{}}}}), count}
    case Record{
      id,
      partition,
      group,
      reservation,
      _,
      Some{Pending{pending_id, _, previous, leased}}
    } Notice.MergePending{+count}:
      MergePending{replace(state, Record{id, partition, group, reservation, 0n,
        Some{Pending{pending_id, count, previous, leased}}}), count}
    case Record{id, partition, group, reservation, _, pending} Notice.KeepLeased{}:
      KeepLeased{replace(state, Record{id, partition, group, reservation, 0n, pending})}
    case _ _: RefusedAdvance{state}

def advance_found(+state: State, found: Maybe<&2, Record>, remaining: Maybe<&2, Nat>,
    maximum_keys: Nat, proposed: Nat, sequence: Nat, max_count: Nat) -> Advance:
  match state found:
    case State{+records} None{}:
      Bool.pick(Advance, Nat.is_ge(List.length(&2, Record, records), maximum_keys),
        RejectedFull{state}, CreateKey{state})
    case _ Some{+record}:
      match record:
        case Record{_, _, _, _, suppressed, +pending}:
          advance_applied(state, record, Notice.advance(remaining, 1n, maximum_keys,
            suppressed, pending_count(pending), pending_leased(pending), max_count),
            proposed, sequence)

def advance(+state: State, key: Nat, remaining: Maybe<&2, Nat>,
    maximum_keys: Nat, proposed: Nat, sequence: Nat, max_count: Nat) -> Advance:
  match state:
    case State{records}:
      advance_found(state, find_record(key, records), remaining,
        maximum_keys, proposed, sequence, max_count)

def commit(+state: State, +key: Nat, +partition: Nat, +group: Nat,
    +reservation: Nat, +pending: Nat, sequence: Nat, maximum_keys: Nat) -> Decision:
  match state:
    case State{+records}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(key, 0n),
        Bool.and(Nat.is_gt(partition, 0n), Bool.and(Nat.is_gt(group, 0n),
          Bool.and(Nat.is_gt(reservation, 0n), Bool.and(Nat.is_gt(pending, 0n),
            Bool.and(Maybe.is_none(&2, Record, find_record(key, records)),
              Nat.is_lt(List.length(&2, Record, records), maximum_keys))))))),
        Granted{State{Record{key, partition, group, reservation, 0n,
          Some{Pending{pending, 0n, sequence, False{}}}} <> records}}, Refused{state})

def records_of(state: State) -> List<&2, Record>:
  match state:
    case State{records}: records

def prune_pending(pending: Maybe<&2, Pending>, drop_lease: Bool,
    drop_pending: Bool) -> Maybe<&2, Pending>:
  match pending drop_pending:
    case _ True{}: None{}
    case Some{Pending{id, count, sequence, leased}} False{}:
      Some{Pending{id, count, sequence, Bool.and(leased, Bool.not(drop_lease))}}
    case None{} False{}: None{}

def prune_applied(+state: State, record: Record, decision: Notice.Prune) -> PruneResult:
  match record decision:
    case Record{id, partition, group, reservation, suppressed, pending} Notice.Prune{
      +drop_lease,
      +drop_pending,
      +drop_key
    }:
      match drop_key:
        case True{}: Pruned{
          State{without(id, records_of(state))},
          drop_lease,
          drop_pending,
          drop_key
        }
        case False{}:
          Pruned{replace(state, Record{id, partition, group, reservation, suppressed,
            prune_pending(pending, drop_lease, drop_pending)}),
            drop_lease, drop_pending, drop_key}

def prune_found(state: State, found: Maybe<&2, Record>, lease_expired: Bool,
    pending_expired: Bool, excepted: Bool, cooldown_expired: Bool) -> PruneResult:
  match found:
    case None{}: PruneMissing{state}
    case Some{+record}:
      match record:
        case Record{_, _, _, _, _, +pending}:
          prune_applied(state, record, Notice.prune(Maybe.is_some(&2, Pending, pending),
            pending_leased(pending), lease_expired, pending_expired,
            excepted, cooldown_expired))

def prune(+state: State, key: Nat, lease_expired: Bool,
    pending_expired: Bool, excepted: Bool, cooldown_expired: Bool) -> PruneResult:
  match state:
    case State{records}:
      prune_found(state, find_record(key, records), lease_expired,
        pending_expired, excepted, cooldown_expired)

def drop(state: State, key: Nat) -> State:
  match state:
    case State{records}: State{without(key, records)}

def set_leased(pending: Maybe<&2, Pending>, leased: Bool) -> Maybe<&2, Pending>:
  match pending:
    case Some{Pending{id, count, sequence, _}}:
      Some{Pending{id, count, sequence, leased}}
    case None{}: None{}

def lease_found(state: State, found: Maybe<&2, Record>, leased: Bool) -> Decision:
  match found:
    case Some{Record{id, partition, group, reservation, suppressed, pending}}:
      match pending:
        case Some{_}:
          Granted{replace(state, Record{id, partition, group, reservation, suppressed,
            set_leased(pending, leased)})}
        case None{}: Refused{state}
    case None{}: Refused{state}

def lease(+state: State, key: Nat, leased: Bool) -> Decision:
  match state:
    case State{records}: lease_found(state, find_record(key, records), leased)

def clear_pending_found(state: State, found: Maybe<&2, Record>) -> Decision:
  match found:
    case Some{Record{id, partition, group, reservation, suppressed, Some{_}}}:
      Granted{replace(state, Record{id, partition, group, reservation, suppressed, None{}})}
    case _:
      Refused{state}

def clear_pending(+state: State, key: Nat) -> Decision:
  match state:
    case State{records}: clear_pending_found(state, find_record(key, records))

def contains(id: Nat, items: List<&2, Nat>) -> Bool:
  List.contains(~Nat, ~Nat.is_eq, items, id)

def candidate(record: Record, partition: Nat, group: Nat, composed: Bool,
    authority_bound: Bool, allowed: List<&2, Nat>) -> Maybe<&2, Pending>:
  match record:
    case Record{_, owner, delivery_group, _, _, Some{+pending}}:
      Bool.pick(Maybe<&2, Pending>, Bool.and(Bool.pick(Bool, composed,
        Nat.is_eq(delivery_group, group), Nat.is_eq(owner, partition)),
        Bool.and(Bool.not(pending_leased(Some{pending})),
          Bool.or(Bool.not(authority_bound), contains(pending_id(pending), allowed)))),
        Some{pending}, None{})
    case _:
      None{}

def insert_pending(+pending: Pending, ordered: List<&2, Pending>) -> List<&2, Pending>:
  match ordered:
    case Nil{}: pending <> Nil{}
    case +head <> +rest:
      Bool.pick(List<&2, Pending>, Nat.is_le(pending_sequence(pending), pending_sequence(head)),
        pending <> head <> rest, head <> insert_pending(pending, rest))

def collect_choice(found: Maybe<&2, Pending>, tail: List<&2, Pending>) -> List<&2, Pending>:
  match found:
    case Some{pending}: insert_pending(pending, tail)
    case None{}: tail

def collect_candidates(records: List<&2, Record>, +partition: Nat, +group: Nat,
    +composed: Bool, +authority_bound: Bool, +allowed: List<&2, Nat>) -> List<&2, Pending>:
  match records:
    case Nil{}: Nil{}
    case record <> rest:
      collect_choice(candidate(record, partition, group, composed, authority_bound, allowed),
        collect_candidates(rest, partition, group, composed, authority_bound, allowed))

def pending_ids(pending: List<&2, Pending>) -> List<&2, Nat>:
  match pending:
    case Nil{}: Nil{}
    case item <> rest: pending_id(item) <> pending_ids(rest)

def select(state: State, partition: Nat, group: Nat, composed: Bool,
    authority_bound: Bool, allowed: List<&2, Nat>) -> List<&2, Nat>:
  match state:
    case State{records}:
      pending_ids(collect_candidates(records, partition, group, composed,
        authority_bound, allowed))
