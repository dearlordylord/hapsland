import assert from "node:assert/strict"
import { it } from "node:test"
import * as Effect from "effect/Effect"
import * as Cause from "effect/Cause"
import * as Result from "effect/Result"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import { residentHandoffSourceCurrent } from "../../../../../dist/resident/advice-delivery/handoff/source-current.js"

// Execute the emitted prepare cursor and the real native scope. Only physical
// workspace acquisition/release, the barrier and advice records are injected.
const fixture = (hooks = {}) => {
  const trace = [],
    workspace = {}
  let charged = 0,
    finishes = 0
  const advice = {
    id: "advice",
    partition: "partition",
    observation: { root: "/repo" },
    prepared: { input: { path: "file.ts" } },
    reservation: {},
    revision: {}
  }
  const unexpected = () => Effect.die(new Error("unexpected prepare operation"))
  const deps = {
    residentAdvice: () => Effect.succeed([advice]),
    residentLedger: {
      advice: { current: () => Effect.succeed({ delivery: { token: "selected" } }) },
      adviceCaptures: {
        start: () =>
          (hooks.acquire?.() ?? Effect.void).pipe(
            Effect.map(() => {
              charged++
              trace.push("start")
              return workspace
            })
          ),
        finish: (capture) =>
          Effect.suspend(() => {
            assert.equal(capture, workspace)
            finishes++
            if (finishes === 1 && hooks.failure) {
              trace.push("finish-failed")
              return Effect.die(hooks.failure)
            }
            trace.push("finish")
            charged--
            return Effect.succeed("retained")
          }),
        resize: unexpected
      }
    },
    residentReviewControls: {
      afterSourceWorkspaceReserved: () => {
        trace.push("barrier")
        return hooks.barrier?.() ?? Effect.fail(new Error("barrier unavailable"))
      }
    },
    residentLifetimeController: new AbortController(),
    residentInspection: { observeAdviceFate: () => assert.fail("unexpected commit") },
    residentIsCurrentWork: unexpected
  }
  return {
    effect: residentHandoffSourceCurrent(deps, { status: "advice", token: "selected" }),
    trace,
    charged: () => charged,
    finishes: () => finishes
  }
}

it("workspace finish failure before commit is retained while the native scope retries physical release", async () => {
  const failure = new Error("workspace release before commit"),
    f = fixture({ failure })
  const exit = await Effect.runPromiseExit(f.effect)
  assert.equal(exit._tag, "Failure")
  assert.equal(Result.getOrThrow(Cause.findDefect(exit.cause)), failure)
  assert.equal(f.charged(), 0)
  assert.equal(f.finishes(), 2)
  assert.deepEqual(f.trace, ["start", "barrier", "finish-failed", "finish"])
})

it("interruption pending at acquisition completion releases the workspace before any barrier", async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make(),
          resume = yield* Deferred.make()
        const f = fixture({
          acquire: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(resume)))
        })
        const checking = yield* f.effect.pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        checking.interruptUnsafe()
        yield* Deferred.succeed(resume, undefined)
        yield* Fiber.interrupt(checking)
        assert.equal(f.charged(), 0)
        assert.equal(f.finishes(), 1)
        assert.deepEqual(f.trace, ["start", "finish"])
      })
    )
  )
})
