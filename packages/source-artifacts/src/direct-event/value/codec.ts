export const ARTIFACT_VALUE_PREFIX = "../../../../source-artifacts/src/direct-event/value/Value."
const constructors = new Set([
  "Binary64",
  "OrderedField",
  "ProductNull",
  "ProductBool",
  "ProductNumber",
  "ProductText",
  "ProductArray",
  "ProductObject"
])
export const artifactValueTag = (name: string): string | undefined =>
  constructors.has(name) ? ARTIFACT_VALUE_PREFIX + name : undefined

// Mechanical representation of product payloads at the Bend boundary.
// Canonical names are those emitted from the graph/preparation artifact roots.
// Deeper composition roots rebase this exact owner prefix at their boundary.
export type Binary64 = {
  readonly $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64"
  readonly high: number
  readonly low: number
}
export type List<Value> =
  | { readonly $: "Nil" }
  | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }
export type OrderedField<Value> = {
  readonly $: "../../../../source-artifacts/src/direct-event/value/Value.OrderedField"
  readonly key: string
  readonly value: Value
}
export type ProductValue =
  | { readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductNull" }
  | { readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductBool"; readonly value: boolean }
  | { readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductNumber"; readonly bits: Binary64 }
  | { readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductText"; readonly value: string }
  | {
      readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductArray"
      readonly items: List<ProductValue>
    }
  | {
      readonly $: "../../../../source-artifacts/src/direct-event/value/Value.ProductObject"
      readonly fields: List<OrderedField<ProductValue>>
    }

export function hostNatural(value: number | bigint): number {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("unsafe host natural")
    return Number(value)
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("unsafe host natural")
  return value
}
export const nil = <Value>(): List<Value> => ({ $: "Nil" })
export const list = <Value>(items: readonly Value[]): List<Value> =>
  items.reduceRight<List<Value>>((tail, head) => ({ $: "Con", head, tail }), nil())
const record = (value: unknown): Record<string, unknown> =>
  value === null || value === undefined ? {} : (Object(value) as Record<string, unknown>)
export function unlist<Value>(value: List<Value>): Value[]
export function unlist(value: unknown): unknown[]
export function unlist(value: unknown): unknown[] {
  const result = []
  let item = record(value)
  while (item.$ === "Con") {
    result.push(item.head)
    item = record(item.tail)
  }
  if (item.$ !== "Nil") throw new Error("invalid list")
  return result
}
// A write completes after native numeric coercion; nested coercion calls finish
// before this write. Only numeric copies escape, never the scratch buffer.
const binary64Scratch = new DataView(new ArrayBuffer(8))
export function binary64(value: number): Binary64 {
  const bytes = binary64Scratch
  bytes.setFloat64(0, value, false)
  return {
    $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64",
    high: bytes.getUint32(0, false),
    low: bytes.getUint32(4, false)
  }
}
export function fromBinary64(value: unknown): number {
  const bits = record(value)
  if (
    bits.$ !== "../../../../source-artifacts/src/direct-event/value/Value.Binary64" ||
    ![bits.high, bits.low].every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffffffff)
  )
    throw new Error("invalid binary64")
  const bytes = new DataView(new ArrayBuffer(8))
  bytes.setUint32(0, bits.high as number, false)
  bytes.setUint32(4, bits.low as number, false)
  return bytes.getFloat64(0, false)
}
export function productValue(value: unknown): ProductValue {
  if (value === null) return { $: "../../../../source-artifacts/src/direct-event/value/Value.ProductNull" }
  if (typeof value === "boolean")
    return { $: "../../../../source-artifacts/src/direct-event/value/Value.ProductBool", value }
  if (typeof value === "number")
    return { $: "../../../../source-artifacts/src/direct-event/value/Value.ProductNumber", bits: binary64(value) }
  if (typeof value === "string")
    return { $: "../../../../source-artifacts/src/direct-event/value/Value.ProductText", value }
  if (Array.isArray(value))
    return {
      $: "../../../../source-artifacts/src/direct-event/value/Value.ProductArray",
      items: list(value.map(productValue))
    }
  if (typeof value === "object")
    return {
      $: "../../../../source-artifacts/src/direct-event/value/Value.ProductObject",
      fields: list(
        Object.entries(value).map(([key, item]) => ({
          $: "../../../../source-artifacts/src/direct-event/value/Value.OrderedField",
          key,
          value: productValue(item)
        }))
      )
    }
  throw new Error("unsupported product encoding")
}
function validateList(value: unknown): void {
  let item = record(value)
  while (item.$ === "Con") item = record(item.tail)
  if (item.$ !== "Nil") throw new Error("invalid list")
}
export function fromProductValue(value: unknown): unknown {
  const item = record(value)
  switch (item.$) {
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductNull":
      return null
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductBool":
      if (typeof item.value !== "boolean") throw new Error("invalid bool")
      return item.value
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductNumber":
      return fromBinary64(item.bits)
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductText":
      if (typeof item.value !== "string") throw new Error("invalid text")
      return item.value
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductArray": {
      validateList(item.items)
      const result = []
      for (let entry = record(item.items); entry.$ === "Con"; entry = record(entry.tail))
        result.push(fromProductValue(entry.head))
      return result
    }
    case "../../../../source-artifacts/src/direct-event/value/Value.ProductObject": {
      validateList(item.fields)
      const result: Record<string, unknown> = {}
      for (let entry = record(item.fields); entry.$ === "Con"; entry = record(entry.tail)) {
        const field = record(entry.head)
        if (
          field.$ !== "../../../../source-artifacts/src/direct-event/value/Value.OrderedField" ||
          typeof field.key !== "string" ||
          Object.hasOwn(result, field.key)
        )
          throw new Error("invalid product fields")
        Object.defineProperty(result, field.key, {
          value: fromProductValue(field.value),
          enumerable: true,
          writable: true,
          configurable: true
        })
      }
      return result
    }
    default:
      throw new Error("unknown product value")
  }
}
