import { randomUUID } from "node:crypto"
import { types } from "node:util"
import type { DirectAdvicee } from "../direct-event/model.ts"
import type { ResidentWriterEvidence } from "../resident/protocol.ts"

const MAX_OUTPUT_BYTES = 16384

/** Capture plain native data without invoking getters/toJSON or constructing an unbounded JSON string. */
const captureOutput = (output: unknown): { encoded: string } | { outputMissing: "oversized" | "unavailable" } => {
  let encoded = ""
  let bytes = 0
  let visits = 0
  const ancestors = new Set<object>()
  const oversized = Symbol("oversized")
  const unavailable = Symbol("unavailable")
  const append = (text: string) => {
    bytes += Buffer.byteLength(text)
    if (bytes > MAX_OUTPUT_BYTES) throw oversized
    encoded += text
  }
  const string = (value: string) => {
    if (value.length > MAX_OUTPUT_BYTES) throw oversized
    append(JSON.stringify(value))
  }
  const visit = (value: unknown, depth: number): void => {
    if (++visits > MAX_OUTPUT_BYTES || depth > 64) throw unavailable
    if (value === null) return append("null")
    switch (typeof value) {
      case "string":
        return string(value)
      case "boolean":
        return append(value ? "true" : "false")
      case "number":
        return append(Number.isFinite(value) ? String(value) : "null")
      case "object":
        break
      default:
        throw unavailable
    }
    const object = value as object
    if (types.isProxy(object) || ancestors.has(object)) throw unavailable
    const array = Array.isArray(object)
    const prototype = Object.getPrototypeOf(object)
    if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null) throw unavailable
    const custom = Object.getOwnPropertyDescriptor(object, "toJSON")
    if (custom === undefined && "toJSON" in object) throw unavailable
    if (custom !== undefined && (!("value" in custom) || typeof custom.value === "function")) throw unavailable
    ancestors.add(object)
    append(array ? "[" : "{")
    let count = 0
    const member = (key: string, arrayMember: boolean) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key)
      if (!arrayMember && (descriptor === undefined || !descriptor.enumerable)) return
      if (descriptor !== undefined && !("value" in descriptor)) throw unavailable
      if (arrayMember && descriptor === undefined && key in object) throw unavailable
      const child: unknown = descriptor?.value
      if (["undefined", "function", "symbol"].includes(typeof child)) {
        if (!arrayMember) return
        if (count++) append(",")
        return append("null")
      }
      if (count++) append(",")
      if (!arrayMember) {
        string(key)
        append(":")
      }
      visit(child, depth + 1)
    }
    if (array) {
      const length: number = Object.getOwnPropertyDescriptor(object, "length")!.value
      if (length > MAX_OUTPUT_BYTES / 2) throw oversized
      for (let index = 0; index < length; index++) member(String(index), true)
    } else {
      let keys = 0
      for (const key in object) {
        if (++keys > MAX_OUTPUT_BYTES) throw unavailable
        member(key, false)
      }
    }
    append(array ? "]" : "}")
    ancestors.delete(object)
  }
  try {
    visit(output, 0)
    return { encoded }
  } catch (reason) {
    return { outputMissing: reason === oversized ? "oversized" : "unavailable" }
  }
}

/** Pi's handler offers a return value; neither the resident ACK nor this port observes native acceptance. */
export const piOfferReports = (
  offer: {
    readonly inspection?: { readonly root: string; readonly advicee: DirectAdvicee }
    readonly findingCount?: number
  },
  output: unknown
): ReadonlyArray<ResidentWriterEvidence> | undefined => {
  try {
    const findingCount = offer.findingCount
    if (
      offer.inspection === undefined ||
      findingCount === undefined ||
      !Number.isSafeInteger(findingCount) ||
      findingCount < 0 ||
      findingCount > 128
    )
      return undefined
    const payload = captureOutput(output)
    const binding = {
      root: offer.inspection.root,
      advicee: { ...offer.inspection.advicee },
      findingCount,
      noticeOnly: findingCount === 0,
      attemptId: randomUUID()
    }
    const states: ReadonlyArray<ResidentWriterEvidence["state"]> = ["ready", "authorized", "write-started", "uncertain"]
    return states.map((state) => ({ ...binding, state, ...payload }))
  } catch {
    return undefined
  }
}
