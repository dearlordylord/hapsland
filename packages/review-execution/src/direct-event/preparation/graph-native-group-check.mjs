import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  createServiceSession,
  performGraphServiceEffect
} from "../../../../source-analysis/dist/direct-event/graph-resolution/service-session.js"
import { productValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import {
  createEffectPreparationDriver,
  createPublicPreparationDriver
} from "../../../dist/direct-event/preparation/canonical-driver.js"
import { performGraphNativeGroup } from "../../../dist/direct-event/preparation/graph-native-group.js"

let cases = 0
async function run(mode, grouped, failure) {
  const trace = []
  let closes = 0,
    nativeStarts = 0
  const operation =
    mode === "fulfilled"
      ? { $: "Types.SelectContextPath", path: "root.ts" }
      : mode === "effect"
        ? { $: "Types.AccessPath", path: "root.ts" }
        : mode === "cancel-return"
          ? {
              $: "Types.ObserveDiagnostic",
              path: "root.ts",
              diagnostic: { $: "Types.CaptureDiagnostic", value: productValue(null) }
            }
          : { $: "Types.StartClock" }
  const request = (held) => ({ $: "Types.Request", invocation: held.invocation, id: 1n, operation })
  const machine = {
    kind: "artifact",
    initial: (input) => ({ phase: 0, invocation: input.invocation }),
    awaitingRequest: (held) => (held.phase === 0 ? request(held) : undefined),
    view: (held) =>
      held.phase === 0
        ? { $: "Types.AwaitService", request: request(held) }
        : { $: "Types.FinishedResolver", result: "accepted", final_frame: "frame" },
    resume(held) {
      trace.push("resume")
      return { ...held, phase: 1 }
    },
    disposeInvocation() {},
    retainedHandles: 0
  }
  const observedOwner = {
    ...owner,
    provider_completed(...args) {
      trace.push("provider_completed")
      return owner.provider_completed(...args)
    }
  }
  const registry = createNativeSessionRegistry()
  const driver = (grouped ? createEffectPreparationDriver : createPublicPreparationDriver)({
    owner: observedOwner,
    initialState: owner.initial_limits(100n, 100000n, 100n, 100000n),
    registry,
    machine,
    foreignSync([outgoing], execution) {
      return grouped
        ? performGraphNativeGroup(outgoing, session, execution)
        : { effect: performGraphServiceEffect(session, outgoing, execution), map: (value) => value }
    },
    foreign() {
      assert.fail("Graph Effect cannot fall back to Promise")
    }
  })
  const invocation = driver.allocateFreshnessInvocation()
  const raw = createServiceSession({
    invocation,
    root: "/",
    access() {
      nativeStarts++
      trace.push("native")
      return Effect.succeed(undefined)
    },
    selectContextPath() {
      nativeStarts++
      trace.push("native")
      return Promise.resolve(true)
    },
    now() {
      nativeStarts++
      trace.push("native")
      driver.cancel(BigInt(invocation))
      throw failure
    },
    diagnostic() {
      nativeStarts++
      trace.push("native")
      driver.cancel(BigInt(invocation))
    }
  })
  const session = {
    ...raw,
    close() {
      closes++
      raw.close()
    }
  }
  const result = await Effect.runPromise(
    driver.driveEffect(session, { $: "Types.ResolverInput", invocation: BigInt(invocation) })
  )
  assert.equal(closes, 1)
  assert.equal(nativeStarts, 1)
  assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
  if (mode === "fulfilled" || mode === "effect") {
    assert.equal(result.result, "accepted")
    assert.equal(trace.filter((x) => x === "resume").length, 1)
    assert.ok(
      trace.indexOf("provider_completed") < trace.indexOf("resume"),
      "fulfilled Promise must cross Canonical completion before Bend resume"
    )
  } else {
    assert.equal(result.failure.$, "Types.InvocationCancelled")
    assert.equal(trace.includes("resume"), false)
  }
  cases++
  return { result, closes, nativeStarts }
}
for (const mode of ["fulfilled", "effect", "cancel-return"])
  assert.deepEqual(await run(mode, true), await run(mode, false))
for (const failure of [undefined, null, false, 0, ""])
  assert.deepEqual(await run("cancel-throw", true, failure), await run("cancel-throw", false, failure))
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "actual Graph group/private protocol and Canonical owner with native service: fulfilled Promise acceptance, synchronous cancellation before commit, falsy cancel+throw equivalence and exact cleanup"
  })
)
