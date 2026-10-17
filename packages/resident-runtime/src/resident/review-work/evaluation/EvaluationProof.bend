import Base
import ./Evaluation.bend as E
import ./EvaluationSpecification.bend as S
import ./Authorization.bend as A
import ./AuthorizationProof.bend as AP
import ./AuthorizationSpecification.bend as AS

# Supporting proofs of owner-approved evaluation_protocol_exact. Existing Context
# only: full arbitrary fault lists, receipts and native opaque IDs are retained.
# These equalities close public-resume branches, not new product laws. Maintain
# with the cursor API; transfer guarantees and delete on replacement.

def signal_exact(+phase: E.Phase) -> {E.signal_scope(phase) == S.signal(phase) : E.SignalScope}:
  match phase:
    case E.PolicyStart{}: {==}
    case E.ReviewStart{}: {==}
    case E.BackendGate{}: {==}
    case E.AdmissionActive{}: {==}
    case E.AdmissionCurrent{}: {==}
    case E.BeforeEvaluate{}: {==}
    case E.Controlled{}: {==}
    case E.Authorizing{E.ForProvider{}, _}: {==}
    case E.Authorizing{E.RefuseStale{}, _}: {==}
    case E.Provider{}: {==}
    case E.DeniedAnalytics{_}: {==}
    case E.DeniedJoined{_}: {==}
    case E.DeniedNotice{}: {==}
    case E.DeniedActivity{}: {==}
    case E.RoundActive{}: {==}
    case E.RoundRuntime{}: {==}
    case E.RoundReported{}: {==}
    case E.CurrentRuntime{}: {==}
    case E.CurrentActive{}: {==}
    case E.CurrentSource{}: {==}
    case E.EvaluatedStatus{_}: {==}
    case E.EvaluatedSettlement{_}: {==}
    case E.EvaluatedObservation{_}: {==}
    case E.DiscardObserved{}: {==}
    case E.DemoRecorded{_}: {==}
    case E.CacheStored{_}: {==}
    case E.CacheClaimReleased{_}: {==}
    case E.EvaluatedActivity{_}: {==}
    case E.NonRetainedFate{_}: {==}
    case E.NonRetainedRetired{_}: {==}
    case E.NonRetainedJoined{}: {==}
    case E.NonRetainedCompleted{}: {==}
    case E.ReleaseReuse{_}: {==}
    case E.ReleaseNativeUnit{_}: {==}
    case E.OutcomeRecorded{}: {==}
    case E.RetentionActive{}: {==}
    case E.RetentionInactiveRetired{}: {==}
    case E.RetentionCandidates{}: {==}
    case E.ExistingPublished{}: {==}
    case E.ExistingRecorded{}: {==}
    case E.ExistingRetired{}: {==}
    case E.ExistingReleased{}: {==}
    case E.AdviceInsertedPhase{}: {==}
    case E.AdviceObserved{_}: {==}
    case E.AdvicePreserved{_}: {==}
    case E.AdviceDriven{}: {==}
    case E.FailureStatus{_}: {==}
    case E.FailureAborted{_}: {==}
    case E.FailureInterrupted{_}: {==}
    case E.FailureInterruptObserved{_}: {==}
    case E.FailureStatusAfterInterrupt{_}: {==}
    case E.FailureSettling{_, _}: {==}
    case E.FailureCompleting{_}: {==}
    case E.FailureObserved{_}: {==}
    case E.FailureJoined{_}: {==}
    case E.FailureNotice{}: {==}
    case E.FailureActivity{}: {==}
    case E.RecoveryStatus{}: {==}
    case E.RecoveryAborted{}: {==}
    case E.RecoveryEscaped{}: {==}
    case E.RecoveryAfterEscapedAborted{}: {==}
    case E.RecoveryReviewing{}: {==}
    case E.RecoveryDeny{_}: {==}
    case E.RecoveryInterrupt{}: {==}
    case E.RecoveryInterrupted{}: {==}
    case E.RecoveryInterruptStatus{}: {==}
    case E.RecoverySettling{_}: {==}
    case E.RecoveryObserved{}: {==}
    case E.RecoveryJoined{}: {==}
    case E.RecoveryDebug{}: {==}
    case E.RecoveryRuntime{}: {==}
    case E.RecoveryActivity{}: {==}
    case E.FinallyCompleted{}: {==}
    case E.FinallyReuse{}: {==}
    case E.FinallyUnit{}: {==}
    case E.Raising{}: {==}

def issue_exact(+context: E.Context, +phase: E.Phase, +command: E.Command, +inv: Nat, +id: Nat) -> {
  E.issue(context, phase, command, inv, id) == S.request(context, phase, command, inv, id) : E.Step
}:
  %signal_exact(phase) : {
    E.issue(context, phase, command, inv, id)
    == E.Await{inv, id, context, phase, E.Request{inv, id, _, command}} : E.Step
  }
  {==}

def initial_exact(
  +input: E.Input,
  +inv: Nat
) -> {E.initial(input, inv) == S.initial(input, inv) : E.Step}:
  match input:
    case E.Input{True{}}: {==}
    case E.Input{False{}}: {==}

def cleanup_initial_exact(+inv: Nat) -> {E.cleanup_initial(inv) == S.cleanup_initial(inv) : E.Step}:
  {==}

def complete_exact(+context: E.Context) -> {E.finished(context) == S.complete(context) : E.Step}:
  match context:
    case E.Context{_, _, _, _, _, _}: {==}

def receipt_exact(
  +context: E.Context,
  +receipt: E.Receipt
) -> {E.receipt_context(context, receipt) == S.with_receipt(context, receipt) : E.Context}:
  match context:
    case E.Context{_, _, _, _, _, _}: {==}

def review_exact(
  +context: E.Context,
  +review: E.Review
) -> {E.review_context(context, review) == S.with_review(context, review) : E.Context}:
  match context:
    case E.Context{_, _, _, _, _, _}: {==}

def finalize_exact(
  +context: E.Context,
  +inv: Nat,
  +next: Nat
) -> {E.finalize(context, inv, next) == S.end(context, inv, next) : E.Step}:
  match context:
    case E.Context{_, _, _, _, _, _}: {==}

def fault_exact(
  +context: E.Context,
  +token: Nat,
  +inv: Nat,
  +next: Nat
) -> {E.fault(context, token, inv, next) == S.error(context, token, inv, next) : E.Step}:
  match context:
    case E.Context{_, _, _, E.Normal{}, _, _}: {==}
    case E.Context{_, _, _, E.Recovering{}, _, _}: {==}
    case E.Context{_, _, _, E.Finalizing{}, _, _}: {==}

def settled_receipt_exact(
  +receipt: E.Receipt
) -> {E.settled_receipt(receipt) == S.settled_receipt(receipt) : E.Receipt}:
  match receipt:
    case E.Unissued{}: {==}
    case E.Issued{_}: {==}
    case E.Started{_}: {==}
    case E.Interrupted{_}: {==}
    case E.Settled{_}: {==}

def settled_exact(+context: E.Context) -> {E.did_settle(context) == S.settled(context) : E.Context}:
  match context:
    case E.Context{+input, +receipt, +review, +mode, +faults, +finals}:
      %settled_receipt_exact(receipt) : {
        E.did_settle(context) == E.Context{input, _, review, mode, faults, finals} : E.Context
      }
      {==}

def authorization_exact(
  +context: E.Context,
  +use: E.AuthorizationUse,
  +step: A.Step,
  +inv: Nat,
  +next: Nat
) -> {
  E.authorized_result(context, use, step, inv, next)
  == S.authorization(context, use, step, inv, next)
  : E.Step
}:
  match use step:
    case E.ForProvider{} A.Await{_, _, _, A.Request{_, _, _}}: {==}
    case E.ForProvider{} A.AuthorizedRequest{+request}:
      %receipt_exact(context, E.Issued{request}) : {
        E.authorized_result(context, E.ForProvider{}, A.AuthorizedRequest{request}, inv, next)
        == E.Await{
          inv,
          next,
          _,
          E.Provider{},
          E.Request{inv, next, E.WorkSignal{}, E.RunProvider{}}
        }
        : E.Step
      }
      {==}
    case E.ForProvider{} A.NotAuthorized{A.Credential{}}: {==}
    case E.ForProvider{} A.NotAuthorized{A.Lost{}}: {==}
    case E.ForProvider{} A.Rejected{}: {==}
    case E.ForProvider{} A.Aborted{token}: fault_exact(context, token, inv, next)
    case E.RefuseStale{} A.Await{_, _, _, A.Request{_, _, _}}: {==}
    case E.RefuseStale{} A.AuthorizedRequest{_}: {==}
    case E.RefuseStale{} A.NotAuthorized{A.Credential{}}: {==}
    case E.RefuseStale{} A.NotAuthorized{A.Lost{}}: {==}
    case E.RefuseStale{} A.Rejected{}: {==}
    case E.RefuseStale{} A.Aborted{token}: fault_exact(context, token, inv, next)

def authorization_reply_exact(
  +context: E.Context,
  +use: E.AuthorizationUse,
  +step: A.Step,
  +response: A.Response,
  +inv: Nat,
  +next: Nat
) -> {
  E.authorization_reply(context, use, step, response, inv, next)
  == S.authorization_reply(context, use, step, response, inv, next)
  : E.Step
}:
  match step:
    case A.Await{_, +id, _, _}:
      %AP.resume_exact(step, A.Reply{inv, id, response}) : {
        E.authorized_result(context, use, A.resume(step, A.Reply{inv, id, response}), inv, next)
        == S.authorization(context, use, _, inv, next) : E.Step
      }
      authorization_exact(context, use, A.resume(step, A.Reply{inv, id, response}), inv, next)
    case A.AuthorizedRequest{_}: {==}
    case A.NotAuthorized{_}: {==}
    case A.Aborted{_}: {==}
    case A.Rejected{}: {==}

def retention_exact(+values: List<&2, E.Candidate>, +context: E.Context, +inv: Nat, +next: Nat) -> {
  E.retained_existing(context, E.first_matching(values), inv, next)
  == S.retention(values, context, inv, next)
  : E.Step
}:
  match values:
    case Nil{}: {==}
    case Con{E.Candidate{_, True{}}, _}: {==}
    case Con{E.Candidate{_, False{}}, rest}: retention_exact(rest, context, inv, next)

def failure_exact(
  +context: E.Context,
  +receipt: E.Receipt,
  +result: E.ProviderResult,
  +aborted: Bool,
  +inv: Nat,
  +next: Nat
) -> {
  E.failure_after_status(context, receipt, result, aborted, inv, next)
  == S.failure(context, receipt, result, aborted, inv, next)
  : E.Step
}:
  match context receipt result aborted:
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Evaluated{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Evaluated{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Backend{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Backend{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Timeout{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Timeout{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.InputRefused{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.InputRefused{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Missing{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} E.Missing{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Evaluated{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Evaluated{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Backend{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Backend{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Timeout{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Timeout{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.InputRefused{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.InputRefused{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Missing{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} E.Missing{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Evaluated{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Evaluated{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Backend{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Backend{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Timeout{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Timeout{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.InputRefused{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.InputRefused{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Missing{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} E.Missing{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Evaluated{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Evaluated{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Backend{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Backend{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Timeout{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Timeout{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.InputRefused{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.InputRefused{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Missing{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} E.Missing{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Evaluated{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Evaluated{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Backend{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Backend{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Timeout{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Timeout{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.InputRefused{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.InputRefused{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Missing{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} E.Missing{} False{}: {==}

def recovery_settlement_exact(
  +context: E.Context,
  +receipt: E.Receipt,
  +aborted: Bool,
  +inv: Nat,
  +next: Nat
) -> {
  E.recovery_settle(context, receipt, aborted, inv, next)
  == S.recovery_settlement(context, receipt, aborted, inv, next)
  : E.Step
}:
  match context receipt aborted:
    case E.Context{_, _, _, _, _, _} E.Unissued{} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Unissued{} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Issued{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Started{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Interrupted{_} False{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} True{}: {==}
    case E.Context{_, _, _, _, _, _} E.Settled{_} False{}: {==}

def evaluated_settlement_exact(
  +context: E.Context,
  +receipt: E.Receipt,
  +current: Bool,
  +inv: Nat,
  +next: Nat
) -> {
  E.evaluated_status(context, receipt, current, inv, next)
  == S.evaluated_settlement(context, receipt, current, inv, next)
  : E.Step
}:
  match context receipt:
    case E.Context{_, _, None{}, _, _, _} E.Unissued{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Unissued{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Unissued{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Issued{_}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Issued{_}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Issued{_}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Started{_}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Started{_}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Started{_}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Interrupted{_}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Interrupted{_}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Interrupted{_}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Settled{_}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Settled{_}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Settled{_}: {==}

def recovery_authorization_exact(+context: E.Context, +step: A.Step, +inv: Nat, +next: Nat) -> {
  E.recovery_deny_step(context, step, inv, next)
  == S.recovery_authorization(context, step, inv, next)
  : E.Step
}:
  match step:
    case A.Await{_, _, _, A.Request{_, _, _}}: {==}
    case A.NotAuthorized{_}: {==}
    case A.Aborted{token}: fault_exact(context, token, inv, next)
    case A.AuthorizedRequest{_}: {==}
    case A.Rejected{}: {==}

def recovery_authorization_reply_exact(
  +context: E.Context,
  +step: A.Step,
  +response: A.Response,
  +inv: Nat,
  +next: Nat
) -> {
  E.recovery_deny_reply(context, step, response, inv, next)
  == S.recovery_authorization_reply(context, step, response, inv, next)
  : E.Step
}:
  match step:
    case A.Await{_, +id, _, _}:
      %AP.resume_exact(step, A.Reply{inv, id, response}) : {
        E.recovery_deny_step(context, A.resume(step, A.Reply{inv, id, response}), inv, next)
        == S.recovery_authorization(context, _, inv, next) : E.Step
      }
      recovery_authorization_exact(context, A.resume(step, A.Reply{inv, id, response}), inv, next)
    case A.AuthorizedRequest{_}: {==}
    case A.NotAuthorized{_}: {==}
    case A.Aborted{_}: {==}
    case A.Rejected{}: {==}

def main() -> Unit:
  Unit{}
