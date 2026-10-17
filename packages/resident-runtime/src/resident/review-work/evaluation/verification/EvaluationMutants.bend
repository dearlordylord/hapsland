import Base
import ../Evaluation.bend as E

def discard_existing(values: List<&2, E.Candidate>) -> Maybe<&2, Nat>:
  None{}

def suppress_work_signal(phase: E.Phase) -> E.SignalScope:
  E.NativeSignal{}

def never_sent(receipt: E.Receipt, aborted: Bool, result: E.ProviderResult) -> E.Outcome:
  E.NeverSent{}

# Replacements are injected only at the named public-step branch. Other
# transitions retain the real implementation, so the witness names the gap.
def skip_provider_result(
  context: E.Context,
  phase: E.Phase,
  response: E.Response,
  invocation: Nat,
  next: Nat
) -> E.Step:
  E.finalize(context, invocation, next)

def skip_cache_store(
  context: E.Context,
  phase: E.Phase,
  response: E.Response,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match phase:
    case E.DemoRecorded{disposition}:
      E.issue(context, E.CacheClaimReleased{disposition}, E.ReleaseReuseClaim{}, invocation, next)
    case _: E.Rejected{}
