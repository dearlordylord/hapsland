import { createHash } from "node:crypto"
import * as Schema from "effect/Schema"

export const MAX_INSPECTION_MESSAGE_BYTES = 16 * 1024
export const MAX_INSPECTION_INPUT_BYTES = 16 * 1024
export const INSPECTION_VERSION = 2 as const
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
export const MAX_INSPECTION_RECORDING_BYTES = 32768
export const InspectionRecordingRoot = Schema.Struct({
  root: Path,
  state: Schema.Literals(["enabled", "disabled", "unavailable"]),
  epoch: Count
})
export type InspectionRecordingRoot = typeof InspectionRecordingRoot.Type

export const InspectionCorrelation = Schema.Struct({
  receiptId: Schema.optionalKey(Id),
  roundId: Schema.optionalKey(Id),
  unitId: Schema.optionalKey(Id),
  requestId: Schema.optionalKey(Id),
  evaluationId: Schema.optionalKey(Id),
  originalRequestId: Schema.optionalKey(Id),
  batchId: Schema.optionalKey(Id),
  attemptId: Schema.optionalKey(Id)
})
export type InspectionCorrelation = typeof InspectionCorrelation.Type

/** Persist factual codes and arguments; wording belongs to the dashboard. */
export const InspectionSelectionExclusion = Schema.Union([
  Schema.Struct({
    stage: Schema.Literal("selection"),
    code: Schema.Literal("file-extension"),
    args: Schema.Struct({ extension: Schema.String.check(Schema.isMaxLength(256)) })
  }),
  Schema.Struct({
    stage: Schema.Literal("selection"),
    code: Schema.Literals([
      "repository-boundary",
      "sensitive",
      "generated-or-vendor",
      "excluded",
      "empty-includes",
      "not-included",
      "language-not-enabled",
      "git-administrative-path",
      "unsafe-file-kind",
      "git-ignored",
      "unsupported-operation"
    ]),
    args: Schema.Struct({})
  })
])
export const InspectionSelectionUnavailable = Schema.Struct({
  stage: Schema.Literal("selection"),
  code: Schema.Literals(["path-observation-unavailable", "edit-policy-unavailable"]),
  args: Schema.Struct({})
})
// Accepted #252 interface; producers remain independent of the inspector.
export const InspectionCaptureDiagnostic = Schema.Union([
  Schema.Struct({
    stage: Schema.Literal("capture"),
    code: Schema.Literal("capture-size-limit"),
    args: Schema.Struct({ observedBytes: Count, limitBytes: Count })
  }),
  Schema.Struct({
    stage: Schema.Literal("capture"),
    code: Schema.Literal("capture-budget-limit"),
    args: Schema.Struct({ resource: Schema.Literals(["files", "bytes"]), used: Count, requested: Count, limit: Count })
  }),
  Schema.Struct({
    stage: Schema.Literal("capture"),
    code: Schema.Literal("capture-unavailable"),
    args: Schema.Struct({ reason: Schema.Literals(["missing", "access", "io", "mechanism", "unknown"]) })
  }),
  Schema.Struct({
    stage: Schema.Literal("capture"),
    code: Schema.Literal("capture-unstable"),
    args: Schema.Struct({ checkpoint: Schema.Literals(["descriptor", "double-read"]) })
  }),
  Schema.Struct({
    stage: Schema.Literal("capture"),
    code: Schema.Literal("capture-validation-failed"),
    args: Schema.Struct({
      reason: Schema.Literals([
        "root-identity",
        "git-identity",
        "path-binding",
        "file-kind",
        "text-encoding",
        "source-null-byte",
        "budget-argument"
      ])
    })
  })
])
export const InspectionPreparationDiagnostic = Schema.Union([
  Schema.Struct({
    stage: Schema.Literal("preparation"),
    code: Schema.Literal("preparation-resource-refused"),
    args: Schema.Struct({
      phase: Schema.Literals(["capture-workspace", "materialization"]),
      requestedBytes: Count,
      constraint: Schema.optionalKey(
        Schema.Literals(["globalItems", "globalBytes", "partitionItems", "partitionBytes"])
      )
    })
  }),
  Schema.Struct({
    stage: Schema.Literal("preparation"),
    code: Schema.Literal("preparation-unavailable"),
    args: Schema.Struct({ reason: Schema.Literals(["stale-round", "wrong-stage"]) })
  })
])
export const InspectionDiagnostic = Schema.Union([
  Schema.Struct({
    stage: Schema.Literal("provider-input"),
    code: Schema.Literal("review-input-invalid"),
    args: Schema.Struct({
      reason: Schema.Literals([
        "root-invalid",
        "supporting-artifact-invalid",
        "duplicate-expanded-target",
        "included-target-unavailable",
        "projection-invalid",
        "request-invalid"
      ])
    })
  }),
  Schema.Struct({
    stage: Schema.Literal("provider-input"),
    code: Schema.Literal("review-input-limit"),
    args: Schema.Struct({ constraint: Schema.Literal("tree-bytes"), observedBytes: Count, limitBytes: Count })
  }),
  Schema.Struct({
    stage: Schema.Literal("observation"),
    code: Schema.Literal("attribution-unavailable"),
    args: Schema.Struct({})
  }),
  Schema.Struct({
    stage: Schema.Literal("admission"),
    code: Schema.Literal("dispatch-unavailable"),
    args: Schema.Struct({})
  }),
  InspectionSelectionExclusion,
  InspectionSelectionUnavailable,
  InspectionCaptureDiagnostic,
  InspectionPreparationDiagnostic,
  Schema.Struct({
    stage: Schema.Literals(["observation", "selection", "capture", "admission", "preparation"]),
    code: Schema.Literal("panic"),
    args: Schema.Struct({
      boundary: Schema.Literals([
        "native-adaptation",
        "file-selection",
        "stable-capture",
        "review-admission",
        "review-preparation"
      ])
    })
  }).check(
    Schema.makeFilter(
      (value) =>
        ({
          observation: "native-adaptation",
          selection: "file-selection",
          capture: "stable-capture",
          admission: "review-admission",
          preparation: "review-preparation"
        })[value.stage] === value.args.boundary
    )
  )
])
export type InspectionDiagnostic = typeof InspectionDiagnostic.Type
export const InspectionSelection = Schema.Union([
  Schema.Struct({ status: Schema.Literal("selected") }),
  Schema.Struct({ status: Schema.Literal("excluded"), diagnostic: InspectionSelectionExclusion }),
  Schema.Struct({ status: Schema.Literal("unavailable"), diagnostic: InspectionSelectionUnavailable }),
  Schema.Struct({ status: Schema.Literal("not-evaluated") })
])
export type InspectionSelection = typeof InspectionSelection.Type
export const InspectionNativeCandidate = Schema.Struct({
  position: Count.check(Schema.isLessThan(64)),
  operation: Schema.Literals(["add", "update", "delete", "move"]),
  path: Path,
  moveTo: Schema.optionalKey(Path),
  selection: InspectionSelection
}).check(Schema.makeFilter((value) => value.moveTo === undefined || value.operation === "move"))
export type InspectionNativeCandidate = typeof InspectionNativeCandidate.Type

export const InspectionFact = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("diagnostic"),
    path: Schema.optionalKey(Path),
    declaration: Schema.optionalKey(Id),
    candidatePosition: Schema.optionalKey(Count.check(Schema.isLessThan(64))),
    diagnostic: InspectionDiagnostic
  }),
  Schema.Struct({
    kind: Schema.Literal("round-membership"),
    roundId: Id,
    pinnedRoot: Path,
    skippedPaths: Schema.Array(Path).check(Schema.isMaxLength(16))
  }),
  Schema.Struct({ kind: Schema.Literal("source-registration") }),
  Schema.Struct({
    kind: Schema.Literal("finding-fate"),
    fate: Schema.Literals(["retained", "current", "stale", "expired", "discarded", "suppressed"]),
    reason: Schema.Literals([
      "pending-advice",
      "revalidated-current",
      "resident-stale",
      "retention-expired",
      "settlement-ignored",
      "collection-suppression",
      "publication-retired",
      "delivery-finalized",
      "credential-invalid",
      "round-closed",
      "resident-disposed",
      "retention-failed"
    ]),
    adviceId: Schema.optionalKey(Id),
    payload: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        findingIds: Schema.Array(Hash).check(Schema.isMaxLength(128))
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("oversized") })
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("evaluation-route"),
    route: Schema.Literals(["fresh", "joined-pending", "joined-claimed", "existing-advice", "cached"]),
    semanticIdentity: Hash,
    path: Path,
    declaration: Id,
    original: Schema.Union([
      Schema.Struct({ status: Schema.Literal("linked"), evaluationId: Id }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("not-captured") })
    ])
  }),
  Schema.Struct({ kind: Schema.Literal("preparation-read"), path: Path }),
  Schema.Struct({ kind: Schema.Literal("preparation-skipped"), path: Path }),
  Schema.Struct({
    kind: Schema.Literal("preparation-omission"),
    path: Path,
    declaration: Schema.optionalKey(Id),
    reason: Schema.Literals([
      "no-applicable-rule",
      "unsupported-operation",
      "metadata-only",
      "ineligible",
      "repository-boundary",
      "sensitive",
      "generated-or-vendor",
      "file-extension",
      "excluded",
      "empty-includes",
      "not-included",
      "language-not-enabled",
      "git-administrative-path",
      "unsafe-file-kind",
      "git-ignored",
      "path-observation-unavailable",
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
      "ambiguous-update",
      "function-analysis-unavailable",
      "function-overload",
      "unsupported-callable",
      "no-supported-function-root"
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
            source: Text,
            question: Text,
            criteria: Schema.Struct({ false: Text, true: Text }),
            threshold: Probability,
            message: Text,
            rank: Count,
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
        encoded: Schema.String.check(Schema.isMaxLength(MAX_INSPECTION_INPUT_BYTES)),
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
      "input-invalid",
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
    candidates: Schema.Array(InspectionNativeCandidate).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64),
      Schema.makeFilter((value) =>
        value.every((candidate, index) => index === 0 || candidate.position > value[index - 1]!.position)
      )
    )
  }),
  Schema.Struct({
    kind: Schema.Literal("edit-admission"),
    outcome: Schema.Literals([
      "accepted",
      "skipped-other-root",
      "rejected-capacity",
      "rejected-stale",
      "unsupported",
      "unavailable",
      "obsolete-lifetime",
      "duplicate"
    ])
  }),
  Schema.Struct({
    kind: Schema.Literal("agent-message"),
    findingIds: Schema.Array(Id).check(Schema.isMaxLength(128)),
    recipient: Schema.Struct({ turnId: Schema.NullOr(Id), toolUseId: Schema.NullOr(Id) }),
    evaluations: Schema.Array(Schema.Struct({ semanticIdentity: Hash, evaluationId: Schema.optionalKey(Id) })).check(
      Schema.isMaxLength(128)
    ),
    message: Schema.Union([
      Schema.Struct({
        status: Schema.Literal("available"),
        text: Schema.String.check(
          Schema.makeFilter((value) => Buffer.byteLength(value, "utf8") <= MAX_INSPECTION_MESSAGE_BYTES)
        )
      }),
      Schema.Struct({ status: Schema.Literal("missing"), reason: Schema.Literal("oversized") })
    ])
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
export const InspectionLoss = Schema.Struct({
  version: Schema.Literal(INSPECTION_VERSION),
  sourceId: Hash,
  sequence: Count.check(Schema.isGreaterThan(0)),
  capturedAt: Count.check(Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000_000 })),
  removedAt: Count.check(Schema.isBetween({ minimum: 0, maximum: 8_640_000_000_000_000 })),
  reason: Schema.Literals(["expired", "capacity-evicted"])
})
export type InspectionLoss = typeof InspectionLoss.Type
export type InspectionJournalSnapshot = {
  readonly records: ReadonlyArray<InspectionRecord>
  readonly losses: ReadonlyArray<InspectionLoss>
  /** Known expiry in this read, without claiming physical deletion or persisting a loss marker. */
  readonly expired?: ReadonlyArray<{ readonly sourceId: string; readonly sequence: number }>
}
export const decodeInspectionLossText = (encoded: string): InspectionLoss => {
  if (Buffer.byteLength(encoded) > 512) throw new Error("inspection loss marker exceeds its bound")
  return Schema.decodeUnknownSync(InspectionLoss, { onExcessProperty: "error" })(JSON.parse(encoded))
}

export const inspectionSourceId = (endpoint: string, lifetime: string): string =>
  createHash("sha256")
    .update(JSON.stringify(["inspection-v1", endpoint, lifetime]))
    .digest("hex")

const decode = Schema.decodeUnknownSync(InspectionRecord, { onExcessProperty: "error" })
const validateModelInput = (record: InspectionRecord): void => {
  if (record.fact.kind === "model-input" && record.fact.payload.status === "available") {
    const payload = record.fact.payload
    if (
      Buffer.byteLength(payload.encoded) !== payload.byteLength ||
      payload.byteLength > MAX_INSPECTION_INPUT_BYTES ||
      createHash("sha256").update(payload.encoded).digest("hex") !== payload.sha256
    )
      throw new Error("inspection payload identity mismatch")
    Schema.decodeUnknownSync(Schema.Json)(JSON.parse(payload.encoded))
  }
}
const validateTransportInput = (record: InspectionRecord): void => {
  if (record.fact.kind === "transport-invoked" && record.fact.payload.status === "available") {
    const payload = record.fact.payload
    const bytes = Buffer.from(payload.encoded, "base64")
    if (
      bytes.byteLength !== payload.byteLength ||
      bytes.byteLength > MAX_INSPECTION_INPUT_BYTES ||
      bytes.toString("base64") !== payload.encoded ||
      createHash("sha256").update(bytes).digest("hex") !== payload.sha256
    )
      throw new Error("inspection payload identity mismatch")
  }
}
export const decodeInspectionRecord = (value: unknown): InspectionRecord => {
  const record = decode(value)
  if (record.source.id !== inspectionSourceId(record.source.endpoint, record.source.lifetime))
    throw new Error("inspection source identity mismatch")
  validateModelInput(record)
  validateTransportInput(record)
  return record
}
export const decodeInspectionRecordText = (encoded: string): InspectionRecord => {
  if (Buffer.byteLength(encoded) > MAX_INSPECTION_RECORD_BYTES) throw new Error("inspection record exceeds its bound")
  return decodeInspectionRecord(JSON.parse(encoded))
}
