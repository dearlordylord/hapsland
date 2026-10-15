import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "PublicationRetention.Next" }
export type Input = Tagged<
  "Input",
  { readonly evaluations: number; readonly current: number; readonly authority: boolean }
>
export type Lens = Tagged<"Lens", { readonly object: number; readonly fields: List<string> }>
export type Query =
  | Tagged<"Iterator", { readonly array: number }>
  | Tagged<"IteratorNext", { readonly iterator: number }>
  | Tagged<"Read", { readonly value: Lens }>
  | Tagged<"Equal", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"InputEqual", { readonly left: number; readonly right: number }>
  | Tagged<"CurrentMethod">
  | Tagged<"CurrentWork", { readonly method: number; readonly prepared: number }>
  | Tagged<"IsArray", { readonly value: number }>
  | Tagged<"Length", { readonly array: number }>
  | Tagged<"Element", { readonly array: number; readonly index: number }>
export type Response =
  | Tagged<"Handle", { readonly value: number }>
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Count", { readonly value: number }>
  | Tagged<"End">
  | Tagged<"Missing">
export type Frame = Tagged<"Frame", { readonly invocation: number; readonly request: number }>
export type Status = Tagged<"Current"> | Tagged<"Stale"> | Tagged<"Unavailable">
export type Step =
  | Tagged<"Await", { readonly frame: Frame; readonly query: Query; readonly next: Next }>
  | Tagged<
      "Completed",
      { readonly status: Status; readonly evaluations: List<number>; readonly findings: List<number> }
    >
  | Tagged<"InvalidReply">
export type Reply = Tagged<
  "Reply",
  { readonly invocation: number; readonly request: number; readonly response: Response }
>
declare const core: {
  start(frame: Frame, input: Input): Step
  initial(invocation: number, input: Input): Step
  resume(step: Step, reply: Reply): Step
}
export default core
