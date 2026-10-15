// Physical transport of the existing traversal/core.bend ReferenceSlot.
// Namespace is an emitted-root ABI detail; the graph owns the fields and cases.
type Tagged<Namespace extends string, Name extends string, Fields = object> = {
  readonly $: `${Namespace}.${Name}`
} & Fields
export type ReferenceOmission<Namespace extends string = "traversal/core"> = Tagged<
  Namespace,
  "Unresolved" | "UnsupportedTarget" | "ReferenceLimit" | "Unavailable"
>
export type PlannedReference<Namespace extends string = "traversal/core"> =
  | Tagged<Namespace, "Included", { readonly identity: string }>
  | Tagged<Namespace, "Expanded", { readonly node: number }>
  | Tagged<Namespace, "Omitted", { readonly reason: ReferenceOmission<Namespace>; readonly target_name: string }>
export type ReferenceSlot<Namespace extends string = "traversal/core"> = Tagged<
  Namespace,
  "ReferenceSlot",
  {
    readonly owner: number
    readonly index: number
    readonly symbol: string
    readonly reference: PlannedReference<Namespace>
  }
>
