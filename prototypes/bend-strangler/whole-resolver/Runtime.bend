import Base
import ./Types.bend as T
import ./Loop.bend as Loop
import ./Machine.bend as Machine

# Runtime shell only; never imported from laws or proofs.
def perform(request: T.Request) -> IO(T.Reply):
  import "./services.js"

def call_service(request: T.Request) -> IO(T.Reply):
  perform(request)

# Runtime-only effect loop. The pure machine owns all iteration budgets and
# terminal decisions. No new service-count cutoff changes its result.
# This module, including unsafe IO recursion, is outside the proof closure.
@unsafe def run(+step: Loop.Continuation) -> IO(Loop.Continuation):
  match step:
    case Loop.ServiceStep{T.AwaitService{_, request}}:
      do IO<Loop.Continuation>:
        reply : T.Reply <- perform(request)
        run(Machine.resume(step, T.ServiceReply{reply}))
    case Loop.ServiceStep{_}: IO.pure(Loop.Continuation, step)
    case _: IO.pure(Loop.Continuation, Machine.malformed())

def resolve_debug(input: T.ResolverInput) -> IO(Loop.Continuation):
  run(Machine.initial(input))

def terminal(step: Loop.Continuation) -> T.RuntimeOutcome:
  match step:
    case Loop.ServiceStep{T.FinishedResolver{result, _}}: T.RuntimeFinished{result}
    case Loop.ServiceStep{T.FailedResolver{failure}}: T.RuntimeFailed{failure}
    case _: T.RuntimeFailed{T.MalformedReply{}}

def resolve(input: T.ResolverInput) -> IO(T.RuntimeOutcome):
  do IO<T.RuntimeOutcome>:
    step : Loop.Continuation <- resolve_debug(input)
    return terminal(step)

def main() -> IO(Unit):
  do IO<Unit>:
    reply : T.Reply <- call_service(T.Request{0n, 0n, T.StartClock{}})
    return Unit{}
