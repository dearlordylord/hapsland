import Base
import ./Evaluation.bend as E
import ./EvaluationSpecification.bend as S

# PROPOSAL: seven additional statements; owner approval is pending.
# These are not the six approved DELIVERY_OWNER_LAWS and are not proved yet.
# Scope: the pure API of the connected whole evaluation cursor. Arbitrary
# existing Context/Phase/Receipt values and unbounded Nat payloads are included.
# The full phase table still has independent finite trace/mutation checks;
# reply_correlation alone does not prove that table's full correspondence.
# Native IO, exact object custody, physical drain, original Effect Causes and
# atomic Canonical metadata publication remain real-consumer obligations.
# On API replacement, move current guarantees to its successor and delete the
# superseded equations/specification/proofs. No TypeScript oracle is retained.

# Only the exact outer invocation/id, embedded request owner/id and reply can
# advance. Terminal/rejected inputs and all mismatches reject; a match advances
# once at id+1. This does not grant a native lease or change Canonical authority.
law reply_correlation:
  for +step: E.Step
  for +reply: E.Reply
  { E.resume(step, reply) == S.resume(step, reply) : E.Step }

# Only beforeEvaluate, provider authorization and provider execution use the
# work signal. Accounting, retained advice, recovery and finalization use the
# native signal so revoked work cannot abandon its committed obligations.
law command_signal_scope:
  for +context: E.Context
  for +phase: E.Phase
  for +command: E.Command
  for +invocation: Nat
  for +id: Nat
  {
    E.issue(context, phase, command, invocation, id)
    == S.issue(context, phase, command, invocation, id)
    : E.Step
  }

# Evaluated settlement requires Started/Interrupted and an actual Review.
# Count zero selects Clear; every positive count selects Finding. The supplied
# current flag and all other context fields survive unchanged; absent authority
# or Review emits the corresponding invariant instead of settlement.
law evaluated_settlement_authority:
  for +context: E.Context
  for +receipt: E.Receipt
  for +current: Bool
  for +invocation: Nat
  for +next: Nat
  { E.evaluated_status(context, receipt, current, invocation, next)
    == S.evaluated_status(context, receipt, current, invocation, next) : E.Step }

# Successful retained observation drives the same tail normally. An observer
# failure preserves that committed tail, retains its fault and enters recovery;
# it must not suppress normal publication or lose the accepted capability.
law retained_advice_observation:
  for +context: E.Context
  for +tail: Nat
  for +response: E.Response
  for +invocation: Nat
  for +next: Nat
  { E.advance(context, E.AdviceObserved{tail}, response, invocation, next)
    == S.retained_observation(context, tail, response, invocation, next) : E.Step }

# Recovery never settles unissued/already-settled requests again. Issued means
# NeverSent; Started means BackendFailure; only Interrupted plus observed abort
# means RequestInterrupted. Every recovery settlement has current=False.
law recovery_accounting:
  for +context: E.Context
  for +receipt: E.Receipt
  for +aborted: Bool
  for +invocation: Nat
  for +next: Nat
  { E.recovery_settle(context, receipt, aborted, invocation, next)
    == S.recovery_settle(context, receipt, aborted, invocation, next) : E.Step }

# A normal failure retains its token and starts recovery; another recovery
# failure retains both and starts finalization. A finalizer failure is separate
# from task failures and completes with both chronological sequences intact.
law fault_progression:
  for +context: E.Context
  for +token: Nat
  for +invocation: Nat
  for +next: Nat
  {
    E.fault(context, token, invocation, next)
    == S.fault(context, token, invocation, next)
    : E.Step
  }

# Completion returns every retained task/finalizer token exactly once, in their
# original order, in separate lists. Native projection keeps the actual Causes.
law completion_fault_chronology:
  for +context: E.Context
  { E.finished(context) == S.complete(context) : E.Step }

def main() -> Unit:
  Unit{}
