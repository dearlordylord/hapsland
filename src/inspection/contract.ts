import { createHash } from "node:crypto"
import * as Schema from "effect/Schema"

export const INSPECTION_VERSION = 1 as const
export const MAX_INSPECTION_RECORD_BYTES = 128 * 1024
export const MAX_INSPECTION_QUEUE_BYTES = 4 * 1024 * 1024
export const MAX_INSPECTION_QUEUE_ITEMS = 128
export const MAX_INSPECTION_ROOTS = 128
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
const Path = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192))
const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
const Text = Schema.String.check(Schema.isMaxLength(65536))
const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

export const InspectionScope = Schema.Struct({
  root: Path,
  runtime: Schema.NullOr(Schema.Literals(["codex-cli", "claude-code", "pi", "opencode"])),
  runtimeVersion: Schema.NullOr(Id),
  sessionId: Schema.NullOr(Id),
  subagentId: Schema.NullOr(Id)
})
export type InspectionScope = typeof InspectionScope.Type

export const InspectionCorrelation = Schema.Struct({
  receiptId: Schema.optionalKey(Id),
  unitId: Schema.optionalKey(Id),
  requestId: Schema.optionalKey(Id),
  originalRequestId: Schema.optionalKey(Id),
  batchId: Schema.optionalKey(Id),
  attemptId: Schema.optionalKey(Id)
})
export type InspectionCorrelation = typeof InspectionCorrelation.Type

/** Availability describes retained original bytes, never reconstructed presentation. */
export const InspectionPayloadReference = Schema.Union([
  Schema.Struct({ status: Schema.Literal("available"), id: Id, byteLength: Count, sha256: Hash }),
  Schema.Struct({
    status: Schema.Literal("missing"),
    reason: Schema.Literals(["not-captured", "oversized", "disabled", "capacity", "expired", "evicted", "unavailable"])
  })
])
export type InspectionPayloadReference = typeof InspectionPayloadReference.Type

/** Shared writer evidence: hook and native producers have no dependency on each other. */
export const InspectionWriterState = Schema.Literals([
  "ready",
  "authorized",
  "write-started",
  "written",
  "acknowledged",
  "failed-before-write",
  "uncertain"
])
export const InspectionFact = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("preparation-read"), path: Path }),
  Schema.Struct({
    kind: Schema.Literal("preparation-omission"),
    path: Path,
    declaration: Schema.optionalKey(Id),
    reason: Schema.Literals([
      "unsupported-operation",
      "metadata-only",
      "ineligible",
      "capture-unavailable",
      "extension",
      "parse",
      "import",
      "declaration-limit",
      "declaration-merge",
      "no-declarations",
      "missing-evidence",
      "unsupported-reference",
      "reference-limit",
      "ambiguous-update"
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("unit-policy"),
    provider: Id,
    model: Id,
    activity: Schema.Literals(["controlled", "live"]),
    interpretation: Schema.Literal("probability-strictly-greater-than-threshold"),
    payload: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        rules: Schema.Array(
          Schema.Struct({
            ruleId: Id,
            qualifiedId: Text,
            question: Text,
            criteria: Schema.Struct({ false: Text, true: Text }),
            threshold: Probability,
            message: Text,
            rank: Count,
            packDigest: Hash,
            definitionDigest: Hash
          })
        ).check(Schema.isMaxLength(128))
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("oversized") })
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("interpreted-findings"),
    payload: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        findings: Schema.Array(
          Schema.Struct({
            ruleId: Id,
            probability: Probability,
            message: Text,
            path: Path,
            declaration: Id,
            semanticIdentity: Hash
          })
        ).check(Schema.isMaxLength(128))
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("oversized") })
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("transport-invoked"),
    representation: Schema.Literal("http-body-base64"),
    payload: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        encoded: Schema.String.check(Schema.isMaxLength(21848)),
        byteLength: Count,
        sha256: Hash
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literals(["oversized", "unavailable"]) })
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("model-input"),
    representation: Schema.Literal("decision-model-json"),
    payload: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        encoded: Schema.String.check(Schema.isMaxLength(16384)),
        byteLength: Count,
        sha256: Hash
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("oversized") })
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("validated-answers"),
    answers: Schema.Array(Schema.Struct({ ruleId: Id, probability: Probability })).check(Schema.isMaxLength(128))
  }),
  Schema.Struct({
    kind: Schema.Literal("evaluation-outcome"),
    outcome: Schema.Literals([
      "clear",
      "findings",
      "input-limit",
      "backend",
      "invalid-response",
      "timeout",
      "interrupted"
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("unit-prepared"),
    semanticIdentity: Hash,
    path: Path,
    declaration: Id,
    completeness: Schema.Literals(["complete", "incomplete-irrelevant"])
  }),
  Schema.Struct({
    kind: Schema.Literal("recording-state"),
    state: Schema.Literals(["enabled", "disabled", "unavailable"])
  }),
  Schema.Struct({
    kind: Schema.Literal("edit-received"),
    candidates: Schema.Array(
      Schema.Struct({ operation: Schema.Literals(["add", "update", "delete", "move"]), path: Path })
    ).check(Schema.isMaxLength(64))
  }),
  Schema.Struct({
    kind: Schema.Literal("edit-admission"),
    outcome: Schema.Literals([
      "accepted",
      "rejected-capacity",
      "rejected-stale",
      "unsupported",
      "unavailable",
      "obsolete-lifetime",
      "duplicate"
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("writer-evidence"),
    state: InspectionWriterState,
    noticeOnly: Schema.Boolean,
    findingIds: Schema.Array(Id).check(Schema.isMaxLength(128)),
    output: Schema.optionalKey(InspectionPayloadReference)
  })
])
export type InspectionFact = typeof InspectionFact.Type

export const InspectionRecord = Schema.Struct({
  version: Schema.Literal(INSPECTION_VERSION),
  source: Schema.Struct({ id: Hash, endpoint: Path, lifetime: Id }),
  sequence: Count.check(Schema.isGreaterThan(0)),
  capturedAt: Count.check(Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000_000 })),
  consentEpoch: Count.check(Schema.isGreaterThan(0)),
  scope: InspectionScope,
  correlation: InspectionCorrelation,
  fact: InspectionFact
})
export type InspectionRecord = typeof InspectionRecord.Type

export const inspectionSourceId = (endpoint: string, lifetime: string): string =>
  createHash("sha256")
    .update(JSON.stringify(["inspection-v1", endpoint, lifetime]))
    .digest("hex")

const decode = Schema.decodeUnknownSync(InspectionRecord, { onExcessProperty: "error" })
export const decodeInspectionRecord = (value: unknown): InspectionRecord => {
  const record = decode(value)
  if (record.source.id !== inspectionSourceId(record.source.endpoint, record.source.lifetime))
    throw new Error("inspection source identity mismatch")
  if (record.fact.kind === "model-input" && record.fact.payload.status === "available") {
    const payload = record.fact.payload
    if (
      Buffer.byteLength(payload.encoded) !== payload.byteLength ||
      payload.byteLength > 16384 ||
      createHash("sha256").update(payload.encoded).digest("hex") !== payload.sha256
    )
      throw new Error("inspection payload identity mismatch")
    Schema.decodeUnknownSync(Schema.Json)(JSON.parse(payload.encoded))
  }
  if (record.fact.kind === "transport-invoked" && record.fact.payload.status === "available") {
    const payload = record.fact.payload
    const bytes = Buffer.from(payload.encoded, "base64")
    if (
      bytes.byteLength !== payload.byteLength ||
      bytes.byteLength > 16384 ||
      bytes.toString("base64") !== payload.encoded ||
      createHash("sha256").update(bytes).digest("hex") !== payload.sha256
    )
      throw new Error("inspection payload identity mismatch")
  }
  return record
}
export const decodeInspectionRecordText = (encoded: string): InspectionRecord => {
  if (Buffer.byteLength(encoded) > MAX_INSPECTION_RECORD_BYTES) throw new Error("inspection record exceeds its bound")
  return decodeInspectionRecord(JSON.parse(encoded))
}
