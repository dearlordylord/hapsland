import { it, expect } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { PassThrough } from "node:stream"
import {
  makeTerminal,
  readControllingInputChunk,
  releaseLineInput
} from "@hapsland/administration/interaction/terminal"
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

it.effect("line cleanup restores raw mode only on live input and preserves an already-flowing stream", () =>
  Effect.gen(function* () {
    const flowingInput = new Input()
    flowingInput.isRaw = true
    flowingInput.resume()
    let flowingLineCloseCalls = 0
    let flowingPauseCalls = 0
    const pause = flowingInput.pause.bind(flowingInput)
    flowingInput.pause = () => {
      flowingPauseCalls += 1
      return pause()
    }
    const flowingLine = { close: () => (flowingLineCloseCalls += 1) }
    yield* releaseLineInput(flowingInput, { line: flowingLine, raw: false, flowing: true })
    expect(flowingInput.isRaw).toBe(false)
    expect(flowingInput.readableFlowing).toBe(true)
    expect(flowingLineCloseCalls).toBe(1)
    expect(flowingPauseCalls).toBe(0)
    flowingInput.destroy()

    const destroyedInput = new Input()
    destroyedInput.isRaw = true
    let rawModeCalls = 0
    let destroyedLineCloseCalls = 0
    destroyedInput.setRawMode = (raw) => {
      rawModeCalls += 1
      destroyedInput.isRaw = raw
      return destroyedInput
    }
    destroyedInput.destroy()
    yield* releaseLineInput(destroyedInput, {
      line: { close: () => (destroyedLineCloseCalls += 1) },
      raw: false,
      flowing: null
    })
    expect(destroyedInput.isRaw).toBe(true)
    expect(rawModeCalls).toBe(0)
    expect(destroyedLineCloseCalls).toBe(1)
  })
)

it("copies and clears available typeahead, ignores only Error EAGAIN, and ends on EOF", () => {
  const input = new PassThrough()
  let readBuffer: Uint8Array | undefined
  readControllingInputChunk(3, input, (_fd, buffer) => {
    if (!Buffer.isBuffer(buffer)) throw new Error("test expected a Buffer read target")
    readBuffer = buffer
    Buffer.from("typeahead").copy(buffer)
    return 9
  })
  expect(input.read()).toEqual(Buffer.from("typeahead"))
  expect(readBuffer).toBeDefined()
  expect(Buffer.from(readBuffer ?? [])).toEqual(Buffer.alloc(256))
  input.destroy()

  const eofInput = new PassThrough()
  readControllingInputChunk(3, eofInput, () => 0)
  expect(eofInput.writableEnded).toBe(true)
  eofInput.destroy()

  const wouldBlock = Object.assign(new Error("would block"), { code: "EAGAIN" })
  expect(() =>
    readControllingInputChunk(3, new PassThrough(), () => {
      throw wouldBlock
    })
  ).not.toThrow()

  const ioError = Object.assign(new Error("read failed"), { code: "EIO" })
  expect(() =>
    readControllingInputChunk(3, new PassThrough(), () => {
      throw ioError
    })
  ).toThrow(ioError)

  const lookalike = { code: "EAGAIN" }
  let thrown: unknown
  try {
    readControllingInputChunk(3, new PassThrough(), () => {
      throw lookalike
    })
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBe(lookalike)
})

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

it("selection navigation wraps, supports edge keys, and toggles individual choices and Back", () => {
  const options = {
    message: "Select agents",
    choices: [
      { id: "claude", title: "Claude Code" },
      { id: "codex", title: "Codex CLI" }
    ],
    back: true
  }
  const state = { focus: 0, selected: [] as string[], warning: true }
  expect(selectionUpdate(state, "down", options)).toEqual({
    _tag: "NextFrame",
    state: { ...state, focus: 1, warning: false }
  })
  expect(selectionUpdate({ ...state, focus: 5 }, "down", options)).toMatchObject({
    _tag: "NextFrame",
    state: { focus: 0 }
  })
  expect(selectionUpdate(state, "up", options)).toMatchObject({ _tag: "NextFrame", state: { focus: 5 } })
  expect(selectionUpdate(state, "tab", options)).toMatchObject({ _tag: "NextFrame", state: { focus: 1 } })
  expect(selectionUpdate(state, "home", options)).toMatchObject({ _tag: "NextFrame", state: { focus: 0 } })
  expect(selectionUpdate(state, "end", options)).toMatchObject({ _tag: "NextFrame", state: { focus: 5 } })
  expect(selectionUpdate({ ...state, focus: 2 }, "space", options)).toMatchObject({
    _tag: "NextFrame",
    state: { focus: 2, selected: ["claude"], warning: false }
  })
  expect(selectionUpdate({ ...state, focus: 2, selected: ["claude"] }, "space", options)).toMatchObject({
    _tag: "NextFrame",
    state: { selected: [] }
  })
  expect(selectionUpdate({ ...state, focus: 3 }, "space", options)).toMatchObject({
    _tag: "NextFrame",
    state: { selected: ["codex"] }
  })
  expect(selectionUpdate({ ...state, focus: 4 }, "enter", options)).toEqual({ _tag: "Submit", value: { kind: "back" } })
  expect(selectionUpdate({ ...state, focus: 5 }, "return", options)).toEqual({
    _tag: "Submit",
    value: { kind: "cancel" }
  })
  expect(selectionUpdate(state, "escape", options)).toEqual({ _tag: "Submit", value: { kind: "back" } })
  expect(selectionUpdate(state, "left", options)).toEqual({ _tag: "NextFrame", state })
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
