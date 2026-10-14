import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createChildExecutionDriver } from "@hapsland/canonical-policy/canonical/child-execution"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { createNativeSessionRegistry } from "@hapsland/runtime-environment/runtime/native-session-registry"
import {
  createFreshnessSession,
  freshnessProtocol,
  performFreshnessSync
} from "../../../dist/direct-event/freshness/canonical-protocol.js"
import { reference as snapshotReference } from "./snapshot-check.mjs"
import { reference as publicationReference, fixture as publicationFixture } from "./publication-check.mjs"

const runEffect = async (effect, execution) => {
  const exit = await Effect.runPromiseExit(effect, execution)
  if (Exit.isFailure(exit)) throw exit.cause
  return exit.value
}
const execute = async (input, ports, hooks = {}) => {
  const registry = createNativeSessionRegistry()
  const driver = createChildExecutionDriver({
    owner,
    initialState: owner.initial_limits(100n, 100000n, 100n, 100000n),
    registry,
    machine: { retainedHandles: 0, disposeInvocation() {} },
    selectMachine: (_input, session) => session.machine,
    protocol: freshnessProtocol,
    foreignSync: ([request], execution) => performFreshnessSync(request, execution),
    foreign() {
      assert.fail("Freshness cannot use an async fallback")
    },
    hooks
  })
  const invocation = driver.allocateFreshnessInvocation()
  const session = createFreshnessSession(invocation, input, ports)
  const machine = session.machine
  let outcome
  try {
    outcome = await driver.drive(session, session.input)
  } finally {
    assert.equal(machine.retainedHandles, 0)
    assert.deepEqual(driver.resources, { payloads: 0, leases: 0, sessions: 0, artifactStates: 0, launches: 0 })
    assert.equal(registry.size, 0)
  }
  return { outcome, driver }
}
let cases = 0
for (const mode of ["snapshot-line", "snapshot-unit"]) {
  const lanes = []
  for (const canonical of [false, true]) {
    const trace = []
    const fingerprints = (label) => {
      const array = []
      array.map = function (callback) {
        trace.push(label + " map " + (this === array))
        const text = callback({
          get z() {
            trace.push(label + " z")
            return 2
          },
          get a() {
            trace.push(label + " a")
            return 1
          }
        })
        return {
          join(separator) {
            trace.push(label + " join " + separator)
            return {
              [Symbol.toPrimitive](hint) {
                trace.push(label + " coerce " + hint)
                return text
              }
            }
          }
        }
      }
      return array
    }
    const input = (label) => ({
      path: "a",
      declaration: { name: "Type" },
      text: "source",
      get sourceFingerprints() {
        trace.push(label + " fingerprints")
        return fingerprints(label)
      }
    })
    const prepared = { identity: "one", input: input("right") }
    const candidate = { identity: "one", input: input("left") }
    const payload = { kind: mode, observation: {}, prepared, context: {} }
    const ports = {
      verifyRoot: () => Promise.resolve(true),
      prepare: () => Promise.resolve({ outcomes: [{ status: "ready", prepared: candidate }] }),
      currentWork() {
        assert.fail("No snapshot authority")
      }
    }
    const current = canonical
      ? (await execute(payload, ports)).outcome.current
      : await snapshotReference(mode === "snapshot-line" ? "SnapshotLine" : "SnapshotUnit", prepared, {
          verifyRoot: ports.verifyRoot,
          prepare: ports.prepare
        })
    lanes.push({ current, trace })
  }
  assert.deepEqual(lanes[1], lanes[0], mode + " native map/join under Canonical lease")
  cases++
}
for (const mode of ["snapshot-line", "snapshot-unit"]) {
  for (const original of [new Error("later original getter"), null, undefined, false, 0, ""]) {
    let active
    const trace = []
    const input = { path: "a", declaration: { name: "Type" }, text: "source", sourceFingerprints: {} }
    const prepared = { identity: "one", input }
    const candidate = {
      identity: "one",
      input: {
        ...input,
        sourceFingerprints: {
          get a() {
            trace.push("cancel")
            active.driver.cancel(active.invocation)
            return 1
          },
          get z() {
            trace.push("later throw")
            throw original
          }
        }
      }
    }
    const ports = {
      verifyRoot: () => Promise.resolve(true),
      prepare: () => Promise.resolve({ outcomes: [{ status: "ready", prepared: candidate }] }),
      currentWork() {
        assert.fail("No snapshot authority")
      }
    }
    let failed = false
    try {
      await execute({ kind: mode, observation: {}, prepared, context: {} }, ports, {
        beforeProvider(event) {
          active = event
        }
      })
    } catch (error) {
      failed = true
      assert.equal(error, original)
    }
    assert.equal(failed, true)
    assert.deepEqual(trace, ["cancel", "later throw"])
    cases++
  }
}
for (const mode of ["snapshot-line", "snapshot-unit"]) {
  for (const root of [false, true])
    for (const count of [0, 1, 2, 1024]) {
      const lanes = []
      for (const canonical of [false, true]) {
        const trace = []
        const input = {
          path: "a",
          declaration: { name: "Type" },
          text: "source",
          sourceFingerprints: { revision: "one" }
        }
        const prepared = { identity: "one", input }
        const payload = { kind: mode, observation: {}, prepared, context: {} }
        const outcomes = Array.from({ length: count }, () => ({ status: "ready", prepared }))
        const ports = {
          verifyRoot() {
            trace.push("root")
            return Promise.resolve(root)
          },
          prepare(_input, names) {
            trace.push(["prepare", names === undefined ? null : [...names].map(([path, names]) => [path, [...names]])])
            return Promise.resolve({ outcomes })
          },
          currentWork() {
            assert.fail("Snapshot cannot consult publication authority")
          }
        }
        let result
        if (canonical) {
          const { outcome, driver } = await execute(payload, ports)
          assert.equal(outcome.kind, "snapshot")
          assert.equal(driver.stats.accepted, 1)
          result = outcome.current
        } else
          result = await snapshotReference(mode === "snapshot-line" ? "SnapshotLine" : "SnapshotUnit", prepared, {
            verifyRoot: ports.verifyRoot,
            prepare: (names) => ports.prepare(payload, names)
          })
        lanes.push({ result, trace })
      }
      assert.deepEqual(lanes[1], lanes[0], mode + " root=" + root + " outcomes=" + count)
      cases++
    }
}
for (let bits = 0; bits < 256; bits++) {
  const lanes = []
  for (const canonical of [false, true]) {
    const trace = []
    const f = publicationFixture(bits, trace)
    const native = f.authority
    f.authority = {
      isCurrentWork(prepared) {
        return Effect.promise(() => native.isCurrentWork(prepared))
      }
    }
    const ports = {
      verifyRoot: f.engines.verifyRoot,
      prepare: (_input, names) => f.engines.prepare(f.observation, f.context, names),
      currentWork: (method, receiver, prepared, execution) => runEffect(method.call(receiver, prepared), execution)
    }
    let result
    if (canonical) {
      const { outcome, driver } = await execute(
        {
          kind: "publication",
          observation: f.observation,
          evaluations: f.evaluations,
          context: f.context,
          authority: f.authority
        },
        ports
      )
      assert.equal(outcome.kind, "publication")
      assert.equal(driver.stats.accepted, 1)
      result = {
        ...outcome.result,
        status: outcome.result.status[0].toUpperCase() + outcome.result.status.slice(1),
        evaluations: outcome.result.evaluations ?? []
      }
    } else {
      const authority = {
        get isCurrentWork() {
          const method = f.authority.isCurrentWork
          return (prepared) => runEffect(method.call(f.authority, prepared), {})
        }
      }
      result = await publicationReference(f.observation, f.evaluations, f.context, f.engines, authority)
    }
    const chronology = [...trace]
    const evaluations = result.evaluations.map((value) => f.evaluations.indexOf(value))
    const originalFindings = f.evaluations.flatMap((evaluation) => evaluation.findings)
    const findings = result.findings.map((value) => originalFindings.indexOf(value))
    assert.ok(evaluations.every((index) => index >= 0))
    assert.ok(findings.every((index) => index >= 0))
    lanes.push({ status: result.status, evaluations, findings, trace: chronology })
  }
  assert.deepEqual(lanes[1], lanes[0], "Canonical publication " + bits)
  cases++
}
for (const mode of ["snapshot-line", "snapshot-unit"]) {
  for (const original of [new Error("original getter"), null, undefined, false, 0, ""]) {
    let active
    const input = { path: "a", declaration: { name: "Type" }, text: "source", sourceFingerprints: {} }
    const prepared = { identity: "one", input }
    const candidate = {
      identity: "one",
      input: {
        ...input,
        get sourceFingerprints() {
          active.driver.cancel(active.invocation)
          throw original
        }
      }
    }
    const ports = {
      verifyRoot: () => Promise.resolve(true),
      prepare: () => Promise.resolve({ outcomes: [{ status: "ready", prepared: candidate }] }),
      currentWork() {
        assert.fail("No snapshot authority")
      }
    }
    let caught = false
    try {
      await execute({ kind: mode, observation: {}, prepared, context: {} }, ports, {
        beforeProvider(event) {
          active = event
        }
      })
    } catch (error) {
      caught = true
      assert.equal(error, original)
    }
    assert.equal(caught, true, mode + " preserves falsy immediate error after cancel")
    cases++
  }
}
{
  let active
  const prepared = { identity: "one", input: { path: "a", declaration: { name: "Type" }, text: "source" } }
  let preparedCalls = 0
  const ports = {
    verifyRoot() {
      return new Promise((resolve) =>
        queueMicrotask(() => {
          active.driver.cancel(active.invocation)
          resolve(true)
        })
      )
    },
    prepare() {
      preparedCalls++
      return Promise.resolve({ outcomes: [] })
    },
    currentWork() {
      assert.fail("No snapshot authority")
    }
  }
  const { outcome, driver } = await execute({ kind: "snapshot-unit", observation: {}, prepared, context: {} }, ports, {
    beforeProvider(event) {
      active = event
    }
  })
  assert.equal(outcome.failure.$, "Types.InvocationCancelled")
  assert.equal(driver.stats.accepted, 0)
  assert.equal(preparedCalls, 0)
  cases++
}
{
  const input = { kind: "snapshot-unit", observation: {}, prepared: {}, context: {} }
  const ports = {
    verifyRoot() {
      assert.fail("Input substitution cannot start IO")
    },
    prepare() {
      assert.fail("Input substitution cannot prepare")
    },
    currentWork() {
      assert.fail("No authority")
    }
  }
  const session = createFreshnessSession(21, input, ports)
  assert.throws(
    () => session.machine.initial({ ...session.input, freshness: { ...input } }),
    /replaced its owned invocation/
  )
  assert.throws(() => session.machine.initial({ ...session.input, invocation: 22n }), /replaced its owned invocation/)
  assert.equal(session.machine.retainedHandles, 0)
  session.close()
  cases += 2
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "actual issued Canonical child, complete three-mode results/read/IO traces and zero retained resources; lazy Bend JSON qualified; production cutover and universal proof remain open"
  })
)
