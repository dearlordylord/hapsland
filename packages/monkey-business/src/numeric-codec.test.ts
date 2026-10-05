import { expect, it } from "vitest"
import { numericAdd, numericDivide } from "./numeric-codec.ts"

it("matches independently supplied IEEE64 ties and normal/subnormal boundaries", () => {
  const tiny = Number.MIN_VALUE
  const sums = [
    [0, tiny],
    [tiny, 0],
    [tiny, tiny],
    [1, 2 ** -53],
    [1 + 2 ** -52, 2 ** -53],
    [2 ** -1022 - tiny, tiny],
    [0.1, 0.2],
    [100, 500]
  ]
  for (const [a, b] of sums) expect(numericAdd(a!, b!), `${a}+${b}`).toBe(a! + b!)
  const ratios = [
    [tiny, tiny],
    [tiny, tiny * 2],
    [tiny, tiny * 6],
    [tiny, 1],
    [tiny, 2],
    [tiny * 3, 2],
    [0.1, 0.3],
    [0.25, 0.75],
    [0, 100]
  ]
  for (const [a, b] of ratios) expect(numericDivide(a!, b!), `${a}/${b}`).toBe(a! / b!)
})

it("matches bounded positive host arithmetic across deterministic exponent pressure", () => {
  let word = 42
  const draw = () => {
    word = (Math.imul(word, 1664525) + 1013904223) >>> 0
    return word / 2 ** 32
  }
  for (let index = 0; index < 180; index++) {
    const a = 2 ** (-1074 + Math.floor(draw() * 1081)) * draw()
    const b = 2 ** (-1074 + Math.floor(draw() * 1081)) * draw()
    expect(numericAdd(a, b), `sum fixture ${index}`).toBe(a + b)
    const total = a + b
    if (total > 0) expect(numericDivide(a, total), `ratio fixture ${index}`).toBe(a / total)
  }
  expect(() => numericAdd(600, 1)).toThrow(RangeError)
  expect(() => numericDivide(1, 0)).toThrow(RangeError)
})
