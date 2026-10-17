import Base
import ./Authorization.bend as Auth
import ../../../../../agent-flow-bend/Work.bend as Work

# Complete resident evaluation progression. Source-bearing values, original
# Causes and committed resource receipts remain native. No physical provider
# call is made here: RunProvider parks this parent while Dispatch owns its
# beforeDispatch callback under the exact Canonical parent request.
type Input is Data:
  Input{policy_unit: Bool}
type Receipt is Data:
  Unissued{}
  Issued{request: Nat}
  Started{request: Nat}
  Interrupted{request: Nat}
  Settled{request: Nat}
type Review is Data:
  Review{count: Nat, bytes: Nat}
type ProviderResult is Data:
  Evaluated{review: Review}
  Backend{}
  Timeout{}
  InputRefused{}
  Missing{}
type Outcome is Data:
  Clear{}
  Finding{}
  NeverSent{}
  RequestInterrupted{}
  RequestTimeout{}
  BackendFailure{}
type Disposition is Data:
  FindingRetained{}
  ClearSettled{}
  StaleClearSettled{}
  StaleFindingRetired{}
  Unavailable{}
  Ignored{}
  Stale{}
type Reason is Data:
  LostReason{}
  CredentialReason{}
  BackendReason{}
  StaleReason{}
type Activity is Data:
  IncompleteActivity{}
  UnavailableActivity{}
  ClearActivity{}
  FindingsActivity{}
type Fate is Data:
  DiscardedFate{}
  StaleFate{}
type Invariant is Data:
  ResultWithoutStart{}
  RoundOutcomeRefused{}
  MissingReview{}
type Candidate is Data:
  Candidate{handle: Nat, matching: Bool}
type Mode is Data:
  Normal{}
  Recovering{}
  Finalizing{}
type Context is Data:
  Context{input: Input, receipt: Receipt, review: Maybe<&2, Review>, mode: Mode,
    task_faults: List<&2, Nat>, final_faults: List<&2, Nat>}
type AuthorizationUse is Data:
  ForProvider{}
  RefuseStale{}
type ReleaseTarget is Data:
  FinishRelease{}
  RecordOutcomeRelease{}
type Command is Data:
  StartPolicyUnit{}
  StartReview{}
  AwaitBackendGate{}
  ReadJobActive{}
  ReadCurrentWork{}
  EvaluationBarrier{}
  DecodeControlled{}
  Authorization{command: Auth.Command}
  RunProvider{}
  ReadRuntimeActive{}
  ReportRoundOutcome{review: Review}
  ReadRequestState{}
  ReadAborted{}
  InterruptRequest{}
  ObserveInterrupted{}
  SettleRequest{outcome: Outcome, current: Bool}
  CompleteUnavailable{}
  ObserveSettled{outcome: Outcome}
  ObserveFate{fate: Fate}
  RecordDemoTerminal{clear: Bool}
  StoreEvaluation{}
  ReleaseReuseClaim{}
  RecordActivity{activity: Activity}
  RecordUnavailableAnalytics{}
  SettleJoined{reason: Reason, clear: Bool}
  RecordOperationalFailure{reason: Reason}
  RetireUnitWork{}
  MarkCompleted{}
  ReleaseUnit{}
  RecordControlledOutcome{clear: Bool}
  ReadAdviceCandidates{}
  PublishExisting{advice: Nat}
  RecordJoined{publication: Nat}
  InsertAdvice{}
  ObserveRetained{tail: Nat}
  PreserveAdviceTail{tail: Nat}
  DriveAdviceTail{tail: Nat}
  ObserveEscaped{outcome: Outcome}
  ReadReviewing{}
  RecordDebugFailure{}
  ReadCompleted{}
  RaiseInvariant{invariant: Invariant}
type Response is Data:
  Ack{}
  Flag{value: Bool}
  Authorized{response: Auth.Response}
  ProviderReturned{result: ProviderResult}
  RequestState{receipt: Receipt}
  RequestSettled{disposition: Disposition}
  AdviceCandidates{values: List<&2, Candidate>}
  Published{publication: Nat}
  AdviceInserted{tail: Nat}
  Failed{token: Nat}
type Phase is Data:
  PolicyStart{}
  ReviewStart{}
  BackendGate{}
  AdmissionActive{}
  AdmissionCurrent{}
  BeforeEvaluate{}
  Controlled{}
  Authorizing{use: AuthorizationUse, step: Auth.Step}
  Provider{}
  DeniedAnalytics{reason: Reason}
  DeniedJoined{reason: Reason}
  DeniedNotice{}
  DeniedActivity{}
  RoundActive{}
  RoundRuntime{}
  RoundReported{}
  CurrentRuntime{}
  CurrentActive{}
  CurrentSource{}
  EvaluatedStatus{current: Bool}
  EvaluatedSettlement{outcome: Outcome}
  EvaluatedObservation{disposition: Disposition}
  DiscardObserved{}
  DemoRecorded{disposition: Disposition}
  CacheStored{disposition: Disposition}
  CacheClaimReleased{disposition: Disposition}
  EvaluatedActivity{disposition: Disposition}
  NonRetainedFate{disposition: Disposition}
  NonRetainedRetired{disposition: Disposition}
  NonRetainedJoined{}
  NonRetainedCompleted{}
  ReleaseReuse{target: ReleaseTarget}
  ReleaseNativeUnit{target: ReleaseTarget}
  OutcomeRecorded{}
  RetentionActive{}
  RetentionInactiveRetired{}
  RetentionCandidates{}
  ExistingPublished{}
  ExistingRecorded{}
  ExistingRetired{}
  ExistingReleased{}
  AdviceInsertedPhase{}
  AdviceObserved{tail: Nat}
  AdvicePreserved{tail: Nat}
  AdviceDriven{}
  FailureStatus{result: ProviderResult}
  FailureAborted{result: ProviderResult}
  FailureInterrupted{result: ProviderResult}
  FailureInterruptObserved{result: ProviderResult}
  FailureStatusAfterInterrupt{result: ProviderResult}
  FailureSettling{outcome: Outcome, classification: Work.FailureDisposition}
  FailureCompleting{classification: Work.FailureDisposition}
  FailureObserved{classification: Work.FailureDisposition}
  FailureJoined{reason: Reason}
  FailureNotice{}
  FailureActivity{}
  RecoveryStatus{}
  RecoveryAborted{}
  RecoveryEscaped{}
  RecoveryAfterEscapedAborted{}
  RecoveryReviewing{}
  RecoveryDeny{step: Auth.Step}
  RecoveryInterrupt{}
  RecoveryInterrupted{}
  RecoveryInterruptStatus{}
  RecoverySettling{outcome: Outcome}
  RecoveryObserved{}
  RecoveryJoined{}
  RecoveryDebug{}
  RecoveryRuntime{}
  RecoveryActivity{}
  FinallyCompleted{}
  FinallyReuse{}
  FinallyUnit{}
  Raising{}
type SignalScope is Data:
  WorkSignal{}
  NativeSignal{}
type Request is Data:
  Request{invocation: Nat, id: Nat, signal: SignalScope, command: Command}
type Reply is Data:
  Reply{invocation: Nat, id: Nat, response: Response}
type Completion is Data:
  Completion{task_faults: List<&2, Nat>, final_faults: List<&2, Nat>}
type Step is Data:
  Await{invocation: Nat, id: Nat, context: Context, phase: Phase, request: Request}
  FinishedEvaluation{result: Completion}
  Rejected{}

def signal_scope(phase: Phase) -> SignalScope:
  match phase:
    case BeforeEvaluate{}: WorkSignal{}
    case Authorizing{ForProvider{}, _}: WorkSignal{}
    case Provider{}: WorkSignal{}
    case _: NativeSignal{}

def issue(context: Context, +phase: Phase, command: Command, +invocation: Nat, +id: Nat) -> Step:
  Await{invocation, id, context, phase, Request{invocation, id, signal_scope(phase), command}}

def finished(context: Context) -> Step:
  match context:
    case Context{_, _, _, _, task_faults, final_faults}:
      FinishedEvaluation{
        Completion{List.reverse(&2, Nat, task_faults), List.reverse(&2, Nat, final_faults)}
      }

def receipt_context(context: Context, receipt: Receipt) -> Context:
  match context:
    case Context{input, _, review, mode, task_faults, final_faults}:
      Context{input, receipt, review, mode, task_faults, final_faults}

def mode_context(context: Context, mode: Mode) -> Context:
  match context:
    case Context{input, receipt, review, _, task_faults, final_faults}:
      Context{input, receipt, review, mode, task_faults, final_faults}

def review_context(context: Context, review: Review) -> Context:
  match context:
    case Context{input, receipt, _, mode, task_faults, final_faults}:
      Context{input, receipt, Some{review}, mode, task_faults, final_faults}

def finalize(context: Context, invocation: Nat, next: Nat) -> Step:
  issue(mode_context(context, Finalizing{}), FinallyCompleted{}, ReadCompleted{}, invocation, next)

def fault(context: Context, token: Nat, invocation: Nat, next: Nat) -> Step:
  match context:
    case Context{input, receipt, review, Normal{}, faults, finals}:
      issue(Context{input, receipt, review, Recovering{}, token <> faults, finals},
        RecoveryStatus{}, ReadRequestState{}, invocation, next)
    case Context{input, receipt, review, Recovering{}, faults, finals}:
      finalize(
        Context{input, receipt, review, Recovering{}, token <> faults, finals},
        invocation,
        next
      )
    case Context{input, receipt, review, Finalizing{}, faults, finals}:
      finished(Context{input, receipt, review, Finalizing{}, faults, token <> finals})

def release(context: Context, target: ReleaseTarget, invocation: Nat, next: Nat) -> Step:
  issue(context, ReleaseReuse{target}, ReleaseReuseClaim{}, invocation, next)

def raise(context: Context, invariant: Invariant, invocation: Nat, next: Nat) -> Step:
  issue(context, Raising{}, RaiseInvariant{invariant}, invocation, next)

def outcome(review: Review) -> Outcome:
  match review:
    case Review{0n, _}: Clear{}
    case _: Finding{}

def clear_review(review: Review) -> Bool:
  match review:
    case Review{0n, _}: True{}
    case _: False{}

def outcome_record(context: Context, review: Maybe<&2, Review>, invocation: Nat, next: Nat) -> Step:
  match review:
    case Some{value}: issue(
      context,
      OutcomeRecorded{},
      RecordControlledOutcome{clear_review(value)},
      invocation,
      next
    )
    case None{}: raise(context, MissingReview{}, invocation, next)

def record_outcome(+context: Context, invocation: Nat, next: Nat) -> Step:
  match context:
    case Context{_, _, review, _, _, _}: outcome_record(context, review, invocation, next)

def released(context: Context, target: ReleaseTarget, invocation: Nat, next: Nat) -> Step:
  match target:
    case FinishRelease{}: finalize(context, invocation, next)
    case RecordOutcomeRelease{}: record_outcome(context, invocation, next)

def denied(context: Context, reason: Reason, invocation: Nat, next: Nat) -> Step:
  issue(context, DeniedAnalytics{reason}, RecordUnavailableAnalytics{}, invocation, next)

def auth_reason(reason: Auth.Reason) -> Reason:
  match reason:
    case Auth.Credential{}: CredentialReason{}
    case Auth.Lost{}: LostReason{}

def authorized_result(
  context: Context,
  use: AuthorizationUse,
  +step: Auth.Step,
  invocation: Nat,
  next: Nat
) -> Step:
  match use step:
    case purpose Auth.Await{_, _, _, Auth.Request{_, _, command}}:
      issue(context, Authorizing{purpose, step}, Authorization{command}, invocation, next)
    case ForProvider{} Auth.AuthorizedRequest{request}:
      issue(receipt_context(context, Issued{request}), Provider{}, RunProvider{}, invocation, next)
    case ForProvider{} Auth.NotAuthorized{reason}: denied(
      context,
      auth_reason(reason),
      invocation,
      next
    )
    case RefuseStale{} Auth.NotAuthorized{_}: denied(context, StaleReason{}, invocation, next)
    case _ Auth.Aborted{token}: fault(context, token, invocation, next)
    case _ _: Rejected{}

def authorization_reply(
  context: Context,
  use: AuthorizationUse,
  step: Auth.Step,
  response: Auth.Response,
  +invocation: Nat,
  next: Nat
) -> Step:
  match step:
    case Auth.Await{_, +id, _, _}:
      authorized_result(
        context,
        use,
        Auth.resume(step, Auth.Reply{invocation, id, response}),
        invocation,
        next
      )
    case _: Rejected{}

def admit_current(context: Context, valid: Bool, +invocation: Nat, +next: Nat) -> Step:
  match valid:
    case True{}: issue(context, BeforeEvaluate{}, EvaluationBarrier{}, invocation, next)
    case False{}: authorized_result(
      context,
      RefuseStale{},
      Auth.deny(Auth.Lost{}, invocation, 0n),
      invocation,
      next
    )

def initial_policy(context: Context, enabled: Bool, invocation: Nat) -> Step:
  match enabled:
    case True{}: issue(context, PolicyStart{}, StartPolicyUnit{}, invocation, 0n)
    case False{}: issue(context, ReviewStart{}, StartReview{}, invocation, 0n)

def initial(+input: Input, invocation: Nat) -> Step:
  match input:
    case Input{enabled}: initial_policy(
      Context{input, Unissued{}, None{}, Normal{}, Nil{}, Nil{}},
      enabled,
      invocation
    )

def started_review(context: Context, valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(context, BackendGate{}, AwaitBackendGate{}, invocation, next)
    case False{}: release(context, FinishRelease{}, invocation, next)

def policy_started(context: Context, valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(context, ReviewStart{}, StartReview{}, invocation, next)
    case False{}: release(context, FinishRelease{}, invocation, next)

def admission_active(context: Context, valid: Bool, invocation: Nat, next: Nat) -> Step:
  match valid:
    case True{}: issue(context, AdmissionCurrent{}, ReadCurrentWork{}, invocation, next)
    case False{}: admit_current(context, False{}, invocation, next)

def denied_joined(context: Context, reason: Reason, invocation: Nat, next: Nat) -> Step:
  match reason:
    case CredentialReason{}: issue(
      context,
      DeniedNotice{},
      RecordOperationalFailure{CredentialReason{}},
      invocation,
      next
    )
    case StaleReason{}: issue(
      context,
      DeniedActivity{},
      RecordActivity{IncompleteActivity{}},
      invocation,
      next
    )
    case _: issue(
      context,
      DeniedActivity{},
      RecordActivity{UnavailableActivity{}},
      invocation,
      next
    )

def round_active(context: Context, active: Bool, invocation: Nat, next: Nat) -> Step:
  match active:
    case True{}: issue(context, RoundRuntime{}, ReadRuntimeActive{}, invocation, next)
    case False{}: issue(context, CurrentRuntime{}, ReadRuntimeActive{}, invocation, next)

def round_input(
  context: Context,
  input: Input,
  review: Maybe<&2, Review>,
  invocation: Nat,
  next: Nat
) -> Step:
  match input review:
    case Input{True{}} Some{value}: issue(
      context,
      RoundReported{},
      ReportRoundOutcome{value},
      invocation,
      next
    )
    case _ _: issue(context, CurrentRuntime{}, ReadRuntimeActive{}, invocation, next)

def round_runtime(+context: Context, active: Bool, invocation: Nat, next: Nat) -> Step:
  match context active:
    case Context{input, _, review, _, _, _} True{}: round_input(
      context,
      input,
      review,
      invocation,
      next
    )
    case _ False{}: issue(context, CurrentRuntime{}, ReadRuntimeActive{}, invocation, next)

def round_reported(context: Context, accepted: Bool, invocation: Nat, next: Nat) -> Step:
  match accepted:
    case True{}: issue(context, CurrentRuntime{}, ReadRuntimeActive{}, invocation, next)
    case False{}: raise(context, RoundOutcomeRefused{}, invocation, next)

def current_runtime(context: Context, active: Bool, invocation: Nat, next: Nat) -> Step:
  match active:
    case True{}: issue(context, CurrentActive{}, ReadJobActive{}, invocation, next)
    case False{}: issue(context, EvaluatedStatus{False{}}, ReadRequestState{}, invocation, next)

def current_active(context: Context, active: Bool, invocation: Nat, next: Nat) -> Step:
  match active:
    case True{}: issue(context, CurrentSource{}, ReadCurrentWork{}, invocation, next)
    case False{}: issue(context, EvaluatedStatus{False{}}, ReadRequestState{}, invocation, next)

def settle_evaluated(
  context: Context,
  review: Maybe<&2, Review>,
  current: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match review:
    case Some{+value}: issue(
      context,
      EvaluatedSettlement{outcome(value)},
      SettleRequest{outcome(value), current},
      invocation,
      next
    )
    case None{}: raise(context, MissingReview{}, invocation, next)

def evaluated_status(
  +context: Context,
  +receipt: Receipt,
  current: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match context receipt:
    case Context{_, _, review, _, _, _} Started{_}: settle_evaluated(
      receipt_context(context, receipt),
      review,
      current,
      invocation,
      next
    )
    case Context{_, _, review, _, _, _} Interrupted{_}: settle_evaluated(
      receipt_context(context, receipt),
      review,
      current,
      invocation,
      next
    )
    case _ _: raise(context, ResultWithoutStart{}, invocation, next)

def disposition_fate(disposition: Disposition) -> Fate:
  match disposition:
    case Stale{}: StaleFate{}
    case StaleFindingRetired{}: StaleFate{}
    case _: DiscardedFate{}

def settled_receipt(receipt: Receipt) -> Receipt:
  match receipt:
    case Issued{request}: Settled{request}
    case Started{request}: Settled{request}
    case Interrupted{request}: Settled{request}
    case other: other

def did_settle(context: Context) -> Context:
  match context:
    case Context{input, receipt, review, mode, faults, finals}:
      Context{input, settled_receipt(receipt), review, mode, faults, finals}

def evaluated_observed(
  +context: Context,
  +disposition: Disposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match context disposition:
    case _ Ignored{}: issue(
      context,
      DiscardObserved{},
      ObserveFate{DiscardedFate{}},
      invocation,
      next
    )
    case _ Stale{}: issue(context, DiscardObserved{}, ObserveFate{StaleFate{}}, invocation, next)
    case Context{_, _, Some{review}, _, _, _} _:
      issue(
        context,
        DemoRecorded{disposition},
        RecordDemoTerminal{clear_review(review)},
        invocation,
        next
      )
    case _ _: raise(context, MissingReview{}, invocation, next)

def evaluated_activity(
  +context: Context,
  disposition: Disposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match context:
    case Context{_, _, Some{Review{0n, _}}, _, _, _}:
      issue(
        context,
        EvaluatedActivity{disposition},
        RecordActivity{ClearActivity{}},
        invocation,
        next
      )
    case Context{_, _, Some{_}, _, _, _}:
      issue(
        context,
        EvaluatedActivity{disposition},
        RecordActivity{FindingsActivity{}},
        invocation,
        next
      )
    case _: raise(context, MissingReview{}, invocation, next)

def retention_or_settle(
  context: Context,
  +disposition: Disposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match disposition:
    case FindingRetained{}: issue(context, RetentionActive{}, ReadJobActive{}, invocation, next)
    case _: issue(
      context,
      NonRetainedFate{disposition},
      ObserveFate{disposition_fate(disposition)},
      invocation,
      next
    )

def nonretained_join(
  context: Context,
  disposition: Disposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match disposition:
    case ClearSettled{}: issue(
      context,
      NonRetainedJoined{},
      SettleJoined{StaleReason{}, True{}},
      invocation,
      next
    )
    case _: issue(
      context,
      NonRetainedJoined{},
      SettleJoined{StaleReason{}, False{}},
      invocation,
      next
    )

def nonretained_observed(
  context: Context,
  disposition: Disposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match disposition:
    case StaleFindingRetired{}: issue(
      context,
      NonRetainedRetired{disposition},
      RetireUnitWork{},
      invocation,
      next
    )
    case _: nonretained_join(context, disposition, invocation, next)

def first_matching(values: List<&2, Candidate>) -> Maybe<&2, Nat>:
  match values:
    case Nil{}: None{}
    case Candidate{handle, True{}} <> _: Some{handle}
    case _ <> rest: first_matching(rest)

def retained_existing(context: Context, found: Maybe<&2, Nat>, invocation: Nat, next: Nat) -> Step:
  match found:
    case Some{handle}: issue(
      context,
      ExistingPublished{},
      PublishExisting{handle},
      invocation,
      next
    )
    case None{}: issue(context, AdviceInsertedPhase{}, InsertAdvice{}, invocation, next)

def retention_active(context: Context, active: Bool, invocation: Nat, next: Nat) -> Step:
  match active:
    case True{}: issue(context, RetentionCandidates{}, ReadAdviceCandidates{}, invocation, next)
    case False{}: issue(context, RetentionInactiveRetired{}, RetireUnitWork{}, invocation, next)

def observed_failure(receipt: Receipt, aborted: Bool, result: ProviderResult) -> Outcome:
  match receipt aborted result:
    case Issued{_} _ _: NeverSent{}
    case Interrupted{_} True{} _: RequestInterrupted{}
    case _ _ Timeout{}: RequestTimeout{}
    case _ _ _: BackendFailure{}

def failure_class(outcome: Outcome) -> Work.FailureDisposition:
  match outcome:
    case BackendFailure{}: Work.BackendUnavailable{}
    case RequestTimeout{}: Work.BackendUnavailable{}
    case NeverSent{}: Work.LostUnavailable{}
    case RequestInterrupted{}: Work.LostUnavailable{}
    case _: Work.NoFailure{}

def failure_issued(context: Context, +observed: Outcome, invocation: Nat, next: Nat) -> Step:
  issue(
    context,
    FailureSettling{observed, failure_class(observed)},
    SettleRequest{observed, False{}},
    invocation,
    next
  )

def provider_backend(result: ProviderResult) -> Bool:
  match result:
    case Backend{}: True{}
    case Timeout{}: True{}
    case _: False{}

def provider_missing(result: ProviderResult) -> Bool:
  match result:
    case Missing{}: True{}
    case _: False{}

def failure_after_status(
  +context: Context,
  +receipt: Receipt,
  +result: ProviderResult,
  aborted: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match receipt:
    case Unissued{}: issue(
      receipt_context(context, receipt),
      FailureCompleting{
        Work.failure_disposition(provider_backend(result), False{}, provider_missing(result))
      },
      CompleteUnavailable{},
      invocation,
      next
    )
    case Settled{_}: finalize(context, invocation, next)
    case _: failure_issued(
      receipt_context(context, receipt),
      observed_failure(receipt, aborted, result),
      invocation,
      next
    )

def provider_returned(
  context: Context,
  +result: ProviderResult,
  invocation: Nat,
  next: Nat
) -> Step:
  match result:
    case Evaluated{review}: issue(
      review_context(context, review),
      RoundActive{},
      ReadJobActive{},
      invocation,
      next
    )
    case _: issue(context, FailureStatus{result}, ReadRequestState{}, invocation, next)

def failure_notice(
  context: Context,
  classification: Work.FailureDisposition,
  invocation: Nat,
  next: Nat
) -> Step:
  match classification:
    case Work.NoFailure{}: finalize(context, invocation, next)
    case Work.BackendUnavailable{}: issue(
      context,
      FailureJoined{BackendReason{}},
      SettleJoined{BackendReason{}, False{}},
      invocation,
      next
    )
    case Work.CredentialUnavailable{}: issue(
      context,
      FailureJoined{CredentialReason{}},
      SettleJoined{CredentialReason{}, False{}},
      invocation,
      next
    )
    case Work.LostUnavailable{}: issue(
      context,
      FailureJoined{LostReason{}},
      SettleJoined{LostReason{}, False{}},
      invocation,
      next
    )

def failed_joined(context: Context, +reason: Reason, invocation: Nat, next: Nat) -> Step:
  match reason:
    case LostReason{}: issue(
      context,
      FailureActivity{},
      RecordActivity{UnavailableActivity{}},
      invocation,
      next
    )
    case _: issue(context, FailureNotice{}, RecordOperationalFailure{reason}, invocation, next)

def failure_abort(
  +context: Context,
  +result: ProviderResult,
  aborted: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match context aborted:
    case Context{_, Started{_}, _, _, _, _} True{}:
      issue(context, FailureInterrupted{result}, InterruptRequest{}, invocation, next)
    case Context{_, receipt, _, _, _, _} _: failure_after_status(
      context,
      receipt,
      result,
      aborted,
      invocation,
      next
    )

def failure_interrupted(
  context: Context,
  result: ProviderResult,
  accepted: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match accepted:
    case True{}: issue(
      context,
      FailureInterruptObserved{result},
      ObserveInterrupted{},
      invocation,
      next
    )
    case False{}: issue(
      context,
      FailureStatusAfterInterrupt{result},
      ReadRequestState{},
      invocation,
      next
    )

def recovery_join(context: Context, invocation: Nat, next: Nat) -> Step:
  issue(context, RecoveryJoined{}, SettleJoined{BackendReason{}, False{}}, invocation, next)

def recovery_settle(
  +context: Context,
  +receipt: Receipt,
  aborted: Bool,
  invocation: Nat,
  next: Nat
) -> Step:
  match receipt aborted:
    case Issued{_} _: issue(
      receipt_context(context, receipt),
      RecoverySettling{NeverSent{}},
      SettleRequest{NeverSent{}, False{}},
      invocation,
      next
    )
    case Started{_} _: issue(
      receipt_context(context, receipt),
      RecoverySettling{BackendFailure{}},
      SettleRequest{BackendFailure{}, False{}},
      invocation,
      next
    )
    case Interrupted{_} True{}: issue(
      receipt_context(context, receipt),
      RecoverySettling{RequestInterrupted{}},
      SettleRequest{RequestInterrupted{}, False{}},
      invocation,
      next
    )
    case Interrupted{_} False{}: issue(
      receipt_context(context, receipt),
      RecoverySettling{BackendFailure{}},
      SettleRequest{BackendFailure{}, False{}},
      invocation,
      next
    )
    case _ _: recovery_join(context, invocation, next)

def recovery_deny_step(context: Context, +step: Auth.Step, invocation: Nat, next: Nat) -> Step:
  match step:
    case Auth.Await{_, _, _, Auth.Request{_, _, command}}:
      issue(context, RecoveryDeny{step}, Authorization{command}, invocation, next)
    case Auth.NotAuthorized{_}: recovery_join(context, invocation, next)
    case Auth.Aborted{token}: fault(context, token, invocation, next)
    case _: Rejected{}

def recovery_reviewing(context: Context, reviewing: Bool, +invocation: Nat, +next: Nat) -> Step:
  match reviewing:
    case True{}: recovery_deny_step(
      context,
      Auth.deny(Auth.Lost{}, invocation, 0n),
      invocation,
      next
    )
    case False{}: recovery_join(context, invocation, next)

def recovery_deny_reply(
  context: Context,
  step: Auth.Step,
  response: Auth.Response,
  +invocation: Nat,
  next: Nat
) -> Step:
  match step:
    case Auth.Await{_, +id, _, _}: recovery_deny_step(
      context,
      Auth.resume(step, Auth.Reply{invocation, id, response}),
      invocation,
      next
    )
    case _: Rejected{}

def recovery_escaped(+context: Context, aborted: Bool, invocation: Nat, next: Nat) -> Step:
  match context aborted:
    case Context{_, Unissued{}, _, _, _, _} _: issue(
      context,
      RecoveryReviewing{},
      ReadReviewing{},
      invocation,
      next
    )
    case Context{_, Started{_}, _, _, _, _} True{}: issue(
      context,
      RecoveryInterrupt{},
      InterruptRequest{},
      invocation,
      next
    )
    case Context{_, receipt, _, _, _, _} _: recovery_settle(
      context,
      receipt,
      aborted,
      invocation,
      next
    )

def recovery_aborted(context: Context, aborted: Bool, invocation: Nat, next: Nat) -> Step:
  match aborted:
    case True{}: issue(
      context,
      RecoveryEscaped{},
      ObserveEscaped{RequestInterrupted{}},
      invocation,
      next
    )
    case False{}: issue(
      context,
      RecoveryEscaped{},
      ObserveEscaped{BackendFailure{}},
      invocation,
      next
    )

def recovery_interrupt(context: Context, accepted: Bool, invocation: Nat, next: Nat) -> Step:
  match accepted:
    case True{}: issue(context, RecoveryInterrupted{}, ObserveInterrupted{}, invocation, next)
    case False{}: issue(context, RecoveryInterruptStatus{}, ReadRequestState{}, invocation, next)

def final_completed(context: Context, completed: Bool, invocation: Nat, next: Nat) -> Step:
  match completed:
    case True{}: finished(context)
    case False{}: issue(context, FinallyReuse{}, ReleaseReuseClaim{}, invocation, next)

def advance(
  +context: Context,
  phase: Phase,
  response: Response,
  +invocation: Nat,
  +next: Nat
) -> Step:
  match phase response:
    case _ Failed{token}: fault(context, token, invocation, next)
    case PolicyStart{} Flag{valid}: policy_started(context, valid, invocation, next)
    case ReviewStart{} Flag{valid}: started_review(context, valid, invocation, next)
    case BackendGate{} Ack{}: issue(context, AdmissionActive{}, ReadJobActive{}, invocation, next)
    case AdmissionActive{} Flag{valid}: admission_active(context, valid, invocation, next)
    case AdmissionCurrent{} Flag{valid}: admit_current(context, valid, invocation, next)
    case BeforeEvaluate{} Ack{}: issue(context, Controlled{}, DecodeControlled{}, invocation, next)
    case Controlled{} Ack{}: authorized_result(
      context,
      ForProvider{},
      Auth.initial(invocation),
      invocation,
      next
    )
    case Authorizing{use, step} Authorized{response}: authorization_reply(
      context,
      use,
      step,
      response,
      invocation,
      next
    )
    case Provider{} ProviderReturned{result}: provider_returned(context, result, invocation, next)
    case DeniedAnalytics{+reason} Ack{}: issue(
      context,
      DeniedJoined{reason},
      SettleJoined{reason, False{}},
      invocation,
      next
    )
    case DeniedJoined{reason} Ack{}: denied_joined(context, reason, invocation, next)
    case DeniedNotice{} Ack{}: issue(
      context,
      DeniedActivity{},
      RecordActivity{UnavailableActivity{}},
      invocation,
      next
    )
    case DeniedActivity{} Ack{}: release(context, FinishRelease{}, invocation, next)
    case RoundActive{} Flag{value}: round_active(context, value, invocation, next)
    case RoundRuntime{} Flag{value}: round_runtime(context, value, invocation, next)
    case RoundReported{} Flag{value}: round_reported(context, value, invocation, next)
    case CurrentRuntime{} Flag{value}: current_runtime(context, value, invocation, next)
    case CurrentActive{} Flag{value}: current_active(context, value, invocation, next)
    case CurrentSource{} Flag{value}: issue(
      context,
      EvaluatedStatus{value},
      ReadRequestState{},
      invocation,
      next
    )
    case EvaluatedStatus{current} RequestState{receipt}: evaluated_status(
      context,
      receipt,
      current,
      invocation,
      next
    )
    case EvaluatedSettlement{+outcome} RequestSettled{disposition}:
      issue(
        did_settle(context),
        EvaluatedObservation{disposition},
        ObserveSettled{outcome},
        invocation,
        next
      )
    case EvaluatedObservation{disposition} Ack{}: evaluated_observed(
      context,
      disposition,
      invocation,
      next
    )
    case DiscardObserved{} Ack{}: release(context, FinishRelease{}, invocation, next)
    case DemoRecorded{disposition} Ack{}: issue(
      context,
      CacheStored{disposition},
      StoreEvaluation{},
      invocation,
      next
    )
    case CacheStored{disposition} Ack{}: issue(
      context,
      CacheClaimReleased{disposition},
      ReleaseReuseClaim{},
      invocation,
      next
    )
    case CacheClaimReleased{disposition} Ack{}: evaluated_activity(
      context,
      disposition,
      invocation,
      next
    )
    case EvaluatedActivity{disposition} Ack{}: retention_or_settle(
      context,
      disposition,
      invocation,
      next
    )
    case NonRetainedFate{disposition} Ack{}: nonretained_observed(
      context,
      disposition,
      invocation,
      next
    )
    case NonRetainedRetired{disposition} Ack{}: nonretained_join(
      context,
      disposition,
      invocation,
      next
    )
    case NonRetainedJoined{} Ack{}: issue(
      context,
      NonRetainedCompleted{},
      MarkCompleted{},
      invocation,
      next
    )
    case NonRetainedCompleted{} Ack{}: issue(
      context,
      ReleaseNativeUnit{RecordOutcomeRelease{}},
      ReleaseUnit{},
      invocation,
      next
    )
    case ReleaseReuse{+target} Ack{}: issue(
      context,
      ReleaseNativeUnit{target},
      ReleaseUnit{},
      invocation,
      next
    )
    case ReleaseNativeUnit{target} Ack{}: released(context, target, invocation, next)
    case OutcomeRecorded{} Ack{}: finalize(context, invocation, next)
    case RetentionActive{} Flag{value}: retention_active(context, value, invocation, next)
    case RetentionInactiveRetired{} Ack{}: issue(
      context,
      ExistingReleased{},
      ReleaseUnit{},
      invocation,
      next
    )
    case RetentionCandidates{} AdviceCandidates{values}: retained_existing(
      context,
      first_matching(values),
      invocation,
      next
    )
    case ExistingPublished{} Published{publication}: issue(
      context,
      ExistingRecorded{},
      RecordJoined{publication},
      invocation,
      next
    )
    case ExistingRecorded{} Ack{}: issue(
      context,
      ExistingRetired{},
      RetireUnitWork{},
      invocation,
      next
    )
    case ExistingRetired{} Ack{}: issue(
      context,
      ExistingReleased{},
      ReleaseUnit{},
      invocation,
      next
    )
    case ExistingReleased{} Ack{}: record_outcome(context, invocation, next)
    case AdviceInsertedPhase{} AdviceInserted{+tail}: issue(
      context,
      AdviceObserved{tail},
      ObserveRetained{tail},
      invocation,
      next
    )
    case AdviceObserved{+tail} Ack{}: issue(
      context,
      AdvicePreserved{tail},
      PreserveAdviceTail{tail},
      invocation,
      next
    )
    case AdvicePreserved{+tail} Ack{}: issue(
      context,
      AdviceDriven{},
      DriveAdviceTail{tail},
      invocation,
      next
    )
    case AdviceDriven{} Ack{}: record_outcome(context, invocation, next)
    case FailureStatus{result} RequestState{receipt}: issue(
      receipt_context(context, receipt),
      FailureAborted{result},
      ReadAborted{},
      invocation,
      next
    )
    case FailureAborted{result} Flag{value}: failure_abort(context, result, value, invocation, next)
    case FailureInterrupted{result} Flag{accepted}: failure_interrupted(
      context,
      result,
      accepted,
      invocation,
      next
    )
    case FailureInterruptObserved{result} Ack{}: issue(
      context,
      FailureStatusAfterInterrupt{result},
      ReadRequestState{},
      invocation,
      next
    )
    case FailureStatusAfterInterrupt{result} RequestState{receipt}: failure_after_status(
      context,
      receipt,
      result,
      True{},
      invocation,
      next
    )
    case FailureSettling{+outcome, classification} RequestSettled{_}:
      issue(
        did_settle(context),
        FailureObserved{classification},
        ObserveSettled{outcome},
        invocation,
        next
      )
    case FailureCompleting{classification} Flag{True{}}: failure_notice(
      context,
      classification,
      invocation,
      next
    )
    case FailureCompleting{_} Flag{False{}}: finalize(context, invocation, next)
    case FailureObserved{classification} Ack{}: failure_notice(
      context,
      classification,
      invocation,
      next
    )
    case FailureJoined{reason} Ack{}: failed_joined(context, reason, invocation, next)
    case FailureNotice{} Ack{}: issue(
      context,
      FailureActivity{},
      RecordActivity{UnavailableActivity{}},
      invocation,
      next
    )
    case FailureActivity{} Ack{}: finalize(context, invocation, next)
    case RecoveryStatus{} RequestState{receipt}: issue(
      receipt_context(context, receipt),
      RecoveryAborted{},
      ReadAborted{},
      invocation,
      next
    )
    case RecoveryAborted{} Flag{value}: recovery_aborted(context, value, invocation, next)
    case RecoveryEscaped{} Ack{}: issue(
      context,
      RecoveryAfterEscapedAborted{},
      ReadAborted{},
      invocation,
      next
    )
    case RecoveryAfterEscapedAborted{} Flag{value}: recovery_escaped(
      context,
      value,
      invocation,
      next
    )
    case RecoveryReviewing{} Flag{value}: recovery_reviewing(context, value, invocation, next)
    case RecoveryDeny{step} Authorized{response}: recovery_deny_reply(
      context,
      step,
      response,
      invocation,
      next
    )
    case RecoveryInterrupt{} Flag{value}: recovery_interrupt(context, value, invocation, next)
    case RecoveryInterrupted{} Ack{}: issue(
      context,
      RecoveryInterruptStatus{},
      ReadRequestState{},
      invocation,
      next
    )
    case RecoveryInterruptStatus{} RequestState{receipt}: recovery_settle(
      context,
      receipt,
      True{},
      invocation,
      next
    )
    case RecoverySettling{+outcome} RequestSettled{_}: issue(
      did_settle(context),
      RecoveryObserved{},
      ObserveSettled{outcome},
      invocation,
      next
    )
    case RecoveryObserved{} Ack{}: recovery_join(context, invocation, next)
    case RecoveryJoined{} Ack{}: issue(
      context,
      RecoveryDebug{},
      RecordDebugFailure{},
      invocation,
      next
    )
    case RecoveryDebug{} Ack{}: issue(
      context,
      RecoveryRuntime{},
      ReadRuntimeActive{},
      invocation,
      next
    )
    case RecoveryRuntime{} Flag{True{}}: issue(
      context,
      RecoveryActivity{},
      RecordActivity{UnavailableActivity{}},
      invocation,
      next
    )
    case RecoveryRuntime{} Flag{False{}}: finalize(context, invocation, next)
    case RecoveryActivity{} Ack{}: finalize(context, invocation, next)
    case FinallyCompleted{} Flag{value}: final_completed(context, value, invocation, next)
    case FinallyReuse{} Ack{}: issue(context, FinallyUnit{}, ReleaseUnit{}, invocation, next)
    case FinallyUnit{} Ack{}: finished(context)
    case _ _: Rejected{}

def correlated(
  valid: Bool,
  context: Context,
  phase: Phase,
  response: Response,
  invocation: Nat,
  next: Nat
) -> Step:
  match valid:
    case True{}: advance(context, phase, response, invocation, next)
    case False{}: Rejected{}

def resume(step: Step, reply: Reply) -> Step:
  match step reply:
    case Await{+invocation, +id, context, phase, Request{owner, request, _, _}} Reply{
      actual,
      received,
      response
    }:
      correlated(
        Bool.and(
          Nat.is_eq(invocation, owner),
          Bool.and(
            Nat.is_eq(id, request),
            Bool.and(Nat.is_eq(invocation, actual), Nat.is_eq(id, received))
          )
        ),
        context,
        phase,
        response,
        invocation,
        Nat.add(id, 1n)
      )
    case _ _: Rejected{}
