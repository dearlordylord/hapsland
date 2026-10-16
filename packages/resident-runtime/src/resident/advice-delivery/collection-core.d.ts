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
}
export default core
