import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { productValue, list, fromProductValue as after } from "./service-session.mjs"
import { fromProductValue as before } from "./decoder-baseline.mjs"
const file = process.argv[2] ?? new URL("decoder-consumer-products.json", import.meta.url),
  raw = readFileSync(file),
  products = JSON.parse(raw)
assert.ok(products.length >= 1)
const tag = (name, fields = {}) => ({ $: "Types." + name, ...fields })
const descriptorCheck = (a, b) => {
  assert.deepEqual(a, b)
  if (a && typeof a === "object") {
    assert.equal(Object.getPrototypeOf(a), Object.getPrototypeOf(b))
    assert.deepEqual(Reflect.ownKeys(a), Reflect.ownKeys(b))
    for (const key of Reflect.ownKeys(a)) {
      assert.deepEqual(Object.getOwnPropertyDescriptor(a, key), Object.getOwnPropertyDescriptor(b, key))
      descriptorCheck(a[key], b[key])
    }
  }
}
const special = Object.fromEntries([
  ["__proto__", { polluted: true }],
  ["constructor", "value"],
  ["toString", "text"],
  ["2", "two"],
  ["1", "one"],
  ["😀", "\ud800"],
  ["optional", null]
])
const valid = [
  ...products,
  productValue(special),
  productValue([false, true, null, -0, NaN, Infinity, -Infinity, "\ud800", "😀"])
]
for (const product of valid) {
  const a = before(product),
    b = after(product)
  descriptorCheck(a, b)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(Object.getPrototypeOf(b), Array.isArray(b) ? Array.prototype : Object.prototype)
}
const field = tag("OrderedField", { key: "x", value: tag("ProductText", { value: "text" }) })
const malformed = [
  undefined,
  tag("ProductText", { value: 4 }),
  tag("ProductBool", { value: 0 }),
  tag("ProductNumber", { bits: {} }),
  tag("ProductArray", { items: { $: "Con", head: undefined, tail: undefined } }),
  tag("ProductObject", { fields: list([field, field]) }),
  tag("ProductObject", { fields: { $: "Con", head: undefined, tail: undefined } }),
  tag("ProductObject", { fields: list([{ ...field, key: 4 }]) }),
  tag("ProductObject", { fields: list([undefined]) })
]
for (const product of malformed) {
  let a, b
  try {
    before(product)
  } catch (e) {
    a = e
  }
  try {
    after(product)
  } catch (e) {
    b = e
  }
  assert.ok(a && b)
  assert.equal(a.constructor, b.constructor)
  assert.equal(a.message, b.message)
}
const consume = (decoder) => {
  let total = 0
  for (let round = 0; round < 20; round++)
    for (const product of products) total += JSON.stringify(decoder(product)).length
  return total
}
assert.equal(consume(before), consume(after))
const samples = { before: [], after: [] }
for (let pair = 0; pair < 17; pair++)
  for (const name of pair % 2 ? ["after", "before"] : ["before", "after"]) {
    const start = performance.now()
    const checksum = consume(name === "before" ? before : after)
    samples[name].push({ seconds: (performance.now() - start) / 1000, checksum })
  }
const mean = (values) => values.reduce((sum, value) => sum + value.seconds, 0) / values.length
const result = {
  at: new Date().toISOString(),
  runtime: typeof Bun === "undefined" ? "node" : "bun",
  products: products.length,
  validCases: valid.length,
  malformedCases: malformed.length,
  pairs: 17,
  rounds: 20,
  meanRatio: mean(samples.after) / mean(samples.before),
  samples,
  sourceHashes: Object.fromEntries(
    ["./decoder-baseline.mjs", "./decoder-experiment.mjs", "./service-session.mjs"].map((name) => [
      name,
      createHash("sha256")
        .update(readFileSync(new URL(name, import.meta.url)))
        .digest("hex")
    ])
  ),
  inputSha256: createHash("sha256").update(raw).digest("hex"),
  scope:
    "Actual full-consumer ProductValue boundary conversion plus JSON serialization, exact values/descriptors/prototype/key order and malformed rejection compared. Diagnostic only; excludes graph algorithm/frontend/IO and cannot qualify whole execution parity."
}
writeFileSync(
  new URL("decoder-" + result.runtime + "-experiment.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n"
)
console.log(JSON.stringify({ products: result.products, meanRatio: result.meanRatio, allComparisonsPassed: true }))
