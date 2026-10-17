import type { Imported } from "./collection-root-codec.ts"
import type { FlowCommand, FlowResponse, FlowStep } from "../collection-core.js"
import type { GInput, GCommand, GResponse, RInput, RCommand, RResponse } from "./handoff-core.js"
export type RootInput = {
  readonly $: "RootInput"
  readonly gate: Imported<GInput, "Handoff.">
  readonly report: boolean
}
export type RootAdvice = { readonly $: "RootAdvice"; readonly handle: number; readonly partition: string }
export type RootCommand =
  | { readonly $: "RootGate"; readonly command: Imported<GCommand, "Handoff."> }
  | { readonly $: "RootCollect"; readonly command: Imported<FlowCommand, "../Collection."> }
  | { readonly $: "RootDecode"; readonly result: Imported<FlowStep, "../Collection."> }
  | { readonly $: "RootReserve"; readonly command: Imported<RCommand, "Handoff."> }
  | { readonly $: "RootWorkState" }
  | { readonly $: "RootEditGate" | "RootEditStartPass" | "RootEditStatus" | "RootEditWorkCount" | "RootEditSleep" }
  | { readonly $: "RootEditExpired"; readonly advice: number }
export type RootResponse =
  | { readonly $: "RootGated"; readonly response: Imported<GResponse, "Handoff."> }
  | { readonly $: "RootCollected"; readonly response: Imported<FlowResponse, "../Collection."> }
  | { readonly $: "RootDecoded"; readonly input: Imported<RInput, "Handoff.">; readonly empty: boolean }
  | { readonly $: "RootReserved"; readonly response: Imported<RResponse, "Handoff."> }
  | { readonly $: "RootWorkStateRead" }
  | { readonly $: "RootDirectDecoded" | "RootEditStarted" | "RootEditSlept" | "RootEditTimedOut" | "RootEditLost" }
  | { readonly $: "RootEditDecoded"; readonly advice: boolean }
  | { readonly $: "RootEditGated"; readonly proceed: boolean }
  | {
      readonly $: "RootEditAdvice"
      readonly values: import("@hapsland/source-artifacts/direct-event/value/codec").List<RootAdvice>
    }
  | { readonly $: "RootEditExpiry"; readonly expired: boolean }
  | { readonly $: "RootEditCount"; readonly count: number }
export type RootRequest = {
  readonly $: "RootRequest"
  readonly invocation: number
  readonly id: number
  readonly command: RootCommand
}
export type RootReply = {
  readonly $: "RootReply"
  readonly invocation: number
  readonly id: number
  readonly response: RootResponse
}
export type RootStep =
  | {
      readonly $: "RootAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: RootRequest
    }
  | {
      readonly $: "RootDone"
      readonly result: {
        readonly $:
          | "RootSelected"
          | "RootEmpty"
          | "RootPending"
          | "RootUnsupported"
          | "RootEditPending"
          | "RootEditEmpty"
          | "RootEditUnavailable"
      }
    }
  | { readonly $: "RootRejected" }
declare const core: {
  initial(invocation: number, input: RootInput): RootStep
  direct_initial(invocation: number, composed: boolean, turn_end: boolean): RootStep
  edit_initial(invocation: number, partition: string): RootStep
  resume(step: RootStep, reply: RootReply): RootStep
  atomic(step: RootStep): boolean
}
export default core
