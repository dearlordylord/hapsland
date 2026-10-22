import Base
import ./core.bend as Core
import ./fixtures.bend as Fixtures
import ../Canonical.bend as Canonical
import ../CollectionState.bend as CollectionState
import ../Collection.bend as Collection
import ../Dispatch.bend as Dispatch
import ../Ledger.bend as Ledger
import ../Reuse.bend as Reuse
import ../Admission.bend as Admission
import ../EditHistory.bend as EditHistory
import ../RevisionState.bend as RevisionState

# exact pending identities survive Stop cutoff, for every cohort.
law cutoff_preserves_every_finding:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  {
    Core.findings(Canonical.retain_after_stop(items, partition, lifetime, round))
    == Core.findings(items)
    : List<&2, Canonical.ReviewWorkRecord>
  }

# completing one operation cannot erase another's pending finding.
law removal_preserves_other_findings:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +operation: Nat
  {
    Core.other_findings(operation, Canonical.remove_work(operation, items))
    == Core.other_findings(operation, items)
    : List<&2, Canonical.ReviewWorkRecord>
  }

law stage_change_preserves_other_findings:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +operation: Nat
  for +kind: Canonical.ReviewWorkPhase
  {
    Core.other_findings(operation, Canonical.replace_work_kind(operation, kind, items))
    == Core.other_findings(operation, items)
    : List<&2, Canonical.ReviewWorkRecord>
  }

# any number of completed findings cannot keep source work pending.
law findings_do_not_block_collection:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +observation: Nat
  {
    Canonical.unfinished_for_observation(
      Core.findings(items),
      partition,
      lifetime,
      round,
      observation
    )
    == False{}
    : Bool
  }

# ownership, completed dependencies and no pending joins suffice.
# A successor ID avoids assuming admission's positive-ID contract in the result.
law completed_edit_becomes_collectible:
  for +state: Canonical.State
  for +advice: Nat
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +observation: Nat
  for owned: {
    True{}
    == Canonical.finding_for_observation(
      Core.work(state),
      partition,
      lifetime,
      round,
      observation,
      (1n + advice : Nat)
    )
    : Bool
  }
  for completed: {
    False{}
    == Canonical.unfinished_for_observation(
      Core.work(state),
      partition,
      lifetime,
      round,
      observation
    )
    : Bool
  }
  {
    Core.ordinary_ready(
      state,
      (1n + advice : Nat),
      partition,
      lifetime,
      round,
      observation,
      False{}
    )
    == True{}
    : Bool
  }

# every terminal owner result resolves every current member,
# preserving member IDs/order and missing-identity failure semantics.
law terminal_owner_resolves_every_member:
  for +members: List<&2, Core.Member>
  for +outcome: Canonical.Outcome
  {Core.replies(members, outcome) == Core.expected_replies(members, outcome) : List<&2, Core.Reply>}

law terminal_members_never_remain_pending:
  for +members: List<&2, Core.Member>
  for +outcome: Canonical.Outcome
  {Core.all_resolved(Core.replies(members, outcome)) == True{} : Bool}

# the earliest runnable entry wins, even behind blocked preparation;
# later arrivals are quantified, not held fixed by a terminal conclusion premise.
law earliest_runnable_cannot_be_overtaken:
  for +prefix: List<&2, Dispatch.ScheduledReviewWork>
  for +entry: Dispatch.ScheduledReviewWork
  for +later: List<&2, Dispatch.ScheduledReviewWork>
  for +running: List<&2, Dispatch.ScheduledReviewWork>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.ReviewServiceRequestRecord>
  for waiting: Core.Waiting(prefix, running)
  for enabled: {True{} == Dispatch.can_start(entry, running) : Bool}
  {
    Dispatch.pump_one(
      Dispatch.State{
        List.append(&2, Dispatch.ScheduledReviewWork, prefix, entry <> later),
        running,
        sequence,
        closed,
        requests
      }
    )
    == Dispatch.Advanced{
      Dispatch.State{
        List.append(&2, Dispatch.ScheduledReviewWork, prefix, later),
        List.append(&2, Dispatch.ScheduledReviewWork, running, entry <> Nil{}),
        sequence,
        closed,
        requests
      },
      Dispatch.start_command(entry) <> Nil{}
    }
    : Dispatch.DispatchResult
  }

# actual releases drain a finite transient cohort, retaining exactly
# the legitimate owner's charges and monotonic reservation identity.
law transient_resources_drain_without_reset:
  for +charges: List<&2, Ledger.ReviewCapacityReservationRecord>
  for +retained: List<&2, Ledger.ReviewCapacityReservationRecord>
  for +limits: Ledger.Limits
  for +next_id: Nat
  for unique: Core.Transient(charges, retained)
  {
    Core.release_charges(
      charges,
      Ledger.Ledger{
        limits,
        next_id,
        List.append(&2, Ledger.ReviewCapacityReservationRecord, charges, retained)
      }
    )
    == Some{Ledger.Ledger{limits, next_id, retained}}
    : Maybe<&2, Ledger.Ledger>
  }

# an attributed edit's complete checked journey, including permit
# consumption, dispatch, source completion, review settlement and finding output.
# One prepared unit; all request outcomes; symbolic identity, bytes and limits.
# The supplied trace represents responsive host operations, not a claim that IO
# happens by itself. Fanout/concurrency use the general cohort laws above.
law admitted_edit_reaches_resolution_and_submission:
  for +partition: Nat
  for +size: Nat
  for +fingerprint: Nat
  for +limits: Ledger.Limits
  for +outcome: Canonical.ReviewServiceRequestOutcome
  for +room: {
    True{}
    == Ledger.fits(limits, Ledger.Usage{0n, 0n}, Ledger.Usage{0n, 0n}, (1n + size : Nat))
    : Bool
  }
  {
    Core.run_events(
      Core.journey_events(partition, size, fingerprint, outcome),
      Canonical.initial(limits)
    )
    == Some{Core.expected_journey(partition, size, fingerprint, limits, outcome)}
    : Maybe<&2, Canonical.State>
  }

# unfinished work from another edit cannot block this edit.
law another_edit_does_not_block_collection:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +observation: Nat
  for +owner: Nat
  for +generation: Nat
  for +current: Nat
  for +operation: Nat
  for +charge: Nat
  for +kind: Canonical.ReviewWorkPhase
  for +parent: Nat
  for different_operation: {False{} == Nat.is_eq(operation, observation) : Bool}
  for different_parent: {False{} == Nat.is_eq(parent, observation) : Bool}
  {
    Canonical.unfinished_for_observation(
      Canonical.ReviewWorkRecord{owner, generation, current, operation, charge, kind, parent} <> items,
      partition,
      lifetime,
      round,
      observation
    )
    == Canonical.unfinished_for_observation(items, partition, lifetime, round, observation)
    : Bool
  }

# a genuinely newer dispatch sequence sorts after the old one.
law newer_advice_cannot_sort_before_older:
  for +sequence: Nat
  for +gap: Nat
  {
    Collection.order(sequence, (sequence + (1n + gap : Nat) : Nat))
    == Collection.Before{}
    : Collection.Order
  }

# recovery includes aggregate ledger capacity and keeps retained
# cache/advice charges; available room is checked on retained owners only.
law released_resources_allow_fresh_capacity:
  for +charges: List<&2, Ledger.ReviewCapacityReservationRecord>
  for +retained: List<&2, Ledger.ReviewCapacityReservationRecord>
  for +limits: Ledger.Limits
  for +next_id: Nat
  for +partition: Nat
  for +bytes: Nat
  for +purpose: Ledger.Purpose
  for unique: Core.Transient(charges, retained)
  for available: {
    True{}
    == Ledger.fits(
      limits,
      Ledger.total(retained),
      Ledger.partition_usage(retained, partition),
      bytes
    )
    : Bool
  }
  {
    Core.recover_capacity(charges, retained, limits, next_id, partition, bytes, purpose)
    == Some{
      Ledger.Granted{
        Ledger.Ledger{
          limits,
          (next_id + 1n : Nat),
          List.append(
            &2,
            Ledger.ReviewCapacityReservationRecord,
            retained,
            Ledger.ReviewCapacityReservationRecord{next_id, partition, bytes, purpose} <> Nil{}
          )
        },
        next_id
      }
    }
    : Maybe<&2, Ledger.LedgerResult>
  }

# Guarantees: settling the first matching request record preserves every record
# before and after it, and all unrelated dispatch state.
# Why it matters: a completion must not release another active request slot.
law physical_settlement_preserves_other_requests:
  for +queued: List<&2, Dispatch.ScheduledReviewWork>
  for +running: List<&2, Dispatch.ScheduledReviewWork>
  for +sequence: Nat
  for +closed: Bool
  for +prefix: List<&2, Dispatch.ReviewServiceRequestRecord>
  for +suffix: List<&2, Dispatch.ReviewServiceRequestRecord>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  for +started: Bool
  for +interrupted: Bool
  for unmatched: Core.UnmatchedRequests(prefix, partition, lifetime, round, operation, request)
  {
    Dispatch.request_update(
      Dispatch.State{
        queued,
        running,
        sequence,
        closed,
        List.append(
          &2,
          Dispatch.ReviewServiceRequestRecord,
          prefix,
          Dispatch.ReviewServiceRequestRecord{
            partition,
            lifetime,
            round,
            operation,
            request,
            started,
            interrupted
          } <> suffix
        )
      },
      partition,
      lifetime,
      round,
      operation,
      request,
      False{},
      False{},
      True{}
    )
    == Dispatch.ReviewServiceRequestAccepted{
      Dispatch.State{
        queued,
        running,
        sequence,
        closed,
        List.append(&2, Dispatch.ReviewServiceRequestRecord, prefix, suffix)
      }
    }
    : Dispatch.ReviewServiceRequestResult
  }

# Guarantees: interruption marks a started request interrupted but retains its
# request slot and all other requests, regardless of unrelated dispatch work.
# Why it matters: an abort request does not mean the service invocation has ended.
law interruption_keeps_physical_permit:
  for +queued: List<&2, Dispatch.ScheduledReviewWork>
  for +running: List<&2, Dispatch.ScheduledReviewWork>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.ReviewServiceRequestRecord>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  {
    Dispatch.request_update(
      Dispatch.State{
        queued,
        running,
        sequence,
        closed,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          True{},
          False{}
        } <> requests
      },
      partition,
      lifetime,
      round,
      operation,
      request,
      False{},
      True{},
      False{}
    )
    == Dispatch.ReviewServiceRequestAccepted{
      Dispatch.State{
        queued,
        running,
        sequence,
        closed,
        Dispatch.ReviewServiceRequestRecord{
          partition,
          lifetime,
          round,
          operation,
          request,
          True{},
          True{}
        } <> requests
      }
    }
    : Dispatch.ReviewServiceRequestResult
  }

# Guarantees: if the exact request record is absent, any terminal callback
# rejects with the entire canonical state unchanged, including newly admitted work.
# Why it matters: a late/repeated callback cannot free a successor's reservation.
law absent_request_terminal_preserves_entire_state:
  for +ledger: Ledger.Ledger
  for +rounds: List<&2, Canonical.Round>
  for +work: List<&2, Canonical.ReviewWorkRecord>
  for +next_round: Nat
  for +next_operation: Nat
  for +admissions: List<&2, Admission.AdmissionState>
  for +queued: List<&2, Dispatch.ScheduledReviewWork>
  for +running: List<&2, Dispatch.ScheduledReviewWork>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.ReviewServiceRequestRecord>
  for +collection: CollectionState.State
  for +history: EditHistory.State
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +request: Nat
  for +outcome: Canonical.ReviewServiceRequestOutcome
  for +current_work: Bool
  for absent: {Dispatch.request_phase(requests, partition, lifetime, round, operation, request)
    == None{} : Maybe<&2, Dispatch.ReviewServiceRequestRecord>}
  {Canonical.request_settled(Canonical.State{ledger, rounds, work, next_round,
      next_operation, admissions, Dispatch.State{queued, running, sequence, closed, requests},
      collection, history}, partition, lifetime, round, operation, request, outcome, current_work)
    == Canonical.Rejected{Canonical.State{ledger, rounds, work, next_round,
      next_operation, admissions, Dispatch.State{queued, running, sequence, closed, requests},
      collection, history}, Canonical.StaleOperation{}} : Canonical.Step}

# Guarantees: canceling any dispatch operations preserves the entire request
# request list, including canceled requests still waiting for real completion.
# Why it matters: logical cancellation must not allow extra HTTP requests early.
law dispatch_cancellation_keeps_physical_requests:
  for +queued: List<&2, Dispatch.ScheduledReviewWork>
  for +running: List<&2, Dispatch.ScheduledReviewWork>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.ReviewServiceRequestRecord>
  for +operations: List<&2, Nat>
  {Core.dispatched_requests(Dispatch.discard(
      Dispatch.State{queued, running, sequence, closed, requests}, operations))
    == requests : List<&2, Dispatch.ReviewServiceRequestRecord>}

# Guarantees: removing one operation preserves every other work record exactly.
# Why it matters: completion of one review cannot silently drop another waiting,
#   preparing, or running review while keeping only already completed findings.
law removal_preserves_all_other_work:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +operation: Nat
  {
    Core.other_work(operation, Canonical.remove_work(operation, items))
    == Core.other_work(operation, items)
    : List<&2, Canonical.ReviewWorkRecord>
  }

# Guarantees: changing one work phase preserves all other records exactly.
# Why it matters: starting or advancing one review cannot lose another review.
law stage_change_preserves_all_other_work:
  for +items: List<&2, Canonical.ReviewWorkRecord>
  for +operation: Nat
  for +kind: Canonical.ReviewWorkPhase
  {
    Core.other_work(operation, Canonical.replace_work_kind(operation, kind, items))
    == Core.other_work(operation, items)
    : List<&2, Canonical.ReviewWorkRecord>
  }

# Guarantees: admission into the matching non-deciding round records the new work,
#   emits its matching admission event, and retains all previous work and state.
# Why it matters: an accepted edit must become a tracked source-read task, not
#   merely receive an acknowledgement while silently replacing older work.
law accepted_observation_is_recorded_without_losing_work:
  for +state: Canonical.State
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +waiting: Bool
  for +write: Maybe<&2, Nat>
  for +uncertain: Bool
  for +quiet_since: Maybe<&2, Nat>
  for current: {
    Some{Canonical.Round{partition, lifetime, round, waiting, False{}, write,
      uncertain, quiet_since}}
    == Canonical.find_round(partition, Core.rounds(state))
    : Maybe<&2, Canonical.Round>
  }
  {
    Canonical.admit_observation(state, partition, lifetime, round)
    == Core.expected_observation(state, partition, lifetime, round)
    : Canonical.Step
  }

# Guarantees: when lookup returns the specified retained generation, releasing
# a different generation leaves the entire registry unchanged, for any member count.
# Why it matters: cleanup from an older revision cannot remove the newer retained revision.
law old_revision_release_preserves_new_registry:
  for +entries: List<&2, RevisionState.Entry>
  for +next_generation: Nat
  for +subject: Nat
  for +input: Nat
  for +retained_generation: Nat
  for +old_generation: Nat
  for +members: Nat
  for found: {
    RevisionState.find(subject, entries)
    == Some{RevisionState.Entry{subject, input, retained_generation, members}}
    : Maybe<&2, RevisionState.Entry>
  }
  for different: {Nat.is_eq(retained_generation, old_generation) == False{} : Bool}
  {RevisionState.release(RevisionState.State{entries, next_generation}, subject, old_generation)
    == RevisionState.State{entries, next_generation} : RevisionState.State}

# Guarantees: when lookup returns the retained generation, checking a different
# generation reports stale, whether its source input matches or differs.
# Why it matters: an old response cannot be treated as current merely because
# its source bytes match the presently retained input.
law old_generation_cannot_become_current_again:
  for +entries: List<&2, RevisionState.Entry>
  for +next_generation: Nat
  for +input: Nat
  for +retained_input: Nat
  for +subject: Nat
  for +retained_generation: Nat
  for +old_generation: Nat
  for +members: Nat
  for found: {
    RevisionState.find(subject, entries)
    == Some{RevisionState.Entry{subject, retained_input, retained_generation, members}}
    : Maybe<&2, RevisionState.Entry>
  }
  for different: {Nat.is_eq(old_generation, retained_generation) == False{} : Bool}
  {
    RevisionState.current(
      RevisionState.State{entries, next_generation},
      subject,
      input,
      old_generation
    )
    == False{}
    : Bool
  }

# Guarantees: observing any review outcome preserves exactly the pending findings
# owned by other operation IDs, whether the observed work is current or stale.
# Why it matters: an old response cannot overwrite or delete a newer operation's findings.
law review_observation_preserves_other_findings:
  for +state: Canonical.State
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +operation: Nat
  for +outcome: Canonical.Outcome
  for +current_work: Bool
  {Core.other_findings(operation, Core.work(Core.step_state(
      Canonical.review_observed(state, partition, lifetime, round,
        operation, outcome, current_work))))
    == Core.other_findings(operation, Core.work(state))
    : List<&2, Canonical.ReviewWorkRecord>}
