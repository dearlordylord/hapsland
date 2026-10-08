import Base
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/Collection.bend as Collection
import ../agent-flow-bend/CollectionState.bend as CollectionState
import ../agent-flow-bend/NoticeState.bend as Notices

# Immutable source-free clocks captured at the actual retained/committed fact.
# Clock sampling supplies facts; actual Canonical owns expiry and eligibility.
type NoticeClock is Data:
  NoticeClock{partition: Nat, group: Nat, key: Nat, retained_at: Nat,
    pending_duration: Nat, lease_started: Nat, lease_duration: Nat,
    cooldown_started: Nat, cooldown_duration: Nat}

def notice_check(clock: NoticeClock, +now: Nat, excepted: Bool) -> C.CanonicalEvent:
  match clock:
    case NoticeClock{_, _, key, retained_at, pending_duration, lease_started,
        lease_duration, cooldown_started, cooldown_duration}:
      C.NoticePrune{key,
        Collection.expired((now - lease_started : Nat), lease_duration),
        Collection.expired((now - retained_at : Nat), pending_duration), excepted,
        Collection.expired((now - cooldown_started : Nat), cooldown_duration)}

def key_dropped(outputs: List<&2, C.Output>) -> Bool:
  match outputs:
    case []: False{}
    case C.EventEstablished{C.NoticePruned{_, _, True{}}} <> _: True{}
    case C.EventEstablished{C.NoticeDropped{}} <> _: True{}
    case _ <> tail: key_dropped(tail)

def notice_release(record: Maybe<&2, Notices.Record>, partition: Nat,
    group: Nat, dropped: Bool) -> List<&2, C.CanonicalEvent>:
  match record dropped:
    case Some{Notices.Record{_, owner, delivery, reservation, _, _}} True{}:
      Bool.pick(List<&2, C.CanonicalEvent>,
        Nat.is_eq(owner, partition) && Nat.is_eq(delivery, group),
        [C.ReleaseCapacity{reservation}], [])
    case _ _: []

# Read the actual pre-prune reservation; release it only after Canonical drops
# that owned key. Pending expiry alone preserves a cooling/excepted key.
def notice_feedback(before: C.State, clock: NoticeClock,
    outputs: List<&2, C.Output>) -> List<&2, C.CanonicalEvent>:
  match clock:
    case NoticeClock{partition, group, key, _, _, _, _, _, _}:
      notice_release(Notices.find_record(key, Notices.records_of(
        CollectionState.notice_state(C.collection_of(before)))), partition, group,
        key_dropped(outputs))

def notice_owned(record: Maybe<&2, Notices.Record>, partition: Nat, group: Nat) -> Bool:
  match record:
    case None{}: False{}
    case Some{Notices.Record{_, owner, delivery, _, _, _}}:
      Nat.is_eq(owner, partition) && Nat.is_eq(delivery, group)

def notice_sampled(owned: Bool, clock: NoticeClock, now: Nat,
    excepted: Bool) -> List<&2, C.CanonicalEvent>:
  match owned:
    case False{}: []
    case True{}: [notice_check(clock, now, excepted)]

def notice_sample(state: C.State, +clock: NoticeClock, now: Nat,
    excepted: Bool) -> List<&2, C.CanonicalEvent>:
  match clock:
    case NoticeClock{partition, group, key, _, _, _, _, _, _}:
      notice_sampled(notice_owned(Notices.find_record(key, Notices.records_of(
        CollectionState.notice_state(C.collection_of(state)))), partition, group),
        clock, now, excepted)

type Profile is Data:
  Profile{pending_duration: Nat, lease_duration: Nat, cooldown_duration: Nat}

def fresh_notice(record: Maybe<&2, Notices.Record>, +key: Nat, +now: Nat,
    profile: Profile) -> Maybe<&2, NoticeClock>:
  match record profile:
    case Some{Notices.Record{_, partition, group, _, _, Some{_}}}
        Profile{pending_duration, lease_duration, cooldown_duration}:
      Some{NoticeClock{partition, group, key, now, pending_duration, now,
        lease_duration, now, cooldown_duration}}
    case _ _: None{}

def notice_capture(after: C.State, +key: Nat, now: Nat,
    profile: Profile) -> Maybe<&2, NoticeClock>:
  fresh_notice(Notices.find_record(key, Notices.records_of(
    CollectionState.notice_state(C.collection_of(after)))), key, now, profile)

# Merging or keeping a leased pending notice renews cooldown only. The original
# pending timestamp, pending duration and lease facts remain captured. This
# follows notice-records.ts: noticePendingMerged never updates pendingAt.
def cooldown_refreshed(clock: NoticeClock, now: Nat, cooldown_duration: Nat) -> NoticeClock:
  match clock:
    case NoticeClock{partition, group, key, retained_at, pending_duration,
        lease_started, lease_duration, _, _}:
      NoticeClock{partition, group, key, retained_at, pending_duration,
        lease_started, lease_duration, now, cooldown_duration}

def lease_captured(clock: NoticeClock, now: Nat, lease_duration: Nat) -> NoticeClock:
  match clock:
    case NoticeClock{partition, group, key, retained_at, pending_duration, _, _,
        cooldown_started, cooldown_duration}:
      NoticeClock{partition, group, key, retained_at, pending_duration, now,
        lease_duration, cooldown_started, cooldown_duration}

def scoped_notice_check(+before: C.State, +clock: NoticeClock,
    partition: Nat, group: Nat, now: Nat) -> List<&2, C.CanonicalEvent>:
  match clock:
    case NoticeClock{owner, delivery, _, _, _, _, _, _, _}:
      Bool.pick(List<&2, C.CanonicalEvent>,
        Nat.is_eq(owner, partition) && Nat.is_eq(delivery, group),
        notice_sample(before, clock, now, False{}), [])

# Collection first samples every retained clock belonging to this exact scope.
# Another advicee's keys are never pruned as a side effect of this collection.
def scoped_notice_checks(clocks: List<&2, NoticeClock>, +before: C.State,
    +partition: Nat, +group: Nat, +now: Nat) -> List<&2, C.CanonicalEvent>:
  match clocks:
    case []: []
    case +clock <> tail:
      List.append(&2, C.CanonicalEvent,
        scoped_notice_check(before, clock, partition, group, now),
        scoped_notice_checks(tail, before, partition, group, now))
