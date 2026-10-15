import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields

export type UnavailableReason = Tagged<"StaleRound"> | Tagged<"WrongStage">

export type WorkspaceRefusal =
  | Tagged<"CapacityRefused">
  | Tagged<"Unavailable", { readonly reason: UnavailableReason }>
  | Tagged<"InvalidMeasurement">

export type CandidateDiagnostic =
  | Tagged<"WorkspaceCapacity", { readonly requested_bytes: number }>
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
  | Tagged<"CheckCandidateActive", { readonly candidate: number }>
  | Tagged<"AdmitCandidateWorkspace", { readonly candidate: number }>
  | Tagged<"PrepareCandidate", { readonly candidate: number; readonly preparation: number }>
  | Tagged<"ObserveCandidateDiagnostic", { readonly candidate: number; readonly diagnostic: CandidateDiagnostic }>
  | Tagged<"RejectCandidateCapacity">
  | Tagged<"RecordCandidateAnalytics", { readonly outcome: CandidateAnalytics }>
  | Tagged<"RecordCandidateUnavailable">
  | Tagged<"ReadExpectedActivity">
  | Tagged<"RecordPendingActivity", { readonly identities: List<number> }>
  | Tagged<"CompletePolicySource">
  | Tagged<"CompleteObservation">
  | Tagged<"AfterPrepare">

export type Response =
  | Tagged<"GateAccepted", { readonly value: boolean }>
  | Tagged<"ExpectedActivity", { readonly identities: List<number> }>
  | Tagged<"Active", { readonly value: boolean }>
  | Tagged<"WorkspaceAdmitted", { readonly preparation: number }>
  | Tagged<"WorkspaceRefused", { readonly reason: WorkspaceRefusal; readonly requested_bytes: number }>
  | Tagged<"ObservationCommittedCancelled", { readonly token: number }>
  | Tagged<"ObservationCommittedFailure", { readonly token: number }>
  | Tagged<"ObservationCommittedDefect", { readonly token: number; readonly recoverable: boolean }>
  | Tagged<"CandidateContinued", { readonly value: boolean }>
  | Tagged<"Ack">
  | Tagged<"CompletionAccepted", { readonly value: boolean }>
  | Tagged<"Failed", { readonly token: number }>
  | Tagged<"Defect", { readonly token: number; readonly interrupted: boolean; readonly recoverable: boolean }>
  | Tagged<"Cancelled", { readonly token: number }>

declare const stateHandle: unique symbol
export type State = { readonly [stateHandle]: "SourcePreparation.State" }

export type Request = Tagged<"Request", { readonly invocation: number; readonly id: number; readonly command: Command }>

export type Reply = Tagged<"Reply", { readonly invocation: number; readonly id: number; readonly response: Response }>

export type Reason =
  | Tagged<"StartRefused">
  | Tagged<"SourceInactive">
  | Tagged<"SettingsRefused">
  | Tagged<"CandidateStopped">
  | Tagged<"PolicyRefused">
  | Tagged<"ObservationRefused">
  | Tagged<"TechnicalFailure", { readonly token: number }>
  | Tagged<"DefectFailure", { readonly token: number }>
  | Tagged<"InvocationCancelled", { readonly token: number }>
  | Tagged<"ProtocolFailure">

export type Step =
  | Tagged<"Await", { readonly state: State; readonly request: Request }>
  | Tagged<"Finished">
  | Tagged<"Stopped", { readonly completed: boolean; readonly reason: Reason }>
  | Tagged<"Recovered", { readonly completed: boolean; readonly reason: Reason }>
  | Tagged<"Rejected">

declare const core: {
  initial(invocation: number, policy_required: boolean, controlled_present: boolean, candidates: List<number>): Step
  initial_after_gates(invocation: number, policy_required: boolean, candidates: List<number>): Step
  resume(step: Step, reply: Reply): Step
  permission(command: Command): number
}
export default core
