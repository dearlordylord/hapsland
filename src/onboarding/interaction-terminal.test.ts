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
