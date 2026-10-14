import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "LazyJson.Next" }
export type JsonKey = Tagged<"JsonKey", { readonly value: bigint; readonly units: List<number> }>
export type Lens = Tagged<"Lens", { readonly object: bigint; readonly fields: List<string> }>
export type Operation =
  | Tagged<"Serialize", { readonly value: bigint }>
  | Tagged<"Compare" | "ReviewEqual", { readonly left: bigint; readonly right: bigint }>
  | Tagged<"Identity", { readonly value: bigint }>
  | Tagged<"LensCompare", { readonly left: Lens; readonly right: Lens }>
export type Query =
  | Tagged<
      "Classify" | "Scalar" | "ArrayMap" | "ArrayJoin" | "ObjectKeys" | "Hash" | "OwnKeys",
      { readonly value: bigint }
    >
  | Tagged<"ReadKey" | "Enumerable", { readonly object: bigint; readonly key: bigint }>
  | Tagged<"ReadPath", { readonly value: Lens }>
  | Tagged<"Literal", { readonly value: string }>
  | Tagged<"Concat", { readonly parts: List<bigint> }>
  | Tagged<"TextEqual", { readonly left: bigint; readonly right: bigint }>
  | Tagged<"ReadNamed", { readonly object: bigint; readonly key: string }>
  | Tagged<"NewObject">
  | Tagged<"KeyEqual", { readonly key: bigint; readonly expected: string }>
  | Tagged<"Define", { readonly object: bigint; readonly key: bigint; readonly value: bigint }>
export type Response =
  | Tagged<"ArrayKind" | "ObjectKind" | "LeafKind" | "Acknowledged">
  | Tagged<"Handle", { readonly value: bigint }>
  | Tagged<"Keys", { readonly values: List<JsonKey> }>
  | Tagged<"Handles", { readonly values: List<bigint> }>
  | Tagged<"Flag", { readonly value: boolean }>
export type Frame = Tagged<"Frame", { readonly invocation: bigint; readonly request: bigint }>
export type Step =
  | Tagged<"Await", { readonly frame: Frame; readonly query: Query; readonly next: Next }>
  | Tagged<"CompletedText", { readonly value: bigint }>
  | Tagged<"CompletedFlag", { readonly value: boolean }>
  | Tagged<"InvalidReply">
export type Reply = Tagged<
  "Reply",
  { readonly invocation: bigint; readonly request: bigint; readonly response: Response }
>
declare const core: {
  initial(invocation: bigint, operation: Operation): Step
  start(frame: Frame, operation: Operation): Step
  resume(step: Step, reply: Reply): Step
}
export default core
