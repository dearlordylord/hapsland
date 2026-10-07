/** Bend 2.0.35 ABI; all fields cross the bridge, selection belongs to Bend. */
export type RequestFields =
  | { readonly $: "Nil" }
  | {
      readonly $: "Con"
      readonly head: { readonly $: "core.Field"; readonly key: string; readonly value: string }
      readonly tail: RequestFields
    }
export declare const projectRequestContent: (fields: RequestFields) => string
