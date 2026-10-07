import { Effect } from "effect"
import { join } from "node:path"
import { HAPSLAND_STATE_DIRECTORY } from "@hapsland/runtime-environment/runtime/user-paths"
import { readInspectionUserLimits } from "@hapsland/inspection-records/inspection/settings"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import { makeInspectionHttpServer, type InspectionHttpServerOptions } from "./http.ts"

export const runInspectionDashboard = (options: InspectionHttpServerOptions) =>
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
