import * as Schema from "effect/Schema";

/** Bend's immediate Nat is 48 bits; byte pairs must remain within that range. */
export const Nat = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 2 ** 48 - 1 }),
);
export const PositiveNat = Nat.check(Schema.isGreaterThanOrEqualTo(1));
export const ByteCount = PositiveNat.check(
  Schema.isLessThanOrEqualTo(2 ** 47 - 1),
);
export const Word = Nat.check(Schema.isLessThanOrEqualTo(0xffffffff));
export const Probability = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
);
export const ProbabilityWordsSchema = Schema.Struct({
  high: Word,
  low: Word,
}).check(
  Schema.makeFilter((words) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setUint32(0, words.high, false);
    view.setUint32(4, words.low, false);
    const value = view.getFloat64(0, false);
    return (
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1 &&
      !Object.is(value, -0)
    );
  }),
);

/** Check physical array bounds before visiting element decoders. Effect Array checks
 * run after elements; this native array declaration deliberately has no traversal. */
export const boundedArray = <S extends Schema.Constraint>(
  element: S,
  limit: number,
) =>
  Schema.declare((value): value is readonly unknown[] => Array.isArray(value))
    .check(Schema.isMaxLength(limit))
    .pipe(Schema.decodeTo(Schema.Array(element)));

/** Preserve the adapters' synchronous TypeError surface and exact field policy. */
export const decoder = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
) => {
  const decode = Schema.decodeUnknownSync(schema, {
    onExcessProperty: "error",
  });
  return (value: unknown): S["Type"] => {
    try {
      return decode(value);
    } catch (cause) {
      throw new TypeError("invalid Bend boundary value", { cause });
    }
  };
};
export const readNat = decoder(Nat);
export const readPositiveNat = decoder(PositiveNat);
export const readBytes = decoder(ByteCount);
export const readBool = decoder(Schema.Boolean);
const RecordSchema = Schema.Record(Schema.String, Schema.Unknown);
/** Schema assertions preserve native object identity used by the provenance fence. */
export const readRecord = (value: unknown): Record<string, unknown> => {
  try {
    Schema.asserts(RecordSchema, value);
  } catch (cause) {
    throw new TypeError("invalid Bend object", { cause });
  }
  return value;
};
// Tag dispatch does not inspect linked tails; each constructor decoder is exact.
const decodeTag = Schema.decodeUnknownSync(Schema.Struct({ $: Schema.String }));
export const readTag = (value: unknown): { readonly $: string } => {
  try {
    return decodeTag(value);
  } catch (cause) {
    throw new TypeError("invalid Bend constructor", { cause });
  }
};
export const NilSchema = Schema.Struct({ $: Schema.Literal("Nil") });
export const ConsSchema = Schema.Struct({
  $: Schema.Literal("Con"),
  head: Schema.Unknown,
  tail: Schema.Unknown,
});
export const readNil = decoder(NilSchema);
const readListCell = decoder(Schema.Union([ConsSchema, NilSchema]));

/** Iterate native list cells, never recursively decode a generated linked list. */
export const readBendList = <T>(
  value: unknown,
  decode: (item: unknown) => T,
  limit: number,
): T[] => {
  const result: T[] = [];
  let cursor = value;
  while (result.length < limit) {
    const cell = readListCell(cursor);
    if (cell.$ === "Nil") return result;
    result.push(decode(cell.head));
    cursor = cell.tail;
  }
  // At the physical bound, inspect only the terminal shape, never another head.
  readNil(cursor);
  return result;
};
