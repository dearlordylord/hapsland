import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import { Nat, decoder, boundedArray } from "./boundary-schema.ts";

// Generated graph output supports bigint; input remains Bend's numeric 48-bit Nat.
const SafeNatural = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
);
export const NativeNatural = Schema.Union([
  SafeNatural,
  Schema.BigInt.check(
    Schema.isBetweenBigInt({
      minimum: 0n,
      maximum: BigInt(Number.MAX_SAFE_INTEGER),
    }),
  ).pipe(
    Schema.decodeTo(SafeNatural, {
      decode: SchemaGetter.transform((value) => Number(value)),
      encode: SchemaGetter.transform((value) => BigInt(value)),
    }),
  ),
]);
const Edges = boundedArray(Nat, 128);
const captureFields = {
  sourceBytes: Nat,
  treeBytes: Nat,
  localWork: Schema.optionalKey(Nat),
  edges: Edges,
};
export const ImportGraphEventSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("root"),
    target: Nat,
    ...captureFields,
  }),
  Schema.Struct({ kind: Schema.Literal("next") }),
  Schema.Struct({
    kind: Schema.Literal("resolved"),
    target: Nat,
    result: Schema.Literals(["found", "missing", "ambiguous", "unsupported"]),
  }),
  Schema.Struct({
    kind: Schema.Literal("pathChecked"),
    allowed: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literal("captured"), ...captureFields }),
  Schema.Struct({ kind: Schema.Literal("captureFailed") }),
  Schema.Struct({ kind: Schema.Literal("deadlineReached") }),
]);
export type ImportGraphEvent = typeof ImportGraphEventSchema.Type;
const reasons = [
  "Missing",
  "Ambiguous",
  "Unsupported",
  "Omitted",
  "Excluded",
  "CaptureUnavailable",
  "FileLimit",
  "ReadLimit",
  "TreeLimit",
  "WorkLimit",
  "DepthLimit",
  "Deadline",
  "ProtocolViolation",
] as const;
// Compiler output and retained graph boundary fixtures admit qualified and bare tags.
export const GraphReasonSchema = Schema.Struct({
  $: Schema.Literals(reasons.flatMap((name) => [name, `ImportGraph.${name}`])),
});
const ctor = <
  const Name extends string,
  const Fields extends Schema.Struct.Fields,
>(
  name: Name,
  fields: Fields,
) =>
  Schema.Struct({
    $: Schema.Literals([name, `ImportGraph.${name}`]),
    ...fields,
  });
export const GraphCommandSchema = Schema.Union([
  ctor("NoCommand", {}),
  ctor("ResolveEdge", { edge: NativeNatural }),
  ctor("CheckPath", { target: NativeNatural }),
  ctor("ReadSource", { target: NativeNatural }),
  ctor("UnitComplete", {}),
  ctor("UnitIncomplete", { reason: GraphReasonSchema }),
  ctor("SkipImport", { target: NativeNatural, reason: GraphReasonSchema }),
]);
export const GraphEdgeConstructor = ctor("Edge", {
  id: NativeNatural,
  depth: NativeNatural,
});
export const GraphPhaseSchema = Schema.Union([
  ctor("Idle", {}),
  ctor("Ready", {}),
  ctor("Resolving", { edge: GraphEdgeConstructor }),
  ctor("Checking", { edge: GraphEdgeConstructor, target: NativeNatural }),
  ctor("Capturing", { edge: GraphEdgeConstructor, target: NativeNatural }),
  ctor("Complete", {}),
  ctor("Incomplete", { reason: GraphReasonSchema }),
]);
export const GraphLimitsConstructor = ctor("Limits", {
  version: NativeNatural,
  source_bytes: NativeNatural,
  tree_bytes: NativeNatural,
  files: NativeNatural,
  read_bytes: NativeNatural,
  outgoing_edges: NativeNatural,
  depth: NativeNatural,
  work: NativeNatural,
});
export const GraphConstructor = ctor("Graph", {
  limits: GraphLimitsConstructor,
  phase: GraphPhaseSchema,
  pending: Schema.Unknown,
  visited: Schema.Unknown,
  files: NativeNatural,
  read_bytes: NativeNatural,
  tree_bytes: NativeNatural,
  work: NativeNatural,
  skipped_tree: Schema.Boolean,
  skipped_excluded: Schema.Boolean,
  skipped_other: Schema.Boolean,
});
export const BoundedGraphConstructor = ctor("Bounded", {
  graph: GraphConstructor,
  remaining: NativeNatural,
});
export const GraphStepConstructor = ctor("BoundedStep", {
  state: Schema.Unknown,
  command: GraphCommandSchema,
});
export const GraphProfileSchema = Schema.Struct({
  version: Schema.Literal(1),
  sourceBytes: Nat.check(Schema.isBetween({ minimum: 1, maximum: 262_144 })),
  treeBytes: Nat.check(Schema.isBetween({ minimum: 1, maximum: 20_480 })),
  files: Nat.check(Schema.isBetween({ minimum: 1, maximum: 8 })),
  readBytes: Nat.check(Schema.isBetween({ minimum: 1, maximum: 1_572_864 })),
  outgoingEdges: Nat.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
  depth: Nat.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  work: Nat.check(Schema.isBetween({ minimum: 1, maximum: 128 })),
}).check(Schema.makeFilter((value) => value.readBytes >= value.sourceBytes));
export const ImportGraphProjectionSchema = Schema.Struct({
  limits: GraphProfileSchema,
  phase: Schema.Literals([
    "idle",
    "ready",
    "resolving",
    "checking",
    "capturing",
    "complete",
    "incomplete",
  ]),
  reason: Schema.optionalKey(Schema.String),
  pending: boundedArray(SafeNatural, 128),
  visited: boundedArray(SafeNatural, 128),
  files: SafeNatural,
  readBytes: SafeNatural,
  treeBytes: SafeNatural,
  work: SafeNatural,
  skippedTree: Schema.Boolean,
  skippedExcluded: Schema.Boolean,
  skippedOther: Schema.Boolean,
});
export type ImportGraphProjection = typeof ImportGraphProjectionSchema.Type;
export const ImportGraphCommandSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({ kind: Schema.Literal("resolveEdge"), edge: SafeNatural }),
  Schema.Struct({ kind: Schema.Literal("checkPath"), target: SafeNatural }),
  Schema.Struct({ kind: Schema.Literal("readSource"), target: SafeNatural }),
  Schema.Struct({ kind: Schema.Literal("unitComplete") }),
  Schema.Struct({
    kind: Schema.Literal("unitIncomplete"),
    reason: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("skipImport"),
    target: SafeNatural,
    reason: Schema.String,
  }),
]);
export type ImportGraphCommand = typeof ImportGraphCommandSchema.Type;
export const decodeGraphEvent = decoder(ImportGraphEventSchema);
export const decodeGraphState = decoder(BoundedGraphConstructor);
export const decodeGraphStep = decoder(GraphStepConstructor);
export const decodeGraphReason = decoder(GraphReasonSchema);
export const decodeGraphEdge = decoder(GraphEdgeConstructor);
export const decodeGraphProfile = decoder(GraphProfileSchema);
export const decodeNativeNatural = decoder(NativeNatural);
