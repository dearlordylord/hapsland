import assert from "node:assert/strict"
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
  const raw = {
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
  }
  const unit = wrap(raw, "unit")
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
    raw,
    prepared,
    findings,
    planned,
    context,
    sentinel,
    trace,
    ports: { uuid: port("uuid", "uuid"), now: port("now", 123), environmentOnly: port("environmentOnly", true) }
  }
}
// Finite authored decisions and observation plans. No native enrollment recipe
// computes expected policy, records or the failure-prefix oracle.
const controlledCases = [
  [null, true, false, ["unit.dispatch", "unit.dispatch.controlled"]],
  [
    {},
    false,
    true,
    [
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch.controlled.requireCredential"
    ]
  ],
  [
    { requireCredential: false },
    false,
    true,
    [
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch.controlled.requireCredential"
    ]
  ],
  [
    { requireCredential: true },
    true,
    true,
    [
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch",
      "unit.dispatch.controlled",
      "unit.dispatch.controlled.requireCredential"
    ]
  ]
]
const credentialReads = ["unit.dispatch.credential.generation", "unit.dispatch.credential.statePath"]
const environmentReads = ["unit.settings", "port:environmentOnly", "unit.settings"]
const credentialCases = [
  [null, null, null, false, [], []],
  [undefined, null, null, true, [], environmentReads],
  [{}, null, null, true, credentialReads, environmentReads],
  [{ generation: 0, statePath: "" }, 0, "", true, credentialReads, environmentReads],
  [{ generation: 7, statePath: "/state" }, 7, "/state", true, credentialReads, environmentReads]
]
const fallbackAnalytics = ["unit.analyticsEnabled", "unit.dispatch", "unit.dispatch.sessionAnalytics"]
const explicitAnalytics = ["unit.analyticsEnabled"]
const analyticsCases = [
  [undefined, undefined, false, fallbackAnalytics],
  [undefined, false, false, fallbackAnalytics],
  [undefined, true, true, fallbackAnalytics],
  [null, undefined, false, fallbackAnalytics],
  [null, false, false, fallbackAnalytics],
  [null, true, true, fallbackAnalytics],
  [false, undefined, false, explicitAnalytics],
  [false, false, false, explicitAnalytics],
  [false, true, false, explicitAnalytics],
  [true, undefined, true, explicitAnalytics],
  [true, false, true, explicitAnalytics],
  [true, true, true, explicitAnalytics]
]
const optionalCases = [
  [undefined, {}, {}, ["unit.round"], ["unit.workUnitId"], ["unit.sourceHash"]],
  [
    null,
    { round: null },
    { workUnitId: null, sourceHash: null },
    ["unit.round", "unit.round"],
    ["unit.workUnitId", "unit.workUnitId"],
    ["unit.sourceHash", "unit.sourceHash"]
  ],
  [
    0,
    { round: 0 },
    { workUnitId: 0, sourceHash: 0 },
    ["unit.round", "unit.round"],
    ["unit.workUnitId", "unit.workUnitId"],
    ["unit.sourceHash", "unit.sourceHash"]
  ]
]
const compare = (controlledCase, credentialCase, analyticsCase, optionalCase, faultAt = 0) => {
  const [controlled, required, analyticsControlled, controlledReads] = controlledCase
  const [credential, generation, statePath, environmentOnly, credentialFields, environmentFields] = credentialCase
  const [analyticsEnabled, sessionAnalytics, expectedAnalytics, analyticsReads] = analyticsCase
  const [optional, roundFields, otherFields, roundReads, workReads, hashReads] = optionalCase
  const left = fixture({ controlled, credential, analyticsEnabled, sessionAnalytics, optional }, faultAt)
  const expectedTrace = [
    "unit.dispatch",
    "unit.dispatch.credential",
    ...controlledReads,
    "unit.prepared",
    "planned.cached",
    "planned.cached.evaluation",
    "planned.cached.evaluation.findings",
    "unit.dispatch",
    "unit.dispatch.activityPath",
    ...analyticsReads,
    "unit.dispatch",
    "unit.dispatch.controlled",
    "port:uuid",
    ...roundReads,
    ...workReads,
    "unit.admissionId",
    "unit.canonicalOperationId",
    "unit.canonicalRound",
    "unit.observation",
    "unit.settings",
    "unit.partition",
    "unit.reservation",
    "unit.prepared",
    ...hashReads,
    "unit.revision",
    "unit.evaluationKey",
    "context.sequence",
    ...credentialFields,
    ...environmentFields,
    "port:now"
  ]
  let actual,
    failed = false
  try {
    actual = enrollCachedAdvice(left.unit, left.planned, left.context, left.ports)
  } catch (error) {
    assert.equal(error, left.sentinel)
    failed = true
  }
  assert.equal(failed, faultAt > 0, "sentinel must fail at the authored observation")
  assert.deepEqual(
    left.trace,
    faultAt > 0 ? expectedTrace.slice(0, faultAt) : expectedTrace,
    "complete ordered observations or exact failed prefix"
  )
  if (!failed) {
    const evaluation = { prepared: left.prepared, findings: left.findings }
    const expected = {
      initial: {
        analyticsPath: "/activity",
        analyticsEnabled: expectedAnalytics,
        analyticsControlled,
        id: "uuid",
        ...roundFields,
        ...Object.fromEntries(Object.entries(otherFields).filter(([key]) => key === "workUnitId")),
        admissionId: 1,
        canonicalOperationId: 2,
        canonicalRound: 3,
        observation: left.raw.observation,
        settings: left.raw.settings,
        partition: "partition",
        reservation: left.raw.reservation,
        prepared: left.prepared,
        ...Object.fromEntries(Object.entries(otherFields).filter(([key]) => key === "sourceHash")),
        revision: left.raw.revision,
        evaluationKey: "evaluation",
        evaluations: [evaluation],
        findings: left.findings,
        sequence: 5,
        credentialGeneration: generation,
        credentialStatePath: statePath,
        credentialRequired: required,
        credentialEnvironmentOnly: environmentOnly,
        pendingAt: 123
      },
      evaluation
    }
    assert.deepEqual(actual, expected)
    assert.deepEqual(Object.keys(actual.initial), Object.keys(expected.initial))
    assert.equal(actual.evaluation.prepared, left.unit.prepared)
    assert.equal(actual.initial.evaluations[0], actual.evaluation)
    assert.equal(actual.evaluation.findings, left.planned.cached.evaluation.findings)
    assert.equal(actual.initial.findings, actual.evaluation.findings)
    for (const field of ["observation", "settings", "reservation", "revision"])
      assert.equal(actual.initial[field], left.unit[field], "retained " + field + " identity")
  }
  cases++
  return expectedTrace.length
}
for (const controlled of controlledCases)
  for (const credential of credentialCases)
    for (const analytics of analyticsCases)
      for (const optional of optionalCases) compare(controlled, credential, analytics, optional)
for (const [controlled, credential, analytics, optional] of [
  [controlledCases[0], credentialCases[0], analyticsCases[0], optionalCases[0]],
  [controlledCases[3], credentialCases[4], analyticsCases[6], optionalCases[2]]
]) {
  const count = compare(controlled, credential, analytics, optional)
  for (let faultAt = 1; faultAt <= count; faultAt++) compare(controlled, credential, analytics, optional, faultAt)
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope:
      "packaged Bend Post enrollment against authored credential/nullish/analytics/optional decisions, full record and property order, input identity and fixed getter/port traces with sentinel identity at every observed prefix; finite evidence, not universal correspondence"
  })
)
