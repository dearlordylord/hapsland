import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  decodeCanonicalConstructor,
  decodeCanonicalProjectionConstructor,
  withCanonicalConstructorReuse
} from "@hapsland/canonical-policy/canonical/constructors"

const interpreter = vi.hoisted(() => ({ calls: 0 }))
vi.mock("@hapsland/canonical-policy/canonical/boundary-schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hapsland/canonical-policy/canonical/boundary-schema")>()
  return {
    ...actual,
    decoder: (schema: Parameters<typeof actual.decoder>[0]) => {
      const decode = actual.decoder(schema)
      return (value: unknown) => {
        interpreter.calls++
        return decode(value)
      }
    }
  }
})

const scope = () => Object.freeze({ $: "Canonical.StopScope", partition: 2, round: 3 })
const decodeScope = (value: unknown) => decodeCanonicalProjectionConstructor(value, "Canonical.StopScope")

beforeEach(() => {
  interpreter.calls = 0
})

describe("canonical constructor reuse during projection", () => {
  it("validates a frozen constructor once and returns independent decoded records", () => {
    const value = scope()
    withCanonicalConstructorReuse(() => {
      const first = decodeScope(value)
      const second = decodeScope(value)
      expect(first).toEqual(value)
      expect(second).toEqual(value)
      expect(first).not.toBe(second)
      first.partition = 90
      expect(second.partition).toBe(2)
      expect(decodeScope(value).partition).toBe(2)
    })
    expect(interpreter.calls).toBe(1)
    expect(withCanonicalConstructorReuse(() => decodeScope(value))).toEqual(value)
    expect(interpreter.calls).toBe(1)
  })

  it("always validates direct calls outside the projection context", () => {
    const value = scope()
    withCanonicalConstructorReuse(() => decodeScope(value))
    decodeScope(value)
    decodeScope(value)
    expect(interpreter.calls).toBe(3)
  })

  it("validates generic calls even when the owner reader has cached the same object", () => {
    const value = scope()
    withCanonicalConstructorReuse(() => {
      decodeScope(value)
      decodeCanonicalConstructor(value, "Canonical.StopScope")
      decodeCanonicalConstructor(value, "Canonical.StopScope")
      expect(decodeScope(value)).toEqual(value)
    })
    expect(interpreter.calls).toBe(3)
  })

  it("keeps generic decoding strict for frozen foreign proxies inside and outside projection", () => {
    const value = new Proxy(scope(), {})
    withCanonicalConstructorReuse(() => {
      expect(decodeCanonicalConstructor(value, "Canonical.StopScope")).toEqual(value)
      expect(decodeCanonicalConstructor(value, "Canonical.StopScope")).toEqual(value)
    })
    expect(decodeCanonicalConstructor(value, "Canonical.StopScope")).toEqual(value)
    expect(interpreter.calls).toBe(3)
  })

  it("rechecks mutable constructors after their fields change", () => {
    const value = { $: "Canonical.StopScope", partition: 2, round: 3 }
    withCanonicalConstructorReuse(() => {
      expect(decodeScope(value).partition).toBe(2)
      value.partition = 8
      expect(decodeScope(value).partition).toBe(8)
      value.partition = -1
      expect(() => decodeScope(value)).toThrow(TypeError)
    })
    expect(interpreter.calls).toBe(3)
  })

  it("rechecks frozen accessor constructors when the getter changes", () => {
    let partition = 2
    const value = Object.freeze({
      $: "Canonical.StopScope",
      get partition() {
        return partition
      },
      round: 3
    })
    withCanonicalConstructorReuse(() => {
      expect(decodeScope(value).partition).toBe(2)
      partition = 8
      expect(decodeScope(value).partition).toBe(8)
    })
    expect(interpreter.calls).toBe(2)
  })

  it("rechecks required fields inherited from a mutable prototype", () => {
    const prototype = { partition: 2 }
    const value = Object.freeze(Object.assign(Object.create(prototype), { $: "Canonical.StopScope", round: 3 }))
    withCanonicalConstructorReuse(() => {
      expect(decodeScope(value).partition).toBe(2)
      prototype.partition = 8
      expect(decodeScope(value).partition).toBe(8)
    })
    expect(interpreter.calls).toBe(2)
  })

  it("validates the requested constructor name even after another name was cached", () => {
    const value = scope()
    withCanonicalConstructorReuse(() => {
      decodeScope(value)
      expect(() => decodeCanonicalProjectionConstructor(value, "Canonical.SourceReading")).toThrow(TypeError)
      expect(() => decodeCanonicalProjectionConstructor(value, "Unknown.Constructor")).toThrow(TypeError)
      expect(decodeScope(value)).toEqual(value)
    })
    expect(interpreter.calls).toBe(2)
  })

  it("discards newly validated constructors when a projection aborts", () => {
    const value = scope()
    const failure = new Error("projection failed after constructor validation")
    expect(() =>
      withCanonicalConstructorReuse(() => {
        decodeScope(value)
        decodeScope(value)
        throw failure
      })
    ).toThrow(failure)
    expect(interpreter.calls).toBe(1)
    expect(withCanonicalConstructorReuse(() => decodeScope(value))).toEqual(value)
    expect(interpreter.calls).toBe(2)
  })

  it("restores the outer projection after a nested projection throws", () => {
    const outer = scope()
    const inner = scope()
    withCanonicalConstructorReuse(() => {
      decodeScope(outer)
      expect(() =>
        withCanonicalConstructorReuse(() => {
          decodeScope(inner)
          throw new Error("nested projection failed")
        })
      ).toThrow("nested projection failed")
      expect(decodeScope(outer)).toEqual(outer)
    })
    expect(interpreter.calls).toBe(2)
    expect(withCanonicalConstructorReuse(() => decodeScope(inner))).toEqual(inner)
    expect(interpreter.calls).toBe(3)
  })

  it("never reuses a failed strict validation", () => {
    const value = Object.freeze({ ...scope(), unexpected: true })
    withCanonicalConstructorReuse(() => {
      expect(() => decodeScope(value)).toThrow(TypeError)
      expect(() => decodeScope(value)).toThrow(TypeError)
    })
    expect(interpreter.calls).toBe(2)
  })
})
