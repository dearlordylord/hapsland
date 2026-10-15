import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { productValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { canonicalJsonPlanOperations } from "./canonical-json-plan-codec.ts"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-json-plan-validation-"))
const prefix = "../../../../source-artifacts/src/direct-event/value/Value."
const operations = (value) =>
  unlist(canonicalJsonPlanOperations(value)).map((operation) => ({
    ...operation,
    $: "CanonicalJsonPlan." + operation.$
  }))
// Independent tree walk used only by this finite consumer.
const reference = (value) => {
  switch (value.$.slice(prefix.length)) {
    case "ProductNull":
      return [{ $: "CanonicalJsonPlan.PrimitiveOperation", value: { $: "CanonicalJson.NullPrimitive" } }]
    case "ProductBool":
      return [
        { $: "CanonicalJsonPlan.PrimitiveOperation", value: { $: "CanonicalJson.BoolPrimitive", value: value.value } }
      ]
    case "ProductText":
      return [
        { $: "CanonicalJsonPlan.PrimitiveOperation", value: { $: "CanonicalJson.StringPrimitive", value: value.value } }
      ]
    case "ProductNumber":
      return [
        { $: "CanonicalJsonPlan.PrimitiveOperation", value: { $: "CanonicalJson.NumberPrimitive", bits: value.bits } }
      ]
    case "ProductArray": {
      const children = unlist(value.items)
      return [...children.flatMap(reference), { $: "CanonicalJsonPlan.ArrayOperation", arity: (children.length) }]
    }
    case "ProductObject": {
      const fields = unlist(value.fields)
      return [
        ...fields.flatMap((field) => reference(field.value)),
        { $: "CanonicalJsonPlan.ObjectOperation", keys: list(fields.map((field) => field.key)) }
      ]
    }
    default:
      throw new Error("Unknown reference tree")
  }
}
try {
  const output = join(temporary, "validation.mjs")
  execFileSync(
    "timeout",
    [
      "-s",
      "KILL",
      "10s",
      "taskset",
      "-c",
      "10",
      process.env.BEND ?? "bend",
      join(import.meta.dirname, "CanonicalJsonPlanValidation.bend"),
      "-o",
      output
    ],
    { timeout: 11000 }
  )
  const validator = (await import(pathToFileURL(output))).default
  const strings = [
    "",
    "a",
    "b",
    "aa",
    "ab",
    "a\u0000b",
    "λ😀",
    "\ue000",
    "\ud800",
    "\udfff",
    "prefix".repeat(1000),
    "prefix".repeat(1000) + "!",
    "x".repeat(22000)
  ]
  let equalityCases = 0
  for (const left of strings)
    for (const right of strings) {
      for (const same of [false, true]) {
        assert.equal(validator.equal_go(left, right, same), same && left === right)
        equalityCases++
      }
      assert.equal(validator.validate(list(operations(productValue(left))), productValue(right)), left === right)
      const expected = productValue({ [right]: true })
      const changed = operations(expected).map((operation) =>
        operation.$ === "CanonicalJsonPlan.ObjectOperation" ? { ...operation, keys: list([left]) } : operation
      )
      assert.equal(validator.validate(list(changed), expected), left === right)
      equalityCases += 2
    }
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
    '\u0000"\\😀',
    [],
    {},
    [1, { z: 2, a: [false, null] }],
    { "\ue000": 1, "😀": 2, z: 3, a: 4 }
  ].map(productValue)
  const duplicate = productValue({ key: 1 })
  values.push({ ...duplicate, fields: list([...unlist(duplicate.fields), ...unlist(productValue({ key: 2 }).fields)]) })
  for (const low of [1, 0x12345678]) {
    const number = productValue(NaN)
    values.push({ ...number, bits: { ...number.bits, low } })
  }
  for (let seed = 0; seed < 62; seed++)
    values.push(productValue({ z: [seed, null, { c: seed % 2 === 0, a: `value-${seed}` }], a: [[], false] }))
  let cases = 0,
    refusals = 0,
    continuations = 0
  for (const value of values) {
    const actual = operations(value)
    assert.deepEqual(actual, reference(value))
    assert.equal(validator.validate(list(actual), value), true)
    assert.equal(validator.validate_reversed(list([...actual].reverse()), list([value])), true)
    cases++
    const invalid = [actual.slice(1), [...actual, actual[0]], operations(productValue("different root"))]
    for (let index = 0; index < actual.length; index++) {
      const operation = actual[index]
      let changed
      if (operation.$ === "CanonicalJsonPlan.PrimitiveOperation") {
        const primitive = operation.value
        if (primitive.$ === "CanonicalJson.NumberPrimitive")
          changed = {
            ...operation,
            value: { ...primitive, bits: { ...primitive.bits, low: (primitive.bits.low ^ 1) >>> 0 } }
          }
        else if (primitive.$ === "CanonicalJson.BoolPrimitive")
          changed = { ...operation, value: { ...primitive, value: !primitive.value } }
        else if (primitive.$ === "CanonicalJson.StringPrimitive")
          changed = { ...operation, value: { ...primitive, value: primitive.value + "!" } }
        else changed = { ...operation, value: { $: "CanonicalJson.BoolPrimitive", value: false } }
        invalid.push(
          actual.map((entry, at) => (at === index ? { $: "CanonicalJsonPlan.ArrayOperation", arity: 0 } : entry))
        )
      } else if (operation.$ === "CanonicalJsonPlan.ArrayOperation")
        changed = { ...operation, arity: operation.arity + 1 }
      else {
        const keys = unlist(operation.keys)
        changed = { ...operation, keys: list([...keys, "extra key"]) }
        if (keys.length > 1 && keys[0] !== keys.at(-1))
          invalid.push(
            actual.map((entry, at) => (at === index ? { ...operation, keys: list([...keys].reverse()) } : entry))
          )
      }
      invalid.push(actual.map((entry, at) => (at === index ? changed : entry)))
    }
    for (const bad of invalid) {
      assert.equal(validator.validate(list(bad), value), false)
      refusals++
    }
  }
  assert.equal(values.length, 79)
  assert.equal(validator.validate_reversed(list([]), list([])), true)
  assert.equal(validator.validate_reversed(list([]), list([productValue(null)])), false)
  assert.equal(validator.validate_reversed(list(operations(productValue(null))), list([])), false)
  for (const value of [productValue([1, "second"]), productValue({ z: true, a: "second" })]) {
    const reversed = operations(value).reverse()
    const children = value.items ? unlist(value.items) : unlist(value.fields).map((field) => field.value)
    assert.equal(validator.validate_reversed(list(reversed.slice(1)), list([...children].reverse())), true)
    assert.equal(validator.validate_reversed(list(reversed.slice(1)), list(children)), false)
    continuations++
  }
  console.log(
    JSON.stringify({
      passed: true,
      cases,
      refusals,
      continuations,
      equalityCases,
      scope: "actual emitted plan validator; finite codec and continuation checks, not whole proof/runtime acceptance"
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
