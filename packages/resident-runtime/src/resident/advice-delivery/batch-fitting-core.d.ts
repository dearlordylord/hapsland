import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

export type Mode =
  | { readonly $: "Findings" }
  | { readonly $: "CurrentFindings" }
  | { readonly $: "Notices"; readonly skip_unfitting: boolean }
export type Stream = { readonly $: "Retained" | "Candidates" | "CurrentOffers" | "NoticeOffers" }
type Batch = { readonly $: "Batch"; readonly mode: Mode; readonly staged: List<number>; readonly selected: List<number> }
export type Command =
  | { readonly $: "BeginCurrent" }
  | { readonly $: "Pull"; readonly stream: Stream }
  | { readonly $: "MeasureProspective"; readonly staged: List<number>; readonly index: number }
  | { readonly $: "MeasureSolo"; readonly index: number }
  | { readonly $: "OfferFinding"; readonly index: number; readonly retained: boolean; readonly selected_count: number; readonly prospective: number; readonly solo: number }
  | { readonly $: "NotifyLimited"; readonly index: number }
  | { readonly $: "OfferNotice"; readonly index: number; readonly prospective: number; readonly skip_unfitting: boolean }
export type Response =
  | { readonly $: "CurrentStarted" | "Exhausted" | "Selected" | "Limited" | "Omitted" | "Included" | "Skipped" | "Stopped" | "InvalidNotice" | "Ack" | "Failed" }
  | { readonly $: "Found"; readonly index: number }
  | { readonly $: "Measured"; readonly handle: number }
type Phase =
  | { readonly $: "CurrentStarting" }
  | { readonly $: "Pulling"; readonly batch: Batch; readonly stream: Stream }
  | { readonly $: "Prospective" | "FindingOffered"; readonly batch: Batch; readonly stream: Stream; readonly index: number }
  | { readonly $: "Solo"; readonly batch: Batch; readonly stream: Stream; readonly index: number; readonly prospective: number }
  | { readonly $: "LimitedPending"; readonly batch: Batch; readonly stream: Stream }
  | { readonly $: "NoticeOffered"; readonly batch: Batch; readonly index: number }
type State = { readonly $: "State"; readonly invocation: number; readonly next: number; readonly phase: Phase }
export type Step =
  | { readonly $: "Await"; readonly state: State; readonly request: { readonly $: "Request"; readonly invocation: number; readonly id: number; readonly command: Command } }
  | { readonly $: "Finished"; readonly selected: List<number> }
  | { readonly $: "Rejected" }
declare const core: {
  initial(invocation: number, mode: Mode): Step
  resume(step: Step, reply: { readonly $: "Reply"; readonly invocation: number; readonly id: number; readonly response: Response }): Step
  failure(): Extract<Step, { readonly $: "Finished" }>
}
export type BatchFitting = typeof core
export default core
