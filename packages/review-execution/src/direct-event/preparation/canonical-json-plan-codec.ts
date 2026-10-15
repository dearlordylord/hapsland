import {
  list,
  unlist,
  type Binary64,
  type List,
  type ProductValue
} from "@hapsland/source-artifacts/direct-event/value/codec"

type Primitive =
  | { readonly $: "CanonicalJson.NullPrimitive" }
  | { readonly $: "CanonicalJson.BoolPrimitive"; readonly value: boolean }
  | { readonly $: "CanonicalJson.NumberPrimitive"; readonly bits: Binary64 }
  | { readonly $: "CanonicalJson.StringPrimitive"; readonly value: string }

export type CanonicalJsonPlanOperation =
  | { readonly $: "PrimitiveOperation"; readonly value: Primitive }
  | { readonly $: "ArrayOperation"; readonly arity: bigint }
  | { readonly $: "ObjectOperation"; readonly keys: List<string> }

type Task = { readonly value: ProductValue } | { readonly operation: CanonicalJsonPlanOperation }

/** Mechanical postorder ABI conversion. Bend owns JSON ordering and assembly. */
export const canonicalJsonPlanOperations = (value: ProductValue): List<CanonicalJsonPlanOperation> => {
  const operations: CanonicalJsonPlanOperation[] = []
  const pending: Task[] = [{ value }]
  while (pending.length > 0) {
    const task = pending.pop()!
    if ("operation" in task) {
      operations.push(task.operation)
      continue
    }
    const node = task.value
    switch (node.$) {
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductNull":
        operations.push({ $: "PrimitiveOperation", value: { $: "CanonicalJson.NullPrimitive" } })
        break
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductBool":
        operations.push({ $: "PrimitiveOperation", value: { $: "CanonicalJson.BoolPrimitive", value: node.value } })
        break
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductNumber":
        operations.push({ $: "PrimitiveOperation", value: { $: "CanonicalJson.NumberPrimitive", bits: node.bits } })
        break
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductText":
        operations.push({ $: "PrimitiveOperation", value: { $: "CanonicalJson.StringPrimitive", value: node.value } })
        break
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductArray": {
        const children = unlist(node.items)
        pending.push({ operation: { $: "ArrayOperation", arity: BigInt(children.length) } })
        for (let index = children.length - 1; index >= 0; index--) pending.push({ value: children[index]! })
        break
      }
      case "../../../../source-artifacts/src/direct-event/value/Value.ProductObject": {
        const fields = unlist(node.fields)
        pending.push({ operation: { $: "ObjectOperation", keys: list(fields.map((field) => field.key)) } })
        for (let index = fields.length - 1; index >= 0; index--) pending.push({ value: fields[index]!.value })
        break
      }
    }
  }
  return list(operations)
}
