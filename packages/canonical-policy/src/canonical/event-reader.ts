import { decoder } from "./boundary-schema.ts"
import { freezeCanonicalData } from "./immutable.ts"
import { CanonicalEventSchema, type CanonicalEvent } from "./models.ts"

const decodeEvent = decoder(CanonicalEventSchema)
const canonicalEvents = new WeakSet<object>()

/** Decode foreign values into an immutable event; reuse only this reader's outputs. */
export const readCanonicalEvent = (value: unknown): CanonicalEvent => {
  if (typeof value === "object" && value !== null && canonicalEvents.has(value)) return value as CanonicalEvent

  const event = freezeCanonicalData(decodeEvent(value))
  canonicalEvents.add(event)
  return event
}
