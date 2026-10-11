// Mechanical representation of product payloads at the Bend boundary.
// Constructor names follow the current emitted declaration owner.
export type Binary64 = { readonly $: "Types.Binary64"; readonly high: number; readonly low: number }
export type List<Value> =
  | { readonly $: "Nil" }
  | { readonly $: "Con"; readonly head: Value; readonly tail: List<Value> }
export type OrderedField<Value> = { readonly $: "Types.OrderedField"; readonly key: string; readonly value: Value }
export type ProductValue =
  | { readonly $: "Types.ProductNull" }
  | { readonly $: "Types.ProductBool"; readonly value: boolean }
  | { readonly $: "Types.ProductNumber"; readonly bits: Binary64 }
  | { readonly $: "Types.ProductText"; readonly value: string }
  | { readonly $: "Types.ProductArray"; readonly items: List<ProductValue> }
  | { readonly $: "Types.ProductObject"; readonly fields: List<OrderedField<ProductValue>> }

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
export function binary64(value: number): Binary64 {
  const bytes = new DataView(new ArrayBuffer(8))
  bytes.setFloat64(0, value, false)
  return { $: "Types.Binary64", high: bytes.getUint32(0, false), low: bytes.getUint32(4, false) }
}
export function fromBinary64(value: unknown): number {
  const bits = record(value)
  if (
    bits.$ !== "Types.Binary64" ||
    ![bits.high, bits.low].every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffffffff)
  )
    throw new Error("invalid binary64")
  const bytes = new DataView(new ArrayBuffer(8))
  bytes.setUint32(0, bits.high as number, false)
  bytes.setUint32(4, bits.low as number, false)
  return bytes.getFloat64(0, false)
}
export function productValue(value: unknown): ProductValue {
  if (value === null) return { $: "Types.ProductNull" }
  if (typeof value === "boolean") return { $: "Types.ProductBool", value }
  if (typeof value === "number") return { $: "Types.ProductNumber", bits: binary64(value) }
  if (typeof value === "string") return { $: "Types.ProductText", value }
  if (Array.isArray(value)) return { $: "Types.ProductArray", items: list(value.map(productValue)) }
  if (typeof value === "object")
    return {
      $: "Types.ProductObject",
      fields: list(
        Object.entries(value).map(([key, item]) => ({ $: "Types.OrderedField", key, value: productValue(item) }))
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
    case "Types.ProductNull":
      return null
    case "Types.ProductBool":
      if (typeof item.value !== "boolean") throw new Error("invalid bool")
      return item.value
    case "Types.ProductNumber":
      return fromBinary64(item.bits)
    case "Types.ProductText":
      if (typeof item.value !== "string") throw new Error("invalid text")
      return item.value
    case "Types.ProductArray": {
      validateList(item.items)
      const result = []
      for (let entry = record(item.items); entry.$ === "Con"; entry = record(entry.tail))
        result.push(fromProductValue(entry.head))
      return result
    }
    case "Types.ProductObject": {
      validateList(item.fields)
      const result: Record<string, unknown> = {}
      for (let entry = record(item.fields); entry.$ === "Con"; entry = record(entry.tail)) {
        const field = record(entry.head)
        if (field.$ !== "Types.OrderedField" || typeof field.key !== "string" || Object.hasOwn(result, field.key))
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
