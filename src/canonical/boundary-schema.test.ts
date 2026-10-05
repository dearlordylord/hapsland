import { expect, it } from "vitest"
import fc from "fast-check"
import { Schema } from "effect"
import {
  Nat,
  PositiveNat,
  ByteCount,
  readNat,
  readPositiveNat,
  readBytes,
  readBool,
  readRecord,
  decoder
} from "./boundary-schema.ts"

it("keeps scalar fast readers equivalent to the declared schemas", () => {
  for (const [schema, read] of [
    [Nat, readNat],
    [PositiveNat, readPositiveNat],
    [ByteCount, readBytes]
  ] as const) {
    const decode = decoder(schema)
    const compare = (value: unknown) => {
      if (Schema.is(schema)(value)) expect(Object.is(read(value), decode(value))).toBe(true)
      else expect(() => read(value)).toThrow(TypeError)
    }
    for (const value of [
      -0,
      0,
      1,
      2 ** 47 - 1,
      2 ** 47,
      2 ** 48 - 1,
      2 ** 48,
      NaN,
      Infinity,
      -Infinity,
      -1,
      0.5,
      "1",
      null
    ])
      compare(value)
    fc.assert(fc.property(fc.oneof(fc.double(), fc.integer({ min: 0, max: 2 ** 48 })), compare), {
      seed: 319,
      numRuns: 300
    })
  }
  for (const value of [true, false]) expect(readBool(value)).toBe(value)
  for (const value of [0, 1, "true", null, undefined]) expect(() => readBool(value)).toThrow(TypeError)
})

it("rechecks frozen accessor records instead of memoizing changing getters", () => {
  let fail = false
  const record = Object.freeze({
    get value() {
      if (fail) throw new Error("changed getter")
      return 1
    }
  })
  expect(readRecord(record)).toBe(record)
  fail = true
  expect(() => readRecord(record)).toThrow(TypeError)
})
