import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { PassThrough } from "node:stream"
import { makeTerminal } from "@hapsland/administration/interaction/terminal"
import { selectionUpdate } from "@hapsland/administration/interaction/selection"

class Input extends PassThrough {
  isRaw = false
  setRawMode(raw: boolean) {
    this.isRaw = raw
    return this
  }
}

it.effect.each([false, true])("interruption restores initial raw mode %s and detaches prompt listeners", (raw) =>
  Effect.gen(function* () {
    const input = new Input()
    input.isRaw = raw
    const ready = yield* Deferred.make<void>()
    const prompt = yield* Effect.scoped(
      Effect.gen(function* () {
        yield* makeTerminal(undefined, input).readInput
        yield* Deferred.succeed(ready, undefined)
        yield* Effect.never
      })
    ).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    expect(input.isRaw).toBe(true)
    expect(input.listenerCount("keypress")).toBe(1)
    yield* Fiber.interrupt(prompt)
    expect(input.isRaw).toBe(raw)
    expect(input.readableFlowing).toBe(false)
    expect(input.listenerCount("keypress")).toBe(0)
    expect(input.listenerCount("end")).toBe(0)
    input.destroy()
  })
)

it("Enter on the initial Continue row stays when empty; Space on Select All enables Continue", () => {
  const options = { message: "Select agents", choices: [{ id: "claude", title: "Claude Code" }], back: false }
  const initial = { focus: 0, selected: [], warning: false }
  expect(selectionUpdate(initial, "return", options)).toEqual({
    _tag: "NextFrame",
    state: { ...initial, warning: true }
  })
  const selectAll = selectionUpdate({ ...initial, focus: 1 }, "space", options)
  expect(selectAll._tag).toBe("NextFrame")
  if (selectAll._tag !== "NextFrame") throw new Error("Select All must stay in the dialog")
  expect(selectionUpdate(selectAll.state, "return", options)).toEqual({
    _tag: "Submit",
    value: { kind: "select", ids: ["claude"] }
  })
  expect(selectionUpdate(initial, "escape", options)).toEqual({ _tag: "Submit", value: { kind: "cancel" } })
})

it.effect("raw Ctrl+C preserves interrupt identity instead of becoming ordinary Exit", () =>
  Effect.gen(function* () {
    const { InputInterrupted, runNavigable } = yield* Effect.promise(
      () => import("@hapsland/administration/interaction/interaction")
    )
    const Prompt = yield* Effect.promise(() => import("effect/cli/Prompt"))
    const input = new Input()
    const ready = yield* Deferred.make<void>()
    const setRawMode = input.setRawMode.bind(input)
    input.setRawMode = (raw) => {
      const result = setRawMode(raw)
      if (raw) Deferred.doneUnsafe(ready, Effect.void)
      return result
    }
    const prompt = yield* runNavigable(
      Prompt.Select({ message: "Choose", choices: [{ title: "Continue", value: "continue" }] }),
      "exit",
      input
    ).pipe(Effect.forkScoped)
    yield* Deferred.await(ready)
    input.emit("keypress", String.fromCharCode(3), { name: "c", ctrl: true })
    const result = yield* Fiber.join(prompt).pipe(Effect.result)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(InputInterrupted)
    expect(input.isRaw).toBe(false)
    expect(input.listenerCount("keypress")).toBe(0)
    input.destroy()
  })
)
