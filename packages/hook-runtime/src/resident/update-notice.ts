import { Effect, Ref } from "effect"
import { HookOutput } from "./hook-output.ts"

export const UPDATE_REQUIRED_TEXT =
  "Hapsland hooks are incompatible with the shared resident. Update this runtime's Hapsland hooks and restart the runtime."

const appendNotice = (value: unknown, event: string): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  if ("decision" in value && value.decision === "block" && "reason" in value && typeof value.reason === "string")
    return { ...value, reason: `${value.reason}\n\n${UPDATE_REQUIRED_TEXT}` }
  const specific = "hookSpecificOutput" in value ? value.hookSpecificOutput : undefined
  if (
    specific !== undefined &&
    specific !== null &&
    typeof specific === "object" &&
    "additionalContext" in specific &&
    typeof specific.additionalContext === "string"
  )
    return {
      ...value,
      hookSpecificOutput: { ...specific, additionalContext: `${specific.additionalContext}\n\n${UPDATE_REQUIRED_TEXT}` }
    }
  if (Object.keys(value).length === 0 || ("systemMessage" in value && typeof value.systemMessage === "string"))
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
