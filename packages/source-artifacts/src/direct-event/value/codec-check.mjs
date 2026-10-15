import assert from "node:assert/strict"
import {
  binary64,
  fromBinary64,
  productValue,
  fromProductValue,
  list
} from "@hapsland/source-artifacts/direct-event/value/codec"

const sentinel = new Error("head accessed before validation")
for (const [tag, property] of [
  ["../../../../source-artifacts/src/direct-event/value/Value.ProductArray", "items"],
  ["../../../../source-artifacts/src/direct-event/value/Value.ProductObject", "fields"]
]) {
  const spine = {
    $: "Con",
    get head() {
      throw sentinel
    },
    tail: { $: "Malformed" }
  }
  assert.throws(() => fromProductValue({ $: tag, [property]: spine }), { message: "invalid list" })
  spine.tail = { $: "Nil" }
  assert.throws(
    () => fromProductValue({ $: tag, [property]: spine }),
    (error) => error === sentinel
  )
}
for (const value of [-0, 0, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE])
  assert.ok(Object.is(fromBinary64(binary64(value)), value))
// Nested numeric coercion must finish before the outer full-width write.
const nested = {
  valueOf() {
    assert.ok(Object.is(fromBinary64(binary64(-0)), -0))
    return Number.MAX_VALUE
  }
}
assert.equal(fromBinary64(binary64(nested)), Number.MAX_VALUE)
const retained = binary64(Math.PI)
binary64(Number.MIN_VALUE)
assert.equal(fromBinary64(retained), Math.PI)
const callable = Object.assign(() => {}, {
  $: "../../../../source-artifacts/src/direct-event/value/Value.ProductText",
  value: "callable constructor"
})
assert.equal(fromProductValue(callable), "callable constructor")
const input = JSON.parse('{"__proto__":{"nested":[true,null,"value"]},"z":1,"a":2}')
assert.deepEqual(fromProductValue(productValue(input)), input)
assert.deepEqual(Object.keys(fromProductValue(productValue(input))), ["__proto__", "z", "a"])
const duplicate = {
  $: "../../../../source-artifacts/src/direct-event/value/Value.OrderedField",
  key: "same",
  value: productValue(1)
}
assert.throws(
  () =>
    fromProductValue({
      $: "../../../../source-artifacts/src/direct-event/value/Value.ProductObject",
      fields: list([duplicate, duplicate])
    }),
  { message: "invalid product fields" }
)
console.log(
  JSON.stringify({
    passed: true,
    cases: 17,
    scope:
      "compiled product codec boundary: list validation precedence, binary64 identity, callable constructors, ordered own fields and duplicate rejection"
  })
)
