import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"

if (process.argv.length > 3) throw new Error("Expected at most one emitted-core diagnostic path")
const core = (
  await import(
    process.argv[2]
      ? pathToFileURL(resolve(process.argv[2])).href
      : "../../../dist/direct-event/freshness/publication-retention-core.js"
  )
).default
const tag = (value) => value.$.split(".").at(-1)
const unlist = (value) => {
  const result = []
  while (tag(value) === "Con") {
    result.push(value.head)
    value = value.tail
  }
  assert.equal(tag(value), "Nil")
  return result
}
const sameInput = (left, right) => {
  const { sourceFingerprints: _lc, rootLocation: _ll, ...l } = left
  const { sourceFingerprints: _rc, rootLocation: _rl, ...r } = right
  return canonicalValue(l) === canonicalValue(r)
}
const reference = async (evaluations, current, authority) => {
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
  if (retained.length === 0) return { status: changed ? "Stale" : "Unavailable", evaluations: [], findings: [] }
  const publishable = []
  for (const evaluation of retained)
    if (authority === undefined || (await authority.isCurrentWork(evaluation.prepared))) publishable.push(evaluation)
  if (publishable.length === 0) return { status: "Stale", evaluations: [], findings: [] }
  return { status: "Current", evaluations: publishable, findings: publishable.flatMap(({ findings }) => findings) }
}
let requests = 0
const consume = async (evaluations, current, authority) => {
  const handles = new Map()
  let next = 0n
  const store = (value) => {
    const id = next++
    handles.set(id, value)
    return id
  }
  const read = (lens) => unlist(lens.fields).reduce((value, key) => value[key], handles.get(lens.object))
  let activeIterator
  let iteratorBody = false
  let step = core.initial(11n, {
    $: "Input",
    evaluations: store(evaluations),
    current: store(current),
    authority: authority !== undefined
  })
  try {
    for (let count = 0; ; count++) {
      assert.ok(count < 100000, "publication retention terminates")
      if (tag(step) === "Completed")
        return {
          status: tag(step.status),
          evaluations: unlist(step.evaluations).map((id) => handles.get(id)),
          findings: unlist(step.findings).map((id) => handles.get(id))
        }
      assert.equal(tag(step), "Await")
      const q = step.query
      let response
      switch (tag(q)) {
        case "Iterator":
          response = {
            $: "Handle",
            value: store(
              (function* () {
                for (const value of handles.get(q.array)) yield value
              })()
            )
          }
          break
        case "IteratorNext": {
          iteratorBody = false
          activeIterator = handles.get(q.iterator)
          const next = activeIterator.next()
          iteratorBody = !next.done
          response = next.done ? { $: "End" } : { $: "Handle", value: store(next.value) }
          break
        }
        case "Read":
          response = { $: "Handle", value: store(read(q.value)) }
          break
        case "Equal":
          response = { $: "Flag", value: read(q.left) === read(q.right) }
          break
        case "InputEqual":
          response = { $: "Flag", value: sameInput(handles.get(q.left), handles.get(q.right)) }
          break
        case "CurrentMethod":
          response = { $: "Handle", value: store(authority.isCurrentWork) }
          break
        case "CurrentWork":
          response = { $: "Flag", value: await handles.get(q.method).call(authority, handles.get(q.prepared)) }
          break
        case "IsArray":
          response = { $: "Flag", value: Array.isArray(handles.get(q.value)) }
          break
        case "Length":
          response = { $: "Count", value: BigInt(handles.get(q.array).length) }
          break
        case "Element": {
          const array = handles.get(q.array)
          response = q.index in array ? { $: "Handle", value: store(array[q.index]) } : { $: "Missing" }
          break
        }
        default:
          assert.fail("Unexpected query " + q.$)
      }
      requests++
      const reply = { $: "Reply", invocation: step.frame.invocation, request: step.frame.request, response }
      assert.equal(tag(core.resume(step, { ...reply, invocation: reply.invocation + 1n })), "InvalidReply")
      assert.equal(tag(core.resume(step, { ...reply, request: reply.request + 1n })), "InvalidReply")
      step = core.resume(step, reply)
    }
  } catch (error) {
    // Native for-of performs IteratorClose with original exception precedence.
    if (iteratorBody) activeIterator.throw(error)
    throw error
  }
}
const prepared = (path, identity = path, text = path) => ({
  identity,
  input: { path, declaration: { name: "Type" }, text }
})
const a = prepared("a"),
  b = prepared("b")
const ea = { prepared: a, findings: ["a1", "a2"] },
  eb = { prepared: b, findings: ["b1"] }
let cases = 0
for (const evaluations of [[], [ea], [ea, eb], [ea, ea, eb], [eb, ea]])
  for (const current of [[], [a], [b, a], [prepared("a", "wrong"), a], [prepared("a", "a", "changed")]])
    for (const enabled of [false, true]) {
      const traces = [],
        results = []
      for (const implementation of [reference, consume]) {
        const trace = []
        const authority = enabled
          ? {
              async isCurrentWork(prepared) {
                trace.push(prepared.identity)
                return prepared.identity !== "b"
              }
            }
          : undefined
        results.push(await implementation(evaluations, current, authority))
        traces.push(trace)
      }
      assert.deepEqual(results[1], results[0])
      assert.deepEqual(traces[1], traces[0])
      cases++
    }
for (const returnThrows of [false, true]) {
  const results = []
  for (const implementation of [reference, consume]) {
    const originalError = new Error("original evaluation getter")
    const trace = []
    const evaluations = {
      [Symbol.iterator]() {
        trace.push("iterator")
        return {
          next() {
            trace.push("next")
            return {
              done: false,
              value: {
                get prepared() {
                  trace.push("prepared")
                  throw originalError
                }
              }
            }
          },
          return() {
            trace.push("return")
            if (returnThrows) throw new Error("cleanup")
            return { done: true }
          }
        }
      }
    }
    await assert.rejects(
      () => implementation(evaluations, [], undefined),
      (error) => error === originalError
    )
    results.push(trace)
  }
  assert.deepEqual(results[1], results[0])
  cases++
}
{
  const lanes = []
  for (const implementation of [reference, consume]) {
    const current = []
    const trace = []
    let added = false
    const candidate = {
      ...a,
      input: {
        ...a.input,
        get path() {
          trace.push("path")
          if (!added) {
            added = true
            current.push(b)
          }
          return "a"
        }
      }
    }
    current.push(candidate)
    const sparse = new Array(3)
    sparse[2] = "one"
    lanes.push({ result: await implementation([{ prepared: a, findings: sparse }, eb], current, undefined), trace })
  }
  assert.equal(lanes[0].result.evaluations.length, 2)
  assert.deepEqual(lanes[0].result.findings, ["one", "b1"])
  assert.deepEqual(lanes[1], lanes[0])
  cases++
}
console.log(
  JSON.stringify({
    passed: true,
    cases,
    requests,
    scope:
      "complete publication retention/authority/findings suffix; prefix, synchronous grouping, proof and production adoption remain open"
  })
)
