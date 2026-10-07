import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber, Redacted, Terminal } from "effect"
import { captureCredential } from "@hapsland/administration/credentials/masked-input"
import { InteractionService } from "@hapsland/administration/interaction/interaction"
import { scriptedInteraction } from "@hapsland/build-tooling/test-support/scripted-interaction"

it.effect("waiting for hidden input remains interruptible and releases the active prompt", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const script = scriptedInteraction([])
    let released = false
    const capture = yield* captureCredential.pipe(
      Effect.provideService(InteractionService, {
        ...script.interaction,
        hidden: () =>
          Effect.acquireUseRelease(
            Deferred.succeed(ready, undefined),
            () => Effect.never,
            () =>
              Effect.sync(() => {
                released = true
              })
          )
      }),
      Effect.forkScoped
    )
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(capture)
    expect(released).toBe(true)
  })
)

it.effect("credential capture releases its redacted wrapper and never presents the key", () =>
  Effect.gen(function* () {
    const key = Redacted.make("controlled-test-key")
    const script = scriptedInteraction([])
    const captured = yield* captureCredential.pipe(
      Effect.provideService(InteractionService, { ...script.interaction, hidden: () => Effect.succeed(key) })
    )
    expect(captured).toBe("controlled-test-key")
    expect(() => Redacted.value(key)).toThrow()
    expect(script.transcript.join("\n")).not.toContain(captured)
  })
)

it.effect("hidden cancellation remains cancellation and consumes no further input", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "exit" }, { kind: "hidden", value: "unused" }])
    const result = yield* captureCredential.pipe(
      Effect.provideService(InteractionService, script.interaction),
      Effect.result
    )
    expect(result._tag).toBe("Failure")
    expect(script.remaining()).toBe(1)
    expect(script.transcript.join("\n")).not.toContain("unused")
  })
)

it.effect("oversized UTF-8 credentials fail before reaching storage and release the wrapper", () =>
  Effect.gen(function* () {
    const key = Redacted.make("あ".repeat(11_000))
    const script = scriptedInteraction([])
    const result = yield* captureCredential.pipe(
      Effect.provideService(InteractionService, { ...script.interaction, hidden: () => Effect.succeed(key) }),
      Effect.result
    )
    expect(result._tag).toBe("Failure")
    expect(() => Redacted.value(key)).toThrow()
  })
)

it.effect("terminal cancellation identity is preserved for the session owner", () =>
  Effect.gen(function* () {
    const cancelled = new Terminal.QuitError({})
    const script = scriptedInteraction([])
    const observed = yield* captureCredential.pipe(
      Effect.provideService(InteractionService, { ...script.interaction, hidden: () => Effect.fail(cancelled) }),
      Effect.catchTag("QuitError", (error) => Effect.succeed(error))
    )
    expect(observed).toBe(cancelled)
  })
)
