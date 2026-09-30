import Base
import ./Collection.bend as Collection
import ./DeliveryState.bend as DeliveryState
import ./RevisionState.bend as RevisionState
import ./TicketState.bend as TicketState
import ./Ticket.bend as Ticket
import ./ReuseState.bend as ReuseState
import ./NoticeState.bend as NoticeState
import ./Handoff.bend as Handoff

type Lease is Data:
  Lease{advice: Nat, owner: Nat}

type Claim is Data:
  Claim{group: Nat, owner: Nat}

type State is Data:
  State{ready: List<&2, Nat>, leases: List<&2, Lease>, claims: List<&2, Claim>, delivery: DeliveryState.State, revision: RevisionState.State, tickets: TicketState.State, reuse: ReuseState.State, notices: NoticeState.State}

type Decision is Data:
  Accepted{state: State}
  Refused{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, Nil{}, DeliveryState.initial(), RevisionState.initial(), TicketState.initial(), ReuseState.initial(), NoticeState.initial()}

def contains(+id: Nat, items: List<&2, Nat>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case item <> rest:
      Bool.or(Nat.is_eq(id, item), contains(id, rest))

def lease_exists(+id: Nat, items: List<&2, Lease>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Lease{advice, _} <> rest:
      Bool.or(Nat.is_eq(id, advice), lease_exists(id, rest))

def claim_exists(+group: Nat, items: List<&2, Claim>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Claim{candidate_group, _} <> rest:
      Bool.or(Nat.is_eq(group, candidate_group), claim_exists(group, rest))

def keep_ready(item: Nat, tail: List<&2, Nat>, remove: Bool) -> List<&2, Nat>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_ready(+id: Nat, items: List<&2, Nat>) -> List<&2, Nat>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      keep_ready(item, remove_ready(id, rest), Nat.is_eq(id, item))

def keep_lease(item: Lease, tail: List<&2, Lease>, remove: Bool) -> List<&2, Lease>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_lease(+id: Nat, +token: Nat, items: List<&2, Lease>) -> List<&2, Lease>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Lease{advice, owner}:
          keep_lease(item, remove_lease(id, token, rest),
            Bool.and(Nat.is_eq(id, advice), Nat.is_eq(token, owner)))

def lease_owned(+id: Nat, +token: Nat, items: List<&2, Lease>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Lease{advice, owner} <> rest:
      Bool.or(Bool.and(Nat.is_eq(id, advice), Nat.is_eq(token, owner)),
        lease_owned(id, token, rest))

def owns_lease(state: State, advice: Nat, token: Nat) -> Bool:
  match state:
    case State{_, leases, _, _, _, _, reuse, notices}:
      lease_owned(advice, token, leases)

def remove_advice_lease(+id: Nat, items: List<&2, Lease>) -> List<&2, Lease>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Lease{advice, _}:
          keep_lease(item, remove_advice_lease(id, rest), Nat.is_eq(id, advice))

def keep_claim(item: Claim, tail: List<&2, Claim>, remove: Bool) -> List<&2, Claim>:
  match remove:
    case True{}:
      tail
    case False{}:
      item <> tail

def remove_claim(+group: Nat, +token: Nat, items: List<&2, Claim>) -> List<&2, Claim>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Claim{candidate_group, candidate_token}:
          keep_claim(item, remove_claim(group, token, rest),
            Bool.and(Nat.is_eq(group, candidate_group), Nat.is_eq(token, candidate_token)))

def claim_owned(+group: Nat, +token: Nat, items: List<&2, Claim>) -> Bool:
  match items:
    case Nil{}:
      False{}
    case Claim{candidate_group, candidate_token} <> rest:
      Bool.or(Bool.and(Nat.is_eq(group, candidate_group), Nat.is_eq(token, candidate_token)),
        claim_owned(group, token, rest))

def mark_ready(+state: State, +advice: Nat, eligible_now: Bool) -> Decision:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(advice, 0n),
        Bool.or(eligible_now, contains(advice, ready))),
        Accepted{State{Bool.pick(List<&2, Nat>, contains(advice, ready), ready,
          advice <> ready), leases, claims, delivery, revision, tickets, reuse, notices}}, Refused{state})

def reserve(+state: State, +advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(token, 0n),
          Bool.and(contains(advice, ready), Bool.not(lease_exists(advice, leases)))),
        Accepted{State{ready, Lease{advice, token} <> leases, claims, delivery, revision, tickets, reuse, notices}}, Refused{state})

def release(+state: State, +advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      Bool.pick(Decision, lease_owned(advice, token, leases),
        Accepted{State{ready, remove_lease(advice, token, leases), claims, delivery, revision, tickets, reuse, notices}},
        Refused{state})

def retire(+state: State, +advice: Nat) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      State{remove_ready(advice, ready), remove_advice_lease(advice, leases), claims,
        DeliveryState.submission_forget(delivery, advice), revision, tickets, reuse, notices}

def claim(+state: State, +group: Nat, +token: Nat, active: Bool, capacity: Nat) -> Decision:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      Bool.pick(Decision, Bool.and(active, Bool.and(Nat.is_gt(token, 0n),
        Bool.and(Bool.not(claim_exists(group, claims)),
          Nat.is_lt(List.length(&2, Claim, claims), capacity)))),
        Accepted{State{ready, leases, Claim{group, token} <> claims, delivery, revision, tickets, reuse, notices}}, Refused{state})

def release_claim(+state: State, +group: Nat, +token: Nat) -> Decision:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      Bool.pick(Decision, claim_owned(group, token, claims),
        Accepted{State{ready, leases, remove_claim(group, token, claims), delivery, revision, tickets, reuse, notices}},
        Refused{state})

def expire_claim(+state: State, group: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Decision:
  Bool.pick(Decision, Collection.expired(elapsed, lifetime),
    release_claim(state, group, token), Refused{state})

def delivery_result(state: State, result: DeliveryState.Decision) -> Decision:
  match state result:
    case State{ready, leases, claims, _, revision, tickets, reuse, notices} DeliveryState.Granted{delivery}:
      Accepted{State{ready, leases, claims, delivery, revision, tickets, reuse, notices}}
    case _ DeliveryState.Denied{_}:
      Refused{state}

def finish_reserve(+state: State, group: Nat, round: Nat, attempt: Nat,
    token: Nat, selected: List<&2, Nat>) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.reserve(delivery, group, round,
        attempt, token, selected))

def finish_release(+state: State, group: Nat, round: Nat, attempt: Nat,
    token: Nat) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.release(delivery, group, round,
        attempt, token))

def finish_authorize(+state: State, group: Nat, round: Nat, attempt: Nat,
    token: Nat, selected: List<&2, Nat>) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.authorize(delivery, group, round,
        attempt, token, selected))

def finish_terminal(+state: State, group: Nat, round: Nat, attempt: Nat,
    token: Nat, selected: List<&2, Nat>, phase: DeliveryState.Phase) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.terminal(delivery, group, round,
        attempt, token, selected, phase))

def finish_end(+state: State, group: Nat, round: Nat, attempt: Nat,
    token: Nat) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.end(delivery, group, round,
        attempt, token))

def consume_continuation(+state: State, group: Nat, round: Nat) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.consume(delivery, group, round))

def submission_begin(+state: State, advice: Nat, group: Nat, round: Nat,
    token: Nat, surface: Handoff.Surface, authorize_now: Bool,
    fingerprints: List<&2, Nat>, units: List<&2, Nat>) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.submission_begin(delivery, advice,
        group, round, token, surface, authorize_now, fingerprints, units))

def submission_authorize(+state: State, advice: Nat, token: Nat) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.submission_authorize(delivery, advice, token))

def submission_terminal(+state: State, advice: Nat, token: Nat, certain: Bool) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.submission_terminal(delivery, advice, token, certain))

def submission_release(+state: State, advice: Nat, token: Nat) -> Decision:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      delivery_result(state, DeliveryState.submission_release(delivery, advice, token))

def submission_forget(state: State, advice: Nat) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      State{ready, leases, claims, DeliveryState.submission_forget(delivery, advice), revision, tickets, reuse, notices}

def retire_round(state: State, group: Nat, round: Nat) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      State{ready, leases, claims, DeliveryState.retire_round(delivery, group, round),
        revision, tickets, reuse, notices}

def submission_suppresses(state: State, advice: Nat, fingerprint: Nat,
    round: Nat, surface: Handoff.Surface) -> Bool:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      DeliveryState.submission_suppresses(delivery, advice, fingerprint, round, surface)

def submission_reofferable(state: State, advice: Nat, token: Nat) -> Bool:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      DeliveryState.submission_reofferable(delivery, advice, token)

def submission_expired(state: State, advice: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Bool:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      DeliveryState.submission_expired(delivery, advice, token, elapsed, lifetime)

def submission_reservation(state: State, group: Nat, round: Nat, token: Nat) -> Bool:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      DeliveryState.submission_reservation(delivery, group, round, token)

def submission_ready(state: State, group: Nat, round: Nat, token: Nat,
    selected: List<&2, Nat>) -> Bool:
  match state:
    case State{_, _, _, delivery, _, _, reuse, notices}:
      DeliveryState.submission_ready(delivery, group, round, token, selected)


def revision_register(state: State, subject: Nat, input: Nat,
    add_member: Bool) -> RevisionState.Registration:
  match state:
    case State{_, _, _, _, revision, _, reuse, notices}:
      RevisionState.register(revision, subject, input, add_member)

def revision_replace(state: State, replacement: RevisionState.State) -> State:
  match state:
    case State{ready, leases, claims, delivery, _, tickets, reuse, notices}:
      State{ready, leases, claims, delivery, replacement, tickets, reuse, notices}

def revision_release(state: State, subject: Nat, generation: Nat) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, notices}:
      State{ready, leases, claims, delivery, RevisionState.release(revision, subject, generation), tickets, reuse, notices}

def revision_current(state: State, subject: Nat, input: Nat, generation: Nat) -> Bool:
  match state:
    case State{_, _, _, _, revision, _, reuse, notices}:
      RevisionState.current(revision, subject, input, generation)

def revision_generation(state: State, subject: Nat) -> Nat:
  match state:
    case State{_, _, _, _, revision, _, reuse, notices}:
      RevisionState.generation(revision, subject)

def revision_count(state: State) -> Nat:
  match state:
    case State{_, _, _, _, revision, _, reuse, notices}:
      RevisionState.count(revision)

def revision_superseded(state: State, subject: Nat, candidate_subject: Nat,
    generation: Nat) -> Bool:
  match state:
    case State{_, _, _, _, revision, _, reuse, notices}:
      RevisionState.superseded(revision, subject, candidate_subject, generation)

def ticket_result(state: State, decision: TicketState.Decision) -> Decision:
  match state decision:
    case State{ready, leases, claims, delivery, revision, _, reuse, notices} TicketState.Granted{tickets}:
      Accepted{State{ready, leases, claims, delivery, revision, tickets, reuse, notices}}
    case _ TicketState.Refused{_}:
      Refused{state}

def ticket_open(+state: State, id: Nat) -> Decision:
  match state:
    case State{_, _, _, _, _, tickets, reuse, notices}:
      ticket_result(state, TicketState.open(tickets, id))

def ticket_forget(+state: State, id: Nat) -> Decision:
  match state:
    case State{_, _, _, _, _, tickets, reuse, notices}:
      ticket_result(state, TicketState.forget(tickets, id))

def ticket_add_unit(+state: State, id: Nat, unit: Nat) -> Decision:
  match state:
    case State{_, _, _, _, _, tickets, reuse, notices}:
      ticket_result(state, TicketState.add_unit(tickets, id, unit))

def ticket_step_unit(+state: State, id: Nat, unit: Nat,
    event: Ticket.UnitEvent, reason: Ticket.Reason) -> Decision:
  match state:
    case State{_, _, _, _, _, tickets, reuse, notices}:
      ticket_result(state, TicketState.step_unit(tickets, id, unit, event, reason))

def ticket_unit_snapshot(state: State, id: Nat, unit: Nat) -> Maybe<&2, TicketState.TicketUnit>:
  match state:
    case State{_, _, _, _, _, tickets, reuse, notices}:
      TicketState.unit_snapshot(tickets, id, unit)

def ticket_state(state: State) -> TicketState.State:
  match state:
    case State{_, _, _, _, _, tickets, _, _}: tickets

def with_tickets(state: State, replacement: TicketState.State) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, _, reuse, notices}:
      State{ready, leases, claims, delivery, revision, replacement, reuse, notices}

def reuse_state(state: State) -> ReuseState.State:
  match state:
    case State{_, _, _, _, _, _, reuse, notices}: reuse

def with_reuse(state: State, replacement: ReuseState.State) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, _, notices}:
      State{ready, leases, claims, delivery, revision, tickets, replacement, notices}

def notice_state(state: State) -> NoticeState.State:
  match state:
    case State{_, _, _, _, _, _, _, notices}: notices

def with_notices(state: State, replacement: NoticeState.State) -> State:
  match state:
    case State{ready, leases, claims, delivery, revision, tickets, reuse, _}:
      State{ready, leases, claims, delivery, revision, tickets, reuse, replacement}
