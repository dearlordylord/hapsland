import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  createFreshnessSession,
  freshnessProtocol,
  performFreshnessSync
} from "../../../dist/direct-event/freshness/canonical-protocol.js"
import { fixture as publicationFixture } from "./publication-check.mjs"

class Marker extends Context.Service()("Freshness.EffectQualification") {}
const marker = {}
const setup = (input, ports, customize = (session) => session) => {
  const registry = createNativeSessionRegistry()
  const driver = createChildExecutionDriver({
    owner,
    initialState: owner.initial_limits(100, 100000, 100, 100000),
    registry,
    machine: { retainedHandles: 0, disposeInvocation() {} },
    selectMachine: (_input, session) => session.machine,
    protocol: freshnessProtocol,
    foreignSync: ([request], execution) => performFreshnessSync(request, execution),
    foreign() {
      assert.fail("No async fallback")
    }
  })
  const session = customize(createFreshnessSession(driver.allocateFreshnessInvocation(), input, ports))
  const clear = () => {
    assert.equal(session.machine.retainedHandles, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assert.equal(registry.size, 0)
    assert.equal(registry.pendingCleanup, 0)
  }
  return { driver, session, clear, run: () => driver.driveEffect(session, session.input) }
}
const snapshot = (mode) => {
  const input = { path: "a", declaration: { name: "Type" }, text: "source", sourceFingerprints: {} }
  const prepared = { identity: "one", input }
  return {
    input: { kind: mode, observation: {}, prepared, context: {} },
    latest: { outcomes: [{ status: "ready", prepared }] }
  }
}
let cases = 0
for (const pending of ["sync", "resolved", "deferred"]) {
  const trace = []
  const registry = createNativeSessionRegistry()
  const task = registry.runOutcome(
    {
      invocation: 1,
      close() {
        trace.push("close")
      }
    },
    () => {
      if (pending === "deferred")
        return new Promise((resolve) =>
          queueMicrotask(() => {
            trace.push("task microtask")
            resolve(1)
          })
        )
      queueMicrotask(() => trace.push("task microtask"))
      return pending === "resolved" ? Promise.resolve(1) : 1
    }
  )
  queueMicrotask(() => trace.push("caller microtask"))
  const outcome = await task
  assert.equal(outcome.task.value, 1)
  assert.deepEqual(
    trace,
    pending === "deferred"
      ? ["task microtask", "caller microtask", "close"]
      : ["task microtask", "close", "caller microtask"]
  )
  assert.equal(registry.size, 0)
  cases++
}
for (const mode of ["snapshot-line", "snapshot-unit"])
  for (const root of [false, true]) {
    const fixture = snapshot(mode)
    const trace = []
    await Effect.runPromise(
      Effect.gen(function* () {
        const caller = yield* Effect.fiberId
        const service = (name, value) =>
          Effect.gen(function* () {
            assert.equal(yield* Effect.fiberId, caller)
            assert.equal(yield* Marker, marker)
            trace.push(name)
            return value
          })
        const execution = setup(fixture.input, {
          verifyRoot: () => service("root", root),
          prepare: () => service("prepare", fixture.latest),
          currentWork() {
            assert.fail("No snapshot authority")
          }
        })
        const result = yield* execution.run()
        assert.deepEqual(result, { kind: "snapshot", current: root })
        execution.clear()
        assert.deepEqual(trace, root ? ["root", "prepare"] : ["root"])
      }).pipe(Effect.provideService(Marker, marker))
    )
    cases++
  }
{
  await Effect.runPromise(
    Effect.gen(function* () {
      const caller = yield* Effect.fiberId
      const trace = []
      const fixture = publicationFixture(0, trace)
      const authorityTrace = []
      fixture.authority = {
        isCurrentWork(prepared) {
          assert.equal(this, fixture.authority)
          assert.equal(prepared, fixture.evaluations[0].prepared)
          return Effect.gen(function* () {
            assert.equal(yield* Marker, marker)
            authorityTrace.push(yield* Effect.fiberId)
            return (yield* Effect.fiberId) === caller
          })
        }
      }
      const execution = setup(
        { kind: "publication", ...fixture },
        {
          verifyRoot: () => Effect.promise(() => fixture.engines.verifyRoot(fixture.observation)),
          prepare: (_input, names) =>
            Effect.promise(() => fixture.engines.prepare(fixture.observation, fixture.context, names)),
          currentWork: (method, receiver, prepared) => method.call(receiver, prepared)
        }
      )
      const result = yield* execution.run()
      assert.equal(result.result.status, "current")
      assert.equal(result.result.evaluations[0], fixture.evaluations[0])
      assert.equal(result.result.findings[0], fixture.evaluations[0].findings[0])
      assert.deepEqual(authorityTrace, [caller])
      execution.clear()
    }).pipe(Effect.provideService(Marker, marker))
  )
  cases++
}
for (const boundary of ["root", "prepare", "authority"]) {
  for (const original of [new Error("original effect cause"), null, undefined, false, 0, ""]) {
    const cause = Cause.combine(Cause.fail(original), Cause.die(original))
    const f = publicationFixture(0, [])
    const execution = setup(
      { kind: "publication", ...f },
      {
        verifyRoot: () => (boundary === "root" ? Effect.failCause(cause) : Effect.succeed(true)),
        prepare: (_input, names) =>
          boundary === "prepare"
            ? Effect.failCause(cause)
            : Effect.promise(() => f.engines.prepare(f.observation, f.context, names)),
        currentWork: () => Effect.failCause(cause)
      }
    )
    const exit = await Effect.runPromiseExit(execution.run())
    assert.equal(Exit.isFailure(exit), true)
    assert.deepEqual(
      exit.cause.reasons.map((reason) => [reason._tag, reason.error ?? reason.defect]),
      cause.reasons.map((reason) => [reason._tag, reason.error ?? reason.defect])
    )
    execution.clear()
    cases++
  }
}
for (const boundary of ["root", "prepare", "authority"]) {
  await Effect.runPromise(
    Effect.gen(function* () {
      const entered = yield* Deferred.make()
      const trace = []
      const blocked = Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Effect.sync(() => trace.push("service finalizer")))
      )
      const f = publicationFixture(0, [])
      const execution = setup(
        { kind: "publication", ...f },
        {
          verifyRoot: () => (boundary === "root" ? blocked : Effect.succeed(true)),
          prepare: (_input, names) =>
            boundary === "prepare" ? blocked : Effect.promise(() => f.engines.prepare(f.observation, f.context, names)),
          currentWork: () => blocked
        }
      )
      const fiber = yield* execution.run().pipe(Effect.forkChild)
      yield* Deferred.await(entered)
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      assert.equal(Exit.isFailure(exit), true)
      assert.equal(Cause.hasInterruptsOnly(exit.cause), true)
      assert.deepEqual(trace, ["service finalizer"])
      assert.equal(execution.driver.stats.accepted, 0)
      execution.clear()
    })
  )
  cases++
}
for (const shared of [false, true]) {
  const taskError = new Error("task Cause"),
    cleanupError = shared ? taskError : new Error("native close")
  const f = snapshot("snapshot-unit")
  const execution = setup(
    f.input,
    {
      verifyRoot: () => Effect.die(taskError),
      prepare() {
        assert.fail("No preparation")
      },
      currentWork() {
        assert.fail("No authority")
      }
    },
    (session) => ({
      ...session,
      close() {
        session.close()
        throw cleanupError
      }
    })
  )
  const exit = await Effect.runPromiseExit(execution.run())
  assert.equal(Exit.isFailure(exit), true)
  assert.deepEqual(
    exit.cause.reasons.map((reason) => reason.defect),
    [taskError, cleanupError]
  )
  execution.clear()
  cases++
}
console.log(
  JSON.stringify({
    passed: true,
    owner: "freshness-caller-fiber",
    cases,
    qualified: true,
    scope: "actual Canonical child, caller Context/fiber, Causes, interrupt/service finalizers and native cleanup"
  })
)
