import { Effect } from "effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { join } from "node:path"
import { HAPSLAND_STATE_DIRECTORY } from "../runtime/user-paths.ts"
import { readInspectionUserLimits } from "./settings.ts"
import { makeInspectionStorage } from "./storage.ts"
import { makeInspectionHttpServer, type InspectionHttpServerOptions } from "./http.ts"

export const runInspectionDashboard = (options: InspectionHttpServerOptions): void => {
  NodeRuntime.runMain(
    Effect.scoped(
      Effect.gen(function* () {
        const limits = yield* Effect.try({
          try: () => readInspectionUserLimits(),
          catch: () => new Error("inspection user configuration unavailable")
        })
        const server = yield* makeInspectionHttpServer(
          makeInspectionStorage(join(HAPSLAND_STATE_DIRECTORY, "inspection"), limits),
          options
        )
        yield* Effect.sync(() => process.stdout.write(`${server.url}\n`))
        yield* Effect.never
      })
    )
  )
}
