import Base
import ./Handoff.bend as Handoff
import ./Delivery.bend as Delivery

# One fingerprint lease per advice and one batch per advice/output token.
# Fingerprints and tokens are opaque Nat identities supplied by the adapter.
type LeaseRecord is Data:
  LeaseRecord{advice: Nat, fingerprint: Nat, current: Handoff.Lease,
    previous: Maybe<&2, Handoff.Lease>}

type Batch is Data:
  Batch{advice: Nat, group: Nat, round: Nat, token: Nat,
    surface: Handoff.Surface, phase: Delivery.Phase,
    fingerprints: List<&2, Nat>, units: List<&2, Nat>}

type State is Data:
  State{leases: List<&2, LeaseRecord>, batches: List<&2, Batch>}

type Decision is Data:
  Granted{state: State}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}}

def record_matches(+advice: Nat, +fingerprint: Nat, item: LeaseRecord) -> Bool:
  match item:
    case LeaseRecord{candidate_advice, candidate_fingerprint, _, _}:
      Bool.and(Nat.is_eq(advice, candidate_advice),
        Nat.is_eq(fingerprint, candidate_fingerprint))

def find_lease(+advice: Nat, +fingerprint: Nat,
    items: List<&2, LeaseRecord>) -> Maybe<&2, LeaseRecord>:
  match items:
    case Nil{}:
      None{}
    case +item <> rest:
      Bool.pick(Maybe<&2, LeaseRecord>, record_matches(advice, fingerprint, item),
        Some{item}, find_lease(advice, fingerprint, rest))

def keep_record(item: LeaseRecord, tail: List<&2, LeaseRecord>,
    remove: Bool) -> List<&2, LeaseRecord>:
  match remove:
    case True{}: tail
    case False{}: item <> tail

def remove_record(+advice: Nat, +fingerprint: Nat,
    items: List<&2, LeaseRecord>) -> List<&2, LeaseRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      keep_record(item, remove_record(advice, fingerprint, rest),
        record_matches(advice, fingerprint, item))

def batch_matches(+advice: Nat, +token: Nat, item: Batch) -> Bool:
  match item:
    case Batch{candidate_advice, _, _, candidate_token, _, _, _, _}:
      Bool.and(Nat.is_eq(advice, candidate_advice),
        Nat.is_eq(token, candidate_token))

def has_batch(+advice: Nat, +token: Nat, items: List<&2, Batch>) -> Bool:
  match items:
    case Nil{}: False{}
    case item <> rest:
      Bool.or(batch_matches(advice, token, item), has_batch(advice, token, rest))

def staged_lease_authorize(advice: Nat, fingerprint: Nat, round: Nat,
    token: Nat, previous: Maybe<&2, Handoff.Lease>,
    result: Handoff.LeaseResult) -> Maybe<&2, LeaseRecord>:
  match result:
    case Handoff.Granted{current}:
      Some{LeaseRecord{advice, fingerprint, current, previous}}
    case Handoff.Denied{_}:
      None{}

def staged_lease_granted(advice: Nat, fingerprint: Nat, +round: Nat,
    +token: Nat, authorize_now: Bool, previous: Maybe<&2, Handoff.Lease>,
    current: Handoff.Lease) -> Maybe<&2, LeaseRecord>:
  match authorize_now:
    case True{}:
      staged_lease_authorize(advice, fingerprint, round, token, previous,
        Handoff.lease.authorize(current, round, token))
    case False{}:
      Some{LeaseRecord{advice, fingerprint, current, previous}}

def staged_lease_offered(advice: Nat, fingerprint: Nat, round: Nat,
    token: Nat, authorize_now: Bool, previous: Maybe<&2, Handoff.Lease>,
    result: Handoff.LeaseResult) -> Maybe<&2, LeaseRecord>:
  match result:
    case Handoff.Granted{current}:
      staged_lease_granted(advice, fingerprint, round, token, authorize_now,
        previous, current)
    case Handoff.Denied{_}:
      None{}

def staged_lease_from(advice: Nat, fingerprint: Nat, +round: Nat,
    +token: Nat, surface: Handoff.Surface, authorize_now: Bool,
    current: Handoff.Lease, previous: Maybe<&2, Handoff.Lease>) -> Maybe<&2, LeaseRecord>:
  staged_lease_offered(advice, fingerprint, round, token, authorize_now, previous,
    Handoff.lease.offer(current, round, token, surface, True{}))

def staged_lease(advice: Nat, +fingerprint: Nat, +round: Nat, token: Nat,
    surface: Handoff.Surface, authorize_now: Bool,
    previous: Maybe<&2, LeaseRecord>) -> Maybe<&2, LeaseRecord>:
  match previous:
    case None{}:
      staged_lease_from(advice, fingerprint, round, token, surface,
        authorize_now, Handoff.lease.initial(fingerprint, round), None{})
    case Some{LeaseRecord{_, _, +current, _}}:
      staged_lease_from(advice, fingerprint, round, token, surface,
        authorize_now, current, Some{current})

def is_stop(surface: Handoff.Surface) -> Bool:
  match surface:
    case Handoff.Stop{}: True{}
    case _: False{}

def begin_one_result(+state: State, advice: Nat, fingerprint: Nat,
    result: Maybe<&2, LeaseRecord>) -> Maybe<&2, State>:
  match state result:
    case State{leases, batches} Some{record}:
      Some{State{record <> remove_record(advice, fingerprint, leases), batches}}
    case _ None{}:
      None{}

def begin_one(state: State, +advice: Nat, +fingerprint: Nat, round: Nat,
    token: Nat, +surface: Handoff.Surface, authorize_now: Bool) -> Maybe<&2, State>:
  match state:
    case State{+leases, _}:
      begin_one_result(state, advice, fingerprint,
        staged_lease(advice, fingerprint, round, token, surface,
          authorize_now, find_lease(advice, fingerprint, leases)))

def begin_one_if(current: Maybe<&2, State>, advice: Nat, fingerprint: Nat,
    round: Nat, token: Nat, surface: Handoff.Surface,
    authorize_now: Bool) -> Maybe<&2, State>:
  match current:
    case None{}: None{}
    case Some{state}:
      begin_one(state, advice, fingerprint, round, token, surface, authorize_now)

def begin_many(fingerprints: List<&2, Nat>, current: Maybe<&2, State>,
    +advice: Nat, +round: Nat, +token: Nat,
    +surface: Handoff.Surface, +authorize_now: Bool) -> Maybe<&2, State>:
  match fingerprints:
    case Nil{}:
      current
    case fingerprint <> rest:
      begin_many(rest, begin_one_if(current, advice, fingerprint, round, token, surface,
        authorize_now), advice, round, token, surface, authorize_now)

def begin_result(original: State, advice: Nat, group: Nat, round: Nat,
    token: Nat, surface: Handoff.Surface, authorize_now: Bool,
    fingerprints: List<&2, Nat>, units: List<&2, Nat>,
    result: Maybe<&2, State>) -> Decision:
  match result:
    case None{}: Denied{original}
    case Some{state}:
      match state:
        case State{leases, batches}:
          Granted{State{leases, List.append(&2, Batch, batches,
            Batch{advice, group, round, token, surface,
            Bool.pick(Delivery.Phase, authorize_now,
              Delivery.Authorized{}, Delivery.Reserved{}), fingerprints, units} <> Nil{})}}

def begin(+state: State, +advice: Nat, +group: Nat, +round: Nat,
    +token: Nat, +surface: Handoff.Surface,
    +authorize_now: Bool, +fingerprints: List<&2, Nat>, +units: List<&2, Nat>) -> Decision:
  match state:
    case State{leases, batches}:
      Bool.pick(Decision, Bool.and(Nat.is_gt(advice, 0n),
        Bool.and(Nat.is_gt(group, 0n), Bool.and(Nat.is_gt(round, 0n),
          Bool.and(Nat.is_gt(token, 0n), Bool.and(Bool.not(has_batch(advice, token, batches)),
          Nat.is_gt(List.length(&2, Nat, fingerprints), 0n)))))),
        begin_result(state, advice, group, round, token, surface, authorize_now,
          fingerprints, units, begin_many(fingerprints, Some{state}, advice, round, token,
            surface, authorize_now)),
        Denied{state})

def find_batch(+advice: Nat, +token: Nat, items: List<&2, Batch>) -> Maybe<&2, Batch>:
  match items:
    case Nil{}: None{}
    case +item <> rest:
      Bool.pick(Maybe<&2, Batch>, batch_matches(advice, token, item),
        Some{item}, find_batch(advice, token, rest))

def keep_batch(item: Batch, tail: List<&2, Batch>, remove: Bool) -> List<&2, Batch>:
  match remove:
    case True{}: tail
    case False{}: item <> tail

def remove_batch(+advice: Nat, +token: Nat, items: List<&2, Batch>) -> List<&2, Batch>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      keep_batch(item, remove_batch(advice, token, rest), batch_matches(advice, token, item))

def phase_is(phase: Delivery.Phase, required: Delivery.Phase) -> Bool:
  match phase required:
    case Delivery.Reserved{} Delivery.Reserved{}: True{}
    case Delivery.Authorized{} Delivery.Authorized{}: True{}
    case Delivery.Submitted{} Delivery.Submitted{}: True{}
    case Delivery.Uncertain{} Delivery.Uncertain{}: True{}
    case _ _: False{}

def batch_phase(+batch: Batch, phase: Delivery.Phase) -> Batch:
  match batch:
    case Batch{advice, group, round, token, surface, _, fingerprints, units}:
      Batch{advice, group, round, token, surface, phase, fingerprints, units}

def lease_step(current: Handoff.Lease, round: Nat, token: Nat,
    target: Delivery.Phase) -> Handoff.LeaseResult:
  match target:
    case Delivery.Authorized{}: Handoff.lease.authorize(current, round, token)
    case Delivery.Submitted{}: Handoff.lease.terminal(current, round, token, True{})
    case Delivery.Uncertain{}: Handoff.lease.terminal(current, round, token, False{})
    case _: Handoff.Denied{current}

def step_record_result(record: LeaseRecord, result: Handoff.LeaseResult) -> Maybe<&2, LeaseRecord>:
  match record result:
    case LeaseRecord{advice, fingerprint, _, previous} Handoff.Granted{current}:
      Some{LeaseRecord{advice, fingerprint, current, previous}}
    case _ Handoff.Denied{_}: None{}

def step_record(record: LeaseRecord, round: Nat, token: Nat,
    target: Delivery.Phase) -> Maybe<&2, LeaseRecord>:
  match record:
    case LeaseRecord{_, _, +current, _}:
      step_record_result(record, lease_step(current, round, token, target))

def update_one_result(+state: State, advice: Nat, fingerprint: Nat,
    result: Maybe<&2, LeaseRecord>) -> Maybe<&2, State>:
  match state result:
    case State{leases, batches} Some{record}:
      Some{State{record <> remove_record(advice, fingerprint, leases), batches}}
    case _ None{}: None{}

def update_one_found(state: State, advice: Nat, fingerprint: Nat,
    round: Nat, token: Nat, target: Delivery.Phase,
    found: Maybe<&2, LeaseRecord>) -> Maybe<&2, State>:
  match found:
    case None{}: None{}
    case Some{record}:
      update_one_result(state, advice, fingerprint,
        step_record(record, round, token, target))

def update_one(+state: State, +advice: Nat, +fingerprint: Nat,
    round: Nat, token: Nat, target: Delivery.Phase) -> Maybe<&2, State>:
  match state:
    case State{leases, _}:
      update_one_found(state, advice, fingerprint, round, token, target,
        find_lease(advice, fingerprint, leases))

def update_one_if(current: Maybe<&2, State>, advice: Nat, fingerprint: Nat,
    round: Nat, token: Nat, target: Delivery.Phase) -> Maybe<&2, State>:
  match current:
    case None{}: None{}
    case Some{state}: update_one(state, advice, fingerprint, round, token, target)

def update_many(fingerprints: List<&2, Nat>, current: Maybe<&2, State>,
    +advice: Nat, +round: Nat, +token: Nat, +target: Delivery.Phase) -> Maybe<&2, State>:
  match fingerprints:
    case Nil{}: current
    case fingerprint <> rest:
      update_many(rest, update_one_if(current, advice, fingerprint, round, token, target),
        advice, round, token, target)

def transition_success(state: State, +batch: Batch, target: Delivery.Phase) -> Decision:
  match state:
    case State{leases, batches}:
      match batch:
        case Batch{advice, _, _, token, _, _, _, _}:
          Granted{State{leases, List.append(&2, Batch,
            remove_batch(advice, token, batches), batch_phase(batch, target) <> Nil{})}}

def transition_result(original: State, batch: Batch, target: Delivery.Phase,
    result: Maybe<&2, State>) -> Decision:
  match result:
    case None{}: Denied{original}
    case Some{state}: transition_success(state, batch, target)

def transition_found(+state: State, +batch: Batch,
    +target: Delivery.Phase, required: Delivery.Phase) -> Decision:
  match batch:
    case Batch{advice, _, round, token, _, phase, fingerprints, _}:
      Bool.pick(Decision, phase_is(phase, required),
        transition_result(state, batch, target,
          update_many(fingerprints, Some{state}, advice, round, token, target)),
        Denied{state})

def transition_lookup(state: State, target: Delivery.Phase,
    required: Delivery.Phase, found: Maybe<&2, Batch>) -> Decision:
  match found:
    case None{}: Denied{state}
    case Some{batch}: transition_found(state, batch, target, required)

def transition(+state: State, +advice: Nat, +token: Nat,
    target: Delivery.Phase, required: Delivery.Phase) -> Decision:
  match state:
    case State{_, batches}:
      transition_lookup(state, target, required, find_batch(advice, token, batches))

def authorize(state: State, advice: Nat, token: Nat) -> Decision:
  transition(state, advice, token, Delivery.Authorized{}, Delivery.Reserved{})

def terminal(state: State, advice: Nat, token: Nat, certain: Bool) -> Decision:
  match certain:
    case True{}:
      transition(state, advice, token, Delivery.Submitted{}, Delivery.Authorized{})
    case False{}:
      transition(state, advice, token, Delivery.Uncertain{}, Delivery.Authorized{})

def restore_record(record: LeaseRecord) -> Maybe<&2, LeaseRecord>:
  match record:
    case LeaseRecord{advice, fingerprint, _, previous}:
      match previous:
        case None{}: None{}
        case Some{current}: Some{LeaseRecord{advice, fingerprint, current, None{}}}

def restore_previous(+advice: Nat, +fingerprint: Nat,
    leases: List<&2, LeaseRecord>, batches: List<&2, Batch>,
    previous: Maybe<&2, LeaseRecord>) -> State:
  match previous:
    case None{}: State{remove_record(advice, fingerprint, leases), batches}
    case Some{record}:
      State{record <> remove_record(advice, fingerprint, leases), batches}

def restore_found(+state: State, +advice: Nat, +fingerprint: Nat,
    found: Maybe<&2, LeaseRecord>) -> State:
  match state found:
    case State{leases, batches} None{}: State{leases, batches}
    case State{leases, batches} Some{record}:
      restore_previous(advice, fingerprint, leases, batches,
        restore_record(record))

def restore_one(+state: State, +advice: Nat, +fingerprint: Nat) -> State:
  match state:
    case State{leases, _}:
      restore_found(state, advice, fingerprint, find_lease(advice, fingerprint, leases))

def restore_many(fingerprints: List<&2, Nat>, state: State, +advice: Nat) -> State:
  match fingerprints:
    case Nil{}: state
    case fingerprint <> rest: restore_many(rest, restore_one(state, advice, fingerprint), advice)

def without_batch(state: State, advice: Nat, token: Nat) -> State:
  match state:
    case State{leases, batches}: State{leases, remove_batch(advice, token, batches)}

def release_found(+state: State, batch: Batch) -> Decision:
  match batch:
    case Batch{+advice, _, _, token, _, +phase, fingerprints, _}:
      Bool.pick(Decision, Bool.or(phase_is(phase, Delivery.Reserved{}),
        phase_is(phase, Delivery.Authorized{})),
        Granted{without_batch(restore_many(fingerprints, state, advice), advice, token)},
        Denied{state})

def release_lookup(state: State, found: Maybe<&2, Batch>) -> Decision:
  match found:
    case None{}: Denied{state}
    case Some{batch}: release_found(state, batch)

def release(+state: State, +advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{_, batches}:
      release_lookup(state, find_batch(advice, token, batches))

def remove_advice_leases(+advice: Nat, items: List<&2, LeaseRecord>) -> List<&2, LeaseRecord>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      match item:
        case LeaseRecord{candidate, _, _, _}:
          keep_record(item, remove_advice_leases(advice, rest), Nat.is_eq(advice, candidate))

def remove_advice_batches(+advice: Nat, items: List<&2, Batch>) -> List<&2, Batch>:
  match items:
    case Nil{}: Nil{}
    case +item <> rest:
      match item:
        case Batch{candidate, _, _, _, _, _, _, _}:
          keep_batch(item, remove_advice_batches(advice, rest), Nat.is_eq(advice, candidate))

def forget(state: State, +advice: Nat) -> State:
  match state:
    case State{leases, batches}:
      State{remove_advice_leases(advice, leases), remove_advice_batches(advice, batches)}

def suppresses_found(round: Nat, surface: Handoff.Surface,
    found: Maybe<&2, LeaseRecord>) -> Bool:
  match found:
    case None{}: False{}
    case Some{LeaseRecord{_, _, current, _}}:
      Handoff.lease.suppresses(current, round, surface)

def suppresses(state: State, advice: Nat, fingerprint: Nat,
    round: Nat, surface: Handoff.Surface) -> Bool:
  match state:
    case State{leases, _}:
      suppresses_found(round, surface, find_lease(advice, fingerprint, leases))

def delivery_surface(surface: Handoff.Surface) -> Delivery.Surface:
  match surface:
    case Handoff.Edit{}: Delivery.Edit{}
    case Handoff.Background{}: Delivery.Background{}
    case Handoff.Stop{}: Delivery.Stop{}

def reofferable_found(found: Maybe<&2, Batch>) -> Bool:
  match found:
    case None{}: False{}
    case Some{Batch{_, _, _, _, surface, phase, _, _}}:
      Delivery.background_reofferable(phase, delivery_surface(surface))

def background_reofferable(state: State, advice: Nat, token: Nat) -> Bool:
  match state:
    case State{_, batches}:
      reofferable_found(find_batch(advice, token, batches))

def expired_found(elapsed: Nat, lifetime: Nat, found: Maybe<&2, Batch>) -> Bool:
  match found:
    case None{}: False{}
    case Some{Batch{_, _, _, _, _, phase, _, _}}:
      Delivery.expired(phase, elapsed, lifetime)

def expired(state: State, advice: Nat, token: Nat, elapsed: Nat, lifetime: Nat) -> Bool:
  match state:
    case State{_, batches}:
      expired_found(elapsed, lifetime, find_batch(advice, token, batches))

def token_ready_items(+group: Nat, +round: Nat, +token: Nat,
    items: List<&2, Batch>) -> Bool:
  match items:
    case Nil{}: True{}
    case Batch{_, candidate_group, candidate_round, candidate_token, _, phase, _, _} <> rest:
      Bool.and(Bool.or(Bool.not(Nat.is_eq(token, candidate_token)),
        Bool.and(Nat.is_eq(group, candidate_group),
          Bool.and(Nat.is_eq(round, candidate_round),
            phase_is(phase, Delivery.Reserved{})))),
        token_ready_items(group, round, token, rest))

def token_exists(+token: Nat, items: List<&2, Batch>) -> Bool:
  match items:
    case Nil{}: False{}
    case Batch{_, _, _, candidate, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(token, candidate), token_exists(token, rest))

def token_units_keep(units: List<&2, Nat>, tail: List<&2, Nat>, hit: Bool) -> List<&2, Nat>:
  match hit:
    case True{}: List.append(&2, Nat, units, tail)
    case False{}: tail

def token_units(+token: Nat, items: List<&2, Batch>) -> List<&2, Nat>:
  match items:
    case Nil{}: Nil{}
    case Batch{_, _, _, candidate, _, _, _, units} <> +rest:
      token_units_keep(units, token_units(token, rest), Nat.is_eq(token, candidate))

def same_units(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left right:
    case Nil{} Nil{}: True{}
    case left_head <> left_rest right_head <> right_rest:
      Bool.and(Nat.is_eq(left_head, right_head), same_units(left_rest, right_rest))
    case _ _: False{}

def token_ready(state: State, group: Nat, round: Nat, +token: Nat,
    selected: List<&2, Nat>) -> Bool:
  match state:
    case State{_, +batches}:
      Bool.and(token_exists(token, batches), Bool.and(token_ready_items(group, round, token, batches),
        same_units(token_units(token, batches), selected)))

def main() -> Decision:
  begin(initial(), 1n, 1n, 1n, 1n, Handoff.Background{}, True{}, 1n <> Nil{}, Nil{})
