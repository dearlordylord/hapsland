import { Cause, Effect, Option, Queue, Terminal } from "effect"
import { emitKeypressEvents, type Key } from "node:readline"
// Prototype-owned stdin/stderr scope. No production Terminal layer involved.
export const terminal = Terminal.make({
  columns: Effect.sync(() => process.stderr.columns || 80),
  rows: Effect.sync(() => process.stderr.rows || 24),
  display: (text) =>
    Effect.sync(() => {
      process.stderr.write(process.env.NO_COLOR ? text.replace(/\u001b\[[0-9;]*m/g, "") : text)
    }),
  readLine: Effect.fail(new Terminal.QuitError({})),
  readInput: Effect.gen(function* () {
    const queue = yield* Queue.make<Terminal.UserInput, Cause.Done>()
    const stdin = process.stdin
    const raw = !!stdin.isRaw
    const flowing = stdin.readableFlowing
    emitKeypressEvents(stdin)
    const keypress = (input: string | undefined, key: Key) => {
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
        stdin.setRawMode(raw)
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
