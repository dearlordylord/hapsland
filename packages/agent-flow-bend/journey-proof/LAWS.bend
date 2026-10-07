import Base
import ./core.bend as Core
import ./fixtures.bend as Fixtures
import ../Canonical.bend as Canonical
import ../CollectionState.bend as CollectionState
import ../Collection.bend as Collection
import ../Dispatch.bend as Dispatch
import ../Ledger.bend as Ledger
import ../Reuse.bend as Reuse

# exact pending identities survive Stop cutoff, for every cohort.
law cutoff_preserves_every_finding:
  for +items: List<&2, Canonical.Work>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  {
    Core.findings(Canonical.retain_after_stop(items, partition, lifetime, round))
    == Core.findings(items)
    : List<&2, Canonical.Work>
  }

# completing one operation cannot erase another's pending finding.
law removal_preserves_other_findings:
  for +items: List<&2, Canonical.Work>
  for +operation: Nat
  {
    Core.other_findings(operation, Canonical.remove_work(operation, items))
    == Core.other_findings(operation, items)
    : List<&2, Canonical.Work>
  }

law stage_change_preserves_other_findings:
  for +items: List<&2, Canonical.Work>
  for +operation: Nat
  for +kind: Canonical.WorkKind
  {
    Core.other_findings(operation, Canonical.replace_work_kind(operation, kind, items))
    == Core.other_findings(operation, items)
    : List<&2, Canonical.Work>
  }

# any number of completed findings cannot keep source work pending.
law findings_do_not_block_collection:
  for +items: List<&2, Canonical.Work>
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
  for +prefix: List<&2, Dispatch.Entry>
  for +entry: Dispatch.Entry
  for +later: List<&2, Dispatch.Entry>
  for +running: List<&2, Dispatch.Entry>
  for +sequence: Nat
  for +closed: Bool
  for +requests: List<&2, Dispatch.Request>
  for waiting: Core.Waiting(prefix, running)
  for enabled: {True{} == Dispatch.can_start(entry, running) : Bool}
  {
    Dispatch.pump_one(
      Dispatch.State{
        List.append(&2, Dispatch.Entry, prefix, entry <> later),
        running,
        sequence,
        closed,
        requests
      }
    )
    == Dispatch.Advanced{
      Dispatch.State{
        List.append(&2, Dispatch.Entry, prefix, later),
        List.append(&2, Dispatch.Entry, running, entry <> Nil{}),
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
  for +charges: List<&2, Ledger.Charge>
  for +retained: List<&2, Ledger.Charge>
  for +limits: Ledger.Limits
  for +next_id: Nat
  for unique: Core.Transient(charges, retained)
  {
    Core.release_charges(
      charges,
      Ledger.Ledger{limits, next_id, List.append(&2, Ledger.Charge, charges, retained)}
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
  for +outcome: Canonical.RequestOutcome
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
  for +items: List<&2, Canonical.Work>
  for +partition: Nat
  for +lifetime: Nat
  for +round: Nat
  for +observation: Nat
  for +owner: Nat
  for +generation: Nat
  for +current: Nat
  for +operation: Nat
  for +charge: Nat
  for +kind: Canonical.WorkKind
  for +parent: Nat
  for different_operation: {False{} == Nat.is_eq(operation, observation) : Bool}
  for different_parent: {False{} == Nat.is_eq(parent, observation) : Bool}
  {
    Canonical.unfinished_for_observation(
      Canonical.Work{owner, generation, current, operation, charge, kind, parent} <> items,
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
  for +charges: List<&2, Ledger.Charge>
  for +retained: List<&2, Ledger.Charge>
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
            Ledger.Charge,
            retained,
            Ledger.Charge{next_id, partition, bytes, purpose} <> Nil{}
          )
        },
        next_id
      }
    }
    : Maybe<&2, Ledger.LedgerResult>
  }
