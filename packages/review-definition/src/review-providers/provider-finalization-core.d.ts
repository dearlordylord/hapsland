import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"

type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
type Backend<Name extends string, Fields = object> = Tagged<
  `../../../runtime-environment/src/runtime/backend/Backend.${Name}`,
  Fields
>
export type Maybe<Value> = Tagged<"None"> | Tagged<"Some", { readonly value: Value }>
export type Selection = Backend<
  "Selection",
  {
    readonly provider: string
    readonly model: Backend<"Missing"> | Backend<"Supplied", { readonly value: Maybe<string> }>
    readonly fields: List<Backend<"Field", { readonly name: string; readonly value: string }>>
  }
>
export type Declaration = Backend<
  "Declaration",
  { readonly id: string; readonly default_model: Maybe<string>; readonly destination: string }
>
export type Identity = Backend<
  "Identity",
  { readonly provider: string; readonly model: string; readonly destination: string }
>
declare const opaqueState: unique symbol
export type State = {
  readonly [opaqueState]: "ProviderFinalization.State"
  readonly invocation: number
  readonly request: number
}
export type Step =
  | Tagged<"Continue", { readonly state: State }>
  | Tagged<"EncodeComponent", { readonly state: State; readonly value: string }>
  | Tagged<"Completed", { readonly identity: Identity }>
  | Tagged<"TypeError", { readonly message: string }>
  | Tagged<"URIError">
  | Tagged<"InvalidReply">
export type Reply =
  | Tagged<"Encoded", { readonly invocation: number; readonly request: number; readonly value: string }>
  | Tagged<"EncodingFailed", { readonly invocation: number; readonly request: number }>
declare const core: {
  initial_selection(invocation: number, selection: Selection, catalog: List<Declaration>): Step
  advance(state: State): Step
  resume(step: Step, reply: Reply): Step
}
export default core
