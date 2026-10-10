import * as Effect from "effect/Effect"
import { ResidentAdapterError, residentAdapter } from "../adapter-error.ts"

export const physicalRequest = (operation: string, run: (signal: AbortSignal) => Promise<void>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const controller = new AbortController()
      const completion = Promise.resolve().then(() => run(controller.signal))
      return { controller, completion }
    }),
    ({ completion }) => residentAdapter(operation, () => completion),
    ({ controller, completion }) =>
      Effect.gen(function* () {
        controller.abort()
        yield* residentAdapter(operation, () => completion).pipe(Effect.exit, Effect.asVoid)
      })
  )

export const workInvalidated = (signal: AbortSignal) =>
  Effect.callback<never, ResidentAdapterError>((resume) => {
    const abort = () => resume(Effect.fail(new ResidentAdapterError({ operation: "work invalidated" })))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", abort))
  })

export const withinWork = <A, E, R>(effect: Effect.Effect<A, E, R>, signal: AbortSignal) =>
  effect.pipe(Effect.raceFirst(workInvalidated(signal)), Effect.interruptible)
