import type { Imported } from "./collection-root-codec.ts"
import type { FlowCommand, FlowResponse, FlowStep } from "../collection-core.js"
import type { GInput, GCommand, GResponse, RInput, RCommand, RResponse } from "./handoff-core.js"
export type RootInput = {
  readonly $: "RootInput"
  readonly gate: Imported<GInput, "Handoff.">
  readonly report: boolean
}
export type RootCommand =
  | { readonly $: "RootGate"; readonly command: Imported<GCommand, "Handoff."> }
  | { readonly $: "RootCollect"; readonly command: Imported<FlowCommand, "../Collection."> }
  | { readonly $: "RootDecode"; readonly result: Imported<FlowStep, "../Collection."> }
  | { readonly $: "RootReserve"; readonly command: Imported<RCommand, "Handoff."> }
  | { readonly $: "RootWorkState" }
export type RootResponse =
  | { readonly $: "RootGated"; readonly response: Imported<GResponse, "Handoff."> }
  | { readonly $: "RootCollected"; readonly response: Imported<FlowResponse, "../Collection."> }
  | { readonly $: "RootDecoded"; readonly input: Imported<RInput, "Handoff.">; readonly empty: boolean }
  | { readonly $: "RootReserved"; readonly response: Imported<RResponse, "Handoff."> }
  | { readonly $: "RootWorkStateRead" }
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
      readonly result: { readonly $: "RootSelected" | "RootEmpty" | "RootPending" | "RootUnsupported" }
    }
  | { readonly $: "RootRejected" }
declare const core: {
  initial(invocation: number, input: RootInput): RootStep
  resume(step: RootStep, reply: RootReply): RootStep
  atomic(step: RootStep): boolean
}
export default core
