import { expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer, Ref, Scope } from "effect"
import { ResidentDispatchControls } from "./dispatch-controls.ts"
import { makeDispatchControls } from "../test-support/dispatch-controls.ts"

it.effect("holds only the selected dispatch boundary and consumes the hold once", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const controls = yield* makeDispatchControls()
      const service = Context.get(yield* Layer.build(controls.layer), ResidentDispatchControls)
      yield* controls.holdNext("credentialResolved")
      yield* service.atBoundary("authorized")
      const completed = yield* Ref.make(false)
      const held = yield* Effect.forkChild(
        service.atBoundary("credentialResolved").pipe(Effect.andThen(Ref.set(completed, true))),
        { startImmediately: true }
      )
      expect(yield* controls.entered).toBe("credentialResolved")
      expect(yield* Ref.get(completed)).toBe(false)
      yield* service.atBoundary("credentialResolved")
      yield* controls.release
      yield* Fiber.join(held)
      expect(yield* Ref.get(completed)).toBe(true)
    })
  )
)

it.effect("interrupts a held dispatch boundary without an external release", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const controls = yield* makeDispatchControls()
      const service = Context.get(yield* Layer.build(controls.layer), ResidentDispatchControls)
      yield* controls.holdNext("authorized")
      const completed = yield* Ref.make(false)
      const held = yield* Effect.forkChild(
        service.atBoundary("authorized").pipe(Effect.andThen(Ref.set(completed, true))),
        { startImmediately: true }
      )
      yield* controls.entered
      yield* Fiber.interrupt(held)
      expect(yield* Ref.get(completed)).toBe(false)
    })
  )
)

it.effect("retires dispatch fixture gates with the service layer", () =>
  Effect.gen(function* () {
    const controls = yield* makeDispatchControls()
    const scope = yield* Scope.make()
    const service = Context.get(yield* Layer.buildWithScope(controls.layer, scope), ResidentDispatchControls)
    yield* controls.holdNext("credentialResolved")
    const held = yield* Effect.forkChild(service.atBoundary("credentialResolved"), { startImmediately: true })
    yield* controls.entered
    yield* Scope.close(scope, Exit.void)
    yield* controls.retired
    yield* Fiber.join(held)
  })
)
