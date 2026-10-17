import Base
import ./Evaluation.bend as E
import ./EvaluationSpecification.bend as S
import ./Authorization.bend as A
import ./AuthorizationProof.bend as AP
import ./AuthorizationSpecification.bend as AS
import ../../../../../agent-flow-bend/Work.bend as W

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

# Complete Ack transition family, including rejection in phases expecting facts.
# No reachable-state assumption: review count and all remaining Context fields
# are arbitrary; constructor cases are exhaustive and kernel checked.
def ack_transition_exact(+context: E.Context, +phase: E.Phase, +inv: Nat, +next: Nat) -> {
  E.advance(context, phase, E.Ack{}, inv, next)
  == S.transition(phase, E.Ack{}, context, inv, next)
  : E.Step
}:
  match context phase:
    case E.Context{_, _, None{}, _, _, _} E.PolicyStart{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.PolicyStart{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.PolicyStart{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ReviewStart{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ReviewStart{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ReviewStart{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.BackendGate{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.BackendGate{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.BackendGate{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdmissionActive{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdmissionActive{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdmissionActive{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdmissionCurrent{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdmissionCurrent{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdmissionCurrent{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.BeforeEvaluate{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.BeforeEvaluate{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.BeforeEvaluate{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Controlled{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Controlled{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Controlled{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Authorizing{E.ForProvider{}, p_step}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Authorizing{E.ForProvider{}, p_step}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Authorizing{E.ForProvider{}, p_step}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Authorizing{E.RefuseStale{}, p_step}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Authorizing{E.RefuseStale{}, p_step}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Authorizing{E.RefuseStale{}, p_step}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Provider{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Provider{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Provider{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedAnalytics{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedAnalytics{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedAnalytics{E.LostReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedAnalytics{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedAnalytics{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedAnalytics{E.CredentialReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedAnalytics{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedAnalytics{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedAnalytics{E.BackendReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedAnalytics{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedAnalytics{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedAnalytics{E.StaleReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedJoined{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedJoined{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedJoined{E.LostReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedNotice{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedNotice{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedNotice{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DeniedActivity{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DeniedActivity{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DeniedActivity{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RoundActive{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RoundActive{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RoundActive{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RoundRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RoundRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RoundRuntime{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RoundReported{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RoundReported{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RoundReported{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CurrentRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CurrentRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CurrentRuntime{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CurrentActive{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CurrentActive{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CurrentActive{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CurrentSource{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CurrentSource{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CurrentSource{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedStatus{p_current}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedStatus{p_current}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedStatus{p_current}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.Clear{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{E.Clear{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{E.Clear{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.Finding{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{E.Finding{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{E.Finding{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.NeverSent{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{E.NeverSent{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{E.NeverSent{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.RequestInterrupted{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{
      E.RequestInterrupted{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{
      E.RequestInterrupted{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.RequestTimeout{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{E.RequestTimeout{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{
      E.RequestTimeout{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedSettlement{E.BackendFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedSettlement{E.BackendFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedSettlement{
      E.BackendFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{
      E.FindingRetained{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{
      E.FindingRetained{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedObservation{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedObservation{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedObservation{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DiscardObserved{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DiscardObserved{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DiscardObserved{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.FindingRetained{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.DemoRecorded{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.DemoRecorded{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.DemoRecorded{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.FindingRetained{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheStored{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheStored{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheStored{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{
      E.FindingRetained{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.CacheClaimReleased{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.CacheClaimReleased{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.CacheClaimReleased{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{E.FindingRetained{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.EvaluatedActivity{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.EvaluatedActivity{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.EvaluatedActivity{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.FindingRetained{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedFate{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedFate{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedFate{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{E.FindingRetained{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{
      E.FindingRetained{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{E.ClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{E.ClearSettled{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.StaleClearSettled{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{
      E.StaleClearSettled{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.StaleFindingRetired{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{
      E.StaleFindingRetired{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{E.Unavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{E.Unavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{E.Ignored{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{E.Ignored{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedRetired{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedRetired{E.Stale{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedRetired{E.Stale{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedJoined{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedJoined{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedJoined{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.NonRetainedCompleted{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.NonRetainedCompleted{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.NonRetainedCompleted{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ReleaseReuse{E.FinishRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ReleaseReuse{E.FinishRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ReleaseReuse{E.FinishRelease{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ReleaseReuse{E.RecordOutcomeRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ReleaseReuse{E.RecordOutcomeRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ReleaseReuse{E.RecordOutcomeRelease{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ReleaseNativeUnit{E.FinishRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ReleaseNativeUnit{E.FinishRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ReleaseNativeUnit{E.FinishRelease{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ReleaseNativeUnit{E.RecordOutcomeRelease{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ReleaseNativeUnit{
      E.RecordOutcomeRelease{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ReleaseNativeUnit{
      E.RecordOutcomeRelease{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.OutcomeRecorded{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.OutcomeRecorded{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.OutcomeRecorded{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RetentionActive{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RetentionActive{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RetentionActive{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RetentionInactiveRetired{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RetentionInactiveRetired{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RetentionInactiveRetired{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RetentionCandidates{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RetentionCandidates{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RetentionCandidates{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ExistingPublished{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ExistingPublished{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ExistingPublished{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ExistingRecorded{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ExistingRecorded{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ExistingRecorded{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ExistingRetired{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ExistingRetired{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ExistingRetired{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.ExistingReleased{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.ExistingReleased{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.ExistingReleased{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdviceInsertedPhase{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdviceInsertedPhase{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdviceInsertedPhase{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdviceObserved{p_tail}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdviceObserved{p_tail}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdviceObserved{p_tail}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdvicePreserved{p_tail}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdvicePreserved{p_tail}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdvicePreserved{p_tail}: {==}
    case E.Context{_, _, None{}, _, _, _} E.AdviceDriven{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.AdviceDriven{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.AdviceDriven{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureStatus{p_result}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureStatus{p_result}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureStatus{p_result}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureAborted{p_result}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureAborted{p_result}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureAborted{p_result}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureInterrupted{p_result}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureInterrupted{p_result}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureInterrupted{p_result}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureInterruptObserved{p_result}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureInterruptObserved{p_result}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureInterruptObserved{p_result}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureStatusAfterInterrupt{p_result}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureStatusAfterInterrupt{p_result}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureStatusAfterInterrupt{p_result}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Clear{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Clear{}, W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Clear{}, W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Clear{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Finding{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Finding{}, W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.Finding{}, W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.Finding{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.NeverSent{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.NeverSent{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestInterrupted{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.RequestTimeout{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{E.BackendFailure{}, W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.NoFailure{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureSettling{
      E.BackendFailure{},
      W.LostUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureCompleting{W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureCompleting{W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureCompleting{W.NoFailure{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureCompleting{W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureCompleting{
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureCompleting{
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureCompleting{W.CredentialUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureCompleting{
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureCompleting{
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureCompleting{W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureCompleting{W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureCompleting{W.LostUnavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureObserved{W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureObserved{W.NoFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureObserved{W.NoFailure{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureObserved{W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureObserved{W.BackendUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureObserved{
      W.BackendUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureObserved{W.CredentialUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureObserved{
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureObserved{
      W.CredentialUnavailable{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureObserved{W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureObserved{W.LostUnavailable{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureObserved{W.LostUnavailable{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureJoined{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureJoined{E.LostReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureJoined{E.LostReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureJoined{E.CredentialReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureJoined{E.BackendReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureJoined{E.StaleReason{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureNotice{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureNotice{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureNotice{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FailureActivity{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FailureActivity{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FailureActivity{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryStatus{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryStatus{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryStatus{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryAborted{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryAborted{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryAborted{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryEscaped{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryEscaped{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryEscaped{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryAfterEscapedAborted{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryAfterEscapedAborted{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryAfterEscapedAborted{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryReviewing{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryReviewing{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryReviewing{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryDeny{p_step}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryDeny{p_step}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryDeny{p_step}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryInterrupt{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryInterrupt{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryInterrupt{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryInterrupted{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryInterrupted{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryInterrupted{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryInterruptStatus{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryInterruptStatus{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryInterruptStatus{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.Clear{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.Clear{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{E.Clear{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.Finding{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.Finding{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{E.Finding{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.NeverSent{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.NeverSent{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{E.NeverSent{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.RequestInterrupted{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.RequestInterrupted{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{
      E.RequestInterrupted{}
    }: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.RequestTimeout{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.RequestTimeout{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{E.RequestTimeout{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoverySettling{E.BackendFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoverySettling{E.BackendFailure{}}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoverySettling{E.BackendFailure{}}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryObserved{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryObserved{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryObserved{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryJoined{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryJoined{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryJoined{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryDebug{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryDebug{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryDebug{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryRuntime{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryRuntime{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.RecoveryActivity{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.RecoveryActivity{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.RecoveryActivity{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FinallyCompleted{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FinallyCompleted{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FinallyCompleted{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FinallyReuse{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FinallyReuse{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FinallyReuse{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.FinallyUnit{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.FinallyUnit{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.FinallyUnit{}: {==}
    case E.Context{_, _, None{}, _, _, _} E.Raising{}: {==}
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _} E.Raising{}: {==}
    case E.Context{_, _, Some{E.Review{1n+_, _}}, _, _, _} E.Raising{}: {==}

# All Flag replies: admission/current work, interruption and finalization.
def flag_transition_exact(
  +phase: E.Phase,
  +value: Bool,
  +context: E.Context,
  +inv: Nat,
  +next: Nat
) -> {
  E.advance(context, phase, E.Flag{value}, inv, next)
  == S.transition(phase, E.Flag{value}, context, inv, next)
  : E.Step
}:
  match phase value context:
    case E.PolicyStart{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.ForProvider{}, p_step} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.ForProvider{}, p_step} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} True{} E.Context{E.Input{True{}}, _, None{}, _, _, _}: {==}
    case E.RoundRuntime{} False{} E.Context{E.Input{True{}}, _, None{}, _, _, _}: {==}
    case E.RoundRuntime{} True{} E.Context{E.Input{True{}}, _, Some{_}, _, _, _}: {==}
    case E.RoundRuntime{} False{} E.Context{E.Input{True{}}, _, Some{_}, _, _, _}: {==}
    case E.RoundRuntime{} True{} E.Context{E.Input{False{}}, _, None{}, _, _, _}: {==}
    case E.RoundRuntime{} False{} E.Context{E.Input{False{}}, _, None{}, _, _, _}: {==}
    case E.RoundRuntime{} True{} E.Context{E.Input{False{}}, _, Some{_}, _, _, _}: {==}
    case E.RoundRuntime{} False{} E.Context{E.Input{False{}}, _, Some{_}, _, _, _}: {==}
    case E.RoundReported{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Unavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Unavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Evaluated{_}} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Backend{}} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Timeout{}} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.InputRefused{}} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureAborted{E.Missing{}} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatusAfterInterrupt{p_result} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatusAfterInterrupt{p_result} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} True{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} False{} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.LostUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.LostUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.BackendUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.BackendUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.LostUnavailable{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.LostUnavailable{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} True{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} False{} E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} True{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} False{} E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} True{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} False{} E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} True{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} False{} E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} True{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} False{} E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.RecoveryReviewing{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestTimeout{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestTimeout{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.BackendFailure{}} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.BackendFailure{}} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} False{} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} True{} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} False{} E.Context{_, _, _, _, _, _}: {==}

# Every remaining reply constructor, with Ack/Flag delegated to proved families.
def transition_exact(
  +phase: E.Phase,
  +response: E.Response,
  +context: E.Context,
  +inv: Nat,
  +next: Nat
) -> {
  E.advance(context, phase, response, inv, next)
  == S.transition(phase, response, context, inv, next)
  : E.Step
}:
  match phase response context:
    case _ E.Ack{} _: ack_transition_exact(context, phase, inv, next)
    case _ E.Flag{value} _: flag_transition_exact(phase, value, context, inv, next)
    case E.PolicyStart{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.PolicyStart{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.PolicyStart{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ReviewStart{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ReviewStart{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.BackendGate{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.BackendGate{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.AdmissionActive{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionActive{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.AdmissionCurrent{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdmissionCurrent{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.BeforeEvaluate{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.BeforeEvaluate{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.Controlled{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.Controlled{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.Authorizing{E.ForProvider{}, p_step} E.Authorized{response} E.Context{_, _, _, _, _, _}: authorization_reply_exact(
      context,
      E.ForProvider{},
      p_step,
      response,
      inv,
      next
    )
    case E.Authorizing{E.ForProvider{}, p_step} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.ForProvider{}, p_step} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.Authorizing{E.RefuseStale{}, p_step} E.Authorized{response} E.Context{_, _, _, _, _, _}: authorization_reply_exact(
      context,
      E.RefuseStale{},
      p_step,
      response,
      inv,
      next
    )
    case E.Authorizing{E.RefuseStale{}, p_step} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.Authorizing{E.RefuseStale{}, p_step} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.Provider{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.ProviderReturned{E.Evaluated{_}} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.ProviderReturned{E.Backend{}} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.ProviderReturned{E.Timeout{}} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.ProviderReturned{E.InputRefused{}} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.ProviderReturned{E.Missing{}} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.Provider{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedAnalytics{E.LostReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.LostReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedAnalytics{E.CredentialReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.CredentialReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedAnalytics{E.BackendReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.BackendReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedAnalytics{E.StaleReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedAnalytics{E.StaleReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedJoined{E.LostReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.LostReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedJoined{E.CredentialReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.CredentialReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedJoined{E.BackendReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DeniedJoined{E.BackendReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.BackendReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedJoined{E.StaleReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedJoined{E.StaleReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedNotice{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedNotice{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DeniedActivity{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DeniedActivity{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RoundActive{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundActive{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RoundRuntime{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundRuntime{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RoundReported{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RoundReported{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CurrentRuntime{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentRuntime{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CurrentActive{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentActive{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CurrentSource{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CurrentSource{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedStatus{p_current} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: evaluated_settlement_exact(
      context,
      receipt,
      p_current,
      inv,
      next
    )
    case E.EvaluatedStatus{p_current} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedStatus{p_current} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.Clear{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Clear{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.Finding{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.Finding{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.NeverSent{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.NeverSent{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestInterrupted{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.RequestTimeout{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedSettlement{E.BackendFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedSettlement{E.BackendFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.FindingRetained{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.ClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedObservation{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedObservation{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedObservation{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DiscardObserved{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DiscardObserved{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.FindingRetained{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.StaleClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.StaleFindingRetired{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.DemoRecorded{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.DemoRecorded{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.DemoRecorded{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.FindingRetained{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.StaleClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.StaleFindingRetired{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheStored{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheStored{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheStored{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.FindingRetained{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.CacheClaimReleased{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.CacheClaimReleased{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.FindingRetained{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.EvaluatedActivity{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.EvaluatedActivity{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.FindingRetained{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.StaleClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedFate{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedFate{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.FindingRetained{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.FindingRetained{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.ClearSettled{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.ClearSettled{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleClearSettled{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.StaleFindingRetired{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.Unavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Unavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.Ignored{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Ignored{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedRetired{E.Stale{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedRetired{E.Stale{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedJoined{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedJoined{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.NonRetainedCompleted{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.NonRetainedCompleted{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ReleaseReuse{E.FinishRelease{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.FinishRelease{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseReuse{E.RecordOutcomeRelease{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.OutcomeRecorded{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.OutcomeRecorded{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.OutcomeRecorded{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RetentionActive{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionActive{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RetentionInactiveRetired{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionInactiveRetired{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RetentionCandidates{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: retention_exact(
      values,
      context,
      inv,
      next
    )
    case E.RetentionCandidates{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RetentionCandidates{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ExistingPublished{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingPublished{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ExistingRecorded{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRecorded{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ExistingRetired{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingRetired{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.ExistingReleased{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.ExistingReleased{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.AdviceInsertedPhase{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceInsertedPhase{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.Failed{token} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceObserved{p_tail} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.AdvicePreserved{p_tail} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdvicePreserved{p_tail} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.AdviceDriven{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.AdviceDriven{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureStatus{p_result} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatus{p_result} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureAborted{p_result} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureAborted{p_result} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureInterrupted{p_result} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterrupted{p_result} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureInterruptObserved{p_result} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureInterruptObserved{p_result} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureInterruptObserved{p_result} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureInterruptObserved{p_result} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureInterruptObserved{p_result} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureStatusAfterInterrupt{p_result} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: failure_exact(context, receipt, p_result, True{}, inv, next)
    case E.FailureStatusAfterInterrupt{p_result} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureStatusAfterInterrupt{p_result} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Clear{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.Finding{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.ProviderReturned{
      result
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.AdviceCandidates{
      values
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.ProviderReturned{
      result
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestState{
      receipt
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.AdviceCandidates{
      values
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.Published{
      publication
    } E.Context{_, _, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.RequestTimeout{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.NoFailure{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Unissued{}, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Issued{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Started{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Interrupted{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.RequestSettled{
      disposition
    } E.Context{_, E.Settled{_}, _, _, _, _}: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.Failed{token} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: fault_exact(context, token, inv, next)
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureSettling{E.BackendFailure{}, W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.NoFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureCompleting{W.NoFailure{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.NoFailure{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.NoFailure{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureCompleting{W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureCompleting{W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureCompleting{W.LostUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureCompleting{W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.NoFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureObserved{W.NoFailure{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.NoFailure{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureObserved{W.BackendUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.BackendUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureObserved{W.CredentialUnavailable{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.CredentialUnavailable{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureObserved{W.LostUnavailable{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureObserved{W.LostUnavailable{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureJoined{E.LostReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.LostReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureJoined{E.CredentialReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureJoined{E.CredentialReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureJoined{E.CredentialReason{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureJoined{E.CredentialReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.CredentialReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureJoined{E.BackendReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.RequestSettled{disposition} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.FailureJoined{E.BackendReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.BackendReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureJoined{E.StaleReason{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureJoined{E.StaleReason{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureNotice{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureNotice{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FailureActivity{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FailureActivity{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryStatus{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryStatus{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryAborted{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAborted{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryEscaped{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryEscaped{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryAfterEscapedAborted{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryAfterEscapedAborted{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryReviewing{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryReviewing{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryDeny{p_step} E.Authorized{response} E.Context{_, _, _, _, _, _}: recovery_authorization_reply_exact(
      context,
      p_step,
      response,
      inv,
      next
    )
    case E.RecoveryDeny{p_step} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDeny{p_step} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryInterrupt{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupt{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryInterrupted{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterrupted{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryInterruptStatus{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: recovery_settlement_exact(
      context,
      receipt,
      True{},
      inv,
      next
    )
    case E.RecoveryInterruptStatus{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryInterruptStatus{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.Clear{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Clear{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Clear{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Clear{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.Finding{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Finding{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.Finding{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.Finding{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.NeverSent{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.NeverSent{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.NeverSent{}} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.NeverSent{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.RequestInterrupted{}} E.Authorized{response} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestState{receipt} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestInterrupted{}} E.AdviceInserted{tail} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.RequestTimeout{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.RequestTimeout{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoverySettling{E.BackendFailure{}} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.ProviderReturned{result} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Unissued{},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Issued{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Started{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Interrupted{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.RequestSettled{disposition} E.Context{
      _,
      E.Settled{_},
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.AdviceCandidates{values} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.Published{publication} E.Context{
      _,
      _,
      _,
      _,
      _,
      _
    }: {==}
    case E.RecoverySettling{E.BackendFailure{}} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryObserved{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryObserved{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryJoined{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryJoined{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryDebug{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryDebug{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryRuntime{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryRuntime{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.RecoveryActivity{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.RecoveryActivity{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FinallyCompleted{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyCompleted{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FinallyReuse{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyReuse{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.FinallyUnit{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.FinallyUnit{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.Failed{token} E.Context{_, _, _, _, _, _}: fault_exact(
      context,
      token,
      inv,
      next
    )
    case E.Raising{} E.Authorized{response} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.ProviderReturned{result} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.RequestState{receipt} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.RequestSettled{disposition} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.AdviceCandidates{values} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.Published{publication} E.Context{_, _, _, _, _, _}: {==}
    case E.Raising{} E.AdviceInserted{tail} E.Context{_, _, _, _, _, _}: {==}

def correlated_exact(
  +valid: Bool,
  +context: E.Context,
  +phase: E.Phase,
  +response: E.Response,
  +inv: Nat,
  +next: Nat
) -> {
  E.correlated(valid, context, phase, response, inv, next)
  == S.correlated(valid, context, phase, response, inv, next)
  : E.Step
}:
  match valid:
    case False{}: {==}
    case True{}: transition_exact(phase, response, context, inv, next)

def resume_exact(+step: E.Step, +reply: E.Reply) -> {
  E.resume(step, reply) == S.resume(step, reply) : E.Step
}:
  match step reply:
    case E.Await{+inv, +id, context, phase, E.Request{owner, request_id, _, _}} E.Reply{
      actual,
      received,
      response
    }:
      correlated_exact(
        Bool.and(
          Nat.is_eq(inv, owner),
          Bool.and(
            Nat.is_eq(id, request_id),
            Bool.and(Nat.is_eq(inv, actual), Nat.is_eq(id, received))
          )
        ),
        context,
        phase,
        response,
        inv,
        Nat.add(id, 1n)
      )
    case E.FinishedEvaluation{_} _: {==}
    case E.Rejected{} _: {==}

def main() -> Unit:
  Unit{}
