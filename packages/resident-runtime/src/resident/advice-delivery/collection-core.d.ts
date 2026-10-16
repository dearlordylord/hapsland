import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

export type Command =
  | { readonly $: "AllocateToken" }
  | { readonly $: "OpenFresh"; readonly candidate: number }
  | { readonly $: "PullFresh"; readonly stream: number; readonly candidate: number }
  | { readonly $: "CloseStream"; readonly stream: number }
  | {
      readonly $: "Reserve" | "ReadDelivery" | "RemoveStale" | "Remove"
      readonly advice: number
      readonly token: number
    }
  | { readonly $: "Barrier"; readonly advice: number; readonly final: boolean }
  | { readonly $: "OpenRetained" | "CheckWork" | "RecordLimited" | "Release"; readonly advice: number }
  | { readonly $: "PullRetained"; readonly stream: number; readonly advice: number }
  | { readonly $: "OpenFindings"; readonly advice: number; readonly content: number }
  | { readonly $: "PullFinding"; readonly stream: number }
  | { readonly $: "Suppressed"; readonly advice: number; readonly stream: number; readonly finding: number }
  | { readonly $: "ObserveSuppressed"; readonly advice: number; readonly finding: number }
  | { readonly $: "Fit"; readonly advice: number; readonly retained: List<number>; readonly candidates: List<number> }
  | { readonly $: "PostCheck"; readonly has_fitting: boolean }
  | { readonly $: "Update"; readonly advice: number; readonly token: number; readonly findings: List<number> }
export type Disposition = { readonly $: "Retain" | "Retire" | "ReleaseCandidate" | "Other" }
export type Response =
  | { readonly $: "Ack" | "Exhausted" }
  | { readonly $: "Handle"; readonly handle: number }
  | { readonly $: "Fresh"; readonly advice: number; readonly same_id: boolean; readonly unleased: boolean }
  | { readonly $: "Owner"; readonly same_id: boolean; readonly same_pointer: boolean }
  | { readonly $: "Content"; readonly handle: number; readonly owned: boolean }
  | { readonly $: "Truth"; readonly value: boolean }
  | { readonly $: "Fitting"; readonly findings: List<number>; readonly limited: number }
  | { readonly $: "Route"; readonly disposition: Disposition }
export type Step =
  | {
      readonly $: "Await"
      readonly state: unknown
      readonly request: {
        readonly $: "Request"
        readonly invocation: number
        readonly id: number
        readonly command: Command
      }
    }
  | { readonly $: "Empty" | "Rejected" }
  | { readonly $: "Selected"; readonly token: number; readonly advice: List<number> }
declare const core: {
  initial(invocation: number, candidates: List<number>): Step
  resume(
    step: Step,
    reply: { readonly $: "Reply"; readonly invocation: number; readonly id: number; readonly response: Response }
  ): Step
  atomic(step: Step): boolean
  collect_initial(invocation: number, composed: boolean, turn_end: boolean): FlowStep
  collect_resume(
    step: FlowStep,
    reply: {
      readonly $: "FlowReply"
      readonly invocation: number
      readonly id: number
      readonly response: FlowResponse
    }
  ): FlowStep
  collect_atomic(step: FlowStep): boolean
}
export default core

export type FlowCommand =
  | { readonly $: "CReadCredential" }
  | { readonly $: "CCredentialMetadata"; readonly advice: number }
  | {
      readonly $:
        | "CCaptureFrame"
        | "CReadDeciding"
        | "CExpirePending"
        | "CPruneNotices"
        | "CCaptureCredential"
        | "COpenSnapshots"
        | "CHandoffClock"
    }
  | { readonly $: "CSetStop"; readonly value: boolean }
  | { readonly $: "COpenAdvice"; readonly copy: boolean }
  | { readonly $: "CPullAdvice" | "CPullSnapshot"; readonly stream: number }
  | {
      readonly $:
        | "CCheckCredential"
        | "CRemoveCredential"
        | "CCheckLease"
        | "CSetEligibility"
        | "CReadEligibility"
        | "CCheckExpiry"
        | "CHandoffOffers"
        | "CDeliveryFindings"
        | "CResponseContent"
      readonly advice: number
    }
  | { readonly $: "CCandidateFacts" | "CResponseFindings"; readonly advice: number; readonly content: number }
  | {
      readonly $: "CCandidateCheck"
      readonly same_scope: boolean
      readonly unleased: boolean
      readonly unsuppressed: boolean
      readonly authority: boolean
    }
  | { readonly $: "CCompare"; readonly left: number; readonly right: number }
  | { readonly $: "CPrimitive"; readonly command: Command }
  | { readonly $: "CPullOwner"; readonly stream: number; readonly advice: number }
  | {
      readonly $: "CHandoffInfo"
      readonly advice: number
      readonly retained: { readonly $: "Some"; readonly value: number } | { readonly $: "None" }
      readonly token: number
    }
  | {
      readonly $: "CFinalRoute"
      readonly info: number
      readonly credential_authorized: boolean
      readonly expired: boolean
      readonly current: boolean
    }
  | { readonly $: "CRenew"; readonly advice: number; readonly token: number }
  | { readonly $: "CFitHandoff"; readonly offers: List<number> }
  | { readonly $: "CHandoffLimited"; readonly offer: number }
export type FlowResponse =
  | { readonly $: "RCredentialMetadata"; readonly absent: boolean; readonly environment_only: boolean }
  | {
      readonly $: "RCredentialState"
      readonly present: boolean
      readonly generation: boolean
      readonly suspended: boolean
    }
  | { readonly $: "RAck" | "RExhausted" }
  | { readonly $: "RTruth"; readonly value: boolean }
  | { readonly $: "RHandle"; readonly handle: number }
  | { readonly $: "RAdvice"; readonly advice: number }
  | { readonly $: "RSnapshot"; readonly advice: number; readonly content: number; readonly leased: boolean }
  | { readonly $: "RCandidate"; readonly same_scope: boolean; readonly unleased: boolean; readonly authority: boolean }
  | { readonly $: "RPrimitive"; readonly response: Response }
  | { readonly $: "ROwner"; readonly advice: number; readonly same_id: boolean }
  | {
      readonly $: "RInfo"
      readonly handle: number
      readonly owner: boolean
      readonly generation: boolean
      readonly has_delivery: boolean
    }
  | { readonly $: "RRoute"; readonly disposition: Disposition }
  | { readonly $: "RFindings"; readonly owned: boolean; readonly findings: List<number> }
  | { readonly $: "RItems"; readonly items: List<number> }
  | { readonly $: "RFitting"; readonly selected: List<number>; readonly limited: List<number> }
export type FlowStep =
  | {
      readonly $: "FlowAwait"
      readonly state: unknown
      readonly request: {
        readonly $: "FlowRequest"
        readonly invocation: number
        readonly id: number
        readonly command: FlowCommand
      }
    }
  | { readonly $: "FlowEmpty" | "FlowRejected" }
  | { readonly $: "FlowDone"; readonly token: number; readonly advice: List<number>; readonly findings: List<number> }
