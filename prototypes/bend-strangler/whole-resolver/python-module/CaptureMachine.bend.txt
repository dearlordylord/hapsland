import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ../Clock.bend as Clock
import ../CaptureAdmission.bend as Admission
import ./Session.bend as S

# Complete readAuthority ordering: physical cache/access/capture are effects;
# all reservation, refusal, charging and canonical/authority decisions are here.
type Stage is Data:
  LookingUp{}
  CheckingReservation{}
  Accessing{}
  Snapshotting{}
  Capturing{}
  Storing{}
  CheckingAdoption{}
  Diagnosing{}
type State is Data:
  State{
    session: S.Session,
    path: String,
    clock: T.ClockToken,
    cache: T.CacheToken,
    invocation: Nat,
    next_request: Nat,
    cached: T.CacheOutcome,
    selection: Maybe<&2, T.SelectionToken>,
    capture: Maybe<&2, T.CaptureToken>,
    bytes: Nat,
    stage: Stage
  }
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, capture: Maybe<&2, T.CaptureToken>, next_request: Nat}
  Failed{failure: T.TechnicalFailure}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _, _, _, _, _}: session

def with_session(state: State, replacement: S.Session) -> State:
  match state:
    case State{_, path, clock, cache, invocation, next_request, cached, selection, capture, bytes, stage}:
      State{replacement, path, clock, cache, invocation, next_request, cached, selection, capture, bytes, stage}

def state_path(state: State) -> String:
  match state:
    case State{_, path, _, _, _, _, _, _, _, _, _}: path

def with_path(state: State, replacement: String) -> State:
  match state:
    case State{session, _, clock, cache, invocation, next_request, cached, selection, capture, bytes, stage}:
      State{session, replacement, clock, cache, invocation, next_request, cached, selection, capture, bytes, stage}

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, _, clock, _, _, _, _, _, _, _, _}: clock

def with_clock(state: State, replacement: T.ClockToken) -> State:
  match state:
    case State{session, path, _, cache, invocation, next_request, cached, selection, capture, bytes, stage}:
      State{session, path, replacement, cache, invocation, next_request, cached, selection, capture, bytes, stage}

def state_cache(state: State) -> T.CacheToken:
  match state:
    case State{_, _, _, cache, _, _, _, _, _, _, _}: cache

def with_cache(state: State, replacement: T.CacheToken) -> State:
  match state:
    case State{session, path, clock, _, invocation, next_request, cached, selection, capture, bytes, stage}:
      State{session, path, clock, replacement, invocation, next_request, cached, selection, capture, bytes, stage}

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _, _, _, _, _}: invocation

def with_invocation(state: State, replacement: Nat) -> State:
  match state:
    case State{session, path, clock, cache, _, next_request, cached, selection, capture, bytes, stage}:
      State{session, path, clock, cache, replacement, next_request, cached, selection, capture, bytes, stage}

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _, _, _, _, _}: next_request

def with_next_request(state: State, replacement: Nat) -> State:
  match state:
    case State{session, path, clock, cache, invocation, _, cached, selection, capture, bytes, stage}:
      State{session, path, clock, cache, invocation, replacement, cached, selection, capture, bytes, stage}

def state_cached(state: State) -> T.CacheOutcome:
  match state:
    case State{_, _, _, _, _, _, cached, _, _, _, _}: cached

def with_cached(state: State, replacement: T.CacheOutcome) -> State:
  match state:
    case State{session, path, clock, cache, invocation, next_request, _, selection, capture, bytes, stage}:
      State{session, path, clock, cache, invocation, next_request, replacement, selection, capture, bytes, stage}

def state_selection(state: State) -> Maybe<&2, T.SelectionToken>:
  match state:
    case State{_, _, _, _, _, _, _, selection, _, _, _}: selection

def with_selection(state: State, replacement: Maybe<&2, T.SelectionToken>) -> State:
  match state:
    case State{session, path, clock, cache, invocation, next_request, cached, _, capture, bytes, stage}:
      State{session, path, clock, cache, invocation, next_request, cached, replacement, capture, bytes, stage}

def state_capture(state: State) -> Maybe<&2, T.CaptureToken>:
  match state:
    case State{_, _, _, _, _, _, _, _, capture, _, _}: capture

def with_capture(state: State, replacement: Maybe<&2, T.CaptureToken>) -> State:
  match state:
    case State{session, path, clock, cache, invocation, next_request, cached, selection, _, bytes, stage}:
      State{session, path, clock, cache, invocation, next_request, cached, selection, replacement, bytes, stage}

def state_bytes(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, _, _, _, _, bytes, _}: bytes

def with_bytes(state: State, replacement: Nat) -> State:
  match state:
    case State{session, path, clock, cache, invocation, next_request, cached, selection, capture, _, stage}:
      State{session, path, clock, cache, invocation, next_request, cached, selection, capture, replacement, stage}

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, _, _, _, _, stage}: stage

def with_stage(state: State, replacement: Stage) -> State:
  match state:
    case State{session, path, clock, cache, invocation, next_request, cached, selection, capture, bytes, _}:
      State{session, path, clock, cache, invocation, next_request, cached, selection, capture, bytes, replacement}

def request(+state: State, stage: Stage, operation: T.Operation) -> Step:
  Await{with_next_request(with_stage(state, stage), Nat.add(state_next_request(state), 1n)),
    T.Request{state_invocation(state), state_next_request(state), operation}}

def returned(+state: State, capture: Maybe<&2, T.CaptureToken>) -> Step:
  Returned{state_session(state), capture, state_next_request(state)}

def refused(state: State) -> Step:
  returned(state, None{})

def adoption(result: S.AuthorityResult, next: Nat) -> Step:
  match result:
    case S.AuthorityRefused{session}: Returned{session, None{}, next}
    case S.AuthorityAccepted{session, capture}: Returned{session, Some{capture}, next}

def adoption_capture(capture: Maybe<&2, T.CaptureToken>, +state: State, expired: Bool) -> Step:
  match capture:
    case None{}: Failed{T.MalformedReply{}}
    case Some{capture}: adoption(S.finish_capture(state_session(state), state_path(state), capture,
      state_bytes(state), expired), state_next_request(state))

def adoption_clock(available: Bool, +state: State) -> Step:
  match available:
    case False{}: refused(state)
    case True{}: request(state, CheckingAdoption{}, T.ReadClock{state_clock(state)})

def source_size(allowed: Bool, +state: State) -> Step:
  match allowed:
    case False{}: refused(state)
    case True{}: adoption_clock(S.available(state_session(state)), state)

def captured_size(+state: State) -> Step:
  source_size(Nat.is_le(state_bytes(state), S.source_cap(state_session(state))), state)

def capture_source(selection: Maybe<&2, T.SelectionToken>, +state: State) -> Step:
  match selection:
    case None{}: Failed{T.MalformedReply{}}
    case Some{selection}: request(with_session(state, S.reserve_capture(state_session(state), state_path(state))),
      Capturing{}, T.CaptureSource{selection, S.source_cap(state_session(state))})

def cached_source(cached: T.CacheOutcome, +state: State) -> Step:
  match cached:
    case T.CacheAbsent{}: capture_source(state_selection(state), state)
    case T.CachePresent{capture, bytes}: captured_size(with_bytes(with_capture(state, Some{capture}), bytes))

def cache_admission(refusal: Maybe<&2, T.CaptureDiagnostic>, +state: State) -> Step:
  match refusal:
    case None{}: cached_source(state_cached(state), state)
    case Some{diagnostic}: request(state, Diagnosing{}, T.ObserveDiagnostic{state_path(state), diagnostic})

def snapshot(entries: List<&2, T.CaptureBytes>, +state: State) -> Step:
  cache_admission(Admission.cache_refusal_for(entries, state_path(state), S.source_cap(state_session(state))), state)

def accessed(outcome: T.AccessOutcome, +state: State) -> Step:
  match outcome:
    case T.AccessDenied{}: refused(state)
    case T.AccessAllowed{selection, _}: request(with_selection(state, Some{selection}),
      Snapshotting{}, T.SnapshotCaptureCache{state_cache(state)})

def captured(outcome: T.CaptureOutcome, +state: State) -> Step:
  match outcome:
    case T.CaptureUnavailable{diagnostic}: request(state, Diagnosing{},
      T.ObserveDiagnostic{state_path(state), diagnostic})
    case T.SourceCaptured{+capture, _, bytes}: request(
      with_bytes(with_capture(with_session(state,
        S.capture_succeeded(state_session(state), state_path(state))), Some{capture}), bytes),
      Storing{}, T.StoreCaptureCache{state_cache(state), state_path(state), capture})

def reserved(plan: S.AuthorityPlan, +state: State) -> Step:
  match plan:
    case S.ReuseAuthority{session, S.Authority{_, capture, _}}: returned(with_session(state, session), Some{capture})
    case S.ReuseCanonical{session, capture}: returned(with_session(state, session), capture)
    case S.AccessAuthority{session, path, _}: request(with_session(state, session), Accessing{}, T.AccessPath{path})
    case S.AuthorityUnavailable{session}: refused(with_session(state, session))

def reservation_clock(available: Bool, +state: State) -> Step:
  match available:
    case False{}: refused(state)
    case True{}: request(state, CheckingReservation{}, T.ReadClock{state_clock(state)})

def cached(outcome: T.CacheOutcome, +state: State) -> Step:
  reservation_clock(S.available(state_session(state)), with_cached(state, outcome))

def apply_outcome(stage: Stage, +state: State, outcome: T.ServiceOutcome) -> Step:
  match stage outcome:
    case LookingUp{} T.CacheResult{outcome}: cached(outcome, state)
    case CheckingReservation{} T.ClockRead{bits}: reserved(
      S.plan_authority(state_session(state), state_path(state), state_cached(state), Clock.expired(bits)), state)
    case Accessing{} T.AccessResult{outcome}: accessed(outcome, state)
    case Snapshotting{} T.CacheSnapshot{entries}: snapshot(entries, state)
    case Capturing{} T.CaptureResult{outcome}: captured(outcome, state)
    case Storing{} T.CacheStored{}: captured_size(state)
    case CheckingAdoption{} T.ClockRead{bits}: adoption_capture(state_capture(state), state, Clock.expired(bits))
    case Diagnosing{} T.DiagnosticObserved{}: refused(state)
    case _ T.ProviderRejected{exception}: Failed{T.ForeignProviderFailure{exception}}
    case _ _: Failed{T.MalformedReply{}}

def checked(reply: Protocol.CheckedReply, +state: State) -> Step:
  match reply:
    case Protocol.RejectedReply{failure}: Failed{failure}
    case Protocol.CheckedOutcome{outcome}: apply_outcome(state_stage(state), state, outcome)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{state, request}: checked(Protocol.check(request, reply), state)
    case _: Failed{T.MalformedReply{}}

def failed_capture(failed: Bool, +state: State) -> Step:
  match failed:
    case True{}: refused(state)
    case False{}: request(state, LookingUp{}, T.LookupCaptureCache{state_cache(state), state_path(state)})

def known(known: Maybe<&2, S.Authority>, +state: State) -> Step:
  match known:
    case Some{S.Authority{_, capture, _}}: returned(state, Some{capture})
    case None{}: failed_capture(S.contains(S.failed(state_session(state)), state_path(state)), state)

def begin(+session: S.Session, +path: String, clock: T.ClockToken, cache: T.CacheToken,
    invocation: Nat, next_request: Nat) -> Step:
  known(S.find_authority(S.authority(session), path),
    State{session, path, clock, cache, invocation, next_request, T.CacheAbsent{}, None{}, None{}, 0n, LookingUp{}})

def main() -> Unit:
  Unit{}
