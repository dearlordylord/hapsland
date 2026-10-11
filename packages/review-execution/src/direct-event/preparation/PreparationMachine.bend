import Base
import ../../../../source-analysis/src/direct-event/graph-resolution/Types.bend as T
import ../../../../source-analysis/src/direct-event/graph-resolution/Protocol.bend as Protocol
import ../../../../source-analysis/src/direct-event/graph-resolution/Clock.bend as Clock
import ../../../../source-analysis/src/direct-event/graph-resolution/python-module/Session.bend as S

# Actual prepareGraph admission and root-cache insertion; no Python policy in host.
type Input is Data:
  Input{root: String, capture: T.CaptureToken, root_bytes: Nat, files: Nat,
    read_bytes: Nat, work: Nat, source_cap: Nat, depth: Nat, clock: T.ClockToken,
    invocation: Nat, caller_cache: Maybe<&2, T.CacheToken>}
type Stage is Data:
  CheckingAdmission{}
  CreatingCache{}
  InsertingRoot{}
type State is Data:
  State{input: Input, cache: Maybe<&2, T.CacheToken>, next: Nat, stage: Stage}
type Prepared is Data:
  Prepared{session: S.Session, cache: T.CacheToken}
type Step is Data:
  Await{state: State, request: T.Request}
  Returned{prepared: Maybe<&2, Prepared>, next: Nat}
  Failed{failure: T.TechnicalFailure}

def invocation(input: Input) -> Nat:
  match input:
    case Input{_, _, _, _, _, _, _, _, _, invocation, _}: invocation

def request(+input: Input, cache: Maybe<&2, T.CacheToken>, +next: Nat, stage: Stage, operation: T.Operation) -> Step:
  Await{State{input, cache, Nat.add(next, 1n), stage}, T.Request{invocation(input), next, operation}}

def insert(+input: Input, +cache: T.CacheToken, next: Nat) -> Step:
  match input:
    case Input{+root, +capture, root_bytes, files, read_bytes, work, source_cap, depth, clock, invocation, caller_cache}:
      request(Input{root, capture, root_bytes, files, read_bytes, work, source_cap, depth, clock, invocation, caller_cache},
        Some{cache}, next, InsertingRoot{}, T.InsertRootCaptureCache{cache, root, capture})

def cache(cache: Maybe<&2, T.CacheToken>, input: Input, next: Nat) -> Step:
  match cache:
    case None{}: request(input, None{}, next, CreatingCache{}, T.CreateInvocationCache{})
    case Some{cache}: insert(input, cache, next)

def admission(allowed: Bool, input: Input, caller_cache: Maybe<&2, T.CacheToken>, next: Nat) -> Step:
  match allowed:
    case False{}: Returned{None{}, next}
    case True{}: cache(caller_cache, input, next)

def clock_read(input: Input, bits: T.Binary64, next: Nat) -> Step:
  match input:
    case Input{root, capture, root_bytes, +files, read_bytes, +work, source_cap, depth, clock, invocation, +caller_cache}:
      admission(Bool.and(Bool.not(Clock.expired(bits)), Bool.and(Nat.is_gt(files, 0n), Nat.is_gt(work, 0n))),
        Input{root, capture, root_bytes, files, read_bytes, work, source_cap, depth, clock, invocation, caller_cache}, caller_cache, next)

def prepared(input: Input, cache: Maybe<&2, T.CacheToken>, next: Nat) -> Step:
  match input cache:
    case Input{root, _, root_bytes, files, read_bytes, work, source_cap, depth, _, _, _} Some{cache}:
      Returned{Some{Prepared{S.initial(root, source_cap, depth,
        S.Remaining{S.difference(files, 1n), S.difference(read_bytes, root_bytes), S.Nonnegative{work}}), cache}}, next}
    case _ None{}: Failed{T.MalformedReply{}}

def outcome(state: State, result: T.ServiceOutcome) -> Step:
  match state result:
    case State{input, _, next, CheckingAdmission{}} T.ClockRead{bits}: clock_read(input, bits, next)
    case State{input, _, next, CreatingCache{}} T.InvocationCacheCreated{cache}: insert(input, cache, next)
    case State{input, cache, next, InsertingRoot{}} T.RootCacheInserted{}: prepared(input, cache, next)
    case _ T.ProviderRejected{exception}: Failed{T.ForeignProviderFailure{exception}}
    case _ _: Failed{T.MalformedReply{}}

def checked(state: State, reply: Protocol.CheckedReply) -> Step:
  match reply:
    case Protocol.RejectedReply{failure}: Failed{failure}
    case Protocol.CheckedOutcome{result}: outcome(state, result)

def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Await{state, request}: checked(state, Protocol.check(request, reply))
    case _: Failed{T.MalformedReply{}}

def begin(+input: Input, next: Nat) -> Step:
  match input:
    case Input{root, capture, root_bytes, files, read_bytes, work, source_cap, depth, +clock, invocation, caller_cache}:
      request(Input{root, capture, root_bytes, files, read_bytes, work, source_cap, depth, clock, invocation, caller_cache},
        None{}, next, CheckingAdmission{}, T.ReadClock{clock})

def main() -> Unit:
  Unit{}
