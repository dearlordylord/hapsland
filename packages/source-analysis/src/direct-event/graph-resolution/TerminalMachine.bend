import Base
import ./Types.bend as T
import ./State.bend as S
import ./Loop.bend as Loop
import ./ComposedBudget.bend as Budget
import ./Clock.bend as Clock
import ./Protocol.bend as Protocol
import ./python-module/Session.bend as Python
import ./python-module/RevalidationMachine.bend as Revalidation

type Context is Data:
  Context{session: Maybe<&2, Python.Session>, cache: Maybe<&2, T.CacheToken>, census: Budget.Census}
type Step is Data:
  Generic{context: Context, continuation: Loop.Continuation}
  Revalidating{context: Context, state: T.ResolverState, result: T.ResolverStep, child: Revalidation.Step}
  FinalClock{context: Context, state: T.ResolverState, result: T.ResolverStep, request: T.Request}
def malformed() -> Loop.Continuation:
  Loop.ServiceStep{T.FailedResolver{T.MalformedReply{}}}
def unavailable() -> Loop.Continuation:
  Loop.ServiceStep{T.FinishedResolver{T.NoReviewUnit{}, None{}}}
def context_census(context: Context) -> Budget.Census:
  match context:
    case Context{_, _, census}: census
def context_cache(context: Context) -> Maybe<&2, T.CacheToken>:
  match context:
    case Context{_, cache, _}: cache
def final_clock(clock: Maybe<&2, T.ClockToken>, context: Context, +state: T.ResolverState, result: T.ResolverStep) -> Step:
  match clock:
    case None{}: Generic{context, malformed()}
    case Some{clock}:
      +next = S.state_next_request(state)
      FinalClock{context, S.with_state_next_request(state, Nat.add(next, 1n)), result,
        T.Request{S.input_invocation(S.state_input(state)), next, T.ReadClock{clock}}}

def revalidated(valid: Bool, context: Context, +state: T.ResolverState, result: T.ResolverStep) -> Step:
  match valid:
    case False{}: Generic{context, unavailable()}
    case True{}: final_clock(S.state_clock(state), context, state, result)

def revalidation_result(+context: Context, +state: T.ResolverState, result: T.ResolverStep, child: Revalidation.Step) -> Step:
  match child:
    case Revalidation.Await{+child_state, request}:
      Revalidating{Context{Some{Revalidation.state_session(child_state)}, context_cache(context), context_census(context)},
        S.with_state_next_request(state, Revalidation.state_next_request(child_state)), result, Revalidation.Await{child_state, request}}
    case Revalidation.Returned{session, valid, next}:
      revalidated(valid, Context{Some{session}, context_cache(context), context_census(context)}, S.with_state_next_request(state, next), result)
    case Revalidation.Failed{failure}: Generic{context, Loop.ServiceStep{T.FailedResolver{failure}}}

def terminal_resources(frame: Maybe<&2, T.ResolverFrame>, clock: Maybe<&2, T.ClockToken>, +context: Context,
    session: Python.Session, +state: T.ResolverState, result: T.ResolverStep) -> Step:
  match frame clock:
    case Some{frame} Some{clock}: revalidation_result(context, state, result,
      Revalidation.begin(Python.with_remaining(session, Budget.remaining(context_census(context), frame)), clock,
        S.state_separator(state), S.input_invocation(S.state_input(state)), S.state_next_request(state)))
    case _ _: Generic{context, malformed()}

def terminal_context(+context: Context, +state: T.ResolverState, result: T.ResolverStep) -> Step:
  match context:
    case Context{Some{+session}, cache, census}: terminal_resources(S.state_frame(state), S.state_clock(state),
      Context{Some{session}, cache, census}, session, state, result)
    case _: Generic{context, malformed()}

def final_allowed(allowed: Bool, context: Context, result: T.ResolverStep) -> Step:
  match allowed:
    case False{}: Generic{context, unavailable()}
    case True{}: Generic{context, Loop.ServiceStep{result}}

def final_authority(context: Context, frame: Maybe<&2, T.ResolverFrame>, expired: Bool, result: T.ResolverStep) -> Step:
  match context frame:
    case Context{Some{+session}, cache, +census} Some{frame}:
      final_allowed(Bool.and(Bool.not(expired), Budget.available(census, session, frame)), Context{Some{session}, cache, census}, result)
    case _ _: Generic{context, malformed()}

def final_outcome(context: Context, state: T.ResolverState, result: T.ResolverStep, outcome: T.ServiceOutcome) -> Step:
  match outcome:
    case T.ClockRead{bits}: final_authority(context, S.state_frame(state), Clock.expired(bits), result)
    case T.ProviderRejected{exception}: Generic{context, Loop.ServiceStep{T.FailedResolver{T.ForeignProviderFailure{exception}}}}
    case _: Generic{context, malformed()}

def final_reply(context: Context, state: T.ResolverState, result: T.ResolverStep, checked: Protocol.CheckedReply) -> Step:
  match checked:
    case Protocol.RejectedReply{failure}: Generic{context, Loop.ServiceStep{T.FailedResolver{failure}}}
    case Protocol.CheckedOutcome{outcome}: final_outcome(context, state, result, outcome)


def resume(step: Step, reply: T.Reply) -> Step:
  match step:
    case Revalidating{context, state, result, child}: revalidation_result(context, state, result, Revalidation.resume(child, reply))
    case FinalClock{context, state, result, request}: final_reply(context, state, result, Protocol.check(request, reply))
    case Generic{context, _}: Generic{context, Loop.ServiceStep{T.FailedResolver{T.ReplyAfterTerminal{}}}}

def service(step: Step) -> T.ResolverStep:
  match step:
    case Generic{_, Loop.ServiceStep{result}}: result
    case Revalidating{_, state, _, Revalidation.Await{_, request}}: T.AwaitService{state, request}
    case FinalClock{_, state, _, request}: T.AwaitService{state, request}
    case _: T.FailedResolver{T.MalformedReply{}}

def get_context(step: Step) -> Context:
  match step:
    case Generic{context, _}: context
    case Revalidating{context, _, _, _}: context
    case FinalClock{context, _, _, _}: context

def main() -> Unit:
  Unit{}
