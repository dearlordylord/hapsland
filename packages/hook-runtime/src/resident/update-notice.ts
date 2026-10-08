import { Effect, Ref } from "effect"
import { HookOutput } from "./hook-output.ts"

export const UPDATE_REQUIRED_TEXT =
  "Hapsland hooks are incompatible with the shared resident. Update this runtime's Hapsland hooks and restart the runtime."

const objectOutput = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const blockedReason = (value: Record<string, unknown>): string | undefined =>
  value.decision === "block" && typeof value.reason === "string" ? value.reason : undefined
const additionalContext = (value: unknown): value is { additionalContext: string } =>
  value !== undefined &&
  value !== null &&
  typeof value === "object" &&
  "additionalContext" in value &&
  typeof value.additionalContext === "string"
const acceptsNotice = (value: Record<string, unknown>): boolean =>
  Object.keys(value).length === 0 || typeof value.systemMessage === "string"
const appendNotice = (value: unknown, event: string): unknown => {
  if (!objectOutput(value)) return value
  const reason = blockedReason(value)
  if (reason !== undefined) return { ...value, reason: `${reason}\n\n${UPDATE_REQUIRED_TEXT}` }
  const specific = value.hookSpecificOutput
  if (additionalContext(specific))
    return {
      ...value,
      hookSpecificOutput: { ...specific, additionalContext: `${specific.additionalContext}\n\n${UPDATE_REQUIRED_TEXT}` }
    }
  if (acceptsNotice(value))
    return { ...value, hookSpecificOutput: { hookEventName: event, additionalContext: UPDATE_REQUIRED_TEXT } }
  return value
}

/** One granted notice is consumed before attempting output; uncertain writes are not replayed. */
export const makeUpdateNoticeOutput = (
  output: ContextOutput,
  granted: Ref.Ref<boolean>,
  event: string
): ContextOutput =>
  HookOutput.of({
    write: Effect.fn("HookUpdateNotice.write")(function* (value, deadline) {
      return yield* output.write((yield* Ref.getAndSet(granted, false)) ? appendNotice(value, event) : value, deadline)
    }),
    writeEncoded: Effect.fn("HookUpdateNotice.writeEncoded")(function* (encoded, deadline) {
      if (!(yield* Ref.getAndSet(granted, false))) return yield* output.writeEncoded(encoded, deadline)
      let value: unknown
      try {
        value = JSON.parse(encoded)
      } catch {
        return yield* output.writeEncoded(encoded, deadline)
      }
      return yield* output.writeEncoded(JSON.stringify(appendNotice(value, event)) + "\n", deadline)
    })
  })
type ContextOutput = typeof HookOutput.Service
