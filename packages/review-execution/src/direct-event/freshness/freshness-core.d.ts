import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
declare const continuation: unique symbol
type Next = { readonly [continuation]: "Freshness.Next" }
export type Mode = Tagged<"SnapshotLine"> | Tagged<"SnapshotUnit">
export type Input = Tagged<
  "Input",
  { readonly mode: Mode; readonly observation: number; readonly prepared: number; readonly context: number }
>
export type Lens = Tagged<"Lens", { readonly object: number; readonly fields: List<string> }>
export type Name = Tagged<"Name", { readonly path: number; readonly name: number }>
export type Query =
  | Tagged<"VerifyRoot", { readonly observation: number }>
  | Tagged<"Read", { readonly value: Lens }>
  | Tagged<"Prepare", { readonly input: Input; readonly names: List<Name> }>
  | Tagged<"Length", { readonly array: number }>
  | Tagged<"Element", { readonly array: number; readonly index: number }>
  | Tagged<"TextIs", { readonly value: Lens; readonly expected: string }>
  | Tagged<"Equal", { readonly left: Lens; readonly right: Lens }>
  | Tagged<"CanonicalEqual", { readonly left: Lens; readonly right: Lens; readonly review_input: boolean }>
export type Response =
  | Tagged<"Flag", { readonly value: boolean }>
  | Tagged<"Handle", { readonly value: number }>
  | Tagged<"Count", { readonly value: number }>
  | Tagged<"Missing">
export type Frame = Tagged<"Frame", { readonly invocation: number; readonly request: number }>
export type Step =
  | Tagged<"Await", { readonly frame: Frame; readonly query: Query; readonly next: Next }>
  | Tagged<"Completed", { readonly current: boolean }>
  | Tagged<"InvalidReply">
export type Reply = Tagged<
  "Reply",
  { readonly invocation: number; readonly request: number; readonly response: Response }
>
export type Tuple<Left, Right> = Tagged<"Tuple", { readonly fst: Left; readonly snd: Right }>
export type Engine = Tagged<"Engine", { readonly read: (query: Query) => Tuple<Response, Engine> }>
export type Boundary =
  | Tagged<"PrimitiveBoundary">
  | Tagged<"IoBoundary">
  | Tagged<"TerminalBoundary">
  | Tagged<"InvalidBoundary">
declare const core: {
  boundary(step: Step): Boundary

  initial(invocation: number, input: Input): Step
  resume(step: Step, reply: Reply): Step
  run_group(engine: Engine, step: Step): Tuple<Step, Engine>
}
export default core
