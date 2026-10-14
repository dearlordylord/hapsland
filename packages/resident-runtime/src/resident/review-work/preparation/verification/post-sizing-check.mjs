import assert from "node:assert/strict"
import {
  residentUnitWorstOutcomeBytes as nativeWorst,
  residentUnitReservationBytes as nativeReservation
} from "./native-reservation.ts"
const production = await import(new URL("../../../../../dist/resident/work-ownership/reservation.js", import.meta.url))
const observation = {
  root: "/fixture",
  advicee: { host: "codex-cli", hostVersion: "1.0.0", sessionId: "session", toolUseId: "tool", turnId: "turn" }
}
const dispatch = { activityPath: "/fixture/activity", extra: { arbitrary: [undefined, null, "\ud800"] } }
const capture = (run) => {
  try {
    return { value: run() }
  } catch (error) {
    return { error: error.constructor.name, message: error.message }
  }
}
let cases = 0
for (const text of ["", "plain", '"\\\n', "λ😀", "\ud800", "x".repeat(270000)]) {
  for (const thresholds of [[], [0], [1], [0.5, 1, 0], [1.1], [NaN]]) {
    const prepared = {
      identity: "identity:" + text,
      input: {
        path: "path:" + text,
        declaration: { name: "Declaration" },
        rules: thresholds.map((threshold, index) => ({ threshold, id: String(index), message: text }))
      }
    }
    assert.deepEqual(
      capture(() => production.residentUnitWorstOutcomeBytes(prepared)),
      capture(() => nativeWorst(prepared))
    )
    assert.deepEqual(
      capture(() => production.residentUnitReservationBytes(observation, dispatch, prepared)),
      capture(() => nativeReservation(observation, dispatch, prepared))
    )
    assert.deepEqual(
      capture(() => production.residentUnitFits(prepared)),
      capture(() => nativeWorst(prepared) <= 262144 - 1024)
    )
    cases++
  }
}
const traceInput = (faultAt) => {
  const trace = [],
    sentinel = {},
    memo = new WeakMap()
  const wrap = (value, path) => {
    if (value === null || typeof value !== "object") return value
    if (memo.has(value)) return memo.get(value)
    const proxy = new Proxy(value, {
      get(target, field, receiver) {
        if (typeof field === "string" && !["flatMap", "constructor"].includes(field)) {
          trace.push(path + "." + field)
          if (trace.length === faultAt) throw sentinel
        }
        return wrap(Reflect.get(target, field, receiver), path + "." + String(field))
      }
    })
    memo.set(value, proxy)
    return proxy
  }
  return {
    trace,
    sentinel,
    prepared: wrap(
      {
        identity: "id",
        input: { path: "λ", declaration: { name: "D" }, rules: [{ threshold: 0.5, id: "r", message: "m" }] }
      },
      "prepared"
    )
  }
}
for (const [actual, expected] of [
  [production.residentUnitWorstOutcomeBytes, nativeWorst],
  [
    (prepared) => production.residentUnitReservationBytes(observation, dispatch, prepared),
    (prepared) => nativeReservation(observation, dispatch, prepared)
  ]
]) {
  for (let faultAt = 0; faultAt <= 20; faultAt++) {
    const left = traceInput(faultAt),
      right = traceInput(faultAt)
    let leftResult,
      rightResult,
      leftFailed = false,
      rightFailed = false
    try {
      leftResult = actual(left.prepared)
    } catch (error) {
      assert.equal(error, left.sentinel)
      leftFailed = true
    }
    try {
      rightResult = expected(right.prepared)
    } catch (error) {
      assert.equal(error, right.sentinel)
      rightFailed = true
    }
    assert.equal(leftFailed, rightFailed)
    assert.equal(leftResult, rightResult)
    assert.deepEqual(left.trace, right.trace)
    cases++
  }
}
const postSizing = await import(
  new URL("../../../../../dist/resident/review-work/preparation/post-sizing.js", import.meta.url)
)
for (const status of ["ready", "incomplete"]) {
  let preparedReads = 0,
    statusReads = 0
  const prepared = { identity: "id", input: { path: "p", declaration: { name: "D" }, rules: [] } }
  const outcome = {
    get status() {
      statusReads++
      return status
    },
    get prepared() {
      preparedReads++
      if (status !== "ready") throw new Error("non-ready prepared read")
      return prepared
    }
  }
  assert.equal(postSizing.postOutcomeFits(outcome), status === "ready" && nativeWorst(prepared) <= 262144 - 1024)
  assert.equal(
    postSizing.postOutcomeReservationBytes(outcome, observation, dispatch),
    status === "ready" ? BigInt(nativeReservation(observation, dispatch, prepared)) : 0n
  )
  assert.equal(statusReads, 2)
  assert.equal(preparedReads, status === "ready" ? 2 : 0)
  cases++
}
const boundary = {
  identity: "",
  input: { path: "p", declaration: { name: "D" }, rules: [{ threshold: 0, id: "r", message: "m" }] }
}
const payloadLimit = 262144 - 1024
const initialBytes = nativeWorst(boundary)
boundary.identity = "x".repeat(payloadLimit - initialBytes)
assert.equal(nativeWorst(boundary), payloadLimit)
assert.equal(production.residentUnitFits(boundary), true)
boundary.identity += "x"
assert.equal(nativeWorst(boundary), payloadLimit + 1)
assert.equal(production.residentUnitFits(boundary), false)
cases += 2
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "compiled Post sizing recipe versus independent native sizing: threshold/empty/multiple findings, arbitrary dispatch payload, escaping/Unicode/lone surrogate, oversized envelope, property-read trace and first20 read faults; finite evidence, universal correspondence and adoption remain open"
  })
)
