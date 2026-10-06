import { execFile } from "node:child_process"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export type HostProcessOptions = {
  readonly env: NodeJS.ProcessEnv
  readonly input?: string
  readonly cwd?: string
  readonly timeout: number
  readonly maxBuffer: number
}
export type HostProcessResult = {
  readonly stdout: string
  readonly stderr: string
  readonly succeeded: boolean
  readonly timedOut: boolean
  readonly exitCode: number | null
}
export type HostBufferProcessResult = Omit<HostProcessResult, "stdout" | "stderr"> & {
  readonly stdout: Buffer
  readonly stderr: Buffer
}
class HostProcessStartError extends Schema.TaggedError<HostProcessStartError>()("HostProcessStartError", {}) {}
const failedStart: HostBufferProcessResult = {
  stdout: Buffer.alloc(0),
  stderr: Buffer.alloc(0),
  succeeded: false,
  timedOut: false,
  exitCode: null
}

const acquireProcess = Effect.fn("HostProcess.acquireProcess")(
  (executable: string, args: ReadonlyArray<string>, options: HostProcessOptions) =>
    Effect.try({
      try: () => {
        let output: { readonly stdout: Buffer; readonly stderr: Buffer; readonly succeeded: boolean } | undefined
        let closed = false
        let exitCode: number | null = null
        let timedOut = false
        let outcome: HostBufferProcessResult | undefined
        const waiters = new Set<(result: HostBufferProcessResult) => void>()
        const settle = () => {
          if (!closed || output === undefined || outcome !== undefined) return
          outcome = { ...output, timedOut, exitCode }
          for (const finish of waiters) finish(outcome)
          waiters.clear()
        }
        const { input, ...nativeOptions } = options
        const child = execFile(
          executable,
          [...args],
          { ...nativeOptions, timeout: 0, encoding: "buffer" },
          (cause, stdout, stderr) => {
            output = { stdout, stderr, succeeded: cause === null }
            settle()
          }
        )
        child.once("close", (code) => {
          exitCode = code !== null && code >= 0 ? code : null
          closed = true
          settle()
        })
        child.stdin?.on("error", () => {
          if (!closed) child.kill("SIGKILL")
        })
        const wait = Effect.callback<HostBufferProcessResult>((resume) => {
          if (outcome !== undefined) {
            resume(Effect.succeed(outcome))
            return
          }
          const finish = (result: HostBufferProcessResult) => resume(Effect.succeed(result))
          waiters.add(finish)
          return Effect.sync(() => {
            waiters.delete(finish)
          })
        })
        const terminate = Effect.fn("HostProcess.terminate")((timeout: boolean) =>
          Effect.sync(() => {
            if (closed) return
            timedOut ||= timeout
            child.kill("SIGKILL")
          })
        )
        // Publish ownership before input closure, including synchronous failures.
        const closeInput = Effect.try({
          try: () => {
            child.stdin?.end(input)
          },
          catch: () => new HostProcessStartError()
        })
        return { wait, terminate, closeInput }
      },
      catch: () => new HostProcessStartError()
    })
)

/** Sends optional input and closes stdin; ownership lasts through callback and physical close. */
export const execFileClosedStdinBuffer = Effect.fn("HostProcess.runBuffer")(
  (executable: string, args: ReadonlyArray<string>, options: HostProcessOptions) =>
    Effect.acquireUseRelease(
      acquireProcess(executable, args, options),
      (process) =>
        process.closeInput.pipe(
          Effect.andThen(process.wait),
          Effect.timeoutOrElse({
            duration: options.timeout,
            orElse: () => process.terminate(true).pipe(Effect.andThen(process.wait))
          })
        ),
      (process) => process.terminate(false).pipe(Effect.andThen(process.wait), Effect.asVoid)
    ).pipe(Effect.catch(() => Effect.succeed(failedStart)))
)

export const execFileClosedStdin = Effect.fn("HostProcess.run")(function* (
  executable: string,
  args: ReadonlyArray<string>,
  options: HostProcessOptions
): Effect.fn.Return<HostProcessResult> {
  const result = yield* execFileClosedStdinBuffer(executable, args, options)
  return { ...result, stdout: result.stdout.toString("utf8"), stderr: result.stderr.toString("utf8") }
})
