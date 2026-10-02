# Proposed, unapproved law candidates under #176's concrete-proposal authorization.
# These characterize finite primitives, not whole-resident or infinite progress.
import Base
import ./Scheduler.bend as Scheduler
import ./Driver.bend as Driver
import ./Workload.bend as Workload
import ../session-bend/Session.bend as Session
import ../agent-flow-bend/Canonical.bend as Canonical

# Every arbitrary Nat insertion into an empty queue retains exactly the identity
# and selected time; excludes dropped work, narrowed IDs and altered clocks.
law empty_queue_selection:
  for +now: Nat
  for +at: Nat
  for +order: Nat
  {Scheduler.take(Scheduler.enqueue(Scheduler.State{[], now}, at, order)) == Scheduler.Taken{Scheduler.State{[], at}, Some{Scheduler.Entry{at, order}}} : Scheduler.Taken}

# Taking a nonempty queue consumes precisely its head and preserves all its tail,
# for arbitrary finite queues and Nat clocks; excludes hidden purges/lost work.
law take_preserves_tail:
  for +now: Nat
  for +at: Nat
  for +order: Nat
  for +tail: List<&2, Scheduler.Entry>
  {Scheduler.take(Scheduler.State{Scheduler.Entry{at, order} <> tail, now}) == Scheduler.Taken{Scheduler.State{tail, at}, Some{Scheduler.Entry{at, order}}} : Scheduler.Taken}

# NeverSent is exactly one unstarted settlement, for arbitrary Nat attribution,
# request identity and delay. It cannot silently supply a Started callback.
law never_sent_lifecycle:
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  for +delay: Nat
  {Driver.issued_outcome(Canonical.NeverSent{}, partition, lifetime, round, operation, request, delay) == Driver.Handled{True{}, [Driver.Action{Canonical.JevRequestSettled{partition, lifetime, round, operation, request, Canonical.NeverSent{}, True{}}, delay, None{}, False{}, None{}}]} : Driver.Handled}

# For arbitrary attribution, settings, stream and old/new durations, changing
# the future PRE duration preserves every stream fact and emits no arrival.
# This excludes rewriting already generated work as a side effect of a profile.
law duration_control_only_updates_profile:
  for +partition: Nat
  for +settings: Session.Config
  for +stream: Session.State
  for previous: Maybe<&2, Nat>
  for +duration: Nat
  {Workload.control(Workload.Advicee{partition, settings, stream, previous}, Workload.Duration{duration}) == Workload.Updated{Workload.Advicee{partition, settings, stream, Some{duration}}, []} : Workload.Updated}
