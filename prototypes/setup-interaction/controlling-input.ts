// THROWAWAY: generic nonblocking TTY transport, not a hidden-input prompt.
// Bun's tty.ReadStream is backed by fs.ReadStream: a blocking pending read can
// prevent close/exit. Poll a nonblocking descriptor inside the owned Effect scope.
import { Effect } from "effect"
import { closeSync, constants, openSync, readSync } from "node:fs"
import { PassThrough } from "node:stream"
import { ReadStream } from "node:tty"
import { execFileSync } from "node:child_process"
const terminalMode = (...args: string[]) =>
  execFileSync("stty", [process.platform === "darwin" ? "-f" : "-F", "/dev/tty", ...args], {
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim()
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
export const acquireControllingInput = Effect.gen(function* () {
  const owned = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const fd = openSync("/dev/tty", constants.O_RDONLY | constants.O_NONBLOCK)
      try {
        return { fd, input: new ControllingInput(new ReadStream(fd)) }
      } catch (error) {
        closeSync(fd)
        throw error
      }
    }),
    ({ fd, input }) =>
      Effect.sync(() => {
        input.destroy()
        closeSync(fd)
      })
  )
  // Restoring only the raw-mode boolean leaves macOS PENDIN changed on a
  // separately opened descriptor. Preserve the complete OS terminal settings.
  yield* Effect.acquireRelease(
    Effect.sync(() => terminalMode("-g")),
    (mode) =>
      Effect.sync(() => {
        terminalMode(mode)
      })
  )
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.gen(function* () {
        // Do not consume typeahead outside an active prompt.
        if (owned.input.readableFlowing === true) {
          const buffer = Buffer.alloc(256)
          try {
            const count = readSync(owned.fd, buffer, 0, buffer.length, null)
            if (count) owned.input.write(Buffer.from(buffer.subarray(0, count)))
            else owned.input.end()
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "EAGAIN")) throw error
          } finally {
            buffer.fill(0)
          }
        }
        yield* Effect.sleep("10 millis")
      })
    ).pipe(
      Effect.catchCause(() =>
        Effect.sync(() => {
          owned.input.end()
        })
      )
    )
  )
  return owned.input
})
