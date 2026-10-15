import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { productValue } from "@hapsland/source-artifacts/direct-event/value/codec"
import { canonicalJsonPlanOperations } from "./canonical-json-plan-codec.ts"

const temporary = mkdtempSync(join(tmpdir(), "hapsland-json-plan-"))
const label = (value) => value.$.split(".").at(-1)
const list = (values) => values.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
const unlist = (value) => {
  const result = []
  for (let cursor = value; label(cursor) === "Con"; cursor = cursor.tail) result.push(cursor.head)
  return result
}
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, key === "$" ? label(value) : normalize(item)])
    )
  return value
}
const equal = (left, right, message) => assert.deepEqual(normalize(left), normalize(right), message)
const primitive = (value) => {
  if (value === null) return { $: "CanonicalJson.NullPrimitive" }
  if (typeof value === "boolean") return { $: "CanonicalJson.BoolPrimitive", value }
  if (typeof value === "string") return { $: "CanonicalJson.StringPrimitive", value }
  const bytes = new DataView(new ArrayBuffer(8))
  bytes.setFloat64(0, value)
  return {
    $: "CanonicalJson.NumberPrimitive",
    bits: {
      $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64",
      high: bytes.getUint32(0),
      low: bytes.getUint32(4)
    }
  }
}
// Fixture encoder preserves native field order. It performs no JSON ordering.
const postorder = (value, operations = []) => {
  if (Array.isArray(value)) {
    for (const item of value) postorder(item, operations)
    operations.push({ $: "ArrayOperation", arity: BigInt(value.length) })
  } else if (value !== null && typeof value === "object") {
    const keys = Object.keys(value)
    for (const key of keys) postorder(value[key], operations)
    operations.push({ $: "ObjectOperation", keys: list(keys) })
  } else operations.push({ $: "PrimitiveOperation", value: primitive(value) })
  return operations
}
const literal = (value) => ({ $: "LiteralPiece", value })
const primitivePiece = (value) => ({ $: "PrimitivePiece", value: primitive(value) })
// Independent observable trace of the original tree traversal, including keys.
const expectedParts = (value) => {
  if (Array.isArray(value))
    return [
      literal("["),
      ...value.flatMap((item, index) => [...(index ? [literal(",")] : []), ...expectedParts(item)]),
      literal("]")
    ]
  if (value !== null && typeof value === "object")
    return [
      literal("{"),
      ...Object.keys(value)
        .sort()
        .flatMap((key, index) => [
          ...(index ? [literal(",")] : []),
          primitivePiece(key),
          literal(":"),
          ...expectedParts(value[key])
        ]),
      literal("}")
    ]
  return [primitivePiece(value)]
}

try {
  const output = join(temporary, "plan.mjs")
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
      join(import.meta.dirname, "CanonicalJsonPlan.bend"),
      "-o",
      output
    ],
    { timeout: 11000 }
  )
  const plan = (await import(pathToFileURL(output))).default
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
    { z: [], a: {}, b: [[], {}, [true]] }
  ]
  for (let seed = 0; seed < 64; seed += 1)
    values.push({
      z: [seed, null, { c: seed % 2 === 0, a: `value-${seed}` }],
      a: [[], false],
      [String(seed)]: seed + 0.5
    })
  let pieces = 0
  for (const value of values) {
    const operations = canonicalJsonPlanOperations(productValue(value))
    equal(operations, list(postorder(value)), "actual ProductValue codec preserves postorder structure")
    const result = plan.compile(operations)
    assert.equal(label(result), "Some")
    const parts = unlist(result.value)
    equal(parts, expectedParts(value), "exact primitive identity, key pairing and punctuation")
    pieces += parts.length
  }
  const primitiveOperation = { $: "PrimitiveOperation", value: primitive("first") }
  const malformed = [
    [],
    [{ $: "ArrayOperation", arity: 1n }],
    [{ $: "ObjectOperation", keys: list(["key"]) }],
    [primitiveOperation, primitiveOperation],
    [primitiveOperation, { $: "ArrayOperation", arity: 2n }],
    [{ $: "ArrayOperation", arity: 100000n }, primitiveOperation]
  ]
  for (const operations of malformed) assert.equal(label(plan.compile(list(operations))), "None")
  const stackValues = [[literal("old")], [literal("older")]]
  const state = { $: "ValidStack", values: list(stackValues.map(list)) }
  const streams = [
    [],
    [primitiveOperation],
    [{ $: "ArrayOperation", arity: 0n }],
    [{ $: "ArrayOperation", arity: 3n }],
    ...values.slice(0, 15).map((value) => postorder(value))
  ]
  for (const prefix of streams)
    for (const suffix of streams)
      equal(
        plan.fold(list([...prefix, ...suffix]), state),
        plan.fold(list(suffix), plan.fold(list(prefix), state)),
        "fold_composition"
      )
  for (let arity = 0; arity < 6; arity += 1) {
    const accumulated = [[literal("accumulated")]]
    const result = plan.pop(BigInt(arity), list(stackValues.map(list)), list(accumulated.map(list)))
    const expected =
      arity > stackValues.length
        ? { $: "Underflow" }
        : {
            $: "Popped",
            values: list([...stackValues.slice(0, arity).reverse(), ...accumulated].map(list)),
            rest: list(stackValues.slice(arity).map(list))
          }
    equal(result, expected, "pop_exact")
  }
  equal(
    plan.operation(primitiveOperation, state.values),
    { $: "ValidStack", values: { $: "Con", head: list([primitivePiece("first")]), tail: state.values } },
    "primitive_exact"
  )
  equal(plan.fold(list(streams.flat()), { $: "InvalidStack" }), { $: "InvalidStack" }, "invalid_absorbing")
  assert.equal(label(plan.compile(list([]))), "None", "empty_refused")
  equal(
    plan.finish({ $: "ValidStack", values: list([list([literal("root")])]) }),
    { $: "Some", value: list([literal("root")]) },
    "single_root"
  )
  assert.equal(label(plan.finish(state)), "None", "multiple_roots_refused")
  const childPlans = [
    [],
    [literal("part")],
    [primitivePiece(false)],
    [literal("["), primitivePiece(null), literal("]")]
  ]
  let compoundCases = 0
  for (let count = 0; count < 8; count += 1) {
    const children = Array.from({ length: count }, (_, index) => childPlans[index % childPlans.length])
    const underlying = list([...children].reverse().concat(stackValues).map(list))
    const array = [
      literal("["),
      ...children.flatMap((parts, index) => [...(index ? [literal(",")] : []), ...parts]),
      literal("]")
    ]
    equal(
      plan.operation({ $: "ArrayOperation", arity: BigInt(count) }, underlying),
      { $: "ValidStack", values: list([array, ...stackValues].map(list)) },
      "array_exact over arbitrary child plans and older stack"
    )
    const names = ["z", "a", "😀", "\ue000", "a", "", "constructor", "0"].slice(0, count)
    const fields = names.map((key, index) => ({ $: "Field", key, parts: list(children[index]) }))
    equal(
      plan.pair_fields(list(names), list(children.map(list)), list([])),
      { $: "Some", value: list(fields) },
      "pairing_exact"
    )
    const ordered = [...fields].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    const object = [
      literal("{"),
      ...ordered.flatMap((field, index) => [
        ...(index ? [literal(",")] : []),
        primitivePiece(field.key),
        literal(":"),
        ...unlist(field.parts)
      ]),
      literal("}")
    ]
    equal(
      plan.operation({ $: "ObjectOperation", keys: list(names) }, underlying),
      { $: "ValidStack", values: list([object, ...stackValues].map(list)) },
      "object_exact including duplicate keys"
    )
    for (const left of fields)
      for (const right of fields) assert.equal(plan.fields_le(left, right), left.key <= right.key, "comparison_exact")
    const tooMany = BigInt(count + stackValues.length + 1)
    assert.equal(
      label(plan.operation({ $: "ArrayOperation", arity: tooMany }, underlying)),
      "InvalidStack",
      "array_underflow"
    )
    assert.equal(
      label(plan.operation({ $: "ObjectOperation", keys: list(Array(Number(tooMany)).fill("x")) }, underlying)),
      "InvalidStack",
      "object_underflow"
    )
    compoundCases += 1
  }
  assert.equal(label(plan.finish({ $: "InvalidStack" })), "None", "invalid_finish")
  assert.equal(label(plan.finish({ $: "ValidStack", values: list([]) })), "None", "empty_finish")
  console.log(
    `Canonical JSON postorder: ${values.length} trees/${pieces} exact pieces, ${malformed.length} malformed streams, ${streams.length ** 2} fold splits, ${compoundCases} compound stacks and all fifteen law instances`
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
