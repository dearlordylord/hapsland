# Accepted successful output frees payload, not the evidence fencing repeats.
import Base
import ../agent-flow-bend/Ledger.bend as Ledger
import ../agent-flow-bend/RevisionState.bend as Revision
import ../agent-flow-bend/ReuseState.bend as Reuse
import ../agent-flow-bend/NoticeState.bend as Notice
import ./CollectorScenario.bend as Collector
import ./Driver.bend as Driver
import ../agent-flow-bend/Canonical.bend as C
import ../agent-flow-bend/CollectionState.bend as Collection
import ../agent-flow-bend/DeliveryState.bend as Delivery

def delivery(state: Collection.State) -> Delivery.State:
  match state:
    case Collection.State{_, _, _, value, _, _, _}: value

def ledger_after(result: C.Step) -> Ledger.Ledger:
  match result:
    case C.Advanced{C.State{ledger, _, _, _, _, _, _, _, _}, _}: ledger
    case C.Rejected{C.State{ledger, _, _, _, _, _, _, _, _}, _}: ledger
def work_after(result: C.Step) -> List<&2, C.ReviewWorkRecord>:
  match result:
    case C.Advanced{C.State{_, _, work, _, _, _, _, _, _}, _}: work
    case C.Rejected{C.State{_, _, work, _, _, _, _, _, _}, _}: work
def work(state: C.State) -> List<&2, C.ReviewWorkRecord>:
  match state:
    case C.State{_, _, value, _, _, _, _, _, _}: value
law rejected_completion_keeps_payload:
  for certain: Bool
  for found: Maybe<&2, C.ReviewWorkRecord>
  {Collector.completed_record(False{}, certain, found) == [] : List<&2, Driver.Action>}
law uncertain_completion_keeps_payload:
  for accepted: Bool
  for found: Maybe<&2, C.ReviewWorkRecord>
  {Collector.completed_record(accepted, False{}, found) == [] : List<&2, Driver.Action>}
law accepted_ack_releases_exact_finding:
  for +p: Nat
  for +l: Nat
  for +r: Nat
  for +o: Nat
  for charge: Nat
  for count: Nat
  for parent: Nat
  {
    Collector.completed_record(
      True{},
      True{},
      Some{C.ReviewWorkRecord{p, l, r, o, charge, C.PendingFinding{count}, parent}}
    )
    == [Driver.immediate(C.RetireReview{p, l, r, o}, False{})]
    : List<&2, Driver.Action>
  }
law missing_payload_is_not_invented:
  {Collector.completed_record(True{}, True{}, None{}) == [] : List<&2, Driver.Action>}
law source_work_is_not_retired_by_ack:
  for p: Nat
  for l: Nat
  for r: Nat
  for o: Nat
  for charge: Nat
  for parent: Nat
  {
    Collector.completed_record(
      True{},
      True{},
      Some{C.ReviewWorkRecord{p, l, r, o, charge, C.AwaitingSourceRead{}, parent}}
    )
    == []
    : List<&2, Driver.Action>
  }
law payload_release_preserves_submission_evidence:
  for protected: Bool
  for +state: Collection.State
  for advice: Nat
  {
    delivery(Collection.release_payload_when(protected, state, advice))
    == delivery(state)
    : Delivery.State
  }
law protected_output_keeps_its_authority:
  for +state: Collection.State
  for advice: Nat
  {Collection.release_payload_when(True{}, state, advice) == state : Collection.State}

# Complete frame: only ready/lease payload membership may change.
law payload_release_exact_state:
  for +ready: List<&2, Nat>
  for +leases: List<&2, Collection.Lease>
  for +claims: List<&2, Collection.Claim>
  for +delivery: Delivery.State
  for +revision: Revision.State
  for +reuse: Reuse.State
  for +notices: Notice.State
  for +advice: Nat
  {
    Collection.released_payload(
      Collection.State{ready, leases, claims, delivery, revision, reuse, notices},
      advice
    )
    == Collection.State{
      Collection.remove_ready(advice, ready),
      Collection.remove_advice_lease(advice, leases),
      claims,
      delivery,
      revision,
      reuse,
      notices
    }
    : Collection.State
  }

law rejected_retirement_is_atomic:
  for +state: C.State
  for +reason: C.Reason
  for advice: Nat
  {C.retired_payload(C.Rejected{state, reason}, advice) == C.Rejected{state, reason} : C.Step}

law protected_retirement_is_atomic:
  for +state: C.State
  for operation: Nat
  for charge: Nat
  for ledger: Ledger.Ledger
  {
    C.retire_review_when(False{}, state, operation, charge, ledger)
    == C.Rejected{state, C.WrongStage{}}
    : C.Step
  }

law successful_retirement_uses_released_capacity:
  for state: C.State
  for operation: Nat
  for charge: Nat
  for +released: Ledger.Ledger
  {
    ledger_after(
      C.reviewed_released(state, operation, C.Discarded{}, charge, Ledger.Granted{released, 0n})
    )
    == released
    : Ledger.Ledger
  }
law successful_retirement_removes_exact_work:
  for +state: C.State
  for +operation: Nat
  for charge: Nat
  for released: Ledger.Ledger
  {
    work_after(
      C.reviewed_released(state, operation, C.Discarded{}, charge, Ledger.Granted{released, 0n})
    )
    == C.remove_work(operation, work(state))
    : List<&2, C.ReviewWorkRecord>
  }
