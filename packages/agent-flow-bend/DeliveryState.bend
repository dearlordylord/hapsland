import Base
import ./SubmissionState.bend as SubmissionState
import ./Handoff.bend as Handoff

# Exact Stop output ownership. Native tokens and work IDs are mapped to Nat
# before entry; no host payload or source content is retained here.
type Phase is Data:
  Reserved{}
  Authorized{}
  Submitted{}
  Failed{}
  Uncertain{}

type Slot is Data:
  Slot{group: Nat, round: Nat, attempt: Nat, token: Nat,
    selected: List<&2, Nat>, phase: Phase}

type Counter is Data:
  Counter{group: Nat, round: Nat, used: Nat}

type State is Data:
  State{slots: List<&2, Slot>, counters: List<&2, Counter>, submissions: SubmissionState.State}

type Decision is Data:
  Granted{state: State}
  Denied{state: State}

def initial() -> State:
  State{Nil{}, Nil{}, SubmissionState.initial()}

def count(+group: Nat, +round: Nat, counters: List<&2, Counter>) -> Nat:
  match counters:
    case Nil{}:
      0n
    case Counter{candidate_group, candidate_round, used} <> rest:
      Bool.pick(Nat, Bool.and(Nat.is_eq(group, candidate_group),
        Nat.is_eq(round, candidate_round)), used, count(group, round, rest))

def has_group(+group: Nat, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, _, _, _, _, _} <> rest:
      Bool.or(Nat.is_eq(group, candidate_group), has_group(group, rest))

def keep_counter(item: Counter, rest: List<&2, Counter>, remove: Bool) -> List<&2, Counter>:
  match remove:
    case True{}: rest
    case False{}: item <> rest

def without_counter(+group: Nat, +round: Nat,
    counters: List<&2, Counter>) -> List<&2, Counter>:
  match counters:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Counter{candidate_group, candidate_round, _}:
          keep_counter(item, without_counter(group, round, rest),
            Bool.and(Nat.is_eq(group, candidate_group),
              Nat.is_eq(round, candidate_round)))

def retire_round(state: State, group: Nat, round: Nat) -> State:
  match state:
    case State{slots, counters, submissions}:
      State{slots, without_counter(group, round, counters), submissions}

def set_count(state: State, +group: Nat, +round: Nat, used: Nat) -> State:
  match state:
    case State{slots, counters, submissions}:
      State{slots, Counter{group, round, used} <>
        without_counter(group, round, counters), submissions}

def same_selected(left: List<&2, Nat>, right: List<&2, Nat>) -> Bool:
  match left:
    case Nil{}:
      match right:
        case Nil{}: True{}
        case _: False{}
    case head <> tail:
      match right:
        case Nil{}: False{}
        case other <> rest:
          Bool.and(Nat.is_eq(head, other), same_selected(tail, rest))

def reserve(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>) -> Decision:
  match state:
    case State{slots, counters, submissions}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(Nat.is_gt(group, 0n),
        Bool.and(Nat.is_gt(round, 0n), Bool.and(Nat.is_gt(attempt, 0n),
          Bool.and(Nat.is_gt(token, 0n), Bool.and(Bool.not(has_group(group, slots)),
            Bool.and(Nat.is_lt(used, 4n),
              Nat.is_gt(List.length(&2, Nat, selected), 0n))))))),
        Granted{set_count(State{Slot{group, round, attempt, token,
          selected, Reserved{}} <> slots, counters, submissions}, group, round, (used + 1n : Nat))},
        Denied{state})

def slot_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
        Bool.and(Nat.is_eq(round, candidate_round),
          Bool.and(Nat.is_eq(attempt, candidate_attempt),
            Nat.is_eq(token, candidate_token)))),
        slot_owned(group, round, attempt, token, rest))

def reserved_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, phase} <> rest:
      match phase:
        case Reserved{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Nat.is_eq(token, candidate_token)))),
            reserved_owned(group, round, attempt, token, rest))
        case _:
          reserved_owned(group, round, attempt, token, rest)

def keep_slot(item: Slot, rest: List<&2, Slot>, remove: Bool) -> List<&2, Slot>:
  match remove:
    case True{}: rest
    case False{}: item <> rest

def without_slot(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>) -> List<&2, Slot>:
  match slots:
    case Nil{}:
      Nil{}
    case +item <> rest:
      match item:
        case Slot{candidate_group, candidate_round, candidate_attempt,
            candidate_token, _, _}:
          keep_slot(item, without_slot(group, round, attempt, token, rest),
            Bool.and(Nat.is_eq(group, candidate_group),
              Bool.and(Nat.is_eq(round, candidate_round),
                Bool.and(Nat.is_eq(attempt, candidate_attempt),
                  Nat.is_eq(token, candidate_token)))))

def release(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat) -> Decision:
  match state:
    case State{slots, counters, submissions}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(reserved_owned(group, round, attempt, token, slots),
        Nat.is_gt(used, 0n)),
        Granted{set_count(State{without_slot(group, round, attempt, token, slots),
          counters, submissions}, group, round, (used - 1n : Nat))}, Denied{state})

def update_slot(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, +phase: Phase, items: List<&2, Slot>) -> List<&2, Slot>:
  match items:
    case Nil{}:
      Nil{}
    case +item <> +rest:
      match item:
        case Slot{candidate_group, candidate_round, candidate_attempt,
            candidate_token, _, _}:
          Bool.pick(List<&2, Slot>,
            Bool.and(Nat.is_eq(group, candidate_group),
              Bool.and(Nat.is_eq(round, candidate_round),
                Bool.and(Nat.is_eq(attempt, candidate_attempt),
                  Nat.is_eq(token, candidate_token)))),
            Slot{group, round, attempt, token, selected, phase} <> rest,
            item <> update_slot(group, round, attempt, token, selected, phase, rest))

def authorizable(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, candidate_selected, phase} <> rest:
      match phase:
        case Reserved{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Bool.and(Nat.is_eq(token, candidate_token),
                  same_selected(selected, candidate_selected))))),
            authorizable(group, round, attempt, token, selected, rest))
        case _:
          authorizable(group, round, attempt, token, selected, rest)

def authorize_result(+state: State, +group: Nat, +round: Nat,
    +attempt: Nat, +token: Nat, +selected: List<&2, Nat>,
    result: SubmissionState.Decision) -> Decision:
  match state result:
    case _ SubmissionState.Denied{_}: Denied{state}
    case State{slots, counters, _} SubmissionState.Granted{submissions}:
      Granted{State{update_slot(group, round, attempt, token,
        selected, Authorized{}, slots), counters, submissions}}

def authorize(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>) -> Decision:
  match state:
    case State{slots, _, submissions}:
      Bool.pick(Decision,
        authorizable(group, round, attempt, token, selected, slots),
        authorize_result(state, group, round, attempt, token, selected,
          SubmissionState.authorize_stop_token(submissions, token)), Denied{state})

def terminal_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    +selected: List<&2, Nat>, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, candidate_selected, phase} <> rest:
      match phase:
        case Authorized{}:
          Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
            Bool.and(Nat.is_eq(round, candidate_round),
              Bool.and(Nat.is_eq(attempt, candidate_attempt),
                Bool.and(Nat.is_eq(token, candidate_token),
                  same_selected(selected, candidate_selected))))),
            terminal_owned(group, round, attempt, token, selected, rest))
        case _:
          terminal_owned(group, round, attempt, token, selected, rest)

def terminal_submission_result(+state: State, +group: Nat, +round: Nat,
    +attempt: Nat, +token: Nat, +selected: List<&2, Nat>, phase: Phase,
    result: SubmissionState.Decision) -> Decision:
  match state result:
    case _ SubmissionState.Denied{_}: Denied{state}
    case State{slots, counters, _} SubmissionState.Granted{submissions}:
      Granted{State{update_slot(group, round, attempt, token,
        selected, phase, slots), counters, submissions}}

def terminal_owned_result(+state: State, +group: Nat, +round: Nat,
    +attempt: Nat, +token: Nat, +selected: List<&2, Nat>, phase: Phase) -> Decision:
  match state phase:
    case State{_, _, submissions} Submitted{}:
      Bool.pick(Decision, SubmissionState.token_units_match(submissions, token, selected),
        terminal_submission_result(state, group, round, attempt, token, selected,
          Submitted{}, SubmissionState.terminal_stop_token(submissions, token, True{})), Denied{state})
    case State{_, _, submissions} Uncertain{}:
      Bool.pick(Decision, SubmissionState.token_units_match(submissions, token, selected),
        terminal_submission_result(state, group, round, attempt, token, selected,
          Uncertain{}, SubmissionState.terminal_stop_token(submissions, token, False{})), Denied{state})
    case State{slots, counters, submissions} _:
      Granted{State{update_slot(group, round, attempt, token,
        selected, phase, slots), counters, submissions}}

def terminal(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat, +selected: List<&2, Nat>, +phase: Phase) -> Decision:
  match state:
    case State{slots, _, _}:
      Bool.pick(Decision, terminal_owned(group, round, attempt, token, selected, slots),
        terminal_owned_result(state, group, round, attempt, token, selected, phase),
        Denied{state})

def durable_phase(phase: Phase, token: Nat, submissions: SubmissionState.State) -> Bool:
  match phase:
    case Submitted{}: True{}
    case Uncertain{}: True{}
    case Failed{}: Bool.not(SubmissionState.token_exists_state(submissions, token))
    case _: False{}

def durable_owned(+group: Nat, +round: Nat, +attempt: Nat, +token: Nat,
    slots: List<&2, Slot>, +submissions: SubmissionState.State) -> Bool:
  match slots:
    case Nil{}:
      False{}
    case Slot{candidate_group, candidate_round, candidate_attempt,
        candidate_token, _, phase} <> rest:
      Bool.or(Bool.and(durable_phase(phase, token, submissions),
        Bool.and(Nat.is_eq(group, candidate_group),
          Bool.and(Nat.is_eq(round, candidate_round),
            Bool.and(Nat.is_eq(attempt, candidate_attempt),
              Nat.is_eq(token, candidate_token))))),
        durable_owned(group, round, attempt, token, rest, submissions))

def end(+state: State, +group: Nat, +round: Nat, +attempt: Nat,
    +token: Nat) -> Decision:
  match state:
    case State{slots, counters, submissions}:
      Bool.pick(Decision, durable_owned(group, round, attempt, token, slots, submissions),
        Granted{State{without_slot(group, round, attempt, token, slots), counters, submissions}},
        Denied{state})

def consume(+state: State, +group: Nat, +round: Nat) -> Decision:
  match state:
    case State{_, counters, _}:
      +used : Nat = count(group, round, counters)
      Bool.pick(Decision, Bool.and(Nat.is_gt(group, 0n),
        Bool.and(Nat.is_gt(round, 0n), Nat.is_lt(used, 4n))),
        Granted{set_count(state, group, round, (used + 1n : Nat))},
        Denied{state})

def submission_result(state: State, result: SubmissionState.Decision) -> Decision:
  match state result:
    case State{slots, counters, _} SubmissionState.Granted{submissions}:
      Granted{State{slots, counters, submissions}}
    case _ SubmissionState.Denied{_}: Denied{state}

def staging_locked_phase(phase: Phase) -> Bool:
  match phase:
    case Reserved{}: False{}
    case _: True{}

def staging_locked(+token: Nat, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}: False{}
    case Slot{_, _, _, candidate, _, phase} <> rest:
      Bool.or(Bool.and(Nat.is_eq(token, candidate), staging_locked_phase(phase)),
        staging_locked(token, rest))

def submission_begin(+state: State, advice: Nat, group: Nat, round: Nat,
    +token: Nat, surface: Handoff.Surface, authorize_now: Bool,
    fingerprints: List<&2, Nat>, units: List<&2, Nat>) -> Decision:
  match state:
    case State{slots, _, submissions}:
      Bool.pick(Decision, staging_locked(token, slots), Denied{state},
        submission_result(state, SubmissionState.begin(submissions, advice, group,
          round, token, surface, authorize_now, fingerprints, units)))

def slot_token(+token: Nat, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}: False{}
    case Slot{_, _, _, candidate, _, _} <> rest:
      Bool.or(Nat.is_eq(token, candidate), slot_token(token, rest))

def authorized_slot_token(+token: Nat, slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}: False{}
    case Slot{_, _, _, candidate, _, phase} <> rest:
      match phase:
        case Authorized{}:
          Bool.or(Nat.is_eq(token, candidate), authorized_slot_token(token, rest))
        case _:
          authorized_slot_token(token, rest)

def protected_advice_items(+advice: Nat, items: List<&2, SubmissionState.Batch>,
    +slots: List<&2, Slot>) -> Bool:
  match items:
    case Nil{}: False{}
    case SubmissionState.Batch{candidate, _, _, token, _, _, _, _} <> rest:
      Bool.or(Bool.and(Nat.is_eq(advice, candidate), authorized_slot_token(token, slots)),
        protected_advice_items(advice, rest, slots))

def protected_advice(state: State, advice: Nat) -> Bool:
  match state:
    case State{slots, _, SubmissionState.State{_, batches}}:
      protected_advice_items(advice, batches, slots)

def submission_authorize(+state: State, advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{slots, _, submissions}:
      Bool.pick(Decision, slot_token(token, slots), Denied{state},
        submission_result(state, SubmissionState.authorize(submissions, advice, token)))

def submission_terminal(+state: State, advice: Nat, +token: Nat, certain: Bool) -> Decision:
  match state:
    case State{slots, _, submissions}:
      Bool.pick(Decision, slot_token(token, slots), Denied{state},
        submission_result(state, SubmissionState.terminal(submissions, advice, token, certain)))

def submission_release(+state: State, advice: Nat, +token: Nat) -> Decision:
  match state:
    case State{slots, _, submissions}:
      Bool.pick(Decision, authorized_slot_token(token, slots), Denied{state},
        submission_result(state, SubmissionState.release(submissions, advice, token)))

def submission_forget(state: State, advice: Nat) -> State:
  match state:
    case State{slots, counters, submissions}:
      State{slots, counters, SubmissionState.forget(submissions, advice)}

def submission_suppresses(state: State, advice: Nat, fingerprint: Nat,
    round: Nat, surface: Handoff.Surface) -> Bool:
  match state:
    case State{_, _, submissions}:
      SubmissionState.suppresses(submissions, advice, fingerprint, round, surface)

def submission_reofferable(state: State, advice: Nat, token: Nat) -> Bool:
  match state:
    case State{_, _, submissions}:
      SubmissionState.background_reofferable(submissions, advice, token)

def submission_expired(state: State, advice: Nat, token: Nat,
    elapsed: Nat, lifetime: Nat) -> Bool:
  match state:
    case State{_, _, submissions}:
      SubmissionState.expired(submissions, advice, token, elapsed, lifetime)

def phase_is_reserved(phase: Phase) -> Bool:
  match phase:
    case Reserved{}: True{}
    case _: False{}

def reserved_token(+group: Nat, +round: Nat, +token: Nat,
    slots: List<&2, Slot>) -> Bool:
  match slots:
    case Nil{}: False{}
    case Slot{candidate_group, candidate_round, _, candidate_token, _, phase} <> rest:
      Bool.or(Bool.and(Nat.is_eq(group, candidate_group),
        Bool.and(Nat.is_eq(round, candidate_round),
          Bool.and(Nat.is_eq(token, candidate_token),
            phase_is_reserved(phase)))),
        reserved_token(group, round, token, rest))

def submission_reservation(state: State, group: Nat, round: Nat, token: Nat) -> Bool:
  match state:
    case State{slots, _, _}: reserved_token(group, round, token, slots)

def submission_ready(state: State, group: Nat, round: Nat, token: Nat,
    selected: List<&2, Nat>) -> Bool:
  match state:
    case State{_, _, submissions}:
      SubmissionState.token_ready(submissions, group, round, token, selected)

def main() -> Decision:
  reserve(initial(), 1n, 1n, 1n, 1n, 1n <> Nil{})
