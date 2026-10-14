import assert from "node:assert/strict"
import { nativeEnrollCachedAdvice } from "./native-advice-enrollment.ts"
const { enrollCachedAdvice } = await import(
  new URL("../../../../../dist/resident/review-work/preparation/post-enrollment.js", import.meta.url)
)
let cases = 0
const fixture = (options = {}, faultAt = 0) => {
  const trace = [],
    sentinel = {},
    memo = new WeakMap()
  const wrap = (value, path) => {
    if (value === null || typeof value !== "object") return value
    if (memo.has(value)) return memo.get(value)
    const proxy = new Proxy(value, {
      get(target, field, receiver) {
        if (typeof field === "string") {
          trace.push(path + "." + field)
          if (trace.length === faultAt) throw sentinel
        }
        return wrap(Reflect.get(target, field, receiver), path + "." + String(field))
      }
    })
    memo.set(value, proxy)
    return proxy
  }
  const prepared = { identity: "id" },
    findings = [{ message: "λ😀\ud800" }]
  const unit = wrap(
    {
      prepared,
      dispatch: {
        credential: options.credential,
        controlled: options.controlled,
        sessionAnalytics: options.sessionAnalytics,
        activityPath: "/activity"
      },
      analyticsEnabled: options.analyticsEnabled,
      round: options.optional,
      workUnitId: options.optional,
      sourceHash: options.optional,
      admissionId: 1,
      canonicalOperationId: 2,
      canonicalRound: 3,
      observation: { root: "/fixture" },
      settings: { environmentOnly: true },
      partition: "partition",
      reservation: { id: 4 },
      revision: { token: "revision" },
      evaluationKey: "evaluation"
    },
    "unit"
  )
  const planned = wrap({ cached: { evaluation: { findings } } }, "planned")
  const context = wrap({ sequence: 5 }, "context")
  const port =
    (name, result) =>
    (...args) => {
      trace.push("port:" + name)
      if (trace.length === faultAt) throw sentinel
      if (name === "environmentOnly") assert.equal(args[0], unit.settings)
      return result
    }
  return {
    unit,
    planned,
    context,
    sentinel,
    trace,
    ports: { uuid: port("uuid", "uuid"), now: port("now", 123), environmentOnly: port("environmentOnly", true) }
  }
}
const compare = (options, faultAt = 0) => {
  const left = fixture(options, faultAt),
    right = fixture(options, faultAt)
  let actual,
    expected,
    actualFailed = false,
    expectedFailed = false
  try {
    actual = enrollCachedAdvice(left.unit, left.planned, left.context, left.ports)
  } catch (error) {
    assert.equal(error, left.sentinel)
    actualFailed = true
  }
  try {
    expected = nativeEnrollCachedAdvice(right.unit, right.planned, right.context, right.ports)
  } catch (error) {
    assert.equal(error, right.sentinel)
    expectedFailed = true
  }
  assert.equal(actualFailed, expectedFailed)
  assert.deepEqual(left.trace, right.trace)
  const callTraceLength = left.trace.length
  if (!actualFailed) {
    assert.deepEqual(actual, expected)
    assert.deepEqual(Object.keys(actual.initial), Object.keys(expected.initial))
    assert.equal(actual.evaluation.prepared, left.unit.prepared)
    assert.equal(actual.initial.evaluations[0], actual.evaluation)
    assert.equal(actual.evaluation.findings, left.planned.cached.evaluation.findings)
    assert.equal(actual.initial.findings, actual.evaluation.findings)
  }
  cases++
  return callTraceLength
}
for (const controlled of [null, {}, { requireCredential: false }, { requireCredential: true }])
  for (const credential of [
    null,
    undefined,
    {},
    { generation: 0, statePath: "" },
    { generation: 7, statePath: "/state" }
  ])
    for (const analyticsEnabled of [undefined, null, false, true])
      for (const sessionAnalytics of [undefined, false, true])
        for (const optional of [undefined, null, 0])
          compare({ controlled, credential, analyticsEnabled, sessionAnalytics, optional })
for (const options of [
  { controlled: null, credential: null },
  {
    controlled: { requireCredential: true },
    credential: { generation: 7, statePath: "/state" },
    analyticsEnabled: false,
    optional: 0
  }
]) {
  const count = compare(options)
  for (let faultAt = 1; faultAt <= count; faultAt++) compare(options, faultAt)
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "compiled Post cached-advice enrollment versus independent original native recipe: controlled/credential/nullish analytics/optional-field axes, exact ordered field/property/UUID/settings/clock traces, full fault identity at each observed read/port and native evaluation payload identity; finite evidence, universal correspondence and adoption remain open"
  })
)
