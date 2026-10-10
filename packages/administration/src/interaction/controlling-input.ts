// Administration: generic nonblocking TTY transport, not a hidden-input prompt.
// Bun's tty.ReadStream is backed by fs.ReadStream: a blocking pending read can
// prevent close/exit. Poll a nonblocking descriptor inside the owned Effect scope.
import { Effect, Terminal } from "effect"
import { closeSync, constants, openSync, readSync } from "node:fs"
import { PassThrough } from "node:stream"
import { ReadStream } from "node:tty"
import { execFileClosedStdin } from "@hapsland/runtime-environment/process/closed-stdin"
import { terminalModeArguments, terminalModesEquivalent } from "../credentials/terminal.ts"
const terminalMode = Effect.fn("InteractionTerminal.mode")(function* (...args: string[]) {
  const result = yield* execFileClosedStdin("stty", terminalModeArguments(process.platform, ...args), {
    env: process.env,
    timeout: 2_000,
    maxBuffer: 65_536
  })
  if (!result.succeeded) return yield* Effect.fail(new Terminal.QuitError({}))
  return result.stdout.trim()
})
class ControllingInput extends PassThrough {
  isRaw = false
  constructor(private readonly mode: ReadStream) {
    super()
  }
  setRawMode(raw: boolean) {
    this.mode.setRawMode(raw)
    this.isRaw = raw
    return this
  }
}
const isWouldBlock = (error: unknown): error is Error & { readonly code: "EAGAIN" } =>
  error instanceof Error && "code" in error && error.code === "EAGAIN"

export const readControllingInputChunk = (
  fd: number,
  input: Pick<PassThrough, "write" | "end">,
  read: typeof readSync = readSync
): void => {
  const buffer = Buffer.alloc(256)
  try {
    const count = read(fd, buffer, 0, buffer.length, null)
    if (count) input.write(Buffer.from(buffer.subarray(0, count)))
    else input.end()
  } catch (error) {
    if (!isWouldBlock(error)) throw error
  } finally {
    buffer.fill(0)
  }
}

export const acquireControllingInput = Effect.gen(function* () {
  // Capture before constructing tty.ReadStream or changing raw mode.
  // Release last, after both prompt raw-mode cleanup and descriptor cleanup.
  yield* Effect.acquireRelease(
    terminalMode("-g").pipe(
      Effect.flatMap((mode) => (mode.length > 0 ? Effect.succeed(mode) : Effect.fail(new Terminal.QuitError({}))))
    ),
    (mode) =>
      Effect.gen(function* () {
        // macOS may set PENDIN while transitioning back to canonical input.
        // Verify the full mode, as the credential reader did before integration.
        for (let attempt = 0; attempt < 5; attempt++) {
          const observed = yield* terminalMode(mode).pipe(Effect.andThen(terminalMode("-g")), Effect.result)
          if (observed._tag === "Success" && terminalModesEquivalent(process.platform, mode, observed.success)) return
        }
        return yield* Effect.die(new Error("controlling terminal restoration failed"))
      })
  )
  const owned = yield* Effect.acquireRelease(
    Effect.try({
      try: () => {
        const fd = openSync("/dev/tty", constants.O_RDONLY | constants.O_NONBLOCK)
        try {
          const mode = new ReadStream(fd)
          return { fd, mode, input: new ControllingInput(mode) }
        } catch (error) {
          closeSync(fd)
          throw error
        }
      },
      catch: () => new Terminal.QuitError({})
    }),
    ({ mode, input }) =>
      Effect.callback<void>((complete) => {
        const closed = () => complete(Effect.void)
        const failed = () => complete(Effect.die(new Error("controlling terminal descriptor cleanup failed")))
        mode.once("close", closed)
        mode.once("error", failed)
        input.destroy()
        // The tty stream owns fd. Await its close instead of closing the same
        // descriptor behind a still-live stream that could close it again.
        mode.destroy()
        return Effect.sync(() => {
          mode.off("close", closed)
          mode.off("error", failed)
        })
      })
  )
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        // Do not consume typeahead outside an active prompt.
        if (owned.input.readableFlowing === true) {
          yield* Effect.try({
            try: () => readControllingInputChunk(owned.fd, owned.input),
            catch: () => new Terminal.QuitError({})
          })
        }
        yield* Effect.sleep("10 millis")
      })
    ).pipe(
      Effect.catchTag("QuitError", () =>
        Effect.sync(() => {
          owned.input.end()
        })
      )
    )
  )
  return owned.input
})
