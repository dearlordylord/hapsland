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
  readTag,
  readNil,
  readBendList,
  ConsSchema,
  NilSchema,
  decoder
} from "./boundary-schema.ts"

const recordReference = Schema.Record(Schema.String, Schema.Unknown)
const tagReference = Schema.decodeUnknownSync(Schema.Struct({ $: Schema.String }))
const nilReference = decoder(NilSchema)
const listCellReference = decoder(Schema.Union([ConsSchema, NilSchema]))
const capture = (run: () => unknown) => {
  try {
    return { ok: true as const, value: run() }
  } catch (error) {
    return { ok: false as const, error }
  }
}
const compareRecord = (make: (trace: Array<string>) => unknown) => {
  const referenceTrace: Array<string> = []
  const referenceInput = make(referenceTrace)
  const reference = capture(() => {
    Schema.asserts(recordReference, referenceInput)
    return referenceInput
  })

  const readerTrace: Array<string> = []
  const readerInput = make(readerTrace)
  const reader = capture(() => readRecord(readerInput))

  expect(reader.ok).toBe(reference.ok)
  expect(readerTrace).toEqual(referenceTrace)
  if (reader.ok) {
    expect(reader.value).toBe(readerInput)
  } else {
    expect(reader.error).toBeInstanceOf(TypeError)
    expect(reader.error).toHaveProperty("message", "invalid Bend object")
  }
}
const compareTag = (make: (trace: Array<string>) => unknown) => {
  const referenceTrace: Array<string> = []
  const referenceInput = make(referenceTrace)
  const reference = capture(() => tagReference(referenceInput))

  const readerTrace: Array<string> = []
  const readerInput = make(readerTrace)
  const reader = capture(() => readTag(readerInput))

  expect(reader.ok).toBe(reference.ok)
  expect(readerTrace).toEqual(referenceTrace)
  if (reader.ok && reference.ok) {
    const actualTag = reader.value as { readonly $?: unknown }
    const expectedTag = reference.value as { readonly $?: unknown }
    expect(Object.hasOwn(actualTag, "$")).toBe(Object.hasOwn(expectedTag, "$"))
    expect(actualTag.$).toBe(expectedTag.$)
  } else if (!reader.ok) {
    expect(reader.error).toBeInstanceOf(TypeError)
    expect(reader.error).toHaveProperty("message", "invalid Bend constructor")
  }
}
const readListReference = <T>(value: unknown, decode: (item: unknown) => T, limit: number): Array<T> => {
  const result: Array<T> = []
  let cursor = value
  while (result.length < limit) {
    const cell = listCellReference(cursor) as { readonly $: string; readonly head?: unknown; readonly tail?: unknown }
    if (cell.$ === "Nil") return result
    result.push(decode(cell.head))
    cursor = cell.tail
  }
  nilReference(cursor)
  return result
}
const compareList = (make: (trace: Array<string>) => unknown, limit = 2) => {
  const referenceTrace: Array<string> = []
  const referenceInput = make(referenceTrace)
  const reference = capture(() =>
    readListReference(
      referenceInput,
      (item) => {
        referenceTrace.push("decode")
        return item
      },
      limit
    )
  )

  const readerTrace: Array<string> = []
  const readerInput = make(readerTrace)
  const reader = capture(() =>
    readBendList(
      readerInput,
      (item) => {
        readerTrace.push("decode")
        return item
      },
      limit
    )
  )

  expect(reader.ok).toBe(reference.ok)
  expect(readerTrace).toEqual(referenceTrace)
  if (reader.ok && reference.ok) {
    expect(reader.value).toEqual(reference.value)
  } else if (!reader.ok) {
    expect(reader.error).toBeInstanceOf(TypeError)
    expect(reader.error).toHaveProperty("message", "invalid Bend boundary value")
  }
}
const compareNil = (make: (trace: Array<string>) => unknown) => {
  const referenceTrace: Array<string> = []
  const referenceInput = make(referenceTrace)
  const reference = capture(() => nilReference(referenceInput))

  const readerTrace: Array<string> = []
  const readerInput = make(readerTrace)
  const reader = capture(() => readNil(readerInput))

  expect(reader.ok).toBe(reference.ok)
  expect(readerTrace).toEqual(referenceTrace)
  if (reader.ok && reference.ok) {
    expect(Object.keys(reader.value as object)).toEqual(Object.keys(reference.value as object))
    expect((reader.value as { readonly $?: unknown }).$).toBe((reference.value as { readonly $?: unknown }).$)
  } else if (!reader.ok) {
    expect(reader.error).toBeInstanceOf(TypeError)
    expect(reader.error).toHaveProperty("message", "invalid Bend boundary value")
  }
}

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

it("keeps record acceptance and own string reads equivalent to Effect", () => {
  for (const make of [
    () => ({ value: 1 }),
    () => Object.assign(Object.create(null), { value: undefined }),
    () => Object.create({ inherited: 1 }),
    () => new Date(0),
    () => [1],
    () => Object.assign(() => undefined, { value: 1 }),
    () => null,
    () => undefined,
    () => 1,
    () => "record"
  ])
    compareRecord(() => make())

  compareRecord((trace) => {
    const record = Object.create({ inherited: "ignored" })
    const symbol = Symbol("ignored")
    Object.defineProperty(record, "visible", {
      enumerable: true,
      get() {
        trace.push("visible")
        return undefined
      }
    })
    Object.defineProperty(record, "hidden", {
      enumerable: false,
      get() {
        trace.push("hidden")
        throw new Error("non-enumerable field was read")
      }
    })
    Object.defineProperty(record, symbol, {
      enumerable: true,
      get() {
        trace.push("symbol")
        throw new Error("symbol field was read")
      }
    })
    return record
  })

  compareRecord((trace) => {
    const record = {}
    Object.defineProperty(record, "value", {
      enumerable: true,
      get() {
        trace.push("value")
        throw new Error("enumerable getter failed")
      }
    })
    return record
  })

  compareRecord(
    (trace) =>
      new Proxy(
        { value: 1 },
        {
          ownKeys(target) {
            trace.push("ownKeys")
            return Reflect.ownKeys(target)
          },
          getOwnPropertyDescriptor(target, key) {
            trace.push(`descriptor:${String(key)}`)
            return Reflect.getOwnPropertyDescriptor(target, key)
          },
          get(target, key, receiver) {
            if (key === "value") trace.push("get:value")
            return Reflect.get(target, key, receiver)
          }
        }
      )
  )
})

it("preserves Effect record scratch writes for __proto__ and inherited setters", () => {
  compareRecord(() => {
    const record = {}
    const laterSetterPrototype = Object.create(Object.prototype)
    Object.defineProperty(laterSetterPrototype, "after", {
      configurable: true,
      set() {
        throw new Error("__proto__ must not change the scratch prototype")
      }
    })
    Object.defineProperty(record, "__proto__", {
      value: laterSetterPrototype,
      writable: true,
      enumerable: true,
      configurable: true
    })
    Object.defineProperty(record, "after", { value: 1, writable: true, enumerable: true, configurable: true })
    return record
  })

  const key = "__hapsland_boundary_write_probe__"
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key)
  const writes: Array<object> = []
  let reference: ReturnType<typeof capture> | undefined
  let reader: ReturnType<typeof capture> | undefined
  try {
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      set(this: object) {
        writes.push(this)
      }
    })
    const make = () => {
      const record = {}
      Object.defineProperty(record, key, { value: 1, enumerable: true })
      return record
    }
    reference = capture(() => Schema.asserts(recordReference, make()))
    const referenceWrites = writes.splice(0)
    reader = capture(() => readRecord(make()))
    const readerWrites = writes.splice(0)
    expect(referenceWrites).toHaveLength(1)
    expect(readerWrites).toHaveLength(1)
  } finally {
    if (previous) Object.defineProperty(Object.prototype, key, previous)
    else Reflect.deleteProperty(Object.prototype, key)
  }

  expect(reference?.ok).toBe(true)
  expect(reader?.ok).toBe(true)
})

it("keeps tag decoding equivalent for inherited, accessor, proxy, and invalid inputs", () => {
  compareTag(() => ({ $: "tag" }))
  compareTag(() => Object.create({ $: "inherited" }))
  compareTag((trace) => {
    const record = {}
    Object.defineProperty(record, "$", {
      enumerable: false,
      get() {
        trace.push("tag")
        return "hidden tag"
      }
    })
    Object.defineProperty(record, "extra", {
      enumerable: true,
      get() {
        trace.push("extra")
        throw new Error("extra fields are ignored")
      }
    })
    return record
  })
  compareTag((trace) => {
    const record = {}
    Object.defineProperty(record, "$", {
      enumerable: true,
      get() {
        trace.push("tag")
        throw new Error("tag getter failed")
      }
    })
    return record
  })
  compareTag((trace) => {
    const record = {}
    Object.defineProperty(record, "$", {
      enumerable: true,
      get() {
        trace.push("tag")
        return 1
      }
    })
    return record
  })
  compareTag((trace) => {
    const record = new Proxy(
      { $: "proxy tag" },
      {
        has(target, key) {
          if (key === "$") trace.push("has:$")
          return Reflect.has(target, key)
        },
        get(target, key, receiver) {
          if (key === "$") trace.push("get:$")
          return Reflect.get(target, key, receiver)
        }
      }
    )
    return record
  })
  compareTag((trace) => {
    const fn = () => undefined
    Object.defineProperty(fn, "$", {
      get() {
        trace.push("function tag")
        return "ignored"
      }
    })
    return fn
  })
  compareTag((trace) => {
    const array: Array<unknown> = []
    Object.defineProperty(array, "$", {
      get() {
        trace.push("array tag")
        return "ignored"
      }
    })
    return array
  })
  compareTag(
    (trace) =>
      new Proxy(
        {},
        {
          has(_target, key) {
            if (key === "$") trace.push("has:$")
            return false
          }
        }
      )
  )
})

it("preserves readTag's decoded-object writes through Object.prototype", () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "$")
  const writes: Array<unknown> = []
  let reference: ReturnType<typeof capture> | undefined
  let reader: ReturnType<typeof capture> | undefined
  let referenceWrites: Array<unknown> = []
  let readerWrites: Array<unknown> = []
  try {
    Object.defineProperty(Object.prototype, "$", {
      configurable: true,
      set(value: unknown) {
        writes.push(value)
      }
    })
    reference = capture(() => tagReference({ $: "tag" }))
    referenceWrites = writes.splice(0)
    reader = capture(() => readTag({ $: "tag" }))
    readerWrites = writes.splice(0)
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "$", previous)
    else Reflect.deleteProperty(Object.prototype, "$")
  }

  expect(reference?.ok).toBe(true)
  expect(reader?.ok).toBe(true)
  expect(referenceWrites).toEqual(["tag"])
  expect(readerWrites).toEqual(referenceWrites)
  if (reference?.ok && reader?.ok) {
    expect(Object.hasOwn(reader.value as object, "$")).toBe(Object.hasOwn(reference.value as object, "$"))
    expect((reader.value as { readonly $?: unknown }).$).toBe((reference.value as { readonly $?: unknown }).$)
  }
})

it("matches strict list readers over generated plain cell shapes", () => {
  fc.assert(
    fc.property(
      fc.record({
        tag: fc.constantFrom("Con", "Nil", "other"),
        head: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        includeHead: fc.boolean(),
        includeTail: fc.boolean(),
        tailTag: fc.constantFrom("Nil", "Con", "other"),
        extra: fc.boolean()
      }),
      (sample) => {
        const make = (): Record<string, unknown> => {
          const cell: Record<string, unknown> = { $: sample.tag }
          if (sample.includeHead) cell.head = sample.head
          if (sample.includeTail) cell.tail = { $: sample.tailTag }
          if (sample.extra) cell.extra = true
          return cell
        }
        compareList(() => make(), 1)
      }
    ),
    { seed: 81723, numRuns: 150 }
  )
})

it("matches Effect list getter, proxy, and inherited-field traversal", () => {
  compareList((trace) => {
    let calls = 0
    const cell: Record<string, unknown> = {}
    Object.defineProperty(cell, "$", {
      enumerable: true,
      get() {
        calls += 1
        trace.push(`tag:${calls}`)
        return calls === 1 ? "Con" : "Nil"
      }
    })
    cell.head = 1
    cell.tail = { $: "Nil" }
    return cell
  }, 1)

  compareList((trace) => {
    let calls = 0
    const terminal = {}
    Object.defineProperty(terminal, "$", {
      enumerable: true,
      get() {
        trace.push("terminal tag")
        return "Nil"
      }
    })
    const cell: Record<string, unknown> = {}
    Object.defineProperty(cell, "$", {
      enumerable: true,
      get() {
        calls += 1
        trace.push(`tag:${calls}`)
        return "Con"
      }
    })
    Object.defineProperty(cell, "head", {
      enumerable: true,
      get() {
        trace.push("head")
        return undefined
      }
    })
    Object.defineProperty(cell, "tail", {
      enumerable: true,
      get() {
        trace.push("tail")
        return terminal
      }
    })
    return cell
  }, 1)

  compareList((trace) => {
    const target: Record<string, unknown> = { $: "Con", head: 2, tail: { $: "Nil" } }
    return new Proxy(target, {
      has(inner, key) {
        if (key === "$" || key === "head" || key === "tail") trace.push(`has:${String(key)}`)
        return Reflect.has(inner, key)
      },
      ownKeys(inner) {
        trace.push("ownKeys")
        return Reflect.ownKeys(inner)
      },
      getOwnPropertyDescriptor(inner, key) {
        trace.push(`descriptor:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(inner, key)
      },
      get(inner, key, receiver) {
        if (key === "$" || key === "head" || key === "tail") trace.push(`get:${String(key)}`)
        return Reflect.get(inner, key, receiver)
      }
    })
  }, 1)

  compareList((trace) => {
    const extra = Symbol("extra")
    const target: Record<string | symbol, unknown> = { $: "Con", head: 2, tail: { $: "Nil" } }
    Object.defineProperty(target, extra, {
      enumerable: true,
      get() {
        trace.push("get:extra symbol")
        return 3
      }
    })
    return new Proxy(target, {
      ownKeys(inner) {
        trace.push("ownKeys")
        return Reflect.ownKeys(inner)
      },
      getOwnPropertyDescriptor(inner, key) {
        trace.push(`descriptor:${String(key)}`)
        return Reflect.getOwnPropertyDescriptor(inner, key)
      },
      get(inner, key, receiver) {
        if (key === extra) trace.push("proxy get:extra symbol")
        return Reflect.get(inner, key, receiver)
      }
    })
  }, 1)

  compareList((trace) => {
    const array: Array<unknown> = []
    Object.defineProperty(array, "$", {
      get() {
        trace.push("array tag")
        return "Con"
      }
    })
    return array
  }, 1)

  compareList((trace) => {
    const fn = () => undefined
    Object.defineProperty(fn, "$", {
      get() {
        trace.push("function tag")
        return "Con"
      }
    })
    return fn
  }, 1)

  compareList((_trace) => {
    const prototype = { $: "Con", head: "inherited", tail: { $: "Nil" } }
    return Object.create(prototype)
  }, 1)

  compareNil((trace) => {
    let calls = 0
    const value = {}
    Object.defineProperty(value, "$", {
      enumerable: true,
      get() {
        calls += 1
        trace.push(`nil tag:${calls}`)
        return "Nil"
      }
    })
    return value
  })

  compareNil((trace) => {
    const value = {}
    Object.defineProperty(value, "$", {
      enumerable: true,
      get() {
        trace.push("nil tag")
        return "Nil"
      }
    })
    Object.defineProperty(value, "extra", {
      enumerable: true,
      get() {
        trace.push("extra")
        return 1
      }
    })
    return value
  })
})

it("preserves the strict Nil parser's duplicate literal writes", () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "$")
  const writes: Array<unknown> = []
  let reference: ReturnType<typeof capture> | undefined
  let reader: ReturnType<typeof capture> | undefined
  let referenceWrites: Array<unknown> = []
  let readerWrites: Array<unknown> = []
  try {
    Object.defineProperty(Object.prototype, "$", {
      configurable: true,
      set(value: unknown) {
        writes.push(value)
      }
    })
    reference = capture(() => nilReference({ $: "Nil" }))
    referenceWrites = writes.splice(0)
    reader = capture(() => readNil({ $: "Nil" }))
    readerWrites = writes.splice(0)
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "$", previous)
    else Reflect.deleteProperty(Object.prototype, "$")
  }

  expect(reference?.ok).toBe(true)
  expect(reader?.ok).toBe(true)
  expect(referenceWrites).toEqual(["Nil", "Nil"])
  expect(readerWrites).toEqual(referenceWrites)
  if (reference?.ok && reader?.ok) {
    expect(Object.hasOwn(reader.value as object, "$")).toBe(Object.hasOwn(reference.value as object, "$"))
  }
})

it("preserves list union and terminal Struct writes through Object.prototype", () => {
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, "$")
  const writes: Array<unknown> = []
  let reference: ReturnType<typeof capture> | undefined
  let reader: ReturnType<typeof capture> | undefined
  let referenceWrites: Array<unknown> = []
  let readerWrites: Array<unknown> = []
  try {
    Object.defineProperty(Object.prototype, "$", {
      configurable: true,
      set(value: unknown) {
        writes.push(value)
      }
    })
    const make = () => ({ $: "Con", head: 1, tail: { $: "Nil" } })
    reference = capture(() => readListReference(make(), (item) => item, 1))
    referenceWrites = writes.splice(0)
    reader = capture(() => readBendList(make(), (item) => item, 1))
    readerWrites = writes.splice(0)
  } finally {
    if (previous) Object.defineProperty(Object.prototype, "$", previous)
    else Reflect.deleteProperty(Object.prototype, "$")
  }

  expect(reference?.ok).toBe(true)
  expect(reader?.ok).toBe(true)
  expect(referenceWrites).toEqual(["Con", "Con", "Nil", "Nil"])
  expect(readerWrites).toEqual(referenceWrites)
  if (reference?.ok && reader?.ok) expect(reader.value).toEqual(reference.value)
})
