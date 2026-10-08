import { Effect, Redacted } from "effect"
import { MaskedInputError } from "./masked-input-error.ts"
import { flowInteraction } from "../interaction/flow-input.ts"
import { JEV_KEY_ENTRY_GUIDANCE } from "../onboarding/credential-guidance.ts"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

// The secret lives only at the credential-owner boundary, never in a workflow model.
// Prompt.Hidden owns editing and masking; this adapter owns the returned wrapper.
export const captureCredential = Effect.gen(function* () {
  const interaction = yield* flowInteraction("credential-entry")
  yield* interaction.present(JEV_KEY_ENTRY_GUIDANCE)
  return yield* Effect.acquireUseRelease(
    interaction.hidden(`${JEV_PROVIDER.name} API key:`).pipe(Effect.interruptible),
    (key) =>
      Effect.gen(function* () {
        const value = Redacted.value(key)
        if (Buffer.byteLength(value, "utf8") > 32_768)
          return yield* Effect.fail(
            new MaskedInputError({ message: "credential input is too long", reason: "invalid" })
          )
        return value
      }),
    (key) =>
      Effect.sync(() => {
        Redacted.wipeUnsafe(key)
      })
  )
})
