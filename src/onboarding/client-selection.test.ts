import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import {
  selectSetupClients,
  type SelectionKey,
  type SelectionTerminal
} from "@hapsland/administration/onboarding/client-selection"

const choices = [
  { host: "claude", name: "Claude Code", status: "installed" },
  { host: "codex", name: "Codex CLI", status: "not installed" }
] as const
const fixture = (ready: Deferred.Deferred<void>, initialRaw = false) => {
  let key: ((value: string, key: SelectionKey) => void) | undefined
  let raw = initialRaw
  let paused = false
  let listening = false
  const terminal: SelectionTerminal = {
    available: true,
    raw: () => raw,
    setRaw: (value) => {
      raw = value
    },
    resume: () => {
      Deferred.doneUnsafe(ready, Effect.void)
    },
    pause: () => {
      paused = true
    },
    write: () => {},
    interrupted: () => {},
    listen: (listener) => {
      key = listener
      listening = true
      return () => {
        key = undefined
        listening = false
      }
    }
  }
  return {
    terminal,
    press: (name: string) => key?.("", { name }),
    pressKey: (value: SelectionKey) => key?.("", value),
    state: () => ({ raw, paused, listening })
  }
}

it.effect("selection preserves installed defaults, accepts toggles and restores terminal ownership", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const native = fixture(ready)
    const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    native.press("down")
    native.press("space")
    native.press("return")
    expect(yield* Fiber.join(selecting)).toEqual(["claude", "codex"])
    expect(native.state()).toEqual({ raw: false, paused: true, listening: false })
  })
)

it.effect("fiber interruption detaches listeners and restores the original raw mode", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const native = fixture(ready, true)
    const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(selecting)
    expect((yield* Fiber.await(selecting))._tag).toBe("Failure")
    expect(native.state()).toEqual({ raw: true, paused: true, listening: false })
  })
)

it.effect("wraps in both directions and allows removing an installed default", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const native = fixture(ready)
    const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    native.press("up")
    native.press("space")
    native.press("down")
    native.press("space")
    native.press("unknown")
    native.press("return")
    expect(yield* Fiber.join(selecting)).toEqual(["codex"])
  })
)
it.effect.each([{ name: "escape" }, { name: "c", ctrl: true }])(
  "cancels and restores terminal ownership for %j",
  (key) =>
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>()
      const native = fixture(ready)
      const selecting = yield* selectSetupClients(choices, native.terminal).pipe(Effect.forkScoped)
      yield* Deferred.await(ready)
      native.pressKey(key)
      expect(yield* Fiber.join(selecting)).toEqual([])
      expect(native.state()).toEqual({ raw: false, paused: true, listening: false })
    })
)
it.effect("handles empty choices without selecting an absent item", () =>
  Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()
    const native = fixture(ready)
    const selecting = yield* selectSetupClients([], native.terminal).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    native.press("up")
    native.press("down")
    native.press("space")
    native.pressKey({})
    native.press("return")
    expect(yield* Fiber.join(selecting)).toEqual([])
  })
)
