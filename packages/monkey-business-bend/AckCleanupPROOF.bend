import Base
import ../agent-flow-bend/Canonical.bend as C
import ./AckCleanupLAWS.bend as Laws
import ../agent-flow-bend/CollectionState.bend as Collection

def Laws.rejected_completion_keeps_payload(certain, found): {==}
def Laws.uncertain_completion_keeps_payload(accepted, found):
  match accepted:
    case False{}: {==}
    case True{}: {==}
def Laws.accepted_ack_releases_exact_finding(p, l, r, o, charge, count, parent): {==}
def Laws.missing_payload_is_not_invented(): {==}
def Laws.source_work_is_not_retired_by_ack(p, l, r, o, charge, parent): {==}
def Laws.payload_release_preserves_submission_evidence(protected, state, advice):
  match protected state:
    case True{} _: {==}
    case False{} Collection.State{_, _, _, _, _, _, _}: {==}
def Laws.protected_output_keeps_its_authority(state, advice): {==}
def Laws.payload_release_exact_state(
  ready,
  leases,
  claims,
  delivery,
  revision,
  reuse,
  notices,
  advice
): {==}
def Laws.rejected_retirement_is_atomic(state, reason, advice): {==}

def Laws.protected_retirement_is_atomic(state, operation, charge, ledger): {==}

def Laws.successful_retirement_uses_released_capacity(state, operation, charge, released):
  match state:
    case C.State{_, _, _, _, _, _, _, _, _}: {==}
def Laws.successful_retirement_removes_exact_work(state, operation, charge, released):
  match state:
    case C.State{_, _, _, _, _, _, _, _, _}: {==}
