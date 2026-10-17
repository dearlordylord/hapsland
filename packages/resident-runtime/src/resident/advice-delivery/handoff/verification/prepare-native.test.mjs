import { effectNative } from "@hapsland/runtime-environment/runtime/native-execution"
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
    deps,
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

it("native finalization preserves response identity and observes transport writability even without finish", async () => {
  const { residentFinalizeHandoff } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-finalize.js")
  const response = { status: "empty" },
    request = { operation: "stats" },
    trace = []
  const selected = await Effect.runPromise(
    residentFinalizeHandoff({}, request, response, new Map(), undefined, {
      kind: "transport",
      original: request,
      canWrite: () => {
        trace.push("canWrite")
        return false
      }
    })
  )
  assert.equal(selected, response)
  assert.deepEqual(trace, ["canWrite"])
  const local = await Effect.runPromise(
    residentFinalizeHandoff({}, request, response, new Map(), undefined, { kind: "local" })
  )
  assert.equal(local, response)
  assert.deepEqual(trace, ["canWrite"])
})

it("a persistent prepare session retries a failed Scope release using its physical workspace record", async () => {
  const { makeResidentSourceCurrentSession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/source-current.js")
  const failure = new Error("scope close failed"),
    f = fixture({ failure })
  const session = await Effect.runPromise(
    makeResidentSourceCurrentSession(f.deps, { status: "advice", token: "selected" })
  )
  let step = session.initial(401)
  while (step.$ === "PAwait" && step.request.command.$ !== "PCheckWorkspace")
    step = await Effect.runPromise(session.advance(step))
  assert.equal(f.charged(), 1)
  const first = await Effect.runPromiseExit(session.finish())
  assert.equal(first._tag, "Failure")
  assert.equal(Result.getOrThrow(Cause.findDefect(first.cause)), failure)
  assert.equal(f.charged(), 1)
  await Effect.runPromise(session.finish())
  await Effect.runPromise(session.finish())
  assert.equal(f.charged(), 0)
  assert.equal(f.finishes(), 2)
})

const deliveryDriver = async () => {
  const { makeResidentReviewState } =
    await import("../../../../../dist/resident/state/resolver-custody/review-state.js")
  const { createPreparationSessionRegistry } =
    await import("../../../../../dist/resident/review-work/composition/native-preparation-sessions.js")
  const { createResidentPreparationDriver } =
    await import("../../../../../dist/resident/review-work/composition/preparation-driver.js")
  const ledger = Effect.runSync(
    makeResidentReviewState((_facades, bridge) => {
      const registry = createPreparationSessionRegistry(),
        driver = createResidentPreparationDriver({ bridge, registry })
      return { acceptActions: driver.acceptActions, validateAdviceInput: driver.validateAdviceInput, driver, registry }
    })
  )
  return ledger.reviewPreparation
}
const deliveryContext = {
  $: "DeliveryContext",
  request: 1,
  recipient: 1,
  partition: 1,
  lifetime: 1,
  round: { $: "None" },
  local_delivery: false
}

it("the real resident driver carries an empty native Collect through Prepare and Finalize with no Graph input", async () => {
  const { makeResidentCollectionSession } =
    await import("../../../../../dist/resident/advice-delivery/advice-collection.js")
  const { makeResidentCollectionRoot } =
    await import("../../../../../dist/resident/advice-delivery/handoff/collection-root.js")
  const { makeResidentSourceCurrentSession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/source-current.js")
  const { makeResidentDeliveryFinalizationSession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-finalize.js")
  const { createCollectionDeliverySession, createPrepareDeliverySession, createFinalizeDeliverySession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-cursors.js")
  const f = await deliveryDriver(),
    trace = []
  const advicee = { host: "codex-cli", sessionId: "session", subagentId: "agent" }
  const request = {
    operation: "collect",
    root: "/repo",
    advicee,
    dispatch: { credential: null },
    composed: true,
    finish: { token: "stop", deadlineReached: false }
  }
  const collection = makeResidentCollectionSession(
    {},
    request.root,
    advicee,
    request.dispatch,
    "ordinary",
    undefined,
    true
  )
  const root = makeResidentCollectionRoot(
    { residentComposedDelivery: { ownsStop: () => Effect.succeed(false) } },
    request,
    collection
  )
  function* cleanup() {
    trace.push("cleanup")
  }
  const invocation = f.driver.allocateCollectionInvocation(deliveryContext, cleanup)
  const collect = createCollectionDeliverySession(invocation, root)
  const first = await Effect.runPromise(f.driver.driveEffect(collect, collect.input))
  assert.equal(first.delivery.kind, "handoff")
  assert.deepEqual(first.delivery.receipt.receipt.permission, {
    $: "PrepareDeliveryIssued",
    selection: { $: "NoDeliverySelection" }
  })
  const response = first.delivery.value.response
  const second = await Effect.runPromise(
    f.driver.driveDeliveryEffect(first.delivery.receipt, function* (_projected, invocation) {
      const native = yield effectNative(makeResidentSourceCurrentSession({}, response))
      const session = createPrepareDeliverySession(invocation, native, response, { $: "NoDeliverySelection" }, cleanup)
      return { session, input: session.input }
    })
  )
  assert.equal(second.delivery.kind, "handoff")
  assert.deepEqual(second.delivery.receipt.receipt.permission, {
    $: "FinalizeDeliveryIssued",
    selection: { $: "NoDeliverySelection" }
  })
  const final = await Effect.runPromise(
    f.driver.driveDeliveryEffect(second.delivery.receipt, function* (_projected, invocation) {
      const native = makeResidentDeliveryFinalizationSession(
        {},
        request,
        response,
        second.delivery.value.sources,
        undefined,
        {
          kind: "transport",
          original: request,
          canWrite: () => {
            trace.push("canWrite")
            return false
          }
        }
      )
      const session = createFinalizeDeliverySession(invocation, native, { $: "NoDeliverySelection" }, cleanup)
      return { session, input: session.input }
    })
  )
  assert.equal(final.delivery.kind, "result")
  assert.equal(final.delivery.value.response, response)
  assert.deepEqual(trace, ["canWrite"])
  assert.equal(f.registry.size, 0)
  assert.equal(f.registry.pendingCleanup, 0)
  assert.equal(f.driver.resources.payloads, 0)
})

it("the delivery execution port retains typed failures and raw defects through real Canonical acceptance and cleanup", async () => {
  const { createDeliverySession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-session.js")
  const { ResidentAdapterError } = await import("../../../../../dist/resident/adapter-error.js")
  const { default: root } =
    await import("../../../../../dist/resident/advice-delivery/handoff/collection-handoff-core.js")
  for (const kind of ["typed", "defect"]) {
    const f = await deliveryDriver(),
      failure =
        kind === "typed"
          ? new ResidentAdapterError({ operation: "delivery provider fixture" })
          : new Error("delivery provider fixture")
    let cleaned = 0
    function* cleanup() {
      cleaned++
    }
    const invocation = f.driver.allocateCollectionInvocation(deliveryContext, cleanup)
    const session = createDeliverySession({
      invocation,
      initial: {
        stage: "collect",
        step: root.initial(invocation, {
          $: "RootInput",
          gate: { $: "Handoff.GInput", composed: true, turn_end: true, finish: true },
          report: false
        })
      },
      advance: () => (kind === "typed" ? Effect.fail(failure) : Effect.die(failure)),
      accepted: () => assert.fail("failed provider accepted"),
      selection: () => assert.fail("failed provider selected"),
      finish: () => Effect.void,
      cleanup
    })
    const exit = await Effect.runPromiseExit(f.driver.driveEffect(session, session.input))
    assert.equal(exit._tag, "Failure")
    assert.equal(
      Result.getOrThrow(kind === "typed" ? Cause.findError(exit.cause) : Cause.findDefect(exit.cause)),
      failure
    )
    await Effect.runPromise(f.registry.retryCleanupEffect())
    assert.equal(cleaned, 1)
    assert.equal(f.registry.size, 0)
    assert.equal(f.registry.pendingCleanup, 0)
    assert.equal(f.driver.resources.payloads, 0)
  }
})

it("delivery providers cannot replay IO or install an unaccepted or copied continuation", async () => {
  const { createDeliverySession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-session.js")
  const { default: root } =
    await import("../../../../../dist/resident/advice-delivery/handoff/collection-handoff-core.js")
  const state = {
    stage: "collect",
    step: root.initial(701, {
      $: "RootInput",
      gate: { $: "Handoff.GInput", composed: true, turn_end: true, finish: true },
      report: false
    })
  }
  let calls = 0
  const session = createDeliverySession({
    invocation: 701,
    initial: state,
    advance: () =>
      Effect.sync(() => {
        calls++
        return {
          stage: "collect",
          step: root.resume(state.step, {
            $: "RootReply",
            invocation: 701,
            id: 1,
            response: { $: "RootGated", response: { $: "Handoff.GTruth", value: false } }
          })
        }
      }),
    accepted: () => ({ stage: "collect", response: { status: "empty" } }),
    selection: () => ({ $: "NoDeliverySelection" }),
    finish: () => Effect.void,
    *cleanup() {}
  })
  const request = session.machine.view(state).request
  const wrong = session.foreign({ ...request }, {})
  assert.equal((await Effect.runPromiseExit(wrong.effect))._tag, "Failure")
  assert.equal(calls, 0)
  const work = session.foreign(request, {}),
    value = await Effect.runPromise(work.effect),
    reply = work.map(value)
  assert.equal(session.machine.view(state).request, request)
  const replay = session.foreign(request, {})
  assert.equal((await Effect.runPromiseExit(replay.effect))._tag, "Failure")
  assert.throws(() => session.machine.resume(state, { ...reply }), /Wrong delivery continuation reply/)
  const next = session.machine.resume(state, reply)
  assert.equal(next.step.$, "RootDone")
  assert.throws(() => session.machine.resume(state, reply), /Wrong delivery continuation reply/)
  assert.equal(calls, 1)
})

it("the resident driver refuses a Finalize cursor under Collect permission before native IO", async () => {
  const { createDeliverySession } =
    await import("../../../../../dist/resident/advice-delivery/handoff/delivery-session.js")
  const { default: core } = await import("../../../../../dist/resident/advice-delivery/handoff/handoff-core.js")
  const f = await deliveryDriver()
  let calls = 0,
    cleaned = 0
  function* cleanup() {
    cleaned++
  }
  const invocation = f.driver.allocateCollectionInvocation(deliveryContext, cleanup)
  const session = createDeliverySession({
    invocation,
    initial: {
      stage: "finalize",
      step: core.delivery_finalize_initial(invocation, true, {
        $: "FInput",
        request: { $: "FOtherRequest" },
        response: { $: "FOtherResponse" },
        authority: { $: "FNoAuthority" }
      })
    },
    advance: () => {
      calls++
      return Effect.die(new Error("wrong native IO"))
    },
    accepted: () => assert.fail("wrong stage accepted"),
    selection: () => ({ $: "NoDeliverySelection" }),
    finish: () => Effect.void,
    cleanup
  })
  const exit = await Effect.runPromiseExit(f.driver.driveEffect(session, session.input))
  assert.equal(exit._tag, "Failure")
  assert.equal(calls, 0)
  await Effect.runPromise(f.registry.retryCleanupEffect())
  assert.equal(cleaned, 1)
  assert.equal(f.registry.size, 0)
  assert.equal(f.driver.resources.payloads, 0)
})
