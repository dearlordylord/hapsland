import assert from "node:assert/strict"
import { test } from "node:test"
import { productValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { canonicalJsonPlanOperations } from "./canonical-json-plan-codec.ts"

const primitive = (value) => ({ $: "PrimitiveOperation", value })

test("postorder conversion preserves unsorted UTF-16 keys and nested child order", () => {
  const input = productValue({ z: [true, { "\ue000": null, "😀": "text", a: [] }], a: {} })
  assert.deepEqual(unlist(canonicalJsonPlanOperations(input)), [
    primitive({ $: "CanonicalJson.BoolPrimitive", value: true }),
    primitive({ $: "CanonicalJson.NullPrimitive" }),
    primitive({ $: "CanonicalJson.StringPrimitive", value: "text" }),
    { $: "ArrayOperation", arity: 0 },
    { $: "ObjectOperation", keys: list(["\ue000", "😀", "a"]) },
    { $: "ArrayOperation", arity: 2 },
    { $: "ObjectOperation", keys: list([]) },
    { $: "ObjectOperation", keys: list(["z", "a"]) }
  ])
  assert.deepEqual(canonicalJsonPlanOperations(input), canonicalJsonPlanOperations(input))
})

test("numeric primitives retain exact source Binary64 bits and identity", () => {
  const input = productValue([-0, NaN])
  const numbers = unlist(input.items)
  const originalBits = numbers.map((value) => ({ ...value.bits }))
  const operations = unlist(canonicalJsonPlanOperations(input))
  assert.deepEqual(operations, [
    primitive({ $: "CanonicalJson.NumberPrimitive", bits: numbers[0].bits }),
    primitive({ $: "CanonicalJson.NumberPrimitive", bits: numbers[1].bits }),
    { $: "ArrayOperation", arity: 2 }
  ])
  for (let index = 0; index < numbers.length; index++) {
    assert.strictEqual(operations[index].value.bits, numbers[index].bits)
    assert.deepEqual(numbers[index].bits, originalBits[index])
  }
  assert.equal(numbers[0].bits.high, 0x80000000)
  assert.equal(numbers[0].bits.low, 0)
})
