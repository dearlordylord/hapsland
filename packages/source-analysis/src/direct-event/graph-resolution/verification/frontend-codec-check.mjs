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
