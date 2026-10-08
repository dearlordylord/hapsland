import Base

# Each candidate is exactly one finding. A review unit may supply many
# candidates, each with a distinct finding ID and the same unit ID. The adapter
# measures exact encoded host lines; Bend decides selection and limitations.
type Advice is Data:
  Advice{id: Nat, unit: Nat, partition: Nat, round: Nat,
    snapshot: Nat, current_snapshot: Nat, credential: Nat, current_credential: Nat,
    age_ms: Nat, solo_bytes: Nat, collection_ready: Bool}

type Selection is Data:
  Selection{partition: Nat, round: Nat,
    selected: List<&2, Nat>, retained: List<&2, Nat>, findings: Nat, bytes: Nat}

type SelectResult is Data:
  Selected{state: Selection}
  Retained{state: Selection}
  Expired{state: Selection}
  Limited{state: Selection, id: Nat}
  Duplicate{state: Selection}

type NoticeOffer is Data:
  IncludeNotice{}
  SkipNotice{}
  StopNotices{}

type ValidationStatus is Data:
  Current{}
  Stale{}
  Unavailable{}
  Unattributed{}

type CandidateAction is Data:
  IgnoreCandidate{}
  ReleaseCandidate{}
  RetireCandidate{}
  ContinueCandidate{}
  RetainCandidate{}

def validation_route(owner_current: Bool, status: ValidationStatus) -> CandidateAction:
  match owner_current:
    case False{}:
      IgnoreCandidate{}
    case True{}:
      match status:
        case Current{}:
          ContinueCandidate{}
        case Stale{}:
          RetireCandidate{}
        case _:
          ReleaseCandidate{}

def post_validation(work_accepted: Bool, expired: Bool, has_fitting: Bool) -> CandidateAction:
  Bool.pick(CandidateAction, Bool.or(Bool.not(work_accepted), expired), RetireCandidate{},
    Bool.pick(CandidateAction, has_fitting, RetainCandidate{}, ReleaseCandidate{}))

def final_candidate(owner_current: Bool, credential_generation: Bool,
    credential_authorized: Bool, expired: Bool, work_current: Bool,
    has_findings: Bool) -> CandidateAction:
  Bool.pick(CandidateAction, Bool.not(owner_current), IgnoreCandidate{},
    Bool.pick(CandidateAction, Bool.not(credential_generation), RetireCandidate{},
      Bool.pick(CandidateAction, Bool.not(credential_authorized), ReleaseCandidate{},
        Bool.pick(CandidateAction, Bool.or(expired, Bool.not(work_current)), RetireCandidate{},
          Bool.pick(CandidateAction, has_findings, RetainCandidate{}, ReleaseCandidate{})))))

def initial(partition: Nat, round: Nat) -> Selection:
  Selection{partition, round, Nil{}, Nil{}, 0n, 0n}

def current(advice: Advice, partition: Nat, round: Nat) -> Bool:
  match advice:
    case Advice{_, _, source_partition, source_round, source_snapshot, current_snapshot,
        source_credential, current_credential, age_ms, _, ready}:
      Bool.and(Nat.is_eq(source_partition, partition),
        Bool.and(Nat.is_eq(source_round, round),
        Bool.and(Nat.is_eq(source_snapshot, current_snapshot),
        Bool.and(Nat.is_eq(source_credential, current_credential),
        Bool.and(Nat.is_lt(age_ms, 600000n), ready)))))

def fits_batch(+items: Nat, bytes: Nat) -> Bool:
  Bool.and(Nat.is_gt(items, 0n), Nat.is_le(bytes, 10240n))

# Claude may skip a notice that does not fit and consider later candidates;
# Codex preserves a prefix and stops at the first one that does not fit.
def notice_offer(items: Nat, bytes: Nat, skip_unfitting: Bool) -> NoticeOffer:
  Bool.pick(NoticeOffer, fits_batch(items, bytes), IncludeNotice{},
    Bool.pick(NoticeOffer, skip_unfitting, SkipNotice{}, StopNotices{}))

def select.fit(state: Selection, id: Nat, prospective_bytes: Nat, fits: Bool) -> SelectResult:
  match state:
    case Selection{partition, round, selected, retained, count, bytes}:
      match fits:
        case True{}:
          Selected{Selection{partition, round,
            List.append(&2, Nat, selected, id <> Nil{}), retained,
            (count + 1n : Nat), prospective_bytes}}
        case False{}:
          Retained{Selection{partition, round, selected,
            List.append(&2, Nat, retained, id <> Nil{}), count, bytes}}

def select.limit(state: Selection, +id: Nat) -> SelectResult:
  match state:
    case Selection{partition, round, selected, retained, count, bytes}:
      Limited{Selection{partition, round, selected,
        List.append(&2, Nat, retained, id <> Nil{}), count, bytes}, id}

def select.solo(state: Selection, id: Nat, +prospective_bytes: Nat,
    count: Nat, oversized: Bool) -> SelectResult:
  match oversized:
    case True{}:
      select.limit(state, id)
    case False{}:
      select.fit(state, id, prospective_bytes,
        fits_batch((count + 1n : Nat), prospective_bytes))

def select.valid(state: Selection, id: Nat, prospective_bytes: Nat, solo_bytes: Nat,
    count: Nat, valid: Bool) -> SelectResult:
  match valid:
    case True{}:
      select.solo(state, id, prospective_bytes, count, Nat.is_gt(solo_bytes, 10240n))
    case False{}:
      Expired{state}

def select.current(
  +state: Selection,
  advice: Advice,
  prospective_bytes: Nat,
  valid: Bool
) -> SelectResult:
  match state:
    case Selection{_, _, _, _, count, _}:
      match advice:
        case Advice{id, _, _, _, _, _, _, _, _, solo_bytes, _}:
          select.valid(state, id, prospective_bytes, solo_bytes, count, valid)

def contains(id: Nat, ids: List<&2, Nat>) -> Bool:
  List.contains(~Nat, ~Nat.is_eq, ids, id)

def select.duplicate(state: Selection, advice: Advice, prospective_bytes: Nat,
    current: Bool, duplicate: Bool) -> SelectResult:
  match duplicate:
    case True{}:
      Duplicate{state}
    case False{}:
      select.current(state, advice, prospective_bytes, current)

def select(+state: Selection, +advice: Advice, prospective_bytes: Nat) -> SelectResult:
  match state:
    case Selection{partition, round, selected, retained, _, _}:
      match advice:
        case Advice{id, _, _, _, _, _, _, _, _, _, _}:
          select.duplicate(state, advice, prospective_bytes,
            current(advice, partition, round),
            Bool.or(contains(id, selected), contains(id, retained)))

# A notice may be delivered alongside findings but cannot authorize a Stop
# continuation. The finish slot is reserved before output authorization.
type Finish is Data:
  Finish{round: Nat, active: Bool, closed: Bool, continuations: Nat, reserved: Bool,
    token: Nat, collector: Nat, deadline_at: Nat}

type FinishResult is Data:
  Continue{state: Finish}
  Allow{state: Finish}
  FinishWait{state: Finish}

def finish.initial(round: Nat) -> Finish:
  Finish{round, True{}, False{}, 0n, False{}, 0n, 0n, 0n}

def finish.choose.check(state: Finish, can_continue: Bool) -> FinishResult:
  match state:
    case Finish{round, active, closed, continuations, reserved, token, collector, deadline_at}:
      match can_continue:
        case True{}:
          Continue{
            Finish{
              round,
              active,
              closed,
              (continuations + 1n : Nat),
              True{},
              token,
              collector,
              deadline_at
            }
          }
        case False{}:
          Allow{
            Finish{round, False{}, True{}, continuations, False{}, token, collector, deadline_at}
          }

def finish.choose(+state: Finish, actionable_findings: Nat) -> FinishResult:
  match state:
    case Finish{_, _, _, continuations, _, _, _, _}:
      finish.choose.check(state,
        Bool.and(Nat.is_gt(actionable_findings, 0n), Nat.is_lt(continuations, 4n)))

def finish.zero(state: Finish, actionable_findings: Nat, zero: Bool) -> FinishResult:
  match zero:
    case True{}:
      finish.choose(state, actionable_findings)
    case False{}:
      FinishWait{state}

def finish.ready(
  state: Finish,
  unfinished: Nat,
  deadline: Bool,
  actionable_findings: Nat
) -> FinishResult:
  match deadline:
    case True{}:
      finish.choose(state, actionable_findings)
    case False{}:
      finish.zero(state, actionable_findings, Nat.is_eq(unfinished, 0n))

def finish.pending(
  state: Finish,
  unfinished: Nat,
  deadline: Bool,
  actionable_findings: Nat,
  reserved: Bool
) -> FinishResult:
  match reserved:
    case True{}:
      FinishWait{state}
    case False{}:
      finish.ready(state, unfinished, deadline, actionable_findings)

def finish.guard(
  state: Finish,
  unfinished: Nat,
  deadline: Bool,
  actionable_findings: Nat,
  valid: Bool,
  reserved: Bool
) -> FinishResult:
  match valid:
    case True{}:
      finish.pending(state, unfinished, deadline, actionable_findings, reserved)
    case False{}:
      Allow{state}

def finish.decide(
  +state: Finish,
  unfinished: Nat,
  deadline: Bool,
  actionable_findings: Nat
) -> FinishResult:
  match state:
    case Finish{_, active, closed, _, reserved, _, _, _}:
      finish.guard(state, unfinished, deadline, actionable_findings,
        Bool.and(active, Bool.not(closed)), reserved)

def finish.start.choose(state: Finish, original_deadline: Nat, first: Bool) -> Finish:
  match state:
    case Finish{round, active, closed, continuations, reserved, token, collector, deadline_at}:
      match first:
        case True{}:
          Finish{
            round,
            active,
            closed,
            continuations,
            reserved,
            token,
            collector,
            original_deadline
          }
        case False{}:
          Finish{round, active, closed, continuations, reserved, token, collector, deadline_at}

def finish.start(+state: Finish, original_deadline: Nat) -> Finish:
  match state:
    case Finish{_, _, _, _, _, _, _, deadline_at}:
      finish.start.choose(state, original_deadline, Nat.is_eq(deadline_at, 0n))

def finish.at(+state: Finish, unfinished: Nat, now: Nat, actionable_findings: Nat) -> FinishResult:
  match state:
    case Finish{_, _, _, _, _, _, _, deadline_at}:
      finish.decide(state, unfinished, Nat.is_ge(now, deadline_at), actionable_findings)

def finish.decide_at(state: Finish, unfinished: Nat, now: Nat, original_deadline: Nat,
    actionable_findings: Nat) -> FinishResult:
  finish.at(finish.start(state, original_deadline), unfinished, now, actionable_findings)

def finish.bind_writer(state: Finish, writer: Nat) -> Finish:
  match state:
    case Finish{round, active, closed, continuations, reserved, token, _, deadline_at}:
      Finish{
        round,
        active,
        closed,
        continuations,
        reserved,
        (token + 1n : Nat),
        writer,
        deadline_at
      }

def finish.complete.check(state: Finish, valid: Bool) -> Finish:
  match state:
    case Finish{round, active, closed, continuations, reserved, token, collector, deadline_at}:
      match valid:
        case True{}:
          Finish{round, active, closed, continuations, False{}, token, collector, 0n}
        case False{}:
          Finish{round, active, closed, continuations, reserved, token, collector, deadline_at}

def finish.can_complete(state: Finish, round: Nat, slot: Nat, token: Nat, collector: Nat) -> Bool:
  match state:
    case Finish{own_round, active, closed, continuations, reserved, own_token, own_collector, _}:
      Bool.and(Nat.is_eq(own_round, round),
        Bool.and(active, Bool.and(Bool.not(closed),
          Bool.and(reserved, Bool.and(Nat.is_eq(continuations, slot),
            Bool.and(Nat.is_eq(own_token, token), Nat.is_eq(own_collector, collector)))))))

def finish.complete(+state: Finish, round: Nat, slot: Nat, token: Nat, collector: Nat) -> Finish:
  match state:
    case Finish{_, _, _, _, _, _, _, _}:
      finish.complete.check(state, finish.can_complete(state, round, slot, token, collector))

def main() -> FinishResult:
  finish.decide(finish.initial(1n), 0n, False{}, 1n)

# Each item has at most one live writer. An uncertain write means the writer has
# terminated without a reliable acknowledgement; it consumes the original
# slot. Only an uncertain background write can be reoffered once at Stop after
# fresh validation; a successful stdout write counts as delivery.
type Surface is Data:
  Edit{}
  Background{}
  Stop{}

type LeasePhase is Data:
  Available{}
  Reserved{token: Nat, surface: Surface}
  Authorized{token: Nat, surface: Surface}
  Submitted{surface: Surface}
  Uncertain{surface: Surface}

type Lease is Data:
  Lease{item: Nat, round: Nat, closed: Bool, reoffered: Bool, phase: LeasePhase}

type LeaseResult is Data:
  Granted{state: Lease}
  Denied{state: Lease}

def lease.initial(item: Nat, round: Nat) -> Lease:
  Lease{item, round, False{}, False{}, Available{}}

def lease.reserve.phase(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    phase: LeasePhase, token: Nat, surface: Surface) -> LeaseResult:
  match phase:
    case Available{}:
      Granted{Lease{item, round, closed, reoffered, Reserved{token, surface}}}
    case _:
      Denied{Lease{item, round, closed, reoffered, phase}}

def lease.reserve.guard(state: Lease, token: Nat, surface: Surface, allowed: Bool) -> LeaseResult:
  match state:
    case Lease{item, round, closed, reoffered, phase}:
      match allowed:
        case True{}:
          lease.reserve.phase(item, round, closed, reoffered, phase, token, surface)
        case False{}:
          Denied{Lease{item, round, closed, reoffered, phase}}

def lease.reserve(+state: Lease, round: Nat, token: Nat, surface: Surface) -> LeaseResult:
  match state:
    case Lease{_, own_round, closed, _, _}:
      lease.reserve.guard(state, token, surface,
        Bool.and(Nat.is_eq(own_round, round), Bool.not(closed)))

def lease.authorize.match(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    own_token: Nat, surface: Surface, same: Bool) -> LeaseResult:
  match same:
    case True{}:
      Granted{Lease{item, round, closed, reoffered, Authorized{own_token, surface}}}
    case False{}:
      Denied{Lease{item, round, closed, reoffered, Reserved{own_token, surface}}}

def lease.authorize.phase(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    phase: LeasePhase, token: Nat) -> LeaseResult:
  match phase:
    case Reserved{+own_token, surface}:
      lease.authorize.match(
        item,
        round,
        closed,
        reoffered,
        own_token,
        surface,
        Nat.is_eq(own_token, token)
      )
    case _:
      Denied{Lease{item, round, closed, reoffered, phase}}

def lease.authorize.guard(state: Lease, token: Nat, allowed: Bool) -> LeaseResult:
  match state:
    case Lease{item, round, closed, reoffered, phase}:
      match allowed:
        case True{}:
          lease.authorize.phase(item, round, closed, reoffered, phase, token)
        case False{}:
          Denied{Lease{item, round, closed, reoffered, phase}}

def lease.authorize(+state: Lease, round: Nat, token: Nat) -> LeaseResult:
  match state:
    case Lease{_, own_round, closed, _, _}:
      lease.authorize.guard(state, token,
        Bool.and(Nat.is_eq(own_round, round), Bool.not(closed)))

def lease.release.match(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    own_token: Nat, surface: Surface, same: Bool) -> LeaseResult:
  match same:
    case True{}:
      Granted{Lease{item, round, closed, reoffered, Available{}}}
    case False{}:
      Denied{Lease{item, round, closed, reoffered, Reserved{own_token, surface}}}

def lease.release.phase(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    phase: LeasePhase, token: Nat) -> LeaseResult:
  match phase:
    case Reserved{+own_token, surface}:
      lease.release.match(
        item,
        round,
        closed,
        reoffered,
        own_token,
        surface,
        Nat.is_eq(own_token, token)
      )
    case _:
      Denied{Lease{item, round, closed, reoffered, phase}}

def lease.release.guard(state: Lease, token: Nat, allowed: Bool) -> LeaseResult:
  match state:
    case Lease{item, round, closed, reoffered, phase}:
      match allowed:
        case True{}:
          lease.release.phase(item, round, closed, reoffered, phase, token)
        case False{}:
          Denied{Lease{item, round, closed, reoffered, phase}}

def lease.release(+state: Lease, round: Nat, token: Nat) -> LeaseResult:
  match state:
    case Lease{_, own_round, closed, _, _}:
      lease.release.guard(state, token,
        Bool.and(Nat.is_eq(own_round, round), Bool.not(closed)))

def lease.terminal.match(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    own_token: Nat, surface: Surface, same: Bool, certain: Bool) -> LeaseResult:
  match same:
    case True{}:
      match certain:
        case True{}:
          Granted{Lease{item, round, closed, reoffered, Submitted{surface}}}
        case False{}:
          Granted{Lease{item, round, closed, reoffered, Uncertain{surface}}}
    case False{}:
      Denied{Lease{item, round, closed, reoffered, Authorized{own_token, surface}}}

def lease.terminal.phase(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    phase: LeasePhase, token: Nat, certain: Bool) -> LeaseResult:
  match phase:
    case Authorized{+own_token, surface}:
      lease.terminal.match(
        item,
        round,
        closed,
        reoffered,
        own_token,
        surface,
        Nat.is_eq(own_token, token),
        certain
      )
    case _:
      Denied{Lease{item, round, closed, reoffered, phase}}

def lease.terminal.guard(state: Lease, token: Nat, certain: Bool, allowed: Bool) -> LeaseResult:
  match state:
    case Lease{item, round, closed, reoffered, phase}:
      match allowed:
        case True{}:
          lease.terminal.phase(item, round, closed, reoffered, phase, token, certain)
        case False{}:
          Denied{Lease{item, round, closed, reoffered, phase}}

def lease.terminal(+state: Lease, round: Nat, token: Nat, certain: Bool) -> LeaseResult:
  match state:
    case Lease{_, own_round, closed, _, _}:
      lease.terminal.guard(state, token, certain,
        Bool.and(Nat.is_eq(own_round, round), Bool.not(closed)))

def lease.reoffer.surface(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    surface: Surface, uncertain: Bool, token: Nat) -> LeaseResult:
  match surface:
    case Edit{}:
      match uncertain:
        case True{}:
          Denied{Lease{item, round, closed, reoffered, Uncertain{surface}}}
        case False{}:
          Denied{Lease{item, round, closed, reoffered, Submitted{surface}}}
    case Background{}:
      Granted{Lease{item, round, closed, True{}, Reserved{token, Stop{}}}}
    case Stop{}:
      match uncertain:
        case True{}:
          Denied{Lease{item, round, closed, reoffered, Uncertain{surface}}}
        case False{}:
          Denied{Lease{item, round, closed, reoffered, Submitted{surface}}}

def lease.reoffer.phase(item: Nat, round: Nat, closed: Bool, reoffered: Bool,
    phase: LeasePhase, token: Nat) -> LeaseResult:
  match phase:
    case Submitted{surface}:
      Denied{Lease{item, round, closed, reoffered, Submitted{surface}}}
    case Uncertain{surface}:
      lease.reoffer.surface(item, round, closed, reoffered, surface, True{}, token)
    case _:
      Denied{Lease{item, round, closed, reoffered, phase}}

def lease.reoffer.guard(state: Lease, token: Nat, allowed: Bool) -> LeaseResult:
  match state:
    case Lease{item, round, closed, reoffered, phase}:
      match allowed:
        case True{}:
          lease.reoffer.phase(item, round, closed, reoffered, phase, token)
        case False{}:
          Denied{Lease{item, round, closed, reoffered, phase}}

def lease.reoffer(+state: Lease, round: Nat, token: Nat, fresh: Bool) -> LeaseResult:
  match state:
    case Lease{_, own_round, closed, reoffered, _}:
      lease.reoffer.guard(state, token,
        Bool.and(Nat.is_eq(own_round, round),
          Bool.and(Bool.not(closed), Bool.and(Bool.not(reoffered), fresh))))

def lease.offer.background(+state: Lease, round: Nat, token: Nat,
    surface: Surface, fresh: Bool) -> LeaseResult:
  match surface:
    case Stop{}:
      lease.reoffer(state, round, token, fresh)
    case _:
      lease.reserve(state, round, token, surface)

def lease.offer.phase(+state: Lease, round: Nat, token: Nat,
    surface: Surface, fresh: Bool, phase: LeasePhase) -> LeaseResult:
  match phase:
    case Uncertain{Background{}}:
      lease.offer.background(state, round, token, surface, fresh)
    case _:
      lease.reserve(state, round, token, surface)

def lease.offer(+state: Lease, round: Nat, token: Nat,
    surface: Surface, fresh: Bool) -> LeaseResult:
  match state:
    case Lease{_, _, _, _, phase}:
      lease.offer.phase(state, round, token, surface, fresh, phase)

def lease.close(state: Lease) -> Lease:
  match state:
    case Lease{item, round, _, reoffered, phase}:
      Lease{item, round, True{}, reoffered, phase}

def lease.suppress_surface(own: Surface, requested: Surface) -> Bool:
  match own:
    case Background{}:
      match requested:
        case Stop{}:
          False{}
        case _:
          True{}
    case _:
      True{}

def lease.suppress_phase(phase: LeasePhase, requested: Surface) -> Bool:
  match phase:
    case Available{}:
      False{}
    case Reserved{_, _}:
      True{}
    case Authorized{_, _}:
      True{}
    case Submitted{_}:
      True{}
    case Uncertain{surface}:
      lease.suppress_surface(surface, requested)

def lease.suppresses(state: Lease, round: Nat, requested: Surface) -> Bool:
  match state:
    case Lease{_, owner, closed, _, phase}:
      Bool.and(Nat.is_eq(owner, round),
        Bool.and(Bool.not(closed), lease.suppress_phase(phase, requested)))
