import Base
import ../Types.bend as T
import ../Protocol.bend as Protocol
import ../Clock.bend as Clock
import ./Session.bend as S

# One real observePath request, including its exact cached-read/deadline order.
# A parent Python module machine composes this child; host only performs requests.
type Stage is Data:
  CheckingPath{}
  CheckingClock{}
  ReadingMembership{}
type State is Data:
  State{session: S.Session, path: String, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat, stage: Stage}
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{session: S.Session, observation: Maybe<&2, T.PathMembership>, next_request: Nat}
  Failed{failure: T.TechnicalFailure}

def state_session(state: State) -> S.Session:
  match state:
    case State{session, _, _, _, _, _, _}: session

def state_path(state: State) -> String:
  match state:
    case State{_, path, _, _, _, _, _}: path

def state_clock(state: State) -> T.ClockToken:
  match state:
    case State{_, _, clock, _, _, _, _}: clock

def state_separator(state: State) -> String:
  match state:
    case State{_, _, _, separator, _, _, _}: separator

def state_invocation(state: State) -> Nat:
  match state:
    case State{_, _, _, _, invocation, _, _}: invocation

def state_next_request(state: State) -> Nat:
  match state:
    case State{_, _, _, _, _, next_request, _}: next_request

def state_stage(state: State) -> Stage:
  match state:
    case State{_, _, _, _, _, _, stage}: stage

def request(state: State, stage: Stage, operation: T.Operation) -> Step:
  match state:
    case State{session, path, clock, separator, +invocation, +next, _}:
      Await{State{session, path, clock, separator, invocation, Nat.add(next, 1n), stage},
        T.Request{invocation, next, operation}}

def unavailable(state: State) -> Step:
  match state:
    case State{session, _, _, _, _, next, _}:
      Returned{S.with_available(session, False{}), None{}, next}

def clock_available(available: Bool, +state: State, clock: T.ClockToken) -> Step:
  match available:
    case False{}: unavailable(state)
    case True{}: request(state, CheckingClock{}, T.ReadClock{clock})

def start_clock(state: State) -> Step:
  match state:
    case State{+session, path, +clock, separator, invocation, next, stage}:
      clock_available(S.available(session), State{session, path, clock, separator, invocation, next, stage}, clock)

def within(admitted: Bool, +state: State) -> Step:
  match admitted:
    case False{}: unavailable(state)
    case True{}: start_clock(state)

def path_reply(absolute: Bool, +state: State) -> Step:
  match state:
    case State{session, +path, clock, +separator, invocation, next, stage}:
      within(Bool.and(Bool.not(absolute), Bool.and(Bool.not(String.eq(path, "..")),
        Bool.not(String.starts_with(path, String.append("..", separator))))),
        State{session, path, clock, separator, invocation, next, stage})

def probe(plan: S.ObservationPlan, clock: T.ClockToken, separator: String,
    invocation: Nat, +next: Nat) -> Step:
  match plan:
    case S.MembershipUnavailable{session}: Returned{session, None{}, next}
    case S.KnownMembership{session, observation}: Returned{session, Some{observation}, next}
    case S.ProbeMembership{session, +path}:
      request(State{session, path, clock, separator, invocation, next, ReadingMembership{}},
        ReadingMembership{}, T.ReadPathMembership{path})

def clock_reply(bits: T.Binary64, state: State) -> Step:
  match state:
    case State{session, path, clock, separator, invocation, next, _}:
      probe(S.fresh_observation(session, path, True{}, Clock.expired(bits)), clock, separator, invocation, next)

def membership_reply(+observation: T.PathMembership, state: State) -> Step:
  match state:
    case State{+session, path, _, _, _, next, _}:
      Returned{S.observed(session, path, observation), Some{observation}, next}

def apply_outcome(stage: Stage, state: State, outcome: T.ServiceOutcome) -> Step:
  match stage outcome:
    case CheckingPath{} T.AbsoluteResult{absolute}: path_reply(absolute, state)
    case CheckingClock{} T.ClockRead{bits}: clock_reply(bits, state)
    case ReadingMembership{} T.MembershipResult{observation}: membership_reply(observation, state)
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

def known(cached: Maybe<&2, T.PathMembership>, +state: State) -> Step:
  match cached:
    case Some{observation}: Returned{state_session(state), Some{observation}, state_next_request(state)}
    case None{}: request(state, CheckingPath{}, T.PathIsAbsolute{state_path(state)})

def begin(+session: S.Session, +path: String, refresh: Bool, clock: T.ClockToken, separator: String,
    invocation: Nat, next_request: Nat) -> Step:
  match refresh:
    case True{}: known(None{}, State{session, path, clock, separator, invocation, next_request, CheckingPath{}})
    case False{}: known(S.find_membership(S.membership(session), path),
      State{session, path, clock, separator, invocation, next_request, CheckingPath{}})

def main() -> Unit:
  Unit{}
