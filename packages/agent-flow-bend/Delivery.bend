import Base
import ./Round.bend as Round

# Per-output-token write status. The finding lease in Handoff.bend separately
# enforces one live writer per finding and one terminal background reoffer.
type Surface is Data:
  Edit{}
  Background{}
  Stop{}

type Phase is Data:
  Reserved{}
  Authorized{}
  Submitted{}
  Uncertain{}

type Step is Data:
  Granted{phase: Phase}
  Denied{phase: Phase}

type AckDecision is Data:
  AckReady{}
  AckExpired{}
  AckEmpty{}

type FinalDecision is Data:
  FinalReady{}
  FinalExpired{}
  FinalEmpty{}

type FindingDisposition is Data:
  RetireAdvice{}
  KeepRemaining{}
  KeepForReoffer{}

type CollectionLeaseAction is Data:
  KeepLease{}
  DropLease{}

type SubmissionFacts is Data:
  SubmissionFacts{round_active: Bool, has_round: Bool, has_unit: Bool,
    has_delivery: Bool, pending_capacity: Bool, submission_allowed: Bool,
    current_work: Bool, credential_authorized: Bool}

type BatchGate is Data:
  BatchProceed{}
  BatchRelease{}

def submission_candidate(facts: SubmissionFacts) -> Bool:
  match facts:
    case SubmissionFacts{round_active, has_round, has_unit, has_delivery,
        pending_capacity, submission_allowed, current_work, credential_authorized}:
      Bool.and(round_active, Bool.and(has_round, Bool.and(has_unit,
        Bool.and(has_delivery, Bool.and(pending_capacity,
        Bool.and(submission_allowed, Bool.and(current_work, credential_authorized)))))))

def submission_batch_gate(count: Nat, all_valid: Bool) -> BatchGate:
  Bool.pick(BatchGate, Bool.and(Nat.is_gt(count, 0n), all_valid),
    BatchProceed{}, BatchRelease{})

def credential_observe(invalid_seen: Bool, generation_valid: Bool,
    authorized: Bool) -> Bool:
  Bool.or(invalid_seen, Bool.not(Bool.and(generation_valid, authorized)))

def final_credential_gate(legacy_collect: Bool, invalid_seen: Bool) -> BatchGate:
  Bool.pick(BatchGate, Bool.and(legacy_collect, invalid_seen),
    BatchRelease{}, BatchProceed{})

def collection_lease(has_lease: Bool, expired: Bool, stop_collector: Bool,
    same_group: Bool, background_reofferable: Bool) -> CollectionLeaseAction:
  Bool.pick(CollectionLeaseAction,
    Bool.and(has_lease, Bool.or(expired,
      Bool.and(stop_collector, Bool.and(same_group, background_reofferable)))),
    DropLease{}, KeepLease{})

def advice_candidate(same_partition: Bool, unleased: Bool,
    has_unsuppressed_finding: Bool, ticket_owns: Bool) -> Bool:
  Bool.and(same_partition, Bool.and(unleased,
    Bool.and(has_unsuppressed_finding, ticket_owns)))

def notice_candidate(same_partition: Bool, has_pending: Bool,
    unleased: Bool, ticket_owns: Bool) -> Bool:
  Bool.and(same_partition, Bool.and(has_pending, Bool.and(unleased, ticket_owns)))

def reserve_candidate(unleased: Bool) -> Bool:
  unleased

# A native token identifies leased findings and notices. Time comparison and
# exact content subtraction are measured outside Bend; these decisions own
# terminal eligibility and the resulting native record disposition.
def acknowledge(items: Nat, any_expired: Bool) -> AckDecision:
  Bool.pick(AckDecision, Nat.is_eq(items, 0n), AckEmpty{},
    Bool.pick(AckDecision, any_expired, AckExpired{}, AckReady{}))

def finalize(items: Nat, all_acknowledged: Bool, any_expired: Bool) -> FinalDecision:
  Bool.pick(FinalDecision, Bool.or(Nat.is_eq(items, 0n), Bool.not(all_acknowledged)),
    FinalEmpty{}, Bool.pick(FinalDecision, any_expired, FinalExpired{}, FinalReady{}))

def finding_disposition(composed: Bool, remaining: Nat) -> FindingDisposition:
  Bool.pick(FindingDisposition, composed, KeepForReoffer{},
    Bool.pick(FindingDisposition, Nat.is_eq(remaining, 0n), RetireAdvice{}, KeepRemaining{}))

def release_unacknowledged(acknowledged: Bool) -> Bool:
  Bool.not(acknowledged)

# A submission needs a live round. A background writer cannot enter while
# Stop owns the barrier, and an existing token needs its Stop finish permit.
def existing_token_allowed(surface: Surface, existing_token: Bool,
    finish_permit: Bool) -> Bool:
  match surface:
    case Stop{}:
      Bool.or(Bool.not(existing_token), finish_permit)
    case _:
      Bool.not(existing_token)

def submission_allowed(round: Round.Round, surface: Surface,
    existing_token: Bool, finish_permit: Bool) -> Bool:
  match round:
    case Round.Round{_, live, _, _, _, barrier, deciding, _}:
      match surface:
        case Background{}:
          Bool.and(live, Bool.and(existing_token_allowed(surface, existing_token, finish_permit),
            Bool.and(Bool.not(barrier), Bool.not(deciding))))
        case Stop{}:
          Bool.and(live, existing_token_allowed(surface, existing_token, finish_permit))
        case Edit{}:
          Bool.and(live, existing_token_allowed(surface, existing_token, finish_permit))

# Legacy Stop collection predates the finish permit protocol.
def legacy_stop_allowed(round: Round.Round) -> Bool:
  match round:
    case Round.Round{_, live, _, _, _, _, deciding, _}:
      Bool.and(live, Bool.not(deciding))

def transition(current: Phase, requested: Phase) -> Step:
  match current:
    case Reserved{}:
      match requested:
        case Authorized{}:
          Granted{Authorized{}}
        case _:
          Denied{Reserved{}}
    case Authorized{}:
      match requested:
        case Submitted{}:
          Granted{Submitted{}}
        case Uncertain{}:
          Granted{Uncertain{}}
        case _:
          Denied{Authorized{}}
    case _:
      Denied{current}

def expired(phase: Phase, elapsed: Nat, lifetime: Nat) -> Bool:
  match phase:
    case Authorized{}:
      Nat.is_ge(elapsed, lifetime)
    case _:
      False{}

def background_reofferable(phase: Phase, surface: Surface) -> Bool:
  match phase:
    case Submitted{}:
      match surface:
        case Background{}:
          True{}
        case _:
          False{}
    case Uncertain{}:
      match surface:
        case Background{}:
          True{}
        case _:
          False{}
    case _:
      False{}

def main() -> Step:
  transition(Authorized{}, Uncertain{})
