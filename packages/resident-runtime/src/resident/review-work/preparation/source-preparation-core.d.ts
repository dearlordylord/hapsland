import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields

export type UnavailableReason = Tagged<"StaleRound"> | Tagged<"WrongStage">

export type WorkspaceRefusal =
  | Tagged<"CapacityRefused">
  | Tagged<"Unavailable", { readonly reason: UnavailableReason }>
  | Tagged<"InvalidMeasurement">

export type CandidateDiagnostic =
  | Tagged<"WorkspaceCapacity", { readonly requested_bytes: bigint }>
  | Tagged<"WorkspaceUnavailable", { readonly reason: UnavailableReason }>
  | Tagged<"WorkspacePanic">

export type CandidateAnalytics = Tagged<"CapacityRejected"> | Tagged<"PreparationFailed">

export type Command =
  | Tagged<"StartPolicySource">
  | Tagged<"StartObservation">
  | Tagged<"AwaitBackendGate">
  | Tagged<"ReadRuntimeActive">
  | Tagged<"DecodeControlled">
  | Tagged<"ReadCredentialRequired">
  | Tagged<"CheckCredentialShape">
  | Tagged<"VerifyObservationRoot">
  | Tagged<"CheckCredentialGeneration">
  | Tagged<"ReleaseJobReservation", { readonly early: boolean }>
  | Tagged<"CheckJobActive">
  | Tagged<"RecordPreparationFailureAnalytics">
  | Tagged<"RecordUnavailableActivity">
  | Tagged<"ReadEffectiveAnalytics">
  | Tagged<"CheckCandidateActive", { readonly candidate: bigint }>
  | Tagged<"AdmitCandidateWorkspace", { readonly candidate: bigint }>
  | Tagged<"PrepareCandidate", { readonly candidate: bigint; readonly preparation: bigint }>
  | Tagged<"ObserveCandidateDiagnostic", { readonly candidate: bigint; readonly diagnostic: CandidateDiagnostic }>
  | Tagged<"RejectCandidateCapacity">
  | Tagged<"RecordCandidateAnalytics", { readonly outcome: CandidateAnalytics }>
  | Tagged<"RecordCandidateUnavailable">
  | Tagged<"ReadExpectedActivity">
  | Tagged<"RecordPendingActivity", { readonly identities: List<bigint> }>
  | Tagged<"CompletePolicySource">
  | Tagged<"CompleteObservation">
  | Tagged<"AfterPrepare">

export type Response =
  | Tagged<"GateAccepted", { readonly value: boolean }>
  | Tagged<"ExpectedActivity", { readonly identities: List<bigint> }>
  | Tagged<"Active", { readonly value: boolean }>
  | Tagged<"WorkspaceAdmitted", { readonly preparation: bigint }>
  | Tagged<"WorkspaceRefused", { readonly reason: WorkspaceRefusal; readonly requested_bytes: bigint }>
  | Tagged<"ObservationCommittedCancelled", { readonly token: bigint }>
  | Tagged<"ObservationCommittedFailure", { readonly token: bigint }>
  | Tagged<"ObservationCommittedDefect", { readonly token: bigint; readonly recoverable: boolean }>
  | Tagged<"CandidateContinued", { readonly value: boolean }>
  | Tagged<"Ack">
  | Tagged<"CompletionAccepted", { readonly value: boolean }>
  | Tagged<"Failed", { readonly token: bigint }>
  | Tagged<"Defect", { readonly token: bigint; readonly interrupted: boolean; readonly recoverable: boolean }>
  | Tagged<"Cancelled", { readonly token: bigint }>

declare const stateHandle: unique symbol
export type State = { readonly [stateHandle]: "SourcePreparation.State" }

export type Request = Tagged<"Request", { readonly invocation: bigint; readonly id: bigint; readonly command: Command }>

export type Reply = Tagged<"Reply", { readonly invocation: bigint; readonly id: bigint; readonly response: Response }>

export type Reason =
  | Tagged<"StartRefused">
  | Tagged<"SourceInactive">
  | Tagged<"SettingsRefused">
  | Tagged<"CandidateStopped">
  | Tagged<"PolicyRefused">
  | Tagged<"ObservationRefused">
  | Tagged<"TechnicalFailure", { readonly token: bigint }>
  | Tagged<"DefectFailure", { readonly token: bigint }>
  | Tagged<"InvocationCancelled", { readonly token: bigint }>
  | Tagged<"ProtocolFailure">

export type Step =
  | Tagged<"Await", { readonly state: State; readonly request: Request }>
  | Tagged<"Finished">
  | Tagged<"Stopped", { readonly completed: boolean; readonly reason: Reason }>
  | Tagged<"Recovered", { readonly completed: boolean; readonly reason: Reason }>
  | Tagged<"Rejected">

declare const core: {
  initial(invocation: bigint, policy_required: boolean, controlled_present: boolean, candidates: List<bigint>): Step
  initial_after_gates(invocation: bigint, policy_required: boolean, candidates: List<bigint>): Step
  resume(step: Step, reply: Reply): Step
  permission(command: Command): bigint
}
export default core
