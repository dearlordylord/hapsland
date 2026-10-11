import assert from "node:assert/strict"
import test from "node:test"
import { createGraphServiceRegistry as createServiceRegistry } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { createBendResolver } from "../../../../../../source-analysis/src/direct-event/graph-resolution/consumer.ts"
import { createOwnedArtifactDriver } from "../../composition/owned-artifact-driver.mjs"

const rejected = async (task) => {
  try {
    await task()
    assert.fail("expected rejection")
  } catch (error) {
    return error
  }
}
const fixture = (hooks = {}) => {
  const registry = createServiceRegistry()
  let active = true,
    disposals = 0,
    cancelCalls = 0
  const state = { children: {} }
  const driver = createOwnedArtifactDriver({
    registry,
    hooks,
    machine: {
      retainedHandles: 0,
      disposeInvocation() {
        if (++disposals === 1) throw undefined
      }
    },
    owner: { find: () => ({ $: "Some", value: { active } }), child_active: (child) => child.active },
    control: {
      readState: () => state,
      invoke(method) {
        assert.equal(method, "cancel")
        cancelCalls++
        active = false
        return {
          $: "Advanced",
          actions: { $: "Con", head: { $: "CancelChild", invocation: 1n }, tail: { $: "Nil" } },
          outputs: { $: "Nil" }
        }
      }
    }
  })
  return { registry, driver, counts: () => ({ disposals, cancelCalls }) }
}

test("committed construction cancellation retries actual actions without replaying cancel", async () => {
  const { registry, driver, counts } = fixture()
  assert.throws(
    () => driver.constructionFailed(1),
    (error) => error === undefined
  )
  assert.equal(registry.pendingCleanup, 1)
  await registry.retryCleanup()
  assert.equal(registry.pendingCleanup, 0)
  assert.deepEqual(counts(), { disposals: 2, cancelCalls: 1 })
  assert.equal(driver.stats.accepted, 0)
  assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
})

test("close failure does not prevent cancel and exact session stays in custody", async () => {
  const { registry, driver, counts } = fixture()
  let closes = 0
  const session = {
    invocation: 1,
    close() {
      if (++closes === 1) throw undefined
    }
  }
  assert.throws(
    () => driver.constructionFailed(1, { session, closePending: true }),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.deepEqual(error.errors, [undefined, undefined])
      return true
    }
  )
  assert.equal(registry.hasCleanup(session), true)
  await registry.retryCleanup()
  assert.equal(closes, 2)
  assert.equal(registry.pendingCleanup, 0)
  assert.deepEqual(counts(), { disposals: 2, cancelCalls: 1 })
})

test("construction obligation composes existing cleanup without replaying success", async () => {
  const registry = createServiceRegistry(),
    session = { invocation: 2 }
  let finishes = 0,
    closes = 0
  registry.retainCleanup(session, () => {
    finishes++
  })
  registry.retainConstructionCleanup(2, session, () => {
    if (++closes === 1) throw false
  })
  const error = await rejected(() => registry.retryCleanup())
  assert.deepEqual(error.errors, [false])
  await registry.retryCleanup()
  assert.equal(finishes, 1)
  assert.equal(closes, 2)
  assert.equal(registry.pendingCleanup, 0)
})

test("factory preserves original, close and owner cleanup occurrences with exact session custody", async () => {
  const cleanupError = new Error("cancel failed"),
    registry = createServiceRegistry()
  const originalClear = Map.prototype.clear
  let cleanedSession
  const resolver = createBendResolver({
    drive: () => assert.fail("construction must not drive"),
    allocateInvocation: () => 9,
    onConstructionFailure(invocation, { session, closePending }) {
      Map.prototype.clear = originalClear
      assert.equal(invocation, 9)
      assert.equal(closePending, true)
      cleanedSession = session
      registry.retainConstructionCleanup(invocation, session, () => session.close())
      throw cleanupError
    }
  })
  const capture = {
    text: "",
    get byteLength() {
      Map.prototype.clear = () => {
        throw undefined
      }
      throw undefined
    }
  }
  try {
    const error = await rejected(() => resolver("root.ts", capture, "Root", { root: "/tmp" }))
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors, [undefined, undefined, cleanupError])
    assert.equal(error.cause, undefined)
    assert.equal(registry.hasCleanup(cleanedSession), true)
    assert.throws(() => cleanedSession.registerCapture(capture), /closed service session/)
    await registry.retryCleanup()
    assert.equal(registry.pendingCleanup, 0)
  } finally {
    Map.prototype.clear = originalClear
  }
})

test("successful cleanup rethrows the exact original falsy value", async () => {
  const resolver = createBendResolver({
    drive: () => assert.fail(),
    allocateInvocation: () => 10,
    onConstructionFailure() {}
  })
  const capture = {
    text: "",
    get byteLength() {
      throw false
    }
  }
  assert.equal(await rejected(() => resolver("root.ts", capture, "Root", { root: "/tmp" })), false)
})

test("failed cancellation outputs remain pending after the Canonical transition committed", async () => {
  let publications = 0
  const { registry, driver, counts } = fixture({
    canonicalOutputs() {
      if (++publications === 1) throw false
    }
  })
  assert.throws(
    () => driver.constructionFailed(1),
    (error) => {
      assert.deepEqual(error.errors, [undefined, false])
      return true
    }
  )
  assert.equal(registry.pendingCleanup, 1)
  await registry.retryCleanup()
  assert.equal(registry.pendingCleanup, 0)
  assert.equal(publications, 2)
  assert.deepEqual(counts(), { disposals: 2, cancelCalls: 1 })
  assert.equal(driver.stats.accepted, 0)
})
