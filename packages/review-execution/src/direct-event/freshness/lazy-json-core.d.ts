import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "LazyJson.Next" }
export type JsonKey = Tagged<"JsonKey", { readonly value: number; readonly units: List<number> }>
export type Lens = Tagged<"Lens", { readonly object: number; readonly fields: List<string> }>
export type Operation =
  | Tagged<"Serialize", { readonly value: number }>
  | Tagged<"Compare" | "ReviewEqual", { readonly left: number; readonly right: number }>
  | Tagged<"Identity", { readonly value: number }>
  | Tagged<"LensCompare", { readonly left: Lens; readonly right: Lens }>
export type Query =
  | Tagged<
      "Classify" | "Scalar" | "ArrayMap" | "ArrayJoin" | "ObjectKeys" | "Hash" | "OwnKeys",
      { readonly value: number }
    >
  | Tagged<"ReadKey" | "Enumerable", { readonly object: number; readonly key: number }>
  | Tagged<"ReadPath", { readonly value: Lens }>
  | Tagged<"Literal", { readonly value: string }>
  | Tagged<"Concat", { readonly parts: List<number> }>
  | Tagged<"TextEqual", { readonly left: number; readonly right: number }>
  | Tagged<"ReadNamed", { readonly object: number; readonly key: string }>
  | Tagged<"NewObject">
  | Tagged<"KeyEqual", { readonly key: number; readonly expected: string }>
  | Tagged<"Define", { readonly object: number; readonly key: number; readonly value: number }>
export type Response =
  | Tagged<"ArrayKind" | "ObjectKind" | "LeafKind" | "Acknowledged">
  | Tagged<"Handle", { readonly value: number }>
  | Tagged<"Keys", { readonly values: List<JsonKey> }>
  | Tagged<"Handles", { readonly values: List<number> }>
  | Tagged<"Flag", { readonly value: boolean }>
export type Frame = Tagged<"Frame", { readonly invocation: number; readonly request: number }>
export type Step =
  | Tagged<"Await", { readonly frame: Frame; readonly query: Query; readonly next: Next }>
  | Tagged<"CompletedText", { readonly value: number }>
  | Tagged<"CompletedFlag", { readonly value: boolean }>
  | Tagged<"InvalidReply">
export type Reply = Tagged<
  "Reply",
  { readonly invocation: number; readonly request: number; readonly response: Response }
>
declare const core: {
  initial(invocation: number, operation: Operation): Step
  start(frame: Frame, operation: Operation): Step
  resume(step: Step, reply: Reply): Step
}
export default core
