import Base

# A permit is source-free proof that a particular native edit tool was held
# behind the pre-edit boundary in one resident lifetime.
type Permit is Data:
  Permit{token: Nat, tool: Nat, round: Nat, started: Nat, deadline: Nat}

# Terminal permit identities fence replay after consumption, release, or expiry.
# This list is not a count of accepted edits; only consume opens a round.
type Used is Data:
  Used{token: Nat, tool: Nat}

type AdmissionState is Data:
  AdmissionState{
    partition: Nat, lifetime: Nat, round: Nat, active: Bool,
    closed_at: Nat, next_token: Nat,
    permits: List<&2, Permit>, used: List<&2, Used>
  }

type AdmissionEvent is Data:
  Issue{tool: Nat, started: Nat, deadline: Nat, now: Nat}
  Consume{token: Nat, tool: Nat, now: Nat}
  Release{token: Nat}
  CloseRound{at: Nat}
  Restart{new_lifetime: Nat, at: Nat}

type AdmissionRejection is Data:
  WrongPartition{}
  WrongLifetime{}
  StaleInvocation{}
  Expired{}
  DuplicateTool{}
  NoPermit{}
  UsedPermit{}
  WrongTool{}
  OldRound{}
  InvalidClock{}
  RoundAlreadyClosed{}
  LifetimeNotFresh{}

type AdmissionResult is Data:
  Accepted{state: AdmissionState, token: Maybe<&2, Nat>, round: Maybe<&2, Nat>}
  Rejected{state: AdmissionState, reason: AdmissionRejection}

type ExpiryResult is Data:
  KeepPermit{state: AdmissionState}
  RemovePermit{state: AdmissionState}

type ProspectiveFacts is Data:
  ProspectiveFacts{clock_valid: Bool, hook_window: Nat,
    started_upper: Nat, now_lower: Nat,
    advicee_permit_limit: Nat, resident_permit_limit: Nat,
    event_count: Nat, event_limit: Nat}

type ProspectiveDecision is Data:
  PermitAllowed{}
  PermitDenied{}
  PermitLate{}
  PermitInvalidClock{}

# Native identity and monotonic clock readings are measured by the adapter.
# Bend owns the elapsed-time and bounded-retention decisions.
def prospective_gate_ordered(clock_valid: Bool,
    event_count: Nat, event_limit: Nat, within: Bool) -> ProspectiveDecision:
  match within:
    case False{}:
      PermitLate{}
    case True{}:
      Bool.pick(ProspectiveDecision,
        Bool.and(clock_valid, Nat.is_lt(event_count, event_limit)),
        PermitAllowed{}, PermitDenied{})

def prospective_gate_window(facts: ProspectiveFacts, within: Bool, ordered: Bool) -> ProspectiveDecision:
  match facts:
    case ProspectiveFacts{clock_valid, hook_window, started_upper, now_lower,
        advicee_permit_limit, resident_permit_limit, event_count, event_limit}:
      match ordered:
        case False{}:
          PermitInvalidClock{}
        case True{}:
          prospective_gate_ordered(clock_valid, event_count, event_limit, within)

def prospective_gate(facts: ProspectiveFacts, +started: Nat, +now: Nat) -> ProspectiveDecision:
  match facts:
    case ProspectiveFacts{clock_valid, +hook_window, +started_upper, +now_lower,
        advicee_permit_limit, resident_permit_limit, event_count, event_limit}:
      prospective_gate_window(ProspectiveFacts{clock_valid, hook_window, started_upper, now_lower,
        advicee_permit_limit, resident_permit_limit,
        event_count, event_limit}, Nat.is_lt(now, (started + hook_window : Nat)),
        Nat.is_le(started_upper, now_lower))

def pending_count(state: AdmissionState) -> Nat:
  match state:
    case AdmissionState{_, _, _, _, _, _, permits, _}:
      List.length(&2, Permit, permits)

def initial(partition: Nat, lifetime: Nat) -> AdmissionState:
  AdmissionState{partition, lifetime, 0n, False{}, 0n, 1n, Nil{}, Nil{}}

def has_token(+token: Nat, used: List<&2, Used>) -> Bool:
  match used:
    case Nil{}:
      False{}
    case Used{current, _} <> rest:
      Bool.or(Nat.is_eq(token, current), has_token(token, rest))

def has_used_tool(+tool: Nat, used: List<&2, Used>) -> Bool:
  match used:
    case Nil{}:
      False{}
    case Used{_, current} <> rest:
      Bool.or(Nat.is_eq(tool, current), has_used_tool(tool, rest))

def has_tool(+tool: Nat, permits: List<&2, Permit>) -> Bool:
  match permits:
    case Nil{}:
      False{}
    case Permit{_, current, _, _, _} <> rest:
      Bool.or(Nat.is_eq(tool, current), has_tool(tool, rest))

def find_permit.pick(permit: Permit, fallback: Maybe<&2, Permit>, hit: Bool) -> Maybe<&2, Permit>:
  match hit:
    case True{}:
      Some{permit}
    case False{}:
      fallback

def find_permit(+token: Nat, permits: List<&2, Permit>) -> Maybe<&2, Permit>:
  match permits:
    case Nil{}:
      None{}
    case +permit <> rest:
      match permit:
        case Permit{current, _, _, _, _}:
          find_permit.pick(permit, find_permit(token, rest), Nat.is_eq(current, token))

def remove_permit.pick(permit: Permit, tail: List<&2, Permit>, hit: Bool) -> List<&2, Permit>:
  match hit:
    case True{}:
      tail
    case False{}:
      permit <> tail

def remove_permit(+token: Nat, permits: List<&2, Permit>) -> List<&2, Permit>:
  match permits:
    case Nil{}:
      Nil{}
    case +permit <> rest:
      match permit:
        case Permit{current, _, _, _, _}:
          remove_permit.pick(permit, remove_permit(token, rest), Nat.is_eq(current, token))

def candidate_round(round: Nat, active: Bool) -> Nat:
  match active:
    case True{}:
      round
    case False{}:
      (round + 1n : Nat)

def issue.tool(state: AdmissionState, partition: Nat, lifetime: Nat, +round: Nat, +active: Bool, closed_at: Nat, +next_token: Nat, permits: List<&2, Permit>, used: List<&2, Used>, tool: Nat, started: Nat, deadline: Nat, duplicate: Bool) -> AdmissionResult:
  match duplicate:
    case True{}:
      Rejected{state, DuplicateTool{}}
    case False{}:
      +expected_round = candidate_round(round, active)
      Accepted{AdmissionState{partition, lifetime, round, active, closed_at, (next_token + 1n : Nat),
        List.append(&2, Permit, permits, Permit{next_token, tool, expected_round, started, deadline} <> Nil{}), used},
        Some{next_token}, Some{expected_round}}

def issue.guard(state: AdmissionState, partition: Nat, lifetime: Nat, round: Nat, active: Bool, closed_at: Nat, +next_token: Nat, +permits: List<&2, Permit>, +used: List<&2, Used>, +tool: Nat, started: Nat, deadline: Nat, now: Nat, clock_valid: Bool) -> AdmissionResult:
  match clock_valid:
    case False{}:
      Rejected{state, StaleInvocation{}}
    case True{}:
      issue.tool(state, partition, lifetime, round, active, closed_at, next_token, permits, used, tool, started, deadline, Bool.or(has_tool(tool, permits), has_used_tool(tool, used)))

def issue(+state: AdmissionState, tool: Nat, +started: Nat, +deadline: Nat, +now: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{partition, lifetime, round, active, closed_at, next_token, permits, used}:
      issue.guard(state, partition, lifetime, round, active, closed_at, next_token, permits, used, tool, started, deadline, now,
        Bool.and(Nat.is_gt(started, closed_at), Bool.and(Nat.is_le(started, now), Nat.is_le(now, deadline))))

def record_used.found(permit: Maybe<&2, Permit>, used: List<&2, Used>) -> List<&2, Used>:
  match permit:
    case None{}:
      used
    case Some{Permit{found, tool, _, _, _}}:
      Used{found, tool} <> used

def record_used(token: Nat, permits: List<&2, Permit>, used: List<&2, Used>) -> List<&2, Used>:
  record_used.found(find_permit(token, permits), used)

def consume.round(state: AdmissionState, partition: Nat, lifetime: Nat, round: Nat, active: Bool, closed_at: Nat, +next_token: Nat, +permits: List<&2, Permit>, used: List<&2, Used>, +token: Nat, +permitted_round: Nat, correct_round: Bool) -> AdmissionResult:
  match correct_round:
    case False{}:
      Rejected{state, OldRound{}}
    case True{}:
      Accepted{AdmissionState{partition, lifetime, permitted_round, True{}, closed_at, next_token,
        remove_permit(token, permits), record_used(token, permits, used)}, Some{token}, Some{permitted_round}}

def consume.time(state: AdmissionState, partition: Nat, lifetime: Nat, +round: Nat, +active: Bool, closed_at: Nat, +next_token: Nat, permits: List<&2, Permit>, used: List<&2, Used>, token: Nat, now: Nat, +permitted_round: Nat, valid: Bool) -> AdmissionResult:
  match valid:
    case False{}:
      Rejected{state, Expired{}}
    case True{}:
      consume.round(state, partition, lifetime, round, active, closed_at, next_token, permits, used, token, permitted_round,
        Nat.is_eq(permitted_round, candidate_round(round, active)))

def consume.tool(state: AdmissionState, partition: Nat, lifetime: Nat, round: Nat, active: Bool, +closed_at: Nat, +next_token: Nat, permits: List<&2, Permit>, used: List<&2, Used>, token: Nat, tool: Nat, +now: Nat, permitted_round: Nat, +started: Nat, deadline: Nat, correct_tool: Bool) -> AdmissionResult:
  match correct_tool:
    case False{}:
      Rejected{state, WrongTool{}}
    case True{}:
      consume.time(state, partition, lifetime, round, active, closed_at, next_token, permits, used, token, now, permitted_round,
        Bool.and(Nat.is_gt(started, closed_at), Bool.and(Nat.is_le(started, now), Nat.is_le(now, deadline))))

def consume.check(+state: AdmissionState, token: Nat, +tool: Nat, now: Nat, permitted_tool: Nat, permitted_round: Nat, started: Nat, deadline: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{partition, lifetime, round, active, closed_at, next_token, permits, used}:
      consume.tool(state, partition, lifetime, round, active, closed_at, next_token, permits, used, token, tool, now, permitted_round, started, deadline, Nat.is_eq(tool, permitted_tool))

def consume.found(state: AdmissionState, token: Nat, tool: Nat, now: Nat, permit: Maybe<&2, Permit>) -> AdmissionResult:
  match permit:
    case None{}:
      Rejected{state, NoPermit{}}
    case Some{Permit{_, permitted_tool, permitted_round, started, deadline}}:
      consume.check(state, token, tool, now, permitted_tool, permitted_round, started, deadline)

def consume.used(state: AdmissionState, token: Nat, tool: Nat, now: Nat, was_used: Bool, permit: Maybe<&2, Permit>) -> AdmissionResult:
  match was_used:
    case True{}:
      Rejected{state, UsedPermit{}}
    case False{}:
      consume.found(state, token, tool, now, permit)

def consume(+state: AdmissionState, +token: Nat, tool: Nat, now: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{_, _, _, _, _, _, permits, used}:
      consume.used(state, token, tool, now, has_token(token, used), find_permit(token, permits))

def release.found(state: AdmissionState, +token: Nat, found: Maybe<&2, Permit>) -> AdmissionResult:
  match state:
    case AdmissionState{partition, lifetime, round, active, closed_at, next_token, +permits, used}:
      match found:
        case None{}:
          Rejected{AdmissionState{partition, lifetime, round, active, closed_at, next_token, permits, used}, NoPermit{}}
        case Some{_}:
          Accepted{AdmissionState{partition, lifetime, round, active, closed_at, next_token,
            remove_permit(token, permits), record_used(token, permits, used)}, None{}, None{}}

def release.used(state: AdmissionState, token: Nat, used: Bool, found: Maybe<&2, Permit>) -> AdmissionResult:
  match used:
    case True{}:
      Rejected{state, UsedPermit{}}
    case False{}:
      release.found(state, token, found)

def release(+state: AdmissionState, +token: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{_, _, _, _, _, _, permits, used}:
      release.used(state, token, has_token(token, used), find_permit(token, permits))

# The adapter measures the exact fractional deadline comparison. Bend decides
# whether to keep the native permit and removes the matching source-free token.
def expire.due(state: AdmissionState, +token: Nat) -> ExpiryResult:
  match state:
    case AdmissionState{partition, lifetime, round, active, closed_at, next_token,
        +permits, used}:
      RemovePermit{AdmissionState{partition, lifetime, round, active, closed_at,
        next_token, remove_permit(token, permits), record_used(token, permits, used)}}

def expire(+state: AdmissionState, token: Nat, deadline_reached: Bool) -> ExpiryResult:
  match deadline_reached:
    case False{}:
      KeepPermit{state}
    case True{}:
      expire.due(state, token)

def close_round.time(state: AdmissionState, partition: Nat, lifetime: Nat, +round: Nat, next_token: Nat, used: List<&2, Used>, at: Nat, valid: Bool) -> AdmissionResult:
  match valid:
    case False{}:
      Rejected{state, InvalidClock{}}
    case True{}:
      Accepted{AdmissionState{partition, lifetime, round, False{}, at, next_token, Nil{}, used}, None{}, Some{round}}

def close_round.active(state: AdmissionState, partition: Nat, lifetime: Nat, round: Nat, active: Bool, closed_at: Nat, next_token: Nat, used: List<&2, Used>, +at: Nat) -> AdmissionResult:
  match active:
    case False{}:
      Rejected{state, RoundAlreadyClosed{}}
    case True{}:
      close_round.time(state, partition, lifetime, round, next_token, used, at, Nat.is_ge(at, closed_at))

# Closure retires every still-pending tool identity, just like explicit release.
def record_all_used(permits: List<&2, Permit>, used: List<&2, Used>) -> List<&2, Used>:
  match permits:
    case Nil{}:
      used
    case Permit{token, tool, _, _, _} <> rest:
      record_all_used(rest, Used{token, tool} <> used)

def close_round(+state: AdmissionState, at: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{partition, lifetime, round, active, closed_at, next_token, permits, used}:
      close_round.active(state, partition, lifetime, round, active, closed_at, next_token,
        record_all_used(permits, used), at)

def restart.fresh(state: AdmissionState, partition: Nat, lifetime: Nat, closed_at: Nat, new_lifetime: Nat, at: Nat, valid: Bool) -> AdmissionResult:
  match valid:
    case False{}:
      Rejected{state, LifetimeNotFresh{}}
    case True{}:
      Accepted{AdmissionState{partition, new_lifetime, 0n, False{}, at, 1n, Nil{}, Nil{}}, None{}, None{}}

def restart(+state: AdmissionState, +new_lifetime: Nat, +at: Nat) -> AdmissionResult:
  match state:
    case AdmissionState{partition, lifetime, _, _, closed_at, _, _, _}:
      restart.fresh(state, partition, lifetime, closed_at, new_lifetime, at,
        Bool.and(Nat.is_gt(new_lifetime, lifetime), Nat.is_ge(at, closed_at)))

def callback_current(state: AdmissionState, partition: Nat, lifetime: Nat, round: Nat) -> Bool:
  match state:
    case AdmissionState{owner, live, current, active, _, _, _, _}:
      Bool.and(active, Bool.and(Nat.is_eq(owner, partition), Bool.and(Nat.is_eq(live, lifetime), Nat.is_eq(current, round))))

def apply_event(state: AdmissionState, event: AdmissionEvent) -> AdmissionResult:
  match event:
    case Issue{tool, started, deadline, now}:
      issue(state, tool, started, deadline, now)
    case Consume{token, tool, now}:
      consume(state, token, tool, now)
    case Release{token}:
      release(state, token)
    case CloseRound{at}:
      close_round(state, at)
    case Restart{new_lifetime, at}:
      restart(state, new_lifetime, at)

def step.partition(state: AdmissionState, partition: Nat, lifetime: Nat, event: AdmissionEvent, correct_partition: Bool, correct_lifetime: Bool) -> AdmissionResult:
  match correct_partition correct_lifetime:
    case False{} _:
      Rejected{state, WrongPartition{}}
    case True{} False{}:
      Rejected{state, WrongLifetime{}}
    case True{} True{}:
      apply_event(state, event)

def step(+state: AdmissionState, +partition: Nat, +lifetime: Nat, event: AdmissionEvent) -> AdmissionResult:
  match state:
    case AdmissionState{owner, live, _, _, _, _, _, _}:
      step.partition(state, partition, lifetime, event, Nat.is_eq(owner, partition), Nat.is_eq(live, lifetime))

def main() -> AdmissionResult:
  step(initial(7n, 3n), 7n, 3n, Issue{42n, 10n, 20n, 11n})
