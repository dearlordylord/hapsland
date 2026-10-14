import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { Query as RetentionQuery, Response as RetentionResponse } from "./publication-retention-core.js"
type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "Publication.Next" }
type RetentionWire<Value> = Value extends { readonly $: infer Name extends string }
  ? { readonly $: Name extends "Con" | "Nil" ? Name : `PublicationRetention.${Name}` } & {
      readonly [Key in Exclude<keyof Value, "$">]: RetentionWire<Value[Key]>
    }
  : Value extends object
    ? { readonly [Key in keyof Value]: RetentionWire<Value[Key]> }
    : Value
export type Input = Tagged<
  "Input",
  { readonly observation: bigint; readonly evaluations: bigint; readonly context: bigint; readonly authority: boolean }
>
export type Lens = Tagged<"Lens", { readonly object: bigint; readonly fields: List<string> }>
export type Query =
  | Tagged<"Read", { readonly value: Lens }>
  | Tagged<"Truthy", { readonly value: Lens }>
  | Tagged<"Equal", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"AdviceeEqual", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"EqualValues", { readonly left: bigint; readonly right: bigint }>
  | Tagged<"Identity", { readonly input: bigint }>
  | Tagged<"Length", { readonly array: bigint }>
  | Tagged<"Element", { readonly array: bigint; readonly index: bigint }>
  | Tagged<"VerifyRoot", { readonly observation: bigint }>
  | Tagged<"NewMap">
  | Tagged<"NewSet">
  | Tagged<"MapGet", { readonly map: bigint; readonly key: bigint }>
  | Tagged<"SetAdd", { readonly set: bigint; readonly value: bigint }>
  | Tagged<"MapSet", { readonly map: bigint; readonly key: bigint; readonly value: bigint }>
  | Tagged<"Iterator", { readonly array: bigint }>
  | Tagged<"IteratorNext", { readonly iterator: bigint }>
  | Tagged<"Prepare", { readonly input: Input; readonly names: bigint }>
  | Tagged<"StatusReady", { readonly outcome: bigint }>
  | Tagged<"FreshArray", { readonly values: List<bigint> }>
  | Tagged<"RetentionQuery", { readonly query: RetentionWire<RetentionQuery> }>
export type Response =
  | Tagged<"Handle", { readonly value: bigint }>
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Count", { readonly value: bigint }>
  | Tagged<"Missing">
  | Tagged<"End">
  | Tagged<"Acknowledged">
  | Tagged<"RetentionResponse", { readonly response: RetentionWire<RetentionResponse> }>
export type Frame = Tagged<"Frame", { readonly invocation: bigint; readonly request: bigint }>
export type Status = Tagged<"Unattributed"> | Tagged<"Unavailable"> | Tagged<"Stale"> | Tagged<"Current">
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
export type Boundary =
  | Tagged<"PrimitiveBoundary">
  | Tagged<"IoBoundary">
  | Tagged<"TerminalBoundary">
  | Tagged<"InvalidBoundary">
declare const core: {
  boundary(step: Step): Boundary
  initial(invocation: bigint, input: Input): Step
  resume(step: Step, reply: Reply): Step
}
export default core
