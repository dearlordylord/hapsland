import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
export type Input = Tagged<"Input", { readonly policy_unit: boolean }>
export type Receipt =
  | Tagged<"Unissued">
  | Tagged<"Issued" | "Started" | "Interrupted" | "Settled", { readonly request: number }>
export type Review = Tagged<"Review", { readonly count: number; readonly bytes: number }>
export type ProviderResult =
  | Tagged<"Evaluated", { readonly review: Review }>
  | Tagged<"Backend" | "Timeout" | "InputRefused" | "Missing">
export type Outcome = Tagged<
  "Clear" | "Finding" | "NeverSent" | "RequestInterrupted" | "RequestTimeout" | "BackendFailure"
>
export type Disposition = Tagged<
  "FindingRetained" | "ClearSettled" | "StaleClearSettled" | "StaleFindingRetired" | "Unavailable" | "Ignored" | "Stale"
>
export type Reason = Tagged<"LostReason" | "CredentialReason" | "BackendReason" | "StaleReason">
export type Activity = Tagged<"IncompleteActivity" | "UnavailableActivity" | "ClearActivity" | "FindingsActivity">
export type Fate = Tagged<"DiscardedFate" | "StaleFate">
export type Invariant = Tagged<"ResultWithoutStart" | "RoundOutcomeRefused" | "MissingReview">
export type Candidate = Tagged<"Candidate", { readonly handle: number; readonly matching: boolean }>
export type SignalScope = Tagged<"WorkSignal" | "NativeSignal">

export type AuthorizationFacts = Tagged<
  "Authorization.Facts",
  {
    readonly credential_ready: boolean
    readonly selected: boolean
    readonly current_work: boolean
    readonly physical_available: boolean
  }
>
export type AuthorizationCommand =
  | Tagged<
      | "Authorization.ReadEffectiveAnalytics"
      | "Authorization.ValidateControlled"
      | "Authorization.ReadCredentialRequired"
    >
  | Tagged<
      "Authorization.CheckCredentialShape" | "Authorization.ResolveCredential" | "Authorization.CheckCredentialName",
      { readonly required: boolean }
    >
  | Tagged<
      | "Authorization.VerifyInitialRoot"
      | "Authorization.AuthorizationBarrier"
      | "Authorization.CheckCredentialGeneration"
      | "Authorization.CredentialBarrier"
    >
  | Tagged<
      "Authorization.CheckProviderIdentity" | "Authorization.VerifyDispatchRoot" | "Authorization.ObserveRootRefusal"
    >
  | Tagged<"Authorization.ReadFileAdmission", { readonly credential_ready: boolean }>
  | Tagged<"Authorization.ObserveFileAdmission", { readonly selected: boolean; readonly admitted: boolean }>
  | Tagged<"Authorization.ReadCurrentWork" | "Authorization.ReadPhysicalAvailable">
  | Tagged<"Authorization.ReadyRequest", { readonly facts: AuthorizationFacts }>
  | Tagged<"Authorization.DenyRequest" | "Authorization.ArmInterruption" | "Authorization.ObserveUnavailable">
  | Tagged<"Authorization.ObserveIssued", { readonly request: number }>
export type AuthorizationDecision =
  | Tagged<"Authorization.Issued", { readonly request: number }>
  | Tagged<"Authorization.Unavailable" | "Authorization.Stale">
export type AuthorizationResponse =
  | Tagged<"Authorization.Ack">
  | Tagged<"Authorization.Flag", { readonly value: boolean }>
  | Tagged<"Authorization.Resolved", { readonly present: boolean }>
  | Tagged<"Authorization.FileAdmission", { readonly selected: boolean; readonly admitted: boolean }>
  | Tagged<"Authorization.RequestDecision", { readonly decision: AuthorizationDecision }>
  | Tagged<"Authorization.Failed", { readonly token: number }>

export type Command =
  | Tagged<"StartPolicyUnit" | "StartReview" | "AwaitBackendGate" | "ReadJobActive" | "ReadCurrentWork">
  | Tagged<"EvaluationBarrier" | "DecodeControlled" | "RunProvider" | "ReadRuntimeActive">
  | Tagged<"Authorization", { readonly command: AuthorizationCommand }>
  | Tagged<"ReportRoundOutcome", { readonly review: Review }>
  | Tagged<"ReadRequestState" | "ReadAborted" | "InterruptRequest" | "ObserveInterrupted">
  | Tagged<"SettleRequest", { readonly outcome: Outcome; readonly current: boolean }>
  | Tagged<"CompleteUnavailable">
  | Tagged<"ObserveSettled" | "ObserveEscaped", { readonly outcome: Outcome }>
  | Tagged<"ObserveFate", { readonly fate: Fate }>
  | Tagged<"RecordDemoTerminal" | "RecordControlledOutcome", { readonly clear: boolean }>
  | Tagged<"StoreEvaluation" | "ReleaseReuseClaim">
  | Tagged<"RecordActivity", { readonly activity: Activity }>
  | Tagged<"RecordUnavailableAnalytics">
  | Tagged<"SettleJoined", { readonly reason: Reason; readonly clear: boolean }>
  | Tagged<"RecordOperationalFailure", { readonly reason: Reason }>
  | Tagged<"RetireUnitWork" | "MarkCompleted" | "ReleaseUnit" | "ReadAdviceCandidates">
  | Tagged<"PublishExisting", { readonly advice: number }>
  | Tagged<"RecordJoined", { readonly publication: number }>
  | Tagged<"InsertAdvice">
  | Tagged<"ObserveRetained" | "PreserveAdviceTail" | "DriveAdviceTail", { readonly tail: number }>
  | Tagged<"ReadReviewing" | "RecordDebugFailure" | "ReadCompleted">
  | Tagged<"RaiseInvariant", { readonly invariant: Invariant }>
export type Response =
  | Tagged<"Ack">
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Authorized", { readonly response: AuthorizationResponse }>
  | Tagged<"ProviderReturned", { readonly result: ProviderResult }>
  | Tagged<"RequestState", { readonly receipt: Receipt }>
  | Tagged<"RequestSettled", { readonly disposition: Disposition }>
  | Tagged<"AdviceCandidates", { readonly values: List<Candidate> }>
  | Tagged<"Published", { readonly publication: number }>
  | Tagged<"AdviceInserted", { readonly tail: number }>
  | Tagged<"Failed", { readonly token: number }>
export type Request = Tagged<
  "Request",
  { readonly invocation: number; readonly id: number; readonly signal: SignalScope; readonly command: Command }
>
export type Reply = Tagged<"Reply", { readonly invocation: number; readonly id: number; readonly response: Response }>
export type Completion = Tagged<
  "Completion",
  { readonly task_faults: List<number>; readonly final_faults: List<number> }
>

// Only the Bend module creates continuations. Native consumers see the command
// boundary and terminal receipts; they cannot construct or inspect its State.
declare const evaluationContinuation: unique symbol
type Continuation = { readonly [evaluationContinuation]: "Evaluation" }
export type Step = Continuation &
  (
    | Tagged<"Await", { readonly invocation: number; readonly id: number; readonly request: Request }>
    | Tagged<"FinishedEvaluation", { readonly result: Completion }>
    | Tagged<"Rejected">
  )
declare const core: {
  initial(input: Input, invocation: number): Step
  cleanup_initial(invocation: number): Step
  resume(step: Step, reply: Reply): Step
}
export default core
