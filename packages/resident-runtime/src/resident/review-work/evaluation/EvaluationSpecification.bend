import Base
import ./Evaluation.bend as E

# Proposed pure evaluation contract, using the production API's existing types.
# No native credentials, results, Causes or capabilities are represented here.
# E.advance is the common phase engine only in the reply-correlation statement;
# that statement does not claim correspondence for the entire phase table.
# Maintain with this API. On replacement, move current behavioral guarantees
# to its successor and delete obsolete equations, specification and proofs.

def signal(phase: E.Phase) -> E.SignalScope:
  match phase:
    case E.BeforeEvaluate{}: E.WorkSignal{}
    case E.Authorizing{E.ForProvider{}, _}: E.WorkSignal{}
    case E.Provider{}: E.WorkSignal{}
    case _: E.NativeSignal{}

def issue(
  context: E.Context,
  +phase: E.Phase,
  command: E.Command,
  +invocation: Nat,
  +id: Nat
) -> E.Step:
  E.Await{invocation, id, context, phase, E.Request{invocation, id, signal(phase), command}}

def correlate(
  valid: Bool,
  context: E.Context,
  phase: E.Phase,
  response: E.Response,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match valid:
    case False{}: E.Rejected{}
    case True{}: E.advance(context, phase, response, invocation, next)

def resume(step: E.Step, reply: E.Reply) -> E.Step:
  match step reply:
    case E.Await{+invocation, +id, context, phase, E.Request{owner, request, _, _}}
      E.Reply{actual, received, response}:
      correlate(
        Bool.and(
          Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received)),
          Bool.and(Nat.is_eq(invocation, owner), Nat.is_eq(id, request))
        ),
        context,
        phase,
        response,
        invocation,
        Nat.add(id, 1n)
      )
    case _ _: E.Rejected{}

def with_receipt(context: E.Context, receipt: E.Receipt) -> E.Context:
  match context:
    case E.Context{input, _, review, mode, tasks, finals}:
      E.Context{input, receipt, review, mode, tasks, finals}

def evaluated_review(
  context: E.Context,
  receipt: E.Receipt,
  review: Maybe<&2, E.Review>,
  current: Bool,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match review:
    case None{}: issue(
      with_receipt(context, receipt),
      E.Raising{},
      E.RaiseInvariant{E.MissingReview{}},
      invocation,
      next
    )
    case Some{E.Review{0n, _}}: issue(
      with_receipt(context, receipt), E.EvaluatedSettlement{E.Clear{}},
      E.SettleRequest{E.Clear{}, current}, invocation, next
    )
    case Some{E.Review{1n++_, _}}: issue(
      with_receipt(context, receipt), E.EvaluatedSettlement{E.Finding{}},
      E.SettleRequest{E.Finding{}, current}, invocation, next
    )

def evaluated_status(
  +context: E.Context,
  +receipt: E.Receipt,
  current: Bool,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match context receipt:
    case E.Context{_, _, review, _, _, _} E.Started{_}:
      evaluated_review(context, receipt, review, current, invocation, next)
    case E.Context{_, _, review, _, _, _} E.Interrupted{_}:
      evaluated_review(context, receipt, review, current, invocation, next)
    case _ _: issue(
      context,
      E.Raising{},
      E.RaiseInvariant{E.ResultWithoutStart{}},
      invocation,
      next
    )

def retained_observation(
  context: E.Context,
  +tail: Nat,
  response: E.Response,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match context response:
    case _ E.Ack{}: issue(context, E.AdviceDriven{}, E.DriveAdviceTail{tail}, invocation, next)
    case E.Context{input, receipt, review, _, tasks, finals} E.Failed{token}: issue(
      E.Context{input, receipt, review, E.Recovering{}, token <> tasks, finals},
      E.AdvicePreserved{tail}, E.PreserveAdviceTail{tail}, invocation, next
    )
    case _ _: E.Rejected{}

def recovery_settle(
  +context: E.Context,
  +receipt: E.Receipt,
  aborted: Bool,
  invocation: Nat,
  next: Nat
) -> E.Step:
  match receipt aborted:
    case E.Issued{_} _: issue(
      with_receipt(context, receipt), E.RecoverySettling{E.NeverSent{}},
      E.SettleRequest{E.NeverSent{}, False{}}, invocation, next
    )
    case E.Started{_} _: issue(
      with_receipt(context, receipt), E.RecoverySettling{E.BackendFailure{}},
      E.SettleRequest{E.BackendFailure{}, False{}}, invocation, next
    )
    case E.Interrupted{_} True{}: issue(
      with_receipt(context, receipt), E.RecoverySettling{E.RequestInterrupted{}},
      E.SettleRequest{E.RequestInterrupted{}, False{}}, invocation, next
    )
    case E.Interrupted{_} False{}: issue(
      with_receipt(context, receipt), E.RecoverySettling{E.BackendFailure{}},
      E.SettleRequest{E.BackendFailure{}, False{}}, invocation, next
    )
    case _ _: issue(
      context,
      E.RecoveryJoined{},
      E.SettleJoined{E.BackendReason{}, False{}},
      invocation,
      next
    )

def complete(context: E.Context) -> E.Step:
  match context:
    case E.Context{_, _, _, _, tasks, finals}:
      E.FinishedEvaluation{
        E.Completion{List.reverse(&2, Nat, tasks), List.reverse(&2, Nat, finals)}
      }

def fault(context: E.Context, token: Nat, invocation: Nat, next: Nat) -> E.Step:
  match context:
    case E.Context{input, receipt, review, E.Normal{}, tasks, finals}: issue(
      E.Context{input, receipt, review, E.Recovering{}, token <> tasks, finals},
      E.RecoveryStatus{}, E.ReadRequestState{}, invocation, next
    )
    case E.Context{input, receipt, review, E.Recovering{}, tasks, finals}: issue(
      E.Context{input, receipt, review, E.Finalizing{}, token <> tasks, finals},
      E.FinallyCompleted{}, E.ReadCompleted{}, invocation, next
    )
    case E.Context{input, receipt, review, E.Finalizing{}, tasks, finals}:
      complete(E.Context{input, receipt, review, E.Finalizing{}, tasks, token <> finals})

def main() -> Unit:
  Unit{}
