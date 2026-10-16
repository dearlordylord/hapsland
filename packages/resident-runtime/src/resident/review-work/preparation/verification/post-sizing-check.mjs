import assert from "node:assert/strict"
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
// Fixture data pins the original independent TS byte totals and getter order.
// No sizing policy or old implementation is retained as a runtime oracle.
const expectedBytes = [
  [[110, 2948], [350, 3318], [110, 3059], [516, 3812], null, null],
  [[110, 2988], [375, 3403], [110, 3114], [566, 3957], null, null],
  [[110, 3011], [380, 3435], [110, 3140], [576, 4001], null, null],
  [[110, 2996], [380, 3420], [110, 3125], [576, 3986], null, null],
  [[110, 2999], [380, 3423], [110, 3128], [576, 3989], null, null],
  [[110, 2162948], [1350350, 4593321], [110, 2973059], [2700516, 7833816], null, null]
]
const invalidProbability = { error: "RangeError", message: "probability must be finite in [0, 1]" }
let cases = 0
for (const [textIndex, text] of ["", "plain", '"\\\n', "λ😀", "\ud800", "x".repeat(270000)].entries()) {
  for (const [thresholdIndex, thresholds] of [[], [0], [1], [0.5, 1, 0], [1.1], [NaN]].entries()) {
    const prepared = {
      identity: "identity:" + text,
      input: {
        path: "path:" + text,
        declaration: { name: "Declaration" },
        rules: thresholds.map((threshold, index) => ({ threshold, id: String(index), message: text }))
      }
    }
    const expected = expectedBytes[textIndex][thresholdIndex]
    assert.deepEqual(
      capture(() => production.residentUnitWorstOutcomeBytes(prepared)),
      expected === null ? invalidProbability : { value: expected[0] }
    )
    assert.deepEqual(
      capture(() => production.residentUnitReservationBytes(observation, dispatch, prepared)),
      expected === null ? invalidProbability : { value: expected[1] }
    )
    assert.deepEqual(
      capture(() => production.residentUnitFits(prepared)),
      expected === null ? invalidProbability : { value: expected[0] <= 262144 - 1024 }
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
const expectedReads = [
  {
    value: 319,
    trace: [
      "prepared.input",
      "prepared.input.rules",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.threshold",
      "prepared.input",
      "prepared.input.path",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.identity"
    ]
  },
  {
    value: 3203,
    trace: [
      "prepared.input",
      "prepared.input.rules",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.threshold",
      "prepared.input",
      "prepared.input.path",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.identity",
      "prepared.identity",
      "prepared.input",
      "prepared.input.path",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.path",
      "prepared.input.rules",
      "prepared.input.rules.map",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.input.rules.0.threshold",
      "prepared.identity",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.path",
      "prepared.input.rules",
      "prepared.input.rules.map",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.input.rules.0.threshold",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.path",
      "prepared.input.rules",
      "prepared.input.rules.map",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.input.rules.0.threshold",
      "prepared.identity",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.path",
      "prepared.input.rules",
      "prepared.input.rules.map",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.input.rules.0.threshold",
      "prepared.identity",
      "prepared.input",
      "prepared.input.declaration",
      "prepared.input.declaration.name",
      "prepared.input.path",
      "prepared.input.rules",
      "prepared.input.rules.map",
      "prepared.input.rules.length",
      "prepared.input.rules.0",
      "prepared.input.rules.0.id",
      "prepared.input.rules.0.message",
      "prepared.input.rules.0.threshold"
    ]
  }
]
for (const [index, actual] of [
  production.residentUnitWorstOutcomeBytes,
  (prepared) => production.residentUnitReservationBytes(observation, dispatch, prepared)
].entries()) {
  const expected = expectedReads[index]
  for (let faultAt = 0; faultAt <= expected.trace.length; faultAt++) {
    const input = traceInput(faultAt)
    if (faultAt === 0) assert.equal(actual(input.prepared), expected.value)
    else
      assert.throws(
        () => actual(input.prepared),
        (error) => error === input.sentinel
      )
    assert.deepEqual(input.trace, faultAt === 0 ? expected.trace : expected.trace.slice(0, faultAt))
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
  assert.equal(postSizing.postOutcomeFits(outcome), status === "ready")
  assert.equal(postSizing.postOutcomeReservationBytes(outcome, observation, dispatch), status === "ready" ? 2857 : 0)
  assert.equal(statusReads, 2)
  assert.equal(preparedReads, status === "ready" ? 2 : 0)
  cases++
}
const boundary = {
  identity: "",
  input: { path: "p", declaration: { name: "D" }, rules: [{ threshold: 0, id: "r", message: "m" }] }
}
const payloadLimit = 262144 - 1024
const initialBytes = 315
boundary.identity = "x".repeat(payloadLimit - initialBytes)
assert.equal(production.residentUnitWorstOutcomeBytes(boundary), payloadLimit)
assert.equal(production.residentUnitFits(boundary), true)
boundary.identity += "x"
assert.equal(production.residentUnitWorstOutcomeBytes(boundary), payloadLimit + 1)
assert.equal(production.residentUnitFits(boundary), false)
cases += 2
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "Compiled Post sizing versus fixture-authored byte totals and getter sequences: thresholds, Unicode/escaping, large envelopes, exact IPC boundary and original sentinel at every getter position; finite regression evidence"
  })
)
