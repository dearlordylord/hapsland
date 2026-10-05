import { expect, it } from "vitest"
import { freezeCanonicalData } from "./immutable.ts"

it("freezes cyclic and shared graphs and preserves repeated snapshot identity", () => {
  const child = { value: 1 }
  const root: { child: typeof child; shared: typeof child; self?: unknown } = { child, shared: child }
  root.self = root
  expect(freezeCanonicalData(root)).toBe(root)
  expect(Object.isFrozen(child)).toBe(true)
  expect(Object.isFrozen(root)).toBe(true)
  expect(freezeCanonicalData({ old: root }).old).toBe(root)
  expect(() => {
    child.value = 2
  }).toThrow()
})

it("handles wide graphs without spreading children onto the call stack", () => {
  const root = Array.from({ length: 150000 }, () => ({ value: 1 }))
  freezeCanonicalData(root)
  expect(Object.isFrozen(root[149999])).toBe(true)
  expect(Object.isFrozen(root)).toBe(true)
})
