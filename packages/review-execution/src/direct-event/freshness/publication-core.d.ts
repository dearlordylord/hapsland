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
  { readonly observation: number; readonly evaluations: number; readonly context: number; readonly authority: boolean }
>
export type Lens = Tagged<"Lens", { readonly object: number; readonly fields: List<string> }>
export type Query =
  | Tagged<"Read", { readonly value: Lens }>
  | Tagged<"Truthy", { readonly value: Lens }>
  | Tagged<"Equal", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"AdviceeEqual", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"EqualValues", { readonly left: number; readonly right: number }>
  | Tagged<"Identity", { readonly input: number }>
  | Tagged<"Length", { readonly array: number }>
  | Tagged<"Element", { readonly array: number; readonly index: number }>
  | Tagged<"VerifyRoot", { readonly observation: number }>
  | Tagged<"NewMap">
  | Tagged<"NewSet">
  | Tagged<"MapGet", { readonly map: number; readonly key: number }>
  | Tagged<"SetAdd", { readonly set: number; readonly value: number }>
  | Tagged<"MapSet", { readonly map: number; readonly key: number; readonly value: number }>
  | Tagged<"Iterator", { readonly array: number }>
  | Tagged<"IteratorNext", { readonly iterator: number }>
  | Tagged<"Prepare", { readonly input: Input; readonly names: number }>
  | Tagged<"StatusReady", { readonly outcome: number }>
  | Tagged<"FreshArray", { readonly values: List<number> }>
  | Tagged<"RetentionQuery", { readonly query: RetentionWire<RetentionQuery> }>
export type Response =
  | Tagged<"Handle", { readonly value: number }>
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Count", { readonly value: number }>
  | Tagged<"Missing">
  | Tagged<"End">
  | Tagged<"Acknowledged">
  | Tagged<"RetentionResponse", { readonly response: RetentionWire<RetentionResponse> }>
export type Frame = Tagged<"Frame", { readonly invocation: number; readonly request: number }>
export type Status = Tagged<"Unattributed"> | Tagged<"Unavailable"> | Tagged<"Stale"> | Tagged<"Current">
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
export type Boundary =
  | Tagged<"PrimitiveBoundary">
  | Tagged<"IoBoundary">
  | Tagged<"TerminalBoundary">
  | Tagged<"InvalidBoundary">
declare const core: {
  boundary(step: Step): Boundary
  initial(invocation: number, input: Input): Step
  resume(step: Step, reply: Reply): Step
}
export default core
