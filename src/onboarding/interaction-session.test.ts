import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { scopeInteraction } from "@hapsland/administration/interaction/interaction-session"
import { scriptedInteraction } from "@hapsland/build-tooling/test-support/scripted-interaction"

it.effect("an expired session revokes input without consuming the adapter's next answer", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "confirm", line: "y" }])
    const expired = yield* Effect.scoped(scopeInteraction(script.interaction))
    const result = yield* expired
      .confirm({ message: "Apply?", preview: "safe preview", back: false })
      .pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    expect(script.remaining()).toBe(1)
  })
)

it.effect("EOF revokes queued inputs and leaves presentation available until scope exit", () =>
  Effect.gen(function* () {
    const script = scriptedInteraction([{ kind: "eof" }, { kind: "confirm", line: "y" }])
    const input = yield* scopeInteraction(script.interaction)
    const first = yield* input.confirm({ message: "Apply?", preview: "safe preview", back: false }).pipe(Effect.result)
    const second = yield* input.confirm({ message: "Retry?", preview: "safe preview", back: false }).pipe(Effect.result)
    expect(first._tag).toBe("Failure")
    expect(second._tag).toBe("Failure")
    expect(script.remaining()).toBe(1)
    yield* input.present("Last observed result: not applied")
    expect(script.transcript).toContain("Last observed result: not applied")
  })
)

it.effect("only one prompt owns input and interruption releases that ownership", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    let active = 0
    let largest = 0
    const script = scriptedInteraction([])
    const input = yield* scopeInteraction({
      ...script.interaction,
      hidden: () =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            active++
            largest = Math.max(largest, active)
          }),
          () => Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)),
          () =>
            Effect.sync(() => {
              active--
            })
        )
    })
    const first = yield* input.hidden("Key").pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    const second = yield* input.hidden("Key").pipe(Effect.forkScoped)
    yield* Fiber.interrupt(first)
    yield* Fiber.interrupt(second)
    expect(largest).toBe(1)
    expect(active).toBe(0)
  })
)

it.effect("a prompt interrupt reaches the session boundary before a workflow can mistake it for Exit", () =>
  Effect.gen(function* () {
    const { InputInterrupted } = yield* Effect.promise(() => import("@hapsland/administration/interaction/interaction"))
    const interrupted = yield* Deferred.make<void>()
    const script = scriptedInteraction([])
    const input = yield* scopeInteraction(
      { ...script.interaction, hidden: () => Effect.fail(new InputInterrupted({})) },
      Deferred.succeed(interrupted, undefined).pipe(Effect.andThen(Effect.never))
    )
    let ordinaryExit = false
    const prompt = yield* input.hidden("Key").pipe(
      Effect.catchTag("QuitError", () =>
        Effect.sync(() => {
          ordinaryExit = true
        })
      ),
      Effect.forkScoped
    )
    yield* Deferred.await(interrupted)
    expect(ordinaryExit).toBe(false)
    yield* Fiber.interrupt(prompt)
  })
)
