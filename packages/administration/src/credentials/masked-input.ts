import { Effect, Redacted, Schema } from "effect"
import { InteractionService } from "../interaction/interaction.ts"
import { withInteractionSession } from "../interaction/interaction-session.ts"
import { JEV_KEY_ENTRY_GUIDANCE } from "../onboarding/credential-guidance.ts"
import { JEV_PROVIDER } from "@hapsland/runtime-environment/runtime/backend"

export class MaskedInputError extends Schema.TaggedError<MaskedInputError>()("MaskedInputError", {
  message: Schema.String,
  reason: Schema.Literals(["cancelled", "invalid"])
}) {}

// The secret lives only at the credential-owner boundary, never in a workflow model.
// Prompt.Hidden owns editing and masking; this adapter owns the returned wrapper.
export const captureCredential = Effect.gen(function* () {
  const interaction = yield* InteractionService
  yield* interaction.present(
    `${JEV_KEY_ENTRY_GUIDANCE}The key will be saved in ${process.platform === "darwin" ? "login Keychain" : "Secret Service (login keyring)"}.\n`
  )
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

// Explicit interactive credential entry may use /dev/tty after structured stdin.
export const readMaskedCredential = Effect.fn("CredentialTerminal.readMasked")(function* () {
  let opened = false
  return yield* withInteractionSession(
    (interaction) =>
      Effect.gen(function* () {
        opened = true
        return yield* captureCredential.pipe(Effect.provideService(InteractionService, interaction))
      }),
    Effect.fail(new MaskedInputError({ message: "credential input cancelled", reason: "cancelled" })),
    "controlling-terminal"
  ).pipe(
    // Prompt cleanup restores the cursor without a line break. Keep the next
    // structured stdout record at a line boundary even in a merged PTY stream.
    Effect.onExit(() =>
      opened
        ? Effect.sync(() => {
            process.stderr.write("\n")
          })
        : Effect.void
    ),
    Effect.catchTag("QuitError", () =>
      Effect.fail(
        new MaskedInputError({
          message: "credential input cancelled or terminal unavailable; retry with --credential-stdin",
          reason: "cancelled"
        })
      )
    )
  )
})
