import type * as Owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { projectTrustedCanonical } from "../canonical-boundary.ts"
// Canonical outputs retain numeric Nat; only imported constructor tags relocate.
export type HostTransport<Value> = Value extends object
  ? {
      readonly [Key in keyof Value]: Key extends "$"
        ? Value[Key] extends `../${infer Tag}`
          ? Tag
          : Value[Key]
        : HostTransport<Value[Key]>
    }
  : Value

// The owner ABI preserves numeric Nat and relocates imported constructor tags.
const prefix = "../"
const convert = (value: unknown, intoOwner: boolean): unknown => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Inexact Canonical Nat")
    return value
  }
  if (typeof value === "bigint") throw new TypeError("Expected numeric Canonical Nat")
  if (Array.isArray(value)) return value.map((item: unknown) => convert(item, intoOwner))
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]: [string, unknown]) => {
        if (key !== "$") return [key, convert(item, intoOwner)]
        if (typeof item !== "string") throw new TypeError("Malformed Canonical constructor tag")
        return [
          key,
          intoOwner && item.includes(".") && !item.startsWith(prefix)
            ? prefix + item
            : !intoOwner && item.startsWith(prefix)
              ? item.slice(prefix.length)
              : item
        ]
      })
    )
  return value
}

// Assertions are confined to the recursive ABI mapping; no Effect or business
// command is cast. The exported conditional types describe exactly that mapping.
export const toOwner = <Value>(value: Value): Owner.OwnerTransport<Value> =>
  convert(value, true) as Owner.OwnerTransport<Value>
export const fromOwner = <Value>(value: Value): HostTransport<Value> => convert(value, false) as HostTransport<Value>

export const toOwnerCanonical = (value: unknown): Owner.State["canonical"] => {
  // CapacityState deliberately carries the existing trusted Canonical boundary.
  projectTrustedCanonical(value)
  return convert(value, true) as Owner.State["canonical"]
}

export const ownerList = <Value>(value: Owner.List<Value>): readonly Value[] => {
  const result: Value[] = []
  while (value.$ === "Con") {
    result.push(value.head)
    value = value.tail
  }
  if (value.$ !== "Nil") throw new TypeError("Malformed owner command list")
  return result
}

export const ownerSequence = <Value>(values: readonly Value[]): Owner.List<Value> =>
  values.reduceRight<Owner.List<Value>>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
