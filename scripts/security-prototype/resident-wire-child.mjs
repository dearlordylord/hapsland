import { Effect, Exit, Schedule, Scope } from "effect"
import { reviewControlsLayer } from "@hapsland/build-tooling/test-support/review-controls"
import { ReviewControlError } from "@hapsland/resident-runtime/resident/review-controls"
/** Dedicated offline resident process for the security wire witness. */
import { appendFileSync } from "node:fs"
import nodeHttp from "node:http"
import nodeHttps from "node:https"
import { access, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { makeResidentRuntime } from "@hapsland/resident-runtime/resident/server"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import { makeOfflineSecurityHttpClient } from "./security-wire-observer.ts"

const root = process.argv[2]
if (root === undefined || !root.startsWith("/")) throw new Error("fixture root required")
const runtime = residentPaths(join(root, "runtime"))
const journal = join(root, "wire-child-journal.jsonl")
const record = (value) => appendFileSync(journal, `${JSON.stringify(value)}\n`, { mode: 0o600 })
const denyNetwork = () => {
  record({ kind: "unexpectedNetworkAttempt" })
  throw new Error("offline resident forbids network HTTP")
}
globalThis.fetch = async () => denyNetwork()
nodeHttp.request = denyNetwork
nodeHttp.get = denyNetwork
nodeHttps.request = denyNetwork
nodeHttps.get = denyNetwork
const http = makeOfflineSecurityHttpClient((request) => record({ kind: "request", ...request }))
const fixtureScope = await Effect.runPromise(Scope.make())
const server = await Effect.runPromise(
  makeResidentRuntime(runtime, undefined, {
    offlineHttpClient: http,
    dispatchAuthorityObserver: (observation) => record(observation),
    reviewControls: reviewControlsLayer({
      beforeEvaluate: (unit) =>
        Effect.gen(function* () {
          record({ kind: "prepared", path: unit.input.path, declaration: unit.input.declaration.name })
          yield* Effect.tryPromise({
            try: () => writeFile(join(root, "wire-prepared"), "ready\n"),
            catch: () => new ReviewControlError({ phase: "beforeEvaluate" })
          })
          yield* Effect.tryPromise({ try: () => access(join(root, "wire-release")), catch: () => false }).pipe(
            Effect.as(true),
            Effect.catch(() => Effect.succeed(false)),
            Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (released) => released })
          )
        })
    })
  }).pipe(Effect.provideService(Scope.Scope, fixtureScope))
)
await Effect.runPromise(server.listen())
await writeFile(join(root, "wire-ready"), server.lifetime, { mode: 0o600 })
const stop = () => {
  void Effect.runPromise(Scope.close(fixtureScope, Exit.void)).then(() => process.exit(0))
}
process.once("SIGTERM", stop)
process.once("SIGINT", stop)
