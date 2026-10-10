import * as Effect from "effect/Effect"
import * as Config from "effect/Config"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import { ResidentAdapterError, residentAdapter } from "../adapter-error.ts"
import { access } from "node:fs/promises"

export const residentAwaitBackendGate = Effect.fn("ResidentRuntime.awaitBackendGate")((controller: AbortController) => {
  return Effect.gen(function* () {
    const configured = yield* Config.option(Config.String("REVIEW_RESIDENT_BACKEND_GATE_PATH"))
    if (Option.isNone(configured)) return
    yield* residentAdapter("observe backend gate", () => access(configured.value)).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(controller.signal.aborted)),
      Effect.repeat({ schedule: Schedule.spaced("10 millis"), until: (ready) => ready })
    )
  }).pipe(Effect.mapError(() => new ResidentAdapterError({ operation: "configure backend gate" })))
})
