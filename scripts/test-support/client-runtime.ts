import type { Effect } from "effect"
import { Effect as EffectRuntime, Layer, ManagedRuntime, Schema } from "effect"
import { spawn } from "node:child_process"
import { hookMonotonicMillis } from "@hapsland/resident-transport/resident/hook-clock"
import type { ResidentStartup } from "@hapsland/resident-transport/resident/client"
import {
  ResidentStartup as ResidentStartupService,
  makeResidentStartup,
  ResidentLauncher,
  ResidentIpcError,
  residentStartupLayer
} from "@hapsland/resident-transport/resident/client"

const fixtureLaunch = Schema.Struct({
  command: Schema.Struct({ executable: Schema.String, args: Schema.Array(Schema.String) }),
  environment: Schema.Record(Schema.String, Schema.String)
})
const makeRuntime = () => {
  const encoded = process.env.HAPSLAND_TEST_RESIDENT_LAUNCH
  if (encoded === undefined) return ManagedRuntime.make(residentStartupLayer)
  const launch = Schema.decodeUnknownSync(fixtureLaunch)(JSON.parse(encoded))
  const launcher = Layer.succeed(
    ResidentLauncher,
    ResidentLauncher.of({
      now: hookMonotonicMillis,
      spawn: EffectRuntime.fn("FixtureResident.spawn")((paths) =>
        EffectRuntime.tryPromise({
          try: () =>
            new Promise<void>((resolve, reject) => {
              const child = spawn(launch.command.executable, [...launch.command.args, paths.directory], {
                detached: true,
                stdio: "ignore",
                env: { ...process.env, ...launch.environment }
              })
              child.once("spawn", () => {
                child.unref()
                resolve()
              })
              child.once("error", reject)
            }),
          catch: () => new ResidentIpcError({ message: "fixture resident launch failed" })
        })
      )
    })
  )
  return ManagedRuntime.make(Layer.effect(ResidentStartupService, makeResidentStartup).pipe(Layer.provide(launcher)))
}

/** Native fixture process boundary; all calls share its startup service lifetime. */
let runtime: ReturnType<typeof makeRuntime> | undefined
process.once("beforeExit", () => {
  void runtime?.dispose()
})
export const runClient = <A, E>(effect: Effect.Effect<A, E, ResidentStartup>): Promise<A> =>
  (runtime ??= makeRuntime()).runPromise(effect)
