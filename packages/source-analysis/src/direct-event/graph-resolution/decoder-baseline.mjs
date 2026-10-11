// Frozen temporary decoder baseline for measured migration experiment.
// Delete with experiment artifacts when whole resolver is accepted/rejected.
import { unlist, fromBinary64 } from "./service-session.mjs"
const tag = (name) => "Types." + name
export function fromProductValue(value) {
  switch (value?.$) {
    case tag("ProductNull"):
      return null
    case tag("ProductBool"):
      if (typeof value.value !== "boolean") throw new Error("invalid bool")
      return value.value
    case tag("ProductNumber"):
      return fromBinary64(value.bits)
    case tag("ProductText"):
      if (typeof value.value !== "string") throw new Error("invalid text")
      return value.value
    case tag("ProductArray"):
      return unlist(value.items).map(fromProductValue)
    case tag("ProductObject"): {
      const result = {},
        seen = new Set()
      for (const field of unlist(value.fields)) {
        if (field?.$ !== tag("OrderedField") || typeof field.key !== "string" || seen.has(field.key))
          throw new Error("invalid product fields")
        seen.add(field.key)
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
