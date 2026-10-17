import Base
import ./Evaluation.bend as E
import ./Authorization.bend as A
import ./AuthorizationSpecification.bend as Authorization
import ../../../../../agent-flow-bend/Work.bend as W

# Draft complete public-step relation; not an approved contract or proof.
# The flat table independently chooses every command, continuation and terminal
# using the production data types, never a production transition/decision helper.
# Authorization composes its independent public relation. W.failure_disposition
# is an explicitly shared classification primitive, outside this correspondence.
# Native replies remain facts, not evidence of IO or Canonical authority.
# Maintain with the public cursor API; delete superseded equations/proofs when
# that API is replaced, transferring still-current guarantees to its successor.

def signal(phase: E.Phase) -> E.SignalScope:
  match phase:
    case E.BeforeEvaluate{}: E.WorkSignal{}
    case E.Authorizing{E.ForProvider{}, _}: E.WorkSignal{}
    case E.Provider{}: E.WorkSignal{}
    case _: E.NativeSignal{}

def request(context: E.Context, +phase: E.Phase, command: E.Command, +inv: Nat, +id: Nat) -> E.Step:
  E.Await{inv, id, context, phase, E.Request{inv, id, signal(phase), command}}

def with_receipt(context: E.Context, receipt: E.Receipt) -> E.Context:
  match context:
    case E.Context{input, _, review, mode, faults, finals}:
      E.Context{input, receipt, review, mode, faults, finals}

def with_review(context: E.Context, review: E.Review) -> E.Context:
  match context:
    case E.Context{input, receipt, _, mode, faults, finals}:
      E.Context{input, receipt, Some{review}, mode, faults, finals}

def complete(context: E.Context) -> E.Step:
  match context:
    case E.Context{_, _, _, _, faults, finals}:
      E.FinishedEvaluation{
        E.Completion{List.reverse(&2, Nat, faults), List.reverse(&2, Nat, finals)}
      }

def end(context: E.Context, inv: Nat, next: Nat) -> E.Step:
  match context:
    case E.Context{input, receipt, review, _, faults, finals}:
      request(E.Context{input, receipt, review, E.Finalizing{}, faults, finals},
        E.FinallyCompleted{}, E.ReadCompleted{}, inv, next)

def error(context: E.Context, token: Nat, inv: Nat, next: Nat) -> E.Step:
  match context:
    case E.Context{input, receipt, review, E.Normal{}, faults, finals}:
      request(E.Context{input, receipt, review, E.Recovering{}, token <> faults, finals},
        E.RecoveryStatus{}, E.ReadRequestState{}, inv, next)
    case E.Context{input, receipt, review, E.Recovering{}, faults, finals}:
      end(E.Context{input, receipt, review, E.Recovering{}, token <> faults, finals}, inv, next)
    case E.Context{input, receipt, review, E.Finalizing{}, faults, finals}:
      complete(E.Context{input, receipt, review, E.Finalizing{}, faults, token <> finals})

def invariant(context: E.Context, value: E.Invariant, inv: Nat, next: Nat) -> E.Step:
  request(context, E.Raising{}, E.RaiseInvariant{value}, inv, next)

def clear(review: E.Review) -> Bool:
  match review:
    case E.Review{0n, _}: True{}
    case _: False{}

def record(+context: E.Context, inv: Nat, next: Nat) -> E.Step:
  match context:
    case E.Context{_, _, Some{review}, _, _, _}:
      request(context, E.OutcomeRecorded{}, E.RecordControlledOutcome{clear(review)}, inv, next)
    case _: invariant(context, E.MissingReview{}, inv, next)

def settled_receipt(receipt: E.Receipt) -> E.Receipt:
  match receipt:
    case E.Issued{value}: E.Settled{value}
    case E.Started{value}: E.Settled{value}
    case E.Interrupted{value}: E.Settled{value}
    case other: other

def settled(context: E.Context) -> E.Context:
  match context:
    case E.Context{input, receipt, review, mode, faults, finals}:
      E.Context{input, settled_receipt(receipt), review, mode, faults, finals}

def denied(context: E.Context, reason: E.Reason, inv: Nat, next: Nat) -> E.Step:
  request(context, E.DeniedAnalytics{reason}, E.RecordUnavailableAnalytics{}, inv, next)

def authorization(
  context: E.Context,
  use: E.AuthorizationUse,
  +step: A.Step,
  inv: Nat,
  next: Nat
) -> E.Step:
  match use step:
    case purpose A.Await{_, _, _, A.Request{_, _, command}}:
      request(context, E.Authorizing{purpose, step}, E.Authorization{command}, inv, next)
    case E.ForProvider{} A.AuthorizedRequest{value}:
      request(with_receipt(context, E.Issued{value}), E.Provider{}, E.RunProvider{}, inv, next)
    case E.ForProvider{} A.NotAuthorized{A.Credential{}}:
      denied(context, E.CredentialReason{}, inv, next)
    case E.ForProvider{} A.NotAuthorized{A.Lost{}}:
      denied(context, E.LostReason{}, inv, next)
    case E.RefuseStale{} A.NotAuthorized{_}: denied(context, E.StaleReason{}, inv, next)
    case _ A.Aborted{token}: error(context, token, inv, next)
    case _ _: E.Rejected{}

def authorization_reply(context: E.Context, use: E.AuthorizationUse, +step: A.Step,
  response: A.Response, +inv: Nat, next: Nat) -> E.Step:
  match step:
    case A.Await{_, id, _, _}:
      authorization(context, use, Authorization.resume(step, A.Reply{inv, id, response}), inv, next)
    case _: E.Rejected{}

def denial(+inv: Nat) -> A.Step:
  A.Await{inv, 0n, A.Denied{A.Lost{}}, A.Request{inv, 0n, A.DenyRequest{}}}

def recovery_authorization(context: E.Context, +step: A.Step, inv: Nat, next: Nat) -> E.Step:
  match step:
    case A.Await{_, _, _, A.Request{_, _, command}}:
      request(context, E.RecoveryDeny{step}, E.Authorization{command}, inv, next)
    case A.NotAuthorized{_}:
      request(context, E.RecoveryJoined{}, E.SettleJoined{E.BackendReason{}, False{}}, inv, next)
    case A.Aborted{token}: error(context, token, inv, next)
    case _: E.Rejected{}

def recovery_authorization_reply(context: E.Context, +step: A.Step,
  response: A.Response, +inv: Nat, next: Nat) -> E.Step:
  match step:
    case A.Await{_, id, _, _}:
      recovery_authorization(
        context,
        Authorization.resume(step, A.Reply{inv, id, response}),
        inv,
        next
      )
    case _: E.Rejected{}

def review_settlement(+context: E.Context, current: Bool, inv: Nat, next: Nat) -> E.Step:
  match context:
    case E.Context{_, _, Some{E.Review{0n, _}}, _, _, _}:
      request(
        context,
        E.EvaluatedSettlement{E.Clear{}},
        E.SettleRequest{E.Clear{}, current},
        inv,
        next
      )
    case E.Context{_, _, Some{_}, _, _, _}:
      request(
        context,
        E.EvaluatedSettlement{E.Finding{}},
        E.SettleRequest{E.Finding{}, current},
        inv,
        next
      )
    case _: invariant(context, E.MissingReview{}, inv, next)

def evaluated_settlement(
  context: E.Context,
  +receipt: E.Receipt,
  current: Bool,
  inv: Nat,
  next: Nat
) -> E.Step:
  match receipt:
    case E.Started{_}: review_settlement(with_receipt(context, receipt), current, inv, next)
    case E.Interrupted{_}: review_settlement(with_receipt(context, receipt), current, inv, next)
    case _: invariant(context, E.ResultWithoutStart{}, inv, next)

def retention(values: List<&2, E.Candidate>, context: E.Context, inv: Nat, next: Nat) -> E.Step:
  match values:
    case Nil{}: request(context, E.AdviceInsertedPhase{}, E.InsertAdvice{}, inv, next)
    case E.Candidate{handle, True{}} <> _:
      request(context, E.ExistingPublished{}, E.PublishExisting{handle}, inv, next)
    case _ <> rest: retention(rest, context, inv, next)

def failure(context: E.Context, +receipt: E.Receipt, result: E.ProviderResult,
  aborted: Bool, inv: Nat, next: Nat) -> E.Step:
  match receipt result aborted:
    case E.Unissued{} E.Backend{} _:
      request(
        with_receipt(context, receipt),
        E.FailureCompleting{W.failure_disposition(True{}, False{}, False{})},
        E.CompleteUnavailable{},
        inv,
        next
      )
    case E.Unissued{} E.Timeout{} _:
      request(
        with_receipt(context, receipt),
        E.FailureCompleting{W.failure_disposition(True{}, False{}, False{})},
        E.CompleteUnavailable{},
        inv,
        next
      )
    case E.Unissued{} E.Missing{} _:
      request(
        with_receipt(context, receipt),
        E.FailureCompleting{W.failure_disposition(False{}, False{}, True{})},
        E.CompleteUnavailable{},
        inv,
        next
      )
    case E.Unissued{} _ _:
      request(
        with_receipt(context, receipt),
        E.FailureCompleting{W.failure_disposition(False{}, False{}, False{})},
        E.CompleteUnavailable{},
        inv,
        next
      )
    case E.Settled{_} _ _: end(context, inv, next)
    case E.Issued{_} _ _:
      request(
        with_receipt(context, receipt),
        E.FailureSettling{E.NeverSent{}, W.LostUnavailable{}},
        E.SettleRequest{E.NeverSent{}, False{}},
        inv,
        next
      )
    case E.Interrupted{_} _ True{}:
      request(
        with_receipt(context, receipt),
        E.FailureSettling{E.RequestInterrupted{}, W.LostUnavailable{}},
        E.SettleRequest{E.RequestInterrupted{}, False{}},
        inv,
        next
      )
    case _ E.Timeout{} _:
      request(
        with_receipt(context, receipt),
        E.FailureSettling{E.RequestTimeout{}, W.BackendUnavailable{}},
        E.SettleRequest{E.RequestTimeout{}, False{}},
        inv,
        next
      )
    case _ _ _:
      request(
        with_receipt(context, receipt),
        E.FailureSettling{E.BackendFailure{}, W.BackendUnavailable{}},
        E.SettleRequest{E.BackendFailure{}, False{}},
        inv,
        next
      )

def notice(context: E.Context, classification: W.FailureDisposition, inv: Nat, next: Nat) -> E.Step:
  match classification:
    case W.NoFailure{}: end(context, inv, next)
    case W.BackendUnavailable{}:
      request(
        context,
        E.FailureJoined{E.BackendReason{}},
        E.SettleJoined{E.BackendReason{}, False{}},
        inv,
        next
      )
    case W.CredentialUnavailable{}:
      request(
        context,
        E.FailureJoined{E.CredentialReason{}},
        E.SettleJoined{E.CredentialReason{}, False{}},
        inv,
        next
      )
    case W.LostUnavailable{}:
      request(
        context,
        E.FailureJoined{E.LostReason{}},
        E.SettleJoined{E.LostReason{}, False{}},
        inv,
        next
      )

def recovery_settlement(
  context: E.Context,
  +receipt: E.Receipt,
  aborted: Bool,
  inv: Nat,
  next: Nat
) -> E.Step:
  match receipt aborted:
    case E.Issued{_} _:
      request(
        with_receipt(context, receipt),
        E.RecoverySettling{E.NeverSent{}},
        E.SettleRequest{E.NeverSent{}, False{}},
        inv,
        next
      )
    case E.Started{_} _:
      request(
        with_receipt(context, receipt),
        E.RecoverySettling{E.BackendFailure{}},
        E.SettleRequest{E.BackendFailure{}, False{}},
        inv,
        next
      )
    case E.Interrupted{_} True{}:
      request(
        with_receipt(context, receipt),
        E.RecoverySettling{E.RequestInterrupted{}},
        E.SettleRequest{E.RequestInterrupted{}, False{}},
        inv,
        next
      )
    case E.Interrupted{_} False{}:
      request(
        with_receipt(context, receipt),
        E.RecoverySettling{E.BackendFailure{}},
        E.SettleRequest{E.BackendFailure{}, False{}},
        inv,
        next
      )
    case _ _:
      request(context, E.RecoveryJoined{}, E.SettleJoined{E.BackendReason{}, False{}}, inv, next)

def transition(
  phase: E.Phase,
  response: E.Response,
  +context: E.Context,
  +inv: Nat,
  +next: Nat
) -> E.Step:
  match phase response context:
    case E.AdviceObserved{+tail} E.Failed{
      token
    } E.Context{input, receipt, review, _, faults, finals}:
      request(
        E.Context{input, receipt, review, E.Recovering{}, token <> faults, finals},
        E.AdvicePreserved{tail},
        E.PreserveAdviceTail{tail},
        inv,
        next
      )
    case _ E.Failed{token} _: error(context, token, inv, next)
    case E.PolicyStart{} E.Flag{True{}} _: request(
      context,
      E.ReviewStart{},
      E.StartReview{},
      inv,
      next
    )
    case E.PolicyStart{} E.Flag{False{}} _: request(
      context,
      E.ReleaseReuse{E.FinishRelease{}},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.ReviewStart{} E.Flag{True{}} _: request(
      context,
      E.BackendGate{},
      E.AwaitBackendGate{},
      inv,
      next
    )
    case E.ReviewStart{} E.Flag{False{}} _: request(
      context,
      E.ReleaseReuse{E.FinishRelease{}},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.BackendGate{} E.Ack{} _: request(
      context,
      E.AdmissionActive{},
      E.ReadJobActive{},
      inv,
      next
    )
    case E.AdmissionActive{} E.Flag{True{}} _: request(
      context,
      E.AdmissionCurrent{},
      E.ReadCurrentWork{},
      inv,
      next
    )
    case E.AdmissionActive{} E.Flag{False{}} _: authorization(
      context,
      E.RefuseStale{},
      denial(inv),
      inv,
      next
    )
    case E.AdmissionCurrent{} E.Flag{True{}} _: request(
      context,
      E.BeforeEvaluate{},
      E.EvaluationBarrier{},
      inv,
      next
    )
    case E.AdmissionCurrent{} E.Flag{False{}} _: authorization(
      context,
      E.RefuseStale{},
      denial(inv),
      inv,
      next
    )
    case E.BeforeEvaluate{} E.Ack{} _: request(
      context,
      E.Controlled{},
      E.DecodeControlled{},
      inv,
      next
    )
    case E.Controlled{} E.Ack{} _: authorization(
      context,
      E.ForProvider{},
      Authorization.initial(inv),
      inv,
      next
    )
    case E.Authorizing{use, step} E.Authorized{response} _: authorization_reply(
      context,
      use,
      step,
      response,
      inv,
      next
    )
    case E.Provider{} E.ProviderReturned{E.Evaluated{review}} _: request(
      with_review(context, review),
      E.RoundActive{},
      E.ReadJobActive{},
      inv,
      next
    )
    case E.Provider{} E.ProviderReturned{result} _: request(
      context,
      E.FailureStatus{result},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.DeniedAnalytics{+reason} E.Ack{} _: request(
      context,
      E.DeniedJoined{reason},
      E.SettleJoined{reason, False{}},
      inv,
      next
    )
    case E.DeniedJoined{E.CredentialReason{}} E.Ack{} _: request(
      context,
      E.DeniedNotice{},
      E.RecordOperationalFailure{E.CredentialReason{}},
      inv,
      next
    )
    case E.DeniedJoined{E.StaleReason{}} E.Ack{} _: request(
      context,
      E.DeniedActivity{},
      E.RecordActivity{E.IncompleteActivity{}},
      inv,
      next
    )
    case E.DeniedJoined{_} E.Ack{} _: request(
      context,
      E.DeniedActivity{},
      E.RecordActivity{E.UnavailableActivity{}},
      inv,
      next
    )
    case E.DeniedNotice{} E.Ack{} _: request(
      context,
      E.DeniedActivity{},
      E.RecordActivity{E.UnavailableActivity{}},
      inv,
      next
    )
    case E.DeniedActivity{} E.Ack{} _: request(
      context,
      E.ReleaseReuse{E.FinishRelease{}},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.RoundActive{} E.Flag{True{}} _: request(
      context,
      E.RoundRuntime{},
      E.ReadRuntimeActive{},
      inv,
      next
    )
    case E.RoundActive{} E.Flag{False{}} _: request(
      context,
      E.CurrentRuntime{},
      E.ReadRuntimeActive{},
      inv,
      next
    )
    case E.RoundRuntime{} E.Flag{True{}} E.Context{E.Input{True{}}, _, Some{review}, _, _, _}: request(
      context,
      E.RoundReported{},
      E.ReportRoundOutcome{review},
      inv,
      next
    )
    case E.RoundRuntime{} E.Flag{_} _: request(
      context,
      E.CurrentRuntime{},
      E.ReadRuntimeActive{},
      inv,
      next
    )
    case E.RoundReported{} E.Flag{True{}} _: request(
      context,
      E.CurrentRuntime{},
      E.ReadRuntimeActive{},
      inv,
      next
    )
    case E.RoundReported{} E.Flag{False{}} _: invariant(context, E.RoundOutcomeRefused{}, inv, next)
    case E.CurrentRuntime{} E.Flag{True{}} _: request(
      context,
      E.CurrentActive{},
      E.ReadJobActive{},
      inv,
      next
    )
    case E.CurrentRuntime{} E.Flag{False{}} _: request(
      context,
      E.EvaluatedStatus{False{}},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.CurrentActive{} E.Flag{True{}} _: request(
      context,
      E.CurrentSource{},
      E.ReadCurrentWork{},
      inv,
      next
    )
    case E.CurrentActive{} E.Flag{False{}} _: request(
      context,
      E.EvaluatedStatus{False{}},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.CurrentSource{} E.Flag{value} _: request(
      context,
      E.EvaluatedStatus{value},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.EvaluatedStatus{current} E.RequestState{receipt} _: evaluated_settlement(
      context,
      receipt,
      current,
      inv,
      next
    )
    case E.EvaluatedSettlement{+outcome} E.RequestSettled{disposition} _: request(
      settled(context),
      E.EvaluatedObservation{disposition},
      E.ObserveSettled{outcome},
      inv,
      next
    )
    case E.EvaluatedObservation{E.Ignored{}} E.Ack{} _: request(
      context,
      E.DiscardObserved{},
      E.ObserveFate{E.DiscardedFate{}},
      inv,
      next
    )
    case E.EvaluatedObservation{E.Stale{}} E.Ack{} _: request(
      context,
      E.DiscardObserved{},
      E.ObserveFate{E.StaleFate{}},
      inv,
      next
    )
    case E.EvaluatedObservation{disposition} E.Ack{} E.Context{_, _, Some{review}, _, _, _}: request(
      context,
      E.DemoRecorded{disposition},
      E.RecordDemoTerminal{clear(review)},
      inv,
      next
    )
    case E.EvaluatedObservation{_} E.Ack{} _: invariant(context, E.MissingReview{}, inv, next)
    case E.DiscardObserved{} E.Ack{} _: request(
      context,
      E.ReleaseReuse{E.FinishRelease{}},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.DemoRecorded{disposition} E.Ack{} _: request(
      context,
      E.CacheStored{disposition},
      E.StoreEvaluation{},
      inv,
      next
    )
    case E.CacheStored{disposition} E.Ack{} _: request(
      context,
      E.CacheClaimReleased{disposition},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.CacheClaimReleased{disposition} E.Ack{} E.Context{_, _, Some{E.Review{0n, _}}, _, _, _}: request(
      context,
      E.EvaluatedActivity{disposition},
      E.RecordActivity{E.ClearActivity{}},
      inv,
      next
    )
    case E.CacheClaimReleased{disposition} E.Ack{} E.Context{_, _, Some{_}, _, _, _}: request(
      context,
      E.EvaluatedActivity{disposition},
      E.RecordActivity{E.FindingsActivity{}},
      inv,
      next
    )
    case E.CacheClaimReleased{_} E.Ack{} _: invariant(context, E.MissingReview{}, inv, next)
    case E.EvaluatedActivity{E.FindingRetained{}} E.Ack{} _: request(
      context,
      E.RetentionActive{},
      E.ReadJobActive{},
      inv,
      next
    )
    case E.EvaluatedActivity{E.StaleFindingRetired{}} E.Ack{} _: request(
      context,
      E.NonRetainedFate{E.StaleFindingRetired{}},
      E.ObserveFate{E.StaleFate{}},
      inv,
      next
    )
    case E.EvaluatedActivity{E.Stale{}} E.Ack{} _: request(
      context,
      E.NonRetainedFate{E.Stale{}},
      E.ObserveFate{E.StaleFate{}},
      inv,
      next
    )
    case E.EvaluatedActivity{disposition} E.Ack{} _: request(
      context,
      E.NonRetainedFate{disposition},
      E.ObserveFate{E.DiscardedFate{}},
      inv,
      next
    )
    case E.NonRetainedFate{E.StaleFindingRetired{}} E.Ack{} _: request(
      context,
      E.NonRetainedRetired{E.StaleFindingRetired{}},
      E.RetireUnitWork{},
      inv,
      next
    )
    case E.NonRetainedFate{E.ClearSettled{}} E.Ack{} _: request(
      context,
      E.NonRetainedJoined{},
      E.SettleJoined{E.StaleReason{}, True{}},
      inv,
      next
    )
    case E.NonRetainedFate{_} E.Ack{} _: request(
      context,
      E.NonRetainedJoined{},
      E.SettleJoined{E.StaleReason{}, False{}},
      inv,
      next
    )
    case E.NonRetainedRetired{E.ClearSettled{}} E.Ack{} _: request(
      context,
      E.NonRetainedJoined{},
      E.SettleJoined{E.StaleReason{}, True{}},
      inv,
      next
    )
    case E.NonRetainedRetired{_} E.Ack{} _: request(
      context,
      E.NonRetainedJoined{},
      E.SettleJoined{E.StaleReason{}, False{}},
      inv,
      next
    )
    case E.NonRetainedJoined{} E.Ack{} _: request(
      context,
      E.NonRetainedCompleted{},
      E.MarkCompleted{},
      inv,
      next
    )
    case E.NonRetainedCompleted{} E.Ack{} _: request(
      context,
      E.ReleaseNativeUnit{E.RecordOutcomeRelease{}},
      E.ReleaseUnit{},
      inv,
      next
    )
    case E.ReleaseReuse{target} E.Ack{} _: request(
      context,
      E.ReleaseNativeUnit{target},
      E.ReleaseUnit{},
      inv,
      next
    )
    case E.ReleaseNativeUnit{E.FinishRelease{}} E.Ack{} _: end(context, inv, next)
    case E.ReleaseNativeUnit{E.RecordOutcomeRelease{}} E.Ack{} _: record(context, inv, next)
    case E.OutcomeRecorded{} E.Ack{} _: end(context, inv, next)
    case E.RetentionActive{} E.Flag{True{}} _: request(
      context,
      E.RetentionCandidates{},
      E.ReadAdviceCandidates{},
      inv,
      next
    )
    case E.RetentionActive{} E.Flag{False{}} _: request(
      context,
      E.RetentionInactiveRetired{},
      E.RetireUnitWork{},
      inv,
      next
    )
    case E.RetentionInactiveRetired{} E.Ack{} _: request(
      context,
      E.ExistingReleased{},
      E.ReleaseUnit{},
      inv,
      next
    )
    case E.RetentionCandidates{} E.AdviceCandidates{values} _: retention(values, context, inv, next)
    case E.ExistingPublished{} E.Published{publication} _: request(
      context,
      E.ExistingRecorded{},
      E.RecordJoined{publication},
      inv,
      next
    )
    case E.ExistingRecorded{} E.Ack{} _: request(
      context,
      E.ExistingRetired{},
      E.RetireUnitWork{},
      inv,
      next
    )
    case E.ExistingRetired{} E.Ack{} _: request(
      context,
      E.ExistingReleased{},
      E.ReleaseUnit{},
      inv,
      next
    )
    case E.ExistingReleased{} E.Ack{} _: record(context, inv, next)
    case E.AdviceInsertedPhase{} E.AdviceInserted{+tail} _: request(
      context,
      E.AdviceObserved{tail},
      E.ObserveRetained{tail},
      inv,
      next
    )
    case E.AdviceObserved{tail} E.Ack{} _: request(
      context,
      E.AdviceDriven{},
      E.DriveAdviceTail{tail},
      inv,
      next
    )
    case E.AdvicePreserved{_} E.Ack{} _: request(
      context,
      E.RecoveryStatus{},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.AdviceDriven{} E.Ack{} _: record(context, inv, next)
    case E.FailureStatus{result} E.RequestState{receipt} _: request(
      with_receipt(context, receipt),
      E.FailureAborted{result},
      E.ReadAborted{},
      inv,
      next
    )
    case E.FailureAborted{result} E.Flag{True{}} E.Context{_, E.Started{_}, _, _, _, _}: request(
      context,
      E.FailureInterrupted{result},
      E.InterruptRequest{},
      inv,
      next
    )
    case E.FailureAborted{result} E.Flag{aborted} E.Context{_, receipt, _, _, _, _}: failure(
      context,
      receipt,
      result,
      aborted,
      inv,
      next
    )
    case E.FailureInterrupted{result} E.Flag{True{}} _: request(
      context,
      E.FailureInterruptObserved{result},
      E.ObserveInterrupted{},
      inv,
      next
    )
    case E.FailureInterrupted{result} E.Flag{False{}} _: request(
      context,
      E.FailureStatusAfterInterrupt{result},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.FailureInterruptObserved{result} E.Ack{} _: request(
      context,
      E.FailureStatusAfterInterrupt{result},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.FailureStatusAfterInterrupt{result} E.RequestState{receipt} _: failure(
      context,
      receipt,
      result,
      True{},
      inv,
      next
    )
    case E.FailureSettling{outcome, classification} E.RequestSettled{_} _: request(
      settled(context),
      E.FailureObserved{classification},
      E.ObserveSettled{outcome},
      inv,
      next
    )
    case E.FailureCompleting{classification} E.Flag{True{}} _: notice(
      context,
      classification,
      inv,
      next
    )
    case E.FailureCompleting{_} E.Flag{False{}} _: end(context, inv, next)
    case E.FailureObserved{classification} E.Ack{} _: notice(context, classification, inv, next)
    case E.FailureJoined{E.LostReason{}} E.Ack{} _: request(
      context,
      E.FailureActivity{},
      E.RecordActivity{E.UnavailableActivity{}},
      inv,
      next
    )
    case E.FailureJoined{reason} E.Ack{} _: request(
      context,
      E.FailureNotice{},
      E.RecordOperationalFailure{reason},
      inv,
      next
    )
    case E.FailureNotice{} E.Ack{} _: request(
      context,
      E.FailureActivity{},
      E.RecordActivity{E.UnavailableActivity{}},
      inv,
      next
    )
    case E.FailureActivity{} E.Ack{} _: end(context, inv, next)
    case E.RecoveryStatus{} E.RequestState{receipt} _: request(
      with_receipt(context, receipt),
      E.RecoveryAborted{},
      E.ReadAborted{},
      inv,
      next
    )
    case E.RecoveryAborted{} E.Flag{True{}} _: request(
      context,
      E.RecoveryEscaped{},
      E.ObserveEscaped{E.RequestInterrupted{}},
      inv,
      next
    )
    case E.RecoveryAborted{} E.Flag{False{}} _: request(
      context,
      E.RecoveryEscaped{},
      E.ObserveEscaped{E.BackendFailure{}},
      inv,
      next
    )
    case E.RecoveryEscaped{} E.Ack{} _: request(
      context,
      E.RecoveryAfterEscapedAborted{},
      E.ReadAborted{},
      inv,
      next
    )
    case E.RecoveryAfterEscapedAborted{} E.Flag{_} E.Context{_, E.Unissued{}, _, _, _, _}: request(
      context,
      E.RecoveryReviewing{},
      E.ReadReviewing{},
      inv,
      next
    )
    case E.RecoveryAfterEscapedAborted{} E.Flag{True{}} E.Context{_, E.Started{_}, _, _, _, _}: request(
      context,
      E.RecoveryInterrupt{},
      E.InterruptRequest{},
      inv,
      next
    )
    case E.RecoveryAfterEscapedAborted{} E.Flag{aborted} E.Context{_, receipt, _, _, _, _}: recovery_settlement(
      context,
      receipt,
      aborted,
      inv,
      next
    )
    case E.RecoveryReviewing{} E.Flag{True{}} _: recovery_authorization(
      context,
      denial(inv),
      inv,
      next
    )
    case E.RecoveryReviewing{} E.Flag{False{}} _: request(
      context,
      E.RecoveryJoined{},
      E.SettleJoined{E.BackendReason{}, False{}},
      inv,
      next
    )
    case E.RecoveryDeny{step} E.Authorized{response} _: recovery_authorization_reply(
      context,
      step,
      response,
      inv,
      next
    )
    case E.RecoveryInterrupt{} E.Flag{True{}} _: request(
      context,
      E.RecoveryInterrupted{},
      E.ObserveInterrupted{},
      inv,
      next
    )
    case E.RecoveryInterrupt{} E.Flag{False{}} _: request(
      context,
      E.RecoveryInterruptStatus{},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.RecoveryInterrupted{} E.Ack{} _: request(
      context,
      E.RecoveryInterruptStatus{},
      E.ReadRequestState{},
      inv,
      next
    )
    case E.RecoveryInterruptStatus{} E.RequestState{receipt} _: recovery_settlement(
      context,
      receipt,
      True{},
      inv,
      next
    )
    case E.RecoverySettling{outcome} E.RequestSettled{_} _: request(
      settled(context),
      E.RecoveryObserved{},
      E.ObserveSettled{outcome},
      inv,
      next
    )
    case E.RecoveryObserved{} E.Ack{} _: request(
      context,
      E.RecoveryJoined{},
      E.SettleJoined{E.BackendReason{}, False{}},
      inv,
      next
    )
    case E.RecoveryJoined{} E.Ack{} _: request(
      context,
      E.RecoveryDebug{},
      E.RecordDebugFailure{},
      inv,
      next
    )
    case E.RecoveryDebug{} E.Ack{} _: request(
      context,
      E.RecoveryRuntime{},
      E.ReadRuntimeActive{},
      inv,
      next
    )
    case E.RecoveryRuntime{} E.Flag{True{}} _: request(
      context,
      E.RecoveryActivity{},
      E.RecordActivity{E.UnavailableActivity{}},
      inv,
      next
    )
    case E.RecoveryRuntime{} E.Flag{False{}} _: end(context, inv, next)
    case E.RecoveryActivity{} E.Ack{} _: end(context, inv, next)
    case E.FinallyCompleted{} E.Flag{True{}} _: complete(context)
    case E.FinallyCompleted{} E.Flag{False{}} _: request(
      context,
      E.FinallyReuse{},
      E.ReleaseReuseClaim{},
      inv,
      next
    )
    case E.FinallyReuse{} E.Ack{} _: request(context, E.FinallyUnit{}, E.ReleaseUnit{}, inv, next)
    case E.FinallyUnit{} E.Ack{} _: complete(context)
    case _ _ _: E.Rejected{}

def initial(+input: E.Input, inv: Nat) -> E.Step:
  match input:
    case E.Input{True{}}:
      request(
        E.Context{input, E.Unissued{}, None{}, E.Normal{}, Nil{}, Nil{}},
        E.PolicyStart{},
        E.StartPolicyUnit{},
        inv,
        0n
      )
    case E.Input{False{}}:
      request(
        E.Context{input, E.Unissued{}, None{}, E.Normal{}, Nil{}, Nil{}},
        E.ReviewStart{},
        E.StartReview{},
        inv,
        0n
      )

def cleanup_initial(inv: Nat) -> E.Step:
  request(
    E.Context{E.Input{False{}}, E.Unissued{}, None{}, E.Recovering{}, Nil{}, Nil{}},
    E.RecoveryStatus{},
    E.ReadRequestState{},
    inv,
    0n
  )

def correlated(
  valid: Bool,
  context: E.Context,
  phase: E.Phase,
  response: E.Response,
  inv: Nat,
  next: Nat
) -> E.Step:
  match valid:
    case True{}: transition(phase, response, context, inv, next)
    case False{}: E.Rejected{}

def resume(step: E.Step, reply: E.Reply) -> E.Step:
  match step reply:
    case E.Await{+inv, +id, context, phase, E.Request{owner, request_id, _, _}} E.Reply{
      actual,
      received,
      response
    }:
      correlated(
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
    case _ _: E.Rejected{}

def main() -> Unit:
  Unit{}
