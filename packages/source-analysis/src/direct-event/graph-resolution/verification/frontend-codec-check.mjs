import assert from "node:assert/strict"
import fc from "fast-check"
import { mapGraphAbi } from "../abi-mapping.ts"

const convert = (key, value) => (key === "$" && typeof value === "string" ? "wire/" + value : value)
// Bounded independent oracle; deep production inputs use the iterative owner.
const reference = (value) => {
  if (Array.isArray(value)) return value.map(reference)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, reference(convert(key, item))]))
}
let cases = 0
fc.assert(
  fc.property(fc.jsonValue(), (value) => {
    assert.deepEqual(mapGraphAbi(value, convert), reference(value))
    cases++
  }),
  { seed: 7821, numRuns: 300 }
)

const chronology = (mapper) => {
  const trace = []
  const items = new Array(4)
  Object.defineProperty(items, "0", {
    get() {
      trace.push("get0")
      delete items[2]
      items[3] = { $: "Late", value: 3 }
      return { $: "First", value: 0 }
    },
    enumerable: true
  })
  items[2] = { $: "Deleted", value: 2 }
  const result = mapper(items, (key, value) => {
    trace.push(key)
    return convert(key, value)
  })
  return { result, trace }
}
const expected = chronology((value, field) => {
  const walk = (item) =>
    Array.isArray(item)
      ? item.map(walk)
      : item && typeof item === "object"
        ? Object.fromEntries(Object.entries(item).map(([key, child]) => [key, walk(field(key, child))]))
        : item
  return walk(value)
})
assert.deepEqual(chronology(mapGraphAbi), expected)
cases++

const input = JSON.parse('{"__proto__":{"$":"Safe"},"z":1,"a":2}')
const output = mapGraphAbi(input, convert)
assert.deepEqual(output, reference(input))
assert.equal(Object.getPrototypeOf(output), Object.prototype)
assert.equal(Object.hasOwn(output, "__proto__"), true)
assert.deepEqual(Object.keys(output), ["__proto__", "z", "a"])
cases++

const original = new Error("array getter failure")
const failed = new Array(1)
Object.defineProperty(failed, "0", {
  get() {
    throw original
  },
  enumerable: true
})
assert.throws(
  () => mapGraphAbi(failed, convert),
  (error) => error === original
)
cases++

let deep = { $: "Leaf" }
for (let index = 0; index < 25000; index++) deep = [deep]
let converted = mapGraphAbi(deep, convert)
for (let index = 0; index < 25000; index++) {
  assert.equal(converted.length, 1)
  converted = converted[0]
}
assert.deepEqual(converted, { $: "wire/Leaf" })
cases++
console.log(
  JSON.stringify({
    passed: true,
    cases,
    scope: "mechanical Graph ABI mapping, bounded independent oracle and deep/sparse/getter/prototype boundaries"
  })
)

// Closed Graph reply encoding agrees with the former recursive Nat transport
// on produced variants, while large facts retain their existing owner.
const { encodeGraphReply, encodeGraphToken, encodeGraphCache } = await import("../reply-codec.ts")
const { list } = await import("@hapsland/source-artifacts/direct-event/value/codec")
const tag = (name, fields = {}) => ({ $: "Types." + name, ...fields })
const naturalOracle = (value) => {
  if (Array.isArray(value)) return value.map(naturalOracle)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      naturalOracle(["id", "invocation", "bytes"].includes(key) && typeof item === "number" ? BigInt(item) : item)
    ])
  )
}
fc.assert(
  fc.property(fc.nat(), fc.nat(), fc.array(fc.nat(), { maxLength: 12 }), (invocation, id, sizes) => {
    const token = (name) => tag(name, { invocation, id })
    const captured = tag("SourceCaptured", { capture: token("CaptureToken"), relative_path: "root.ts", bytes: id })
    const outcomes = [
      tag("ClockStarted", { clock: token("ClockToken") }),
      tag("InvocationCacheCreated", { cache: token("CacheToken") }),
      tag("ProviderRejected", { exception: token("ExceptionToken") }),
      tag("AccessResult", { outcome: tag("AccessDenied") }),
      tag("AccessResult", {
        outcome: tag("AccessAllowed", { selection: token("SelectionToken"), relative_path: "root.ts" })
      }),
      tag("CacheResult", { outcome: tag("CacheAbsent") }),
      tag("CacheResult", { outcome: tag("CachePresent", { capture: token("CaptureToken"), bytes: id }) }),
      tag("CaptureResult", { outcome: captured }),
      tag("CaptureResult", {
        outcome: tag("CaptureUnavailable", { diagnostic: tag("CaptureDiagnostic", { value: { $: "Value.Null" } }) })
      }),
      tag("CacheSnapshot", { entries: list(sizes.map((bytes) => tag("CaptureBytes", { path: "root.ts", bytes }))) }),
      tag("ProductEncoded", { bytes: id }),
      tag("SourceTextEncoded", { bytes: id }),
      tag("ExtensionResult", { extension: ".ts" })
    ]
    for (const outcome of outcomes) {
      const reply = tag("Reply", { invocation, id, outcome })
      assert.deepEqual(encodeGraphReply(reply), naturalOracle(reply))
      assert.deepEqual(encodeGraphReply(encodeGraphReply(reply)), naturalOracle(reply))
    }
    assert.deepEqual(encodeGraphToken(token("CaptureToken")), naturalOracle(token("CaptureToken")))
    assert.deepEqual(
      encodeGraphCache({ $: "Some", value: token("CacheToken") }),
      naturalOracle({ $: "Some", value: token("CacheToken") })
    )
  }),
  { seed: 90817, numRuns: 200 }
)

const facts = { artifact: { id: "stable-artifact" } }
Object.defineProperty(facts, "unread", {
  enumerable: true,
  get() {
    throw new Error("unexpected facts traversal")
  }
})
const factsOutcome = tag("FrontendResult", { outcome: tag("SourceInspected", { facts }) })
assert.equal(encodeGraphReply(tag("Reply", { invocation: 1, id: 2, outcome: factsOutcome })).outcome, factsOutcome)
const { createServiceSession, performGraphServiceRequest, performGraphServiceEffect } =
  await import("../service-session.ts")
const Effect = await import("effect/Effect")
const invalid = createServiceSession({
  invocation: 1,
  root: "/",
  callerCache: new Map([["root.ts", { text: "", byteLength: 0.5 }]])
})
const request = tag("Request", {
  invocation: 1,
  id: 2,
  operation: tag("LookupCaptureCache", { cache: invalid.callerCache.value, path: "root.ts" })
})
await assert.rejects(performGraphServiceRequest(invalid, request), RangeError)
const exit = await Effect.runPromiseExit(performGraphServiceEffect(invalid, request))
assert.equal(exit._tag, "Failure", "conversion remains outside provider rejection recovery")
invalid.close()
console.log(
  JSON.stringify({ closedReplyCases: 2600, unchangedFacts: true, conversionFailureOutsideProviderCatch: true })
)

const { parseGoFileFacts } = await import("../go-module/parser-facts.ts")
const { parsePythonSyntax } = await import("../frontends.ts")
const { unlist } = await import("@hapsland/source-artifacts/direct-event/value/codec")
const goSyntax = parseGoFileFacts("root.go", "package root\nconst Answer = 1 + 2\n")
assert.ok(goSyntax)
const pythonSyntax = await parsePythonSyntax("answer = 1 + 2\n")
for (const rows of [unlist(goSyntax.expressions), unlist(pythonSyntax.nodes)]) {
  assert.ok(rows.length > 0)
  for (const row of rows) {
    assert.equal(typeof row.id, "bigint")
    assert.equal(typeof row.start, "number")
    assert.equal(typeof row.end, "number")
    for (const child of unlist(row.children)) assert.equal(typeof child, "number")
  }
}
for (const outcome of [
  tag("GoFileResult", { outcome: tag("GoFileInspected", { file: goSyntax }) }),
  tag("PythonSyntaxResult", { syntax: pythonSyntax })
]) {
  const reply = tag("Reply", { invocation: 1, id: 2, outcome })
  assert.deepEqual(encodeGraphReply(reply), naturalOracle(reply))
}
console.log(JSON.stringify({ realGoPythonSyntaxIds: true, neighboringNumericFieldsPreserved: true }))
