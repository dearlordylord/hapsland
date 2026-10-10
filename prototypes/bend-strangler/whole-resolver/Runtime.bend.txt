import Base
import ./Types.bend as T
import ./Loop.bend as Loop
import ./ComposedMachine.bend as Machine

# Runtime shell only; never imported from laws or proofs.
def perform(request: T.Request) -> IO(T.Reply):
  import "./services.js"

def call_service(request: T.Request) -> IO(T.Reply):
  perform(request)

# Runtime-only effect loop. The pure machine owns all iteration budgets and
# terminal decisions. No new service-count cutoff changes its result.
# This module, including unsafe IO recursion, is outside the proof closure.
@unsafe def run_service(+step: Machine.Step, service: T.ResolverStep) -> IO(Machine.Step):
  match service:
    case T.AwaitService{_, request}:
      do IO<Machine.Step>:
        reply : T.Reply <- perform(request)
        run(Machine.resume(step, T.ServiceReply{reply}))
    case _: IO.pure(Machine.Step, step)

@unsafe def run(+step: Machine.Step) -> IO(Machine.Step):
  run_service(step, Machine.view(step))

# Preserve the existing debug ABI: child state stays inside the Bend runtime.
def resolve_debug(input: T.ResolverInput) -> IO(Loop.Continuation):
  do IO<Loop.Continuation>:
    step : Machine.Step <- run(Machine.initial(input))
    return Loop.ServiceStep{Machine.view(step)}

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
