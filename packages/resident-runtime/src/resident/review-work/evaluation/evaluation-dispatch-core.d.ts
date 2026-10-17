type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
export type Command = Tagged<
  | "CheckCredentialGeneration"
  | "ClaimDemoBudget"
  | "StartRequest"
  | "ObserveStarted"
  | "ReadAborted"
  | "InterruptRequest"
  | "ObserveInterrupted"
>
export type Response =
  | Tagged<"Ack">
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Failed", { readonly token: number }>
export type Request = Tagged<"Request", { readonly invocation: number; readonly id: number; readonly command: Command }>
export type Reply = Tagged<"Reply", { readonly invocation: number; readonly id: number; readonly response: Response }>
export type Terminal =
  | Tagged<"Dispatched" | "CredentialChanged" | "StartRefused" | "Rejected">
  | Tagged<"Aborted", { readonly token: number }>
declare const dispatchContinuation: unique symbol
export type Step = { readonly [dispatchContinuation]: "Dispatch" } & (
  | Tagged<"Await", { readonly invocation: number; readonly id: number; readonly request: Request }>
  | Terminal
)
declare const core: {
  initial(invocation: number): Step
  interruption_initial(invocation: number): Step
  resume(step: Step, reply: Reply): Step
}
export default core
