import type { Cause } from "effect"
import { Effect, Option, Queue, Terminal } from "effect"
import type { Readable } from "node:stream"
import { createInterface, emitKeypressEvents, type Key } from "node:readline"
// Administration-owned stdin/stderr transport for Effect prompts.
export type TerminalInput = Readable & { isRaw: boolean; setRawMode: (raw: boolean) => unknown }
export const makeTerminal = (onEscape?: () => void, stdin: TerminalInput = process.stdin) =>
  Terminal.make({
    columns: Effect.sync(() => process.stderr.columns || 80),
    rows: Effect.sync(() => process.stderr.rows || 24),
    display: (text) =>
      Effect.sync(() => {
        process.stderr.write(
          process.env.NO_COLOR ? text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "") : text
        )
      }),
    readLine: Effect.acquireUseRelease(
      Effect.sync(() => ({
        raw: !!stdin.isRaw,
        flowing: stdin.readableFlowing,
        line: createInterface({ input: stdin, output: process.stderr, terminal: true })
      })),
      ({ line }) =>
        Effect.callback<string, Terminal.QuitError>((complete) => {
          const quit = () => complete(Effect.fail(new Terminal.QuitError({})))
          const answer = (value: string) => complete(Effect.succeed(value))
          line.once("line", answer)
          line.once("close", quit)
          line.once("SIGINT", quit)
          return Effect.sync(() => {
            line.off("line", answer)
            line.off("close", quit)
            line.off("SIGINT", quit)
          })
        }),
      ({ line, raw, flowing }) =>
        Effect.sync(() => {
          line.close()
          if (!stdin.destroyed) stdin.setRawMode(raw)
          if (flowing !== true) stdin.pause()
        })
    ),
    readInput: Effect.gen(function* () {
      const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>()
      const raw = !!stdin.isRaw
      const flowing = stdin.readableFlowing
      emitKeypressEvents(stdin)
      const keypress = (input: string | undefined, key: Key) => {
        if (key.name === "escape" && onEscape) {
          onEscape()
          return
        }
        Queue.offerUnsafe(queue, {
          input: Option.fromUndefinedOr(input),
          key: {
            name: key.name === "escape" ? "c" : (key.name ?? ""),
            ctrl: key.name === "escape" || !!key.ctrl,
            meta: !!key.meta,
            shift: !!key.shift
          }
        })
        if (key.name === "escape" || (key.ctrl && (key.name === "c" || key.name === "d"))) Queue.endUnsafe(queue)
      }
      const end = () => Queue.endUnsafe(queue)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          stdin.off("keypress", keypress)
          stdin.off("end", end)
          if (!stdin.destroyed) stdin.setRawMode(raw)
          if (flowing !== true) stdin.pause()
          process.stderr.write("\u001b[?25h")
        })
      )
      stdin.on("keypress", keypress)
      stdin.once("end", end)
      stdin.setRawMode(true)
      stdin.resume()
      return queue
    })
  })

export const terminal = makeTerminal()
