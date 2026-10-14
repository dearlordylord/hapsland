import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { canonicalValue, semanticIdentity } from "@hapsland/review-definition/direct-event/model"

if (process.argv.length > 3) throw new Error("Expected at most one emitted-core diagnostic path")
const core = (
  await import(
    process.argv[2]
      ? pathToFileURL(resolve(process.argv[2])).href
      : "../../../dist/direct-event/freshness/publication-core.js"
  )
).default
const tag = (value) => value.$.split(".").at(-1)
const unlist = (value) => {
  const values = []
  while (tag(value) === "Con") {
    values.push(value.head)
    value = value.tail
  }
  assert.equal(tag(value), "Nil")
  return values
}
const sameInput = (left, right) => {
  const { sourceFingerprints: _lc, rootLocation: _ll, ...l } = left
  const { sourceFingerprints: _rc, rootLocation: _rl, ...r } = right
  return canonicalValue(l) === canonicalValue(r)
}
const sameAdvicee = (left, right) => canonicalValue(left) === canonicalValue(right)
export const reference = async (observation, evaluations, context, engines, authority) => {
  const empty = (status) => ({ status, evaluations: [], findings: [] })
  if (
    !(
      context.controlledWriter &&
      sameAdvicee(observation.advicee, context.advicee) &&
      evaluations.every(
        ({ prepared }) => prepared.root === observation.root && sameAdvicee(prepared.advicee, observation.advicee)
      )
    )
  )
    return empty("Unattributed")
  if (
    !(
      evaluations.length > 0 &&
      evaluations.every(
        (evaluation) =>
          evaluation.prepared.identity === semanticIdentity(evaluation.prepared.input) &&
          evaluation.findings.every(
            (finding) =>
              finding.semanticIdentity === evaluation.prepared.identity &&
              finding.path === evaluation.prepared.input.path &&
              finding.declaration === evaluation.prepared.input.declaration.name
          )
      )
    )
  )
    return empty("Unavailable")
  if (!(await engines.verifyRoot(observation))) return empty("Unavailable")
  const names = new Map()
  for (const evaluation of evaluations) {
    const input = evaluation.prepared.input
    const selected = names.get(input.path) ?? new Set()
    selected.add(input.declaration.name)
    names.set(input.path, selected)
  }
  const latest = await engines.prepare(observation, context, names)
  const current = latest.outcomes.flatMap((outcome) => (outcome.status === "ready" ? [outcome.prepared] : []))
  const retained = []
  let changed = false
  for (const evaluation of evaluations) {
    const expected = evaluation.prepared.input
    const subjects = current.filter(
      (prepared) =>
        prepared.input.path === expected.path && prepared.input.declaration.name === expected.declaration.name
    )
    const matching = subjects.find(
      (prepared) => prepared.identity === evaluation.prepared.identity && sameInput(prepared.input, expected)
    )
    if (matching !== undefined) retained.push(evaluation)
    else if (subjects.length > 0) changed = true
  }
  if (retained.length === 0) return empty(changed ? "Stale" : "Unavailable")
  const publishable = []
  for (const evaluation of retained)
    if (authority === undefined || (await authority.isCurrentWork(evaluation.prepared))) publishable.push(evaluation)
  if (publishable.length === 0) return empty("Stale")
  return { status: "Current", evaluations: publishable, findings: publishable.flatMap(({ findings }) => findings) }
}
let requests = 0
const consume = async (observation, evaluations, context, engines, authority) => {
  const values = new Map()
  let nextHandle = 0n
  const store = (value) => {
    const id = nextHandle++
    values.set(id, value)
    return id
  }
  const read = (lens) => unlist(lens.fields).reduce((value, key) => value[key], values.get(lens.object))
  let activeIterator,
    iteratorBody = false
  const iterator = (array) =>
    (function* () {
      for (const value of array) yield value
    })()
  const primitive = async (q) => {
    switch (tag(q)) {
      case "Read":
        return { $: "Handle", value: store(read(q.value)) }
      case "Truthy":
        return { $: "Flag", value: !!read(q.value) }
      case "Equal":
        return { $: "Flag", value: read(q.left) === read(q.right) }
      case "AdviceeEqual": {
        const left = read(q.left),
          right = read(q.right)
        return { $: "Flag", value: canonicalValue(left) === canonicalValue(right) }
      }
      case "EqualValues":
        return { $: "Flag", value: values.get(q.left) === values.get(q.right) }
      case "Identity":
        return { $: "Handle", value: store(semanticIdentity(values.get(q.input))) }
      case "InputEqual":
        return { $: "Flag", value: sameInput(values.get(q.left), values.get(q.right)) }
      case "Length":
        return { $: "Count", value: BigInt(values.get(q.array).length) }
      case "Element": {
        const array = values.get(q.array)
        return q.index in array ? { $: "Handle", value: store(array[q.index]) } : { $: "Missing" }
      }
      case "VerifyRoot":
        return { $: "Flag", value: await engines.verifyRoot(values.get(q.observation)) }
      case "NewMap":
        return { $: "Handle", value: store(new Map()) }
      case "NewSet":
        return { $: "Handle", value: store(new Set()) }
      case "MapGet": {
        const found = values.get(q.map).get(values.get(q.key))
        return found == null ? { $: "Missing" } : { $: "Handle", value: store(found) }
      }
      case "SetAdd":
        values.get(q.set).add(values.get(q.value))
        return { $: "Acknowledged" }
      case "MapSet":
        values.get(q.map).set(values.get(q.key), values.get(q.value))
        return { $: "Acknowledged" }
      case "Iterator":
        return { $: "Handle", value: store(iterator(values.get(q.array))) }
      case "IteratorNext": {
        iteratorBody = false
        activeIterator = values.get(q.iterator)
        const next = activeIterator.next()
        iteratorBody = !next.done
        return next.done ? { $: "End" } : { $: "Handle", value: store(next.value) }
      }
      case "Prepare":
        return { $: "Handle", value: store(await engines.prepare(observation, context, values.get(q.names))) }
      case "StatusReady":
        return { $: "Flag", value: values.get(q.outcome).status === "ready" }
      case "FreshArray":
        return { $: "Handle", value: store(unlist(q.values).map((id) => values.get(id))) }
      case "CurrentMethod":
        return { $: "Handle", value: store(authority.isCurrentWork) }
      case "CurrentWork":
        return { $: "Flag", value: await values.get(q.method).call(authority, values.get(q.prepared)) }
      case "IsArray":
        return { $: "Flag", value: Array.isArray(values.get(q.value)) }
      case "RetentionQuery": {
        const response = await primitive(q.query)
        return { $: "RetentionResponse", response: { ...response, $: "PublicationRetention." + tag(response) } }
      }
      default:
        assert.fail("Unexpected publication query " + q.$)
    }
  }
  let step = core.initial(31n, {
    $: "Input",
    observation: store(observation),
    evaluations: store(evaluations),
    context: store(context),
    authority: authority !== undefined
  })
  let previousRequest = 0n
  try {
    for (let count = 0; ; count++) {
      assert.ok(count < 100000, "publication terminates")
      if (tag(step) === "Completed")
        return {
          status: tag(step.status),
          evaluations: unlist(step.evaluations).map((id) => values.get(id)),
          findings: unlist(step.findings).map((id) => values.get(id))
        }
      assert.equal(tag(step), "Await")
      assert.ok(step.frame.request > previousRequest, "prefix and suffix correlation is monotonic")
      previousRequest = step.frame.request
      const response = await primitive(step.query)
      const reply = { $: "Reply", invocation: step.frame.invocation, request: step.frame.request, response }
      assert.equal(tag(core.resume(step, { ...reply, invocation: reply.invocation + 1n })), "InvalidReply")
      assert.equal(tag(core.resume(step, { ...reply, request: reply.request + 1n })), "InvalidReply")
      requests++
      step = core.resume(step, reply)
    }
  } catch (error) {
    if (iteratorBody) activeIterator.throw(error)
    throw error
  }
}
const traced = (label, record, trace) =>
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        {
          enumerable: true,
          get() {
            trace.push(label + "." + key)
            return value
          }
        }
      ])
    )
  )
export const fixture = (bits, trace) => {
  const rawInput = {
    path: "a",
    declaration: { name: "Type" },
    text: "source",
    sourceFingerprints: { revision: "old" },
    rootLocation: "old-root"
  }
  const identity = semanticIdentity(rawInput)
  const input = traced("input", { ...rawInput, declaration: traced("declaration", rawInput.declaration, trace) }, trace)
  const advicee = { kind: "runtime", session: "one" }
  const observation = traced("observation", { root: "root", advicee }, trace)
  const context = traced(
    "context",
    { controlledWriter: !(bits & 1), advicee: bits & 2 ? { kind: "other" } : advicee },
    trace
  )
  const prepared = traced(
    "prepared",
    { root: bits & 4 ? "other" : "root", advicee, identity: bits & 8 ? "invalid" : identity, input },
    trace
  )
  const finding = traced(
    "finding",
    { semanticIdentity: identity, path: bits & 16 ? "other" : "a", declaration: "Type" },
    trace
  )
  const evaluation = traced("evaluation", { prepared, findings: [finding] }, trace)
  const current = {
    root: "root",
    advicee,
    identity,
    input: { ...rawInput, sourceFingerprints: { revision: "new" }, rootLocation: "new-root" }
  }
  const engines = {
    async verifyRoot(value) {
      assert.equal(value, observation)
      trace.push("verifyRoot")
      return !(bits & 32)
    },
    async prepare(value, settings, names) {
      assert.equal(value, observation)
      assert.equal(settings, context)
      trace.push(["prepare", [...names].map(([path, names]) => [path, [...names]])])
      return { outcomes: bits & 64 ? [] : [{ status: "ready", prepared: current }] }
    }
  }
  const authority = {
    async isCurrentWork(value) {
      assert.equal(value, prepared)
      trace.push("authority")
      return !(bits & 128)
    }
  }
  return { observation, evaluations: [evaluation], context, engines, authority }
}
const resultRecord = (result, fixture, trace) => {
  const chronology = [...trace]
  const evaluations = result.evaluations.map((value) => fixture.evaluations.indexOf(value))
  const originalFindings = fixture.evaluations.flatMap((evaluation) => evaluation.findings)
  const findings = result.findings.map((value) => originalFindings.indexOf(value))
  assert.ok(
    evaluations.every((index) => index >= 0),
    "exact original evaluation references"
  )
  assert.ok(
    findings.every((index) => index >= 0),
    "exact original finding references"
  )
  return { status: result.status, evaluations, findings, trace: chronology }
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let cases = 0
  for (let bits = 0; bits < 256; bits++) {
    const lanes = []
    for (const implementation of [reference, consume]) {
      const trace = []
      const f = fixture(bits, trace)
      const result = await implementation(f.observation, f.evaluations, f.context, f.engines, f.authority)
      lanes.push(resultRecord(result, f, trace))
    }
    assert.deepEqual(lanes[1], lanes[0], "publication fixture " + bits)
    cases++
  }
  for (const scenario of [
    "authority-getter",
    "authority-throw",
    "authority-absent",
    "advicee-nested",
    "advicee-throw",
    "empty",
    "duplicates",
    "sparse-findings",
    "sparse-evaluations",
    "names-path",
    "names-throw",
    "root-throw",
    "prepare-throw"
  ]) {
    const lanes = []
    for (const implementation of [reference, consume]) {
      const trace = []
      const f = fixture(0, trace)
      const originalError = new Error("original " + scenario)
      if (scenario === "authority-absent") f.authority = undefined
      if (scenario === "authority-getter" || scenario === "authority-throw") {
        f.authority = {
          get isCurrentWork() {
            trace.push("authority method read")
            if (scenario === "authority-throw") throw originalError
            return function (prepared) {
              assert.equal(this, f.authority)
              assert.equal(prepared, f.evaluations[0].prepared)
              trace.push("authority receiver call")
              return true
            }
          }
        }
      }
      if (scenario === "advicee-nested" || scenario === "advicee-throw") {
        let right = { session: "same" }
        const left = {
          get session() {
            trace.push("left advicee serialization")
            if (scenario === "advicee-throw") throw originalError
            right = { session: "mutated" }
            return "same"
          }
        }
        f.observation = {
          root: "root",
          get advicee() {
            trace.push("observation advicee read")
            return left
          }
        }
        f.context = {
          controlledWriter: true,
          get advicee() {
            trace.push("context advicee read")
            return right
          }
        }
      }
      if (scenario === "empty") f.evaluations = []
      if (scenario === "duplicates") f.evaluations = [f.evaluations[0], f.evaluations[0]]
      if (scenario === "sparse-findings") {
        const evaluation = f.evaluations[0]
        const findings = new Array(3)
        findings[2] = evaluation.findings[0]
        f.evaluations = [{ prepared: evaluation.prepared, findings }]
      }
      if (scenario === "sparse-evaluations") f.evaluations = Object.assign(new Array(2), { 1: f.evaluations[0] })
      if (scenario === "root-throw")
        f.engines.verifyRoot = async () => {
          trace.push("root failure")
          throw originalError
        }
      if (scenario === "prepare-throw")
        f.engines.prepare = async () => {
          trace.push("prepare failure")
          throw originalError
        }
      if (scenario === "names-path" || scenario === "names-throw") {
        let namesPhase = false,
          namesReads = 0
        const old = f.evaluations[0]
        const rawInput = { ...old.prepared.input }
        const input = {
          ...rawInput,
          get path() {
            trace.push("changing path")
            if (namesPhase) {
              if (scenario === "names-throw") throw originalError
              return ++namesReads === 2 ? "b" : "a"
            }
            return "a"
          }
        }
        const evaluation = { prepared: { ...old.prepared, input }, findings: old.findings }
        f.evaluations = [evaluation]
        const verify = f.engines.verifyRoot,
          prepare = f.engines.prepare
        f.engines.verifyRoot = async (...args) => {
          const result = await verify(...args)
          namesPhase = true
          return result
        }
        f.engines.prepare = async (...args) => {
          namesPhase = false
          return prepare(...args)
        }
        f.authority = {
          async isCurrentWork(prepared) {
            assert.equal(prepared, evaluation.prepared)
            trace.push("authority")
            return true
          }
        }
        if (scenario === "names-throw") {
          const array = f.evaluations
          array[Symbol.iterator] = function () {
            const iterator = Array.prototype[Symbol.iterator].call(this)
            iterator.return = () => {
              trace.push("iterator close")
              throw new Error("cleanup failure")
            }
            return iterator
          }
        }
      }
      try {
        const result = await implementation(f.observation, f.evaluations, f.context, f.engines, f.authority)
        lanes.push(resultRecord(result, f, trace))
      } catch (error) {
        if (scenario.endsWith("throw")) assert.equal(error, originalError)
        lanes.push({ error: error.name, trace: [...trace] })
      }
    }
    assert.deepEqual(lanes[1], lanes[0], scenario)
    cases++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      requests,
      scope:
        "complete lazy publication prefix and retention suffix; production synchronous grouping, Canonical adoption, lazy Bend JSON and universal proof remain open"
    })
  )
}
