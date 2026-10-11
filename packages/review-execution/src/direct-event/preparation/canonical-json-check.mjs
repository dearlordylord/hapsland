import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import {
  productValue,
  fromBinary64
} from "../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs"

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
      return JSON.stringify(fromBinary64({ ...value.bits, $: "Types.Binary64" }))
    case "StringPrimitive":
      return JSON.stringify(value.value)
    default:
      throw new Error("Unexpected primitive " + value.$)
  }
}
try {
  const output = join(temporary, "canonical-json.mjs")
  execFileSync(
    "timeout",
    ["5s", "taskset", "-c", "10", "bend", join(import.meta.dirname, "CanonicalJson.bend"), "-o", output],
    { timeout: 6000 }
  )
  const stage = (await import(pathToFileURL(output))).default
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
    let state = stage.initial(wire(productValue(value)))
    for (let steps = 0; ; steps++) {
      assert.ok(steps < 10000, "canonical traversal terminates")
      const step = stage.advance(state)
      if (label(step) === "Complete") {
        assert.equal(step.bytes, canonicalValue(value))
        break
      }
      if (label(step) === "Continue") state = step.state
      else {
        assert.equal(label(step), "JsonPrimitive")
        primitiveRequests++
        state = stage.primitive_returned(step.state, primitive(step.value))
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
