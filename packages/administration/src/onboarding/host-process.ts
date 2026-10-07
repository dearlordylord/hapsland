import { spawn } from "node:child_process"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

class InheritedProcessStartError extends Schema.TaggedError<InheritedProcessStartError>()(
  "InheritedProcessStartError",
  {}
) {}

export type InheritedProcessResult = { readonly started: boolean; readonly exitCode: number | null }
const acquireInheritedProcess = Effect.fn("HostProcess.acquireInherited")(
  (executable: string, args: ReadonlyArray<string>, env: NodeJS.ProcessEnv) =>
    Effect.try({
      try: () => {
        const child = spawn(executable, [...args], { env, stdio: "inherit" })
        let started = false
        let outcome: InheritedProcessResult | undefined
        const waiters = new Set<(result: InheritedProcessResult) => void>()
        child.once("spawn", () => {
          started = true
        })
        child.once("error", () => {
          /* close records failed startup without exposing native errors */
        })
        child.once("close", (code) => {
          outcome = { started, exitCode: code !== null && code >= 0 ? code : null }
          for (const finish of waiters) finish(outcome)
          waiters.clear()
        })
        const wait = Effect.callback<InheritedProcessResult>((resume) => {
          if (outcome !== undefined) {
            resume(Effect.succeed(outcome))
            return
          }
          const finish = (result: InheritedProcessResult) => resume(Effect.succeed(result))
          waiters.add(finish)
          return Effect.sync(() => {
            waiters.delete(finish)
          })
        })
        const terminate = Effect.sync(() => {
          if (outcome === undefined) child.kill("SIGKILL")
        })
        return { wait, terminate }
      },
      catch: () => new InheritedProcessStartError()
    })
)

/** Interactive package dispatch inherits the terminal and has no execution deadline. */
export const spawnInherited = Effect.fn("HostProcess.inherited")(
  (executable: string, args: ReadonlyArray<string>, env: NodeJS.ProcessEnv) =>
    Effect.acquireUseRelease(
      acquireInheritedProcess(executable, args, env),
      (process) => process.wait,
      (process) => process.terminate.pipe(Effect.andThen(process.wait), Effect.asVoid)
    ).pipe(Effect.catch(() => Effect.succeed({ started: false, exitCode: null } satisfies InheritedProcessResult)))
)
