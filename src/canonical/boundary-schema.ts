import * as Schema from "effect/Schema"

const maxNat = 2 ** 48 - 1
const maxBytes = 2 ** 47 - 1

/** Bend's immediate Nat is 48 bits; byte pairs must remain within that range. */
export const Nat = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: maxNat }))
export const PositiveNat = Nat.check(Schema.isGreaterThanOrEqualTo(1))
export const ByteCount = PositiveNat.check(Schema.isLessThanOrEqualTo(maxBytes))
export const Word = Nat.check(Schema.isLessThanOrEqualTo(0xffffffff))
export const Probability = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
export const ProbabilityWordsSchema = Schema.Struct({ high: Word, low: Word }).check(
  Schema.makeFilter((words) => {
    const view = new DataView(new ArrayBuffer(8))
    view.setUint32(0, words.high, false)
    view.setUint32(4, words.low, false)
    const value = view.getFloat64(0, false)
    return Number.isFinite(value) && value >= 0 && value <= 1 && !Object.is(value, -0)
  })
)

/** Check physical array bounds before visiting element decoders. Effect Array checks
 * run after elements; this native array declaration deliberately has no traversal. */
export const boundedArray = <S extends Schema.Constraint>(element: S, limit: number) =>
  Schema.declare((value): value is readonly unknown[] => Array.isArray(value))
    .check(Schema.isMaxLength(limit))
    .pipe(Schema.decodeTo(Schema.Array(element)))

/** Preserve the adapters' synchronous TypeError surface and exact field policy. */
export const decoder = <S extends Schema.ConstraintDecoder<unknown>>(schema: S) => {
  const decode = Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })
  return (value: unknown): S["Type"] => {
    try {
      return decode(value)
    } catch (cause) {
      throw new TypeError("invalid Bend boundary value", { cause })
    }
  }
}
/** Scalar fast paths match the public schemas; failures retain their schema diagnostics. */
const naturalReader = (
  schema: typeof Nat | typeof PositiveNat | typeof ByteCount,
  minimum: number,
  maximum: number
) => {
  const decode = decoder(schema)
  return (value: unknown): number =>
    typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : decode(value)
}
export const readNat = naturalReader(Nat, 0, maxNat)
export const readPositiveNat = naturalReader(PositiveNat, 1, maxNat)
export const readBytes = naturalReader(ByteCount, 1, maxBytes)
const decodeBool = decoder(Schema.Boolean)
export const readBool = (value: unknown): boolean => (typeof value === "boolean" ? value : decodeBool(value))
const RecordSchema = Schema.Record(Schema.String, Schema.Unknown)
const checkedRecords = new WeakSet<object>()

/** Match Effect's object-record parser's writes to its discarded decoded record. */
const assignDecodedProperty = (target: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === "__proto__") {
    Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })
  } else {
    target[key] = value
  }
}

/** Preserve native identity while matching the schema parser's reads and writes. */
export const readRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && checkedRecords.has(value)) return value as Record<string, unknown>
  try {
    if (!(typeof value === "object" && value !== null && !Array.isArray(value))) {
      Schema.asserts(RecordSchema, value)
    } else {
      const record = value as Record<string, unknown>
      const decoded: Record<string, unknown> = {}
      for (const key of Object.keys(record)) assignDecodedProperty(decoded, key, record[key])
    }
    if (
      Object.isFrozen(value) &&
      Object.values(Object.getOwnPropertyDescriptors(value)).every((descriptor) => "value" in descriptor)
    )
      checkedRecords.add(value)
  } catch (cause) {
    throw new TypeError("invalid Bend object", { cause })
  }
  return value as Record<string, unknown>
}
// Tag dispatch does not inspect linked tails; each constructor decoder is exact.
const decodeTag = Schema.decodeUnknownSync(Schema.Struct({ $: Schema.String }))
export const readTag = (value: unknown): { readonly $: string } => {
  try {
    if (!(typeof value === "object" && value !== null && !Array.isArray(value))) return decodeTag(value)

    const record = value as Record<string, unknown>
    if (!("$" in record)) return decodeTag({})

    const tag = record.$
    if (typeof tag !== "string") return decodeTag({ $: tag })

    const decoded: Record<string, unknown> = {}
    decoded.$ = tag
    return decoded as { readonly $: string }
  } catch (cause) {
    throw new TypeError("invalid Bend constructor", { cause })
  }
}
export const NilSchema = Schema.Struct({ $: Schema.Literal("Nil") })
export const ConsSchema = Schema.Struct({ $: Schema.Literal("Con"), head: Schema.Unknown, tail: Schema.Unknown })

const NilFields: ReadonlySet<PropertyKey> = new Set(["$"])
const ConsFields: ReadonlySet<PropertyKey> = new Set(["$", "head", "tail"])

const strictStruct = (value: unknown, fields: ReadonlySet<PropertyKey>) => {
  if (!(typeof value === "object" && value !== null && !Array.isArray(value))) {
    throw new Error("expected an object")
  }
  const record = value as Record<PropertyKey, unknown>
  const decoded: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(record)) {
    if (!fields.has(key) && Object.prototype.propertyIsEnumerable.call(record, key)) {
      void record[key]
      throw new Error("unexpected enumerable property")
    }
  }
  return { record, decoded }
}

const readRequired = (record: Record<PropertyKey, unknown>, decoded: Record<string, unknown>, key: string): unknown => {
  if (!(key in record)) throw new Error("missing required property")
  const value = record[key]
  assignDecodedProperty(decoded, key, value)
  return value
}

const readLiteral = (
  record: Record<PropertyKey, unknown>,
  decoded: Record<string, unknown>,
  key: string,
  expected: string
): void => {
  const value = readRequired(record, decoded, key)
  if (value !== expected) throw new Error("invalid literal property")
  // Effect's strict Struct parser writes the successful literal again in its
  // property step, after first writing it before validation in `readRequired`.
  assignDecodedProperty(decoded, key, value)
}

/** Strict single-Struct reader used at the physical list bound; it has no union tag pre-read. */
export const readNil = (value: unknown): typeof NilSchema.Type => {
  try {
    const { record, decoded } = strictStruct(value, NilFields)
    readLiteral(record, decoded, "$", "Nil")
    return decoded as typeof NilSchema.Type
  } catch (cause) {
    throw new TypeError("invalid Bend boundary value", { cause })
  }
}

type ListCell = typeof ConsSchema.Type | typeof NilSchema.Type

/** Match the union sentinel read, then the selected strict Struct parser. */
const readListCell = (value: unknown): ListCell => {
  try {
    if (!((typeof value === "object" && value !== null) || typeof value === "function")) {
      throw new Error("no union candidate")
    }
    const candidate = value as Record<PropertyKey, unknown>
    const hasTag = "$" in candidate
    const tag = hasTag ? candidate.$ : undefined
    if (tag !== "Con" && tag !== "Nil") throw new Error("no union candidate")

    const { record, decoded } = strictStruct(value, tag === "Con" ? ConsFields : NilFields)
    readLiteral(record, decoded, "$", tag)
    if (tag === "Nil") return decoded as typeof NilSchema.Type
    readRequired(record, decoded, "head")
    readRequired(record, decoded, "tail")
    return decoded as typeof ConsSchema.Type
  } catch (cause) {
    throw new TypeError("invalid Bend boundary value", { cause })
  }
}

/** Iterate native list cells, never recursively decode a generated linked list. */
export const readBendList = <T>(value: unknown, decode: (item: unknown) => T, limit: number): T[] => {
  const result: T[] = []
  let cursor = value
  while (result.length < limit) {
    const cell = readListCell(cursor)
    if (cell.$ === "Nil") return result
    result.push(decode(cell.head))
    cursor = cell.tail
  }
  // At the physical bound, inspect only the terminal shape, never another head.
  readNil(cursor)
  return result
}
