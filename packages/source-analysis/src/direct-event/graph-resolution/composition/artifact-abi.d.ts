// Shared declarations for the Graph emission ABI.
export type Tagged<Name extends string, Fields = object> = { readonly $: Name } & Fields
export type Maybe<Value> = Tagged<"None"> | Tagged<"Some", { readonly value: Value }>
export type Token<Name extends "CaptureToken" | "ClockToken" | "CacheToken"> = Tagged<
  `Types.${Name}`,
  { readonly invocation: number; readonly id: number }
>
