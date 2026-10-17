import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
export type SMatch = { readonly $: "SUnavailable" } | { readonly $: "SCurrent"; readonly current: boolean }
export type SCommand =
  | { readonly $: "SVerify"; readonly member: number }
  | { readonly $: "SRecord"; readonly member: number; readonly current: boolean }
  | { readonly $: "SCheckDrop"; readonly remaining: number; readonly aborted: boolean }
  | { readonly $: "SClear" }
export type SResponse =
  | { readonly $: "SVerified"; readonly result: SMatch }
  | { readonly $: "STruth"; readonly value: boolean }
  | { readonly $: "SAck" }
export type SRequest = {
  readonly $: "SRequest"
  readonly invocation: number
  readonly id: number
  readonly command: SCommand
}
export type SReply = {
  readonly $: "SReply"
  readonly invocation: number
  readonly id: number
  readonly response: SResponse
}
export type SStep =
  | {
      readonly $: "SAwait"
      readonly invocation: number
      readonly id: number
      readonly phase: unknown
      readonly request: SRequest
    }
  | { readonly $: "SDone" | "SRejected" }
export type SCache =
  | { readonly $: "SClosed" | "SMissing" }
  | { readonly $: "SCaptured"; readonly oversize: boolean }
  | { readonly $: "SFailed"; readonly size_limit: boolean; readonly larger_limit: boolean }
export type SCaptureRoute = { readonly $: "SCaptureUnavailable" | "SCaptureRead" | "SCaptureCached" | "SCaptureLimit" }
declare const core: {
  source_initial(invocation: number, members: List<number>): SStep
  source_cleanup(invocation: number): SStep
  source_resume(step: SStep, reply: SReply): SStep
  source_capture(cache: SCache): SCaptureRoute
}
export default core
