import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "PublicationRetention.Next" }
export type Input = Tagged<
  "Input",
  { readonly evaluations: bigint; readonly current: bigint; readonly authority: boolean }
>
export type Lens = Tagged<"Lens", { readonly object: bigint; readonly fields: List<string> }>
export type Query =
  | Tagged<"Iterator", { readonly array: bigint }>
  | Tagged<"IteratorNext", { readonly iterator: bigint }>
  | Tagged<"Read", { readonly value: Lens }>
  | Tagged<"Equal", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"InputEqual", { readonly left: bigint; readonly right: bigint }>
  | Tagged<"CurrentWork", { readonly prepared: bigint }>
  | Tagged<"IsArray", { readonly value: bigint }>
  | Tagged<"Length", { readonly array: bigint }>
  | Tagged<"Element", { readonly array: bigint; readonly index: bigint }>
export type Response =
  | Tagged<"Handle", { readonly value: bigint }>
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Count", { readonly value: bigint }>
  | Tagged<"End">
  | Tagged<"Missing">
export type Frame = Tagged<"Frame", { readonly invocation: bigint; readonly request: bigint }>
export type Status = Tagged<"Current"> | Tagged<"Stale"> | Tagged<"Unavailable">
export type Step =
  | Tagged<"Await", { readonly frame: Frame; readonly query: Query; readonly next: Next }>
  | Tagged<
      "Completed",
      { readonly status: Status; readonly evaluations: List<bigint>; readonly findings: List<bigint> }
    >
  | Tagged<"InvalidReply">
export type Reply = Tagged<
  "Reply",
  { readonly invocation: bigint; readonly request: bigint; readonly response: Response }
>
declare const core: { initial(invocation: bigint, input: Input): Step; resume(step: Step, reply: Reply): Step }
export default core
