import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { productValue, fromBinary64 } from "@hapsland/source-artifacts/direct-event/value/codec"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-canonical-json-"))
const label = (value) => value.$.split(".").at(-1)
const namespace = "../../../../source-analysis/src/direct-event/graph-resolution/Types."
const wire = (value) => {
  if (Array.isArray(value)) return value.map(wire)
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string" && item.startsWith("Types.") ? namespace + item.slice(6) : wire(item)
      ])
    )
  return value
}
const primitive = (value) => {
  switch (label(value)) {
    case "NullPrimitive":
      return JSON.stringify(null)
    case "BoolPrimitive":
      return JSON.stringify(value.value)
    case "NumberPrimitive":
      return JSON.stringify(
        fromBinary64({ ...value.bits, $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64" })
      )
    case "StringPrimitive":
      return JSON.stringify(value.value)
    default:
      throw new Error("Unexpected primitive " + value.$)
  }
}
const primitiveTrace = (value) => {
  if (Array.isArray(value)) return value.flatMap(primitiveTrace)
  if (value !== null && typeof value === "object")
    return Object.keys(value)
      .sort()
      .flatMap((key) => [...primitiveTrace(key), ...primitiveTrace(value[key])])
  const kind = value === null ? "Null" : { boolean: "Bool", number: "Number", string: "String" }[typeof value]
  return [[kind + "Primitive", JSON.stringify(value)]]
}
try {
  const output = join(temporary, "canonical-json.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "CanonicalJson.bend"), "-o", output],
    { timeout: 6000 }
  )
  const stage = (await import(pathToFileURL(output))).default
  const visit = { $: "Visit", value: wire(productValue(null)) }
  let literals = { $: "Nil" }
  const tokens = Array.from({ length: 2048 }, (_, index) => (index % 2 ? "," : ":"))
  for (const token of [...tokens].reverse())
    literals = { $: "Con", head: { $: "Literal", value: token }, tail: literals }
  const parts = { $: "Con", head: "before", tail: { $: "Nil" } }
  const exhausted = stage.advance({ $: "State", pending: literals, reversed_parts: parts })
  assert.equal(label(exhausted), "Continue", "literal flush must not complete early")
  assert.equal(label(exhausted.state.pending), "Nil")
  assert.equal(stage.advance(exhausted.state).bytes, "before" + tokens.join(""))
  const stopped = stage.advance({
    $: "State",
    pending: { $: "Con", head: { $: "Literal", value: ":" }, tail: { $: "Con", head: visit, tail: { $: "Nil" } } },
    reversed_parts: parts
  })
  assert.equal(label(stopped), "Continue")
  assert.deepEqual(stopped.state.pending, { $: "Con", head: visit, tail: { $: "Nil" } })
  assert.equal(label(stage.advance(stopped.state)), "JsonPrimitive", "Visit retains its own primitive boundary")
  assert.equal(stage.advance({ $: "State", pending: { $: "Nil" }, reversed_parts: parts }).bytes, "before")
  const values = [
    null,
    true,
    false,
    0,
    -0,
    NaN,
    Infinity,
    -Infinity,
    1.5,
    '\u0000\n"\\😀',
    [],
    {},
    [1, { z: 2, a: [false, null] }],
    { "\ue000": 1, "😀": 2, a: 3 },
    { 10: 1, 2: 2, "01": 3 },
    { nested: { "\ud800": "\udfff", x: -0 }, array: [Infinity, "😀"] }
  ]
  for (let index = 0; index < 80; index++)
    values.push({ z: [index / 7, index % 2 === 0, null], a: { [String(index)]: "\n" + index } })
  let primitiveRequests = 0
  for (const value of values) {
    const trace = []
    let state = stage.initial(wire(productValue(value)))
    for (let steps = 0; ; steps++) {
      assert.ok(steps < 10000, "canonical traversal terminates")
      const step = stage.advance(state)
      if (label(step) === "Complete") {
        assert.equal(step.bytes, canonicalValue(value))
        assert.deepEqual(trace, primitiveTrace(value), "primitive order and values match the original traversal")
        break
      }
      if (label(step) === "Continue") state = step.state
      else {
        assert.equal(label(step), "JsonPrimitive")
        primitiveRequests++
        const token = primitive(step.value)
        trace.push([label(step.value), token])
        state = stage.primitive_returned(step.state, token)
      }
    }
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases: values.length,
      primitiveRequests,
      scope:
        "Compiled canonical JSON stage against current native canonicalValue; not whole finalization or production acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
