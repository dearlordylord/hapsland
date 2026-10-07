import { expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { createConnection, createServer, type Server, type Socket } from "node:net"
import { makeSocketFramePort } from "@hapsland/resident-transport/resident/socket-frame"
import { EDIT_REQUEST_DEADLINE_MS, MAX_IPC_FRAME_BYTES } from "@hapsland/resident-transport/resident/protocol"

type Pair = { readonly listener: Server; readonly client: Socket; readonly accepted: Socket }
const pair = Effect.acquireRelease(
  Effect.callback<Pair, Error>((resume) => {
    let client: Socket
    const listener = createServer((accepted) => resume(Effect.succeed({ listener, client, accepted })))
    listener.once("error", (error) => resume(Effect.fail(error)))
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address()
      if (address === null || typeof address === "string") throw new Error("fixture listener missing")
      client = createConnection({ port: address.port, host: "127.0.0.1" })
      client.on("error", () => undefined)
    })
  }),
  ({ listener, client, accepted }) =>
    Effect.callback<void>((resume) => {
      client.destroy()
      accepted.destroy()
      listener.close(() => resume(Effect.void))
    })
)
const fixture = Effect.gen(function* () {
  const sockets = yield* pair
  const port = yield* Effect.acquireRelease(makeSocketFramePort(sockets.accepted), (port) => port.close)
  return { ...sockets, port }
})

it.effect("decodes UTF-8 at every byte split and returns only the first frame", () =>
  Effect.gen(function* () {
    const expected = JSON.stringify({ text: "🌲é世界" })
    const encoded = Buffer.from(`${expected}\nignored-second-frame\n`)
    for (let split = 0; split <= encoded.byteLength; split += 1) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const { accepted, port } = yield* fixture
          const reading = yield* Effect.forkChild(port.read, { startImmediately: true })
          // Inject exact native chunk boundaries; TCP is free to coalesce writes.
          accepted.emit("data", encoded.subarray(0, split))
          accepted.emit("data", encoded.subarray(split))
          expect(yield* Fiber.join(reading)).toEqual({ _tag: "Frame", encoded: expected })
          expect(accepted.listenerCount("data")).toBe(0)
        })
      )
    }
  })
)

it.effect("rejects oversized input before decoding or retaining its text", () =>
  Effect.gen(function* () {
    const { accepted, port } = yield* fixture
    const reading = yield* Effect.forkChild(port.read, { startImmediately: true })
    accepted.emit("data", Buffer.alloc(MAX_IPC_FRAME_BYTES + 1, 120))
    expect(yield* Fiber.join(reading)).toEqual({ _tag: "Oversized" })
    expect(accepted.isPaused()).toBe(true)
  })
)

it.effect("interruption removes frame listeners and close acknowledges native closure", () =>
  Effect.gen(function* () {
    const { accepted, port } = yield* fixture
    const reading = yield* Effect.forkChild(port.read, { startImmediately: true })
    yield* Fiber.interrupt(reading)
    expect(accepted.listenerCount("data")).toBe(0)
    yield* port.close
    expect(accepted.closed).toBe(true)
    expect(accepted.listenerCount("timeout")).toBe(0)
    expect(yield* port.read).toEqual({ _tag: "Closed" })
    yield* port.closed
  })
)

it.effect("writes one newline-terminated UTF-8 frame through the native socket", () =>
  Effect.gen(function* () {
    const { client, port } = yield* fixture
    const encoded = JSON.stringify({ text: "🌲é世界" })
    const received = yield* Effect.forkChild(
      Effect.callback<string>((resume) => {
        let chunks: Buffer[] = []
        const onData = (chunk: Buffer) => {
          chunks.push(chunk)
          const bytes = Buffer.concat(chunks)
          if (bytes.includes(10)) {
            chunks = []
            resume(Effect.succeed(bytes.toString("utf8")))
          }
        }
        client.on("data", onData)
        return Effect.sync(() => client.removeListener("data", onData))
      }),
      { startImmediately: true }
    )
    expect(yield* port.write(encoded)).toBe(true)
    expect(yield* Fiber.join(received)).toBe(`${encoded}\n`)
    yield* port.closed
    expect(yield* port.write("late")).toBe(false)
  })
)

it.effect("changes the native idle deadline on execution and removes its timeout listener on close", () =>
  Effect.gen(function* () {
    const { accepted, port } = yield* fixture
    expect(accepted.timeout).toBe(1_500)
    const editDeadline = port.setIdleTimeout(EDIT_REQUEST_DEADLINE_MS)
    expect(accepted.timeout).toBe(1_500)
    yield* editDeadline
    expect(accepted.timeout).toBe(3_900)
    expect(accepted.listenerCount("timeout")).toBe(1)
    yield* port.close
    expect(accepted.closed).toBe(true)
    expect(accepted.listenerCount("timeout")).toBe(0)
  })
)

it.effect("acknowledges peer closure after replying to a paused first-frame request", () =>
  Effect.gen(function* () {
    const { client, accepted, port } = yield* fixture
    const reading = yield* Effect.forkChild(port.read, { startImmediately: true })
    client.write("request\nignored-second-frame\n")
    expect(yield* Fiber.join(reading)).toEqual({ _tag: "Frame", encoded: "request" })
    expect(accepted.isPaused()).toBe(true)
    expect(accepted.listenerCount("data")).toBe(0)
    const response = yield* Effect.forkChild(
      Effect.callback<string>((resume) => {
        client.once("data", (chunk) => {
          client.destroy()
          resume(Effect.succeed(chunk.toString("utf8")))
        })
      }),
      { startImmediately: true }
    )
    expect(yield* port.write("reply")).toBe(true)
    expect(yield* Fiber.join(response)).toBe("reply\n")
    yield* port.closed
    expect(accepted.closed).toBe(true)
    expect(accepted.listenerCount("data")).toBe(0)
  })
)
