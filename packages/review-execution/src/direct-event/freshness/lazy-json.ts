import { createHash } from "node:crypto"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import core from "./lazy-json-core.js"
import type { Operation, Query, Response, Lens } from "./lazy-json-core.js"

// The parent's invocation-local arena owns all raw values until lease settlement.
// This interpreter only decodes Bend commands; it has no IO/cancel/controller.
export function createLazyJson(store: (value: unknown) => number, value: (id: number) => unknown) {
  const property = (object: number, key: number): unknown =>
    (value(object) as Record<PropertyKey, unknown>)[value(key) as PropertyKey]
  const handle = (raw: unknown): Response => ({ $: "Handle", value: store(raw) })
  const primitive = (query: Query, invocation: number): Response => {
    switch (query.$) {
      case "Classify": {
        const raw = value(query.value)
        return {
          $: Array.isArray(raw) ? "ArrayKind" : typeof raw === "object" && raw !== null ? "ObjectKind" : "LeafKind"
        }
      }
      case "Scalar":
        return handle(JSON.stringify(value(query.value)) ?? "null")
      case "ArrayMap": {
        const array = value(query.value) as { map(callback: (value: unknown) => string): unknown }
        return handle(
          array.map(function canonicalValue(item: unknown): string {
            return value(text(invocation, { $: "Serialize", value: store(item) })) as string
          })
        )
      }
      case "ArrayJoin":
        // Template interpolation preserves native custom join coercion/errors.
        return handle(`${(value(query.value) as { join(separator: string): unknown }).join(",")}`)
      case "ObjectKeys":
        return {
          $: "Keys",
          values: list(
            Object.keys(value(query.value) as object).map((key) => ({
              $: "JsonKey" as const,
              value: store(key),
              units: list(Array.from({ length: key.length }, (_, index) => key.charCodeAt(index)))
            }))
          )
        }
      case "ReadKey":
        return handle(property(query.object, query.key))
      case "ReadPath":
        return handle(
          unlist(query.value.fields).reduce<unknown>(
            (held, key) => (held as Record<string, unknown>)[key],
            value(query.value.object)
          )
        )
      case "Literal":
        return handle(query.value)
      case "Concat":
        return handle(
          unlist(query.parts)
            .map((id) => value(id) as string)
            .join("")
        )
      case "TextEqual":
        return { $: "Flag", value: value(query.left) === value(query.right) }
      case "Hash":
        return handle(
          createHash("sha256")
            .update(value(query.value) as string, "utf8")
            .digest("hex")
        )
      case "ReadNamed":
        return handle((value(query.object) as Record<string, unknown>)[query.key])
      case "OwnKeys":
        return { $: "Handles", values: list(Reflect.ownKeys(Object(value(query.value))).map(store)) }
      case "NewObject":
        return handle({})
      case "KeyEqual":
        return { $: "Flag", value: value(query.key) === query.expected }
      case "Enumerable":
        return {
          $: "Flag",
          value: !!Reflect.getOwnPropertyDescriptor(Object(value(query.object)), value(query.key) as PropertyKey)
            ?.enumerable
        }
      case "Define":
        Object.defineProperty(value(query.object), value(query.key) as PropertyKey, {
          value: value(query.value),
          enumerable: true,
          writable: true,
          configurable: true
        })
        return { $: "Acknowledged" }
    }
  }
  const run = (invocation: number, operation: Operation) => {
    let step = core.initial(invocation, operation)
    while (step.$ === "Await") {
      const response = primitive(step.query, invocation)
      step = core.resume(step, { $: "Reply", invocation: step.frame.invocation, request: step.frame.request, response })
    }
    if (step.$ === "InvalidReply") throw new TypeError("Invalid lazy JSON command reply")
    return step
  }
  const text = (invocation: number, operation: Operation): number => {
    const result = run(invocation, operation)
    if (result.$ !== "CompletedText") throw new TypeError("Expected lazy JSON text")
    return result.value
  }
  const flag = (invocation: number, operation: Operation): boolean => {
    const result = run(invocation, operation)
    if (result.$ !== "CompletedFlag") throw new TypeError("Expected lazy JSON comparison")
    return result.value
  }
  return {
    serialize: (invocation: number, raw: unknown) =>
      value(text(invocation, { $: "Serialize", value: store(raw) })) as string,
    compare: (invocation: number, left: unknown, right: unknown, reviewInput: boolean) =>
      flag(invocation, { $: reviewInput ? "ReviewEqual" : "Compare", left: store(left), right: store(right) }),
    compareLenses: (invocation: number, left: Lens, right: Lens) => flag(invocation, { $: "LensCompare", left, right }),
    identity: (invocation: number, raw: unknown) => value(text(invocation, { $: "Identity", value: store(raw) }))
  }
}
