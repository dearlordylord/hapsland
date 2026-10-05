import Base
import ./ExpiryScenario.bend as Expiry
import ../agent-flow-bend/Canonical.bend as Canonical
import ../agent-flow-bend/Ledger.bend as Ledger
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/NoticeState.bend as Notices

# Explicit source-free operational-failure exercise. These are supplied facts,
# not a conversion of Jev outcomes into ordinary advice or production limits.
# Canonical remains the sole notice, cooldown, storage and selection authority.
type Scope is Data:
  Scope{partition: Nat, group: Nat, key: Nat, maximum_keys: Nat,
    reservation_bytes: Nat, cooldown: Nat, maximum_count: Nat}
type Scheduled is Data:
  Scheduled{offset: Nat, event: Canonical.CanonicalEvent}
type Pending is Data:
  Pending{scope: Scope, key: Nat, sequence: Nat}
type State is Data:
  State{pending: List<&2, Pending>}
type Followup is Data:
  Followup{state: State, events: List<&2, Canonical.CanonicalEvent>}

def initial() -> State:
  State{[]}

def failure(scope: Scope, remaining: Maybe<&2, Nat>, +key: Nat, sequence: Nat) -> Canonical.CanonicalEvent:
  match scope:
    case Scope{_, _, _, maximum_keys, _, _, maximum_count}:
      Canonical.NoticeAdvance{key, remaining, maximum_keys, key, sequence, maximum_count}

# Existing selectable failure/cooldown/lease/key-pressure fixture. Expiry facts
# remain explicit fixture inputs; generated expiry ownership belongs to #196.
def exercise(+scope: Scope) -> List<&2, Scheduled>:
  match scope:
    case Scope{partition, group, +key, _, _, +cooldown, _}:
      [Scheduled{0n, failure(scope, None{}, key, key)},
       Scheduled{1n, failure(scope, Some{cooldown}, key, key)},
       Scheduled{(cooldown + 2n : Nat), failure(scope, Some{0n}, key, key)},
       Scheduled{(cooldown + 3n : Nat), failure(scope, None{}, (key + 1n : Nat), (key + 1n : Nat))},
       Scheduled{(cooldown + 4n : Nat), Canonical.NoticeSelect{partition, group, False{}, False{}, []}},
       Scheduled{(cooldown + 5n : Nat), Canonical.NoticeLease{key, True{}}},
       Scheduled{(cooldown + 6n : Nat), failure(scope, Some{0n}, key, key)},
       Scheduled{(2n * cooldown + 7n : Nat), Canonical.NoticePrune{key, True{}, True{}, False{}, True{}}},
       Scheduled{(2n * cooldown + 8n : Nat), failure(scope, None{}, (key + 1n : Nat), (key + 1n : Nat))},
       Scheduled{(3n * cooldown + 9n : Nat), Canonical.NoticePrune{(key + 1n : Nat), True{}, True{}, False{}, True{}}}]

def create_key(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticeCreateKey{} <> _: True{}
    case _ <> tail: create_key(tail)

def granted(commands: List<&2, Canonical.Command>) -> Maybe<&2, Nat>:
  match commands:
    case []: None{}
    case Canonical.CapacityGranted{id, _} <> _: Some{id}
    case _ <> tail: granted(tail)

def requested(+state: State, +scope: Scope, key: Nat, sequence: Nat, accepted: Bool) -> Followup:
  match state scope accepted:
    case State{pending} Scope{+partition, group, base, maximum_keys, +bytes, cooldown, maximum_count} True{}:
      Followup{State{List.append(&2, Pending, pending,
        [Pending{Scope{partition, group, base, maximum_keys, bytes, cooldown, maximum_count}, key, sequence}])},
        [Canonical.ReserveCapacity{partition, bytes, Ledger.OperationalNotice{}}]}
    case _ _ False{}: Followup{state, []}

def request(state: State, scope: Scope, key: Nat, sequence: Nat, commands: List<&2, Canonical.Command>) -> Followup:
  requested(state, scope, key, sequence, create_key(commands))

def committed(pending: Pending, remaining: List<&2, Pending>, reservation: Maybe<&2, Nat>) -> Followup:
  match pending reservation:
    case Pending{Scope{partition, group, _, maximum_keys, _, _, _}, +key, sequence} Some{id}:
      Followup{State{remaining}, [Canonical.NoticeCommit{key, partition, group, id, key, sequence, maximum_keys}]}
    case _ None{}: Followup{State{remaining}, []}

# Consume the earliest matching owner request, preserving every other advicee.
# A refusal consumes its pending attempt but never invents a reservation.
def prepend(pending: Pending, result: Followup) -> Followup:
  match result:
    case Followup{State{tail}, events}: Followup{State{pending <> tail}, events}

def reserved_match(hit: Bool, pending: Pending, tail: List<&2, Pending>,
    commands: List<&2, Canonical.Command>, rest: Followup) -> Followup:
  match hit:
    case True{}: committed(pending, tail, granted(commands))
    case False{}: prepend(pending, rest)

def owner(pending: Pending) -> Nat:
  match pending:
    case Pending{Scope{partition, _, _, _, _, _, _}, _, _}: partition

def reserved(pending: List<&2, Pending>, +partition: Nat, +commands: List<&2, Canonical.Command>) -> Followup:
  match pending:
    case []: Followup{initial(), []}
    case +head <> +tail:
      reserved_match(Nat.is_eq(owner(head), partition), head, tail, commands,
        reserved(tail, partition, commands))

def refused(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticeRefused{} <> _: True{}
    case _ <> tail: refused(tail)

def release_commit(reservation: Nat, declined: Bool) -> List<&2, Canonical.CanonicalEvent>:
  match declined:
    case True{}: [Canonical.ReleaseCapacity{reservation}]
    case False{}: []

def commit_feedback(reservation: Nat, commands: List<&2, Canonical.Command>) -> List<&2, Canonical.CanonicalEvent>:
  release_commit(reservation, refused(commands))

# Ordinary notice collection uses actual scope/authority selection, then real
# lease and acknowledgement inputs. It creates no pendingFinding work.
def collect(partition: Nat, group: Nat, composed: Bool, authority_bound: Bool,
    allowed: List<&2, Nat>) -> Canonical.CanonicalEvent:
  Canonical.NoticeSelect{partition, group, composed, authority_bound, allowed}

def lease(key: Nat) -> Canonical.CanonicalEvent:
  Canonical.NoticeLease{key, True{}}

def acknowledge(key: Nat) -> Canonical.CanonicalEvent:
  Canonical.NoticeClearPending{key}

# Clock facts are retained by the scenario, separate from Canonical policy.
type Clock is Data:
  Clock{partition: Nat, group: Nat, key: Nat, next_allowed: Nat, expiry: Maybe<&2, Expiry.NoticeClock>}

def remaining(found: Maybe<&2, Clock>, now: Nat) -> Maybe<&2, Nat>:
  match found:
    case None{}: None{}
    case Some{Clock{_, _, _, next_allowed, _}}: Some{(next_allowed - now : Nat)}

def clock_key(clock: Clock) -> Nat:
  match clock:
    case Clock{_, _, key, _, _}: key

def clock_owned(clock: Clock, partition: Nat, group: Nat) -> Bool:
  match clock:
    case Clock{owner, delivery, _, _, _}: Nat.is_eq(owner, partition) && Nat.is_eq(delivery, group)

def find_clock(clocks: List<&2, Clock>, +key: Nat) -> Maybe<&2, Clock>:
  match clocks:
    case []: None{}
    case +head <> tail:
      Bool.pick(Maybe<&2, Clock>, Nat.is_eq(clock_key(head), key), Some{head}, find_clock(tail, key))

def failure_owned(found: Maybe<&2, Clock>, partition: Nat, group: Nat) -> Bool:
  match found:
    case None{}: True{}
    case Some{clock}: clock_owned(clock, partition, group)

def supplied_failure(scope: Scope, +clocks: List<&2, Clock>, now: Nat, +key: Nat,
    sequence: Nat) -> Maybe<&2, Canonical.CanonicalEvent>:
  match scope:
    case Scope{+partition, +group, base, maximum_keys, bytes, cooldown, maximum_count}:
      Bool.pick(Maybe<&2, Canonical.CanonicalEvent>, failure_owned(find_clock(clocks, key), partition, group),
        Some{failure(Scope{partition, group, base, maximum_keys, bytes, cooldown, maximum_count},
          remaining(find_clock(clocks, key), now), key, sequence)}, None{})

def refresh_commands(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticeCommitted{} <> _: True{}
    case Canonical.NoticeCreatePending{_} <> _: True{}
    case Canonical.NoticeMergePending{_} <> _: True{}
    case Canonical.NoticeKeepLeased{} <> _: True{}
    case _ <> tail: refresh_commands(tail)

def keep_clock(hit: Bool, head: Clock, tail: List<&2, Clock>) -> List<&2, Clock>:
  match hit:
    case True{}: tail
    case False{}: head <> tail

def without_clock(clocks: List<&2, Clock>, +key: Nat) -> List<&2, Clock>:
  match clocks:
    case []: []
    case +head <> tail: keep_clock(Nat.is_eq(clock_key(head), key), head, without_clock(tail, key))

def clock_expiry(found: Maybe<&2, Clock>) -> Maybe<&2, Expiry.NoticeClock>:
  match found:
    case None{}: None{}
    case Some{Clock{_,_,_,_,expiry}}: expiry

def refreshed_clock(partition: Nat, group: Nat, key: Nat, now: Nat,
    cooldown: Nat, existing: Maybe<&2, Clock>) -> Clock:
  Clock{partition,group,key,(now + cooldown : Nat),clock_expiry(existing)}

def clock_refreshed(+clocks: List<&2, Clock>, scope: Scope, +key: Nat, now: Nat, refresh: Bool) -> List<&2, Clock>:
  match scope refresh:
    case Scope{partition, group, _, _, _, cooldown, _} True{}:
      refreshed_clock(partition,group,key,now,cooldown,find_clock(clocks,key)) <> without_clock(clocks,key)
    case _ False{}: clocks

def clock_feedback(clocks: List<&2, Clock>, scope: Scope, key: Nat, now: Nat,
    commands: List<&2, Canonical.Command>) -> List<&2, Clock>:
  clock_refreshed(clocks, scope, key, now, refresh_commands(commands))

def existing_owned(found: Maybe<&2, Clock>, partition: Nat, group: Nat) -> Bool:
  match found:
    case None{}: False{}
    case Some{clock}: clock_owned(clock, partition, group)

def owned_event(owned: Bool, event: Canonical.CanonicalEvent) -> Maybe<&2, Canonical.CanonicalEvent>:
  match owned:
    case True{}: Some{event}
    case False{}: None{}

def scoped_lease(clocks: List<&2, Clock>, partition: Nat, group: Nat, +key: Nat) -> Maybe<&2, Canonical.CanonicalEvent>:
  owned_event(existing_owned(find_clock(clocks, key), partition, group), lease(key))

def scoped_acknowledge(clocks: List<&2, Clock>, partition: Nat, group: Nat, +key: Nat) -> Maybe<&2, Canonical.CanonicalEvent>:
  owned_event(existing_owned(find_clock(clocks, key), partition, group), acknowledge(key))

def dropped_key(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticePruned{_, _, True{}} <> _: True{}
    case Canonical.NoticeDropped{} <> _: True{}
    case _ <> tail: dropped_key(tail)

def release_record(found: Maybe<&2, Notices.Record>, dropped: Bool) -> List<&2, Canonical.CanonicalEvent>:
  match found dropped:
    case Some{Notices.Record{_, _, _, reservation, _, _}} True{}:
      [Canonical.ReleaseCapacity{reservation}]
    case _ _: []

def prune_feedback(before: Canonical.State, key: Nat, commands: List<&2, Canonical.Command>) -> List<&2, Canonical.CanonicalEvent>:
  release_record(Notices.find_record(key, Notices.records_of(
    Collection.notice_state(Canonical.collection_of(before)))), dropped_key(commands))

def clocks_pruned(clocks: List<&2, Clock>, key: Nat, dropped: Bool) -> List<&2, Clock>:
  match dropped:
    case True{}: without_clock(clocks, key)
    case False{}: clocks

def prune_clocks(clocks: List<&2, Clock>, key: Nat, commands: List<&2, Canonical.Command>) -> List<&2, Clock>:
  clocks_pruned(clocks, key, dropped_key(commands))

# Only an actual new pending record starts a pending lifetime. Merge/KeepLeased
# refresh cooldown but retain both original pending and lease facts.
def new_pending(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticeCommitted{} <> _: True{}
    case Canonical.NoticeCreatePending{_} <> _: True{}
    case _ <> tail: new_pending(tail)

def refreshed_expiry(existing: Maybe<&2, Expiry.NoticeClock>, after: Canonical.State,
    key: Nat, now: Nat, profile: Expiry.Profile, created: Bool) -> Maybe<&2, Expiry.NoticeClock>:
  match existing profile created:
    case _ +profile True{}: Expiry.notice_capture(after,key,now,profile)
    case Some{clock} Expiry.Profile{_,_,cooldown} False{}:
      Some{Expiry.cooldown_refreshed(clock,now,cooldown)}
    case None{} _ False{}: None{}

def expiry_clock_feedback(clock: Clock, after: Canonical.State, now: Nat,
    profile: Expiry.Profile, commands: List<&2, Canonical.Command>) -> Clock:
  match clock:
    case Clock{partition,group,+key,next_allowed,expiry}:
      Clock{partition,group,key,next_allowed,
        refreshed_expiry(expiry,after,key,now,profile,new_pending(commands))}

def expiry_feedback_entries(clocks: List<&2, Clock>, +key: Nat, +after: Canonical.State,
    +now: Nat, +profile: Expiry.Profile, +commands: List<&2, Canonical.Command>) -> List<&2, Clock>:
  match clocks:
    case []: []
    case +clock <> tail:
      Bool.pick(Clock,Nat.is_eq(clock_key(clock),key),
        expiry_clock_feedback(clock,after,now,profile,commands),clock) <>
        expiry_feedback_entries(tail,key,after,now,profile,commands)

def expiry_refreshed(clocks: List<&2, Clock>, key: Nat, after: Canonical.State,
    now: Nat, profile: Expiry.Profile, commands: List<&2, Canonical.Command>,
    accepted: Bool) -> List<&2, Clock>:
  match accepted:
    case True{}: expiry_feedback_entries(clocks,key,after,now,profile,commands)
    case False{}: clocks

def expiry_feedback(clocks: List<&2, Clock>, key: Nat, after: Canonical.State,
    now: Nat, profile: Expiry.Profile, +commands: List<&2, Canonical.Command>) -> List<&2, Clock>:
  expiry_refreshed(clocks,key,after,now,profile,commands,refresh_commands(commands))

def collection_check(expiry: Maybe<&2, Expiry.NoticeClock>, before: Canonical.State,
    partition: Nat, group: Nat, now: Nat) -> List<&2, Canonical.CanonicalEvent>:
  match expiry:
    case None{}: []
    case Some{clock}: Expiry.scoped_notice_check(before,clock,partition,group,now)

def collection_prune(clocks: List<&2, Clock>, +before: Canonical.State,
    +partition: Nat, +group: Nat, +now: Nat) -> List<&2, Canonical.CanonicalEvent>:
  match clocks:
    case []: []
    case Clock{_,_,_,_,expiry} <> tail:
      List.append(&2,Canonical.CanonicalEvent,
        collection_check(expiry,before,partition,group,now),
        collection_prune(tail,before,partition,group,now))

def lease_accepted(commands: List<&2, Canonical.Command>) -> Bool:
  match commands:
    case []: False{}
    case Canonical.NoticeLeased{} <> _: True{}
    case _ <> tail: lease_accepted(tail)

# Repeating the leased fact is not the production's separate renew operation.
def was_leased(record: Maybe<&2, Notices.Record>) -> Bool:
  match record:
    case Some{Notices.Record{_,_,_,_,_,pending}}: Notices.pending_leased(pending)
    case None{}: False{}

def new_lease(before: Canonical.State, key: Nat,
    commands: List<&2, Canonical.Command>) -> Bool:
  lease_accepted(commands) && Bool.not(was_leased(Notices.find_record(key,
    Notices.records_of(Collection.notice_state(Canonical.collection_of(before))))))

def leased_expiry(expiry: Maybe<&2, Expiry.NoticeClock>, now: Nat,
    duration: Nat, accepted: Bool) -> Maybe<&2, Expiry.NoticeClock>:
  match expiry accepted:
    case Some{clock} True{}: Some{Expiry.lease_captured(clock,now,duration)}
    case +existing _: existing

def lease_clock_feedback(clock: Clock, now: Nat, duration: Nat,
    accepted: Bool) -> Clock:
  match clock:
    case Clock{partition,group,key,next_allowed,expiry}:
      Clock{partition,group,key,next_allowed,leased_expiry(expiry,now,duration,accepted)}

def lease_feedback(clocks: List<&2, Clock>, +key: Nat, +now: Nat,
    +duration: Nat, +accepted: Bool) -> List<&2, Clock>:
  match clocks:
    case []: []
    case +clock <> tail:
      Bool.pick(Clock,Nat.is_eq(clock_key(clock),key),
        lease_clock_feedback(clock,now,duration,accepted),clock) <>
        lease_feedback(tail,key,now,duration,accepted)
