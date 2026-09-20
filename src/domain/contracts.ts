import * as Schema from "effect/Schema";

export const Probability = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1 }),
).pipe(Schema.brand("Probability"));
export type Probability = typeof Probability.Type;

export const RuleId = Schema.NonEmptyString.pipe(Schema.brand("RuleId"));
export type RuleId = typeof RuleId.Type;

export const SnapshotRef = Schema.Struct({
  path: Schema.String,
  contentHash: Schema.String,
});
export interface SnapshotRef extends Schema.Schema.Type<typeof SnapshotRef> {}

export const Advice = Schema.Struct({
  ruleId: RuleId,
  probability: Probability,
  message: Schema.String,
  snapshot: SnapshotRef,
});
export interface Advice extends Schema.Schema.Type<typeof Advice> {}

export const BackendMetadata = Schema.Struct({
  id: Schema.String,
  model: Schema.optionalKey(Schema.String),
  durationMs: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  retries: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  usage: Schema.Struct({
    inputTokens: Schema.optionalKey(Schema.Finite),
    outputTokens: Schema.optionalKey(Schema.Finite),
  }),
});

export const ReviewedResult = Schema.Struct({
  status: Schema.Literal("reviewed"),
  snapshot: SnapshotRef,
  assessment: Schema.Record(RuleId, Probability),
  advice: Schema.Array(Advice),
  backend: BackendMetadata,
  fingerprint: Schema.String,
});

export const SkippedResult = Schema.Struct({
  status: Schema.Literal("skipped"),
  path: Schema.String,
  reason: Schema.String,
  code: Schema.optionalKey(
    Schema.Literals(["excluded", "missing_consent", "unsupported_repository", "no_applicable_rule"]),
  ),
});

export const UnavailableResult = Schema.Struct({
  status: Schema.Literal("unavailable"),
  path: Schema.String,
  reason: Schema.String,
  retryable: Schema.Boolean,
  code: Schema.optionalKey(
    Schema.Literals([
      "missing_credentials",
      "backend_unavailable",
      "invalid_configuration",
      "stale_snapshot",
      "review_timeout",
    ]),
  ),
});

export const ReviewResult = Schema.Union([
  ReviewedResult,
  SkippedResult,
  UnavailableResult,
]);
export type ReviewResult = typeof ReviewResult.Type;

export const SuccessfulEditEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.Literal("successful-edit"),
  host: Schema.String,
  cwd: Schema.String,
  paths: Schema.Array(Schema.String),
});

export const ReviewRequest = Schema.Struct({
  version: Schema.Literal(1),
  event: SuccessfulEditEvent,
});
export type ReviewRequest = typeof ReviewRequest.Type;

export const ReviewResponse = Schema.Struct({
  version: Schema.Literal(1),
  eventId: Schema.String,
  results: Schema.Array(ReviewResult),
  advice: Schema.Array(Advice),
});
export type ReviewResponse = typeof ReviewResponse.Type;

export const decodeReviewRequest = Schema.decodeUnknownEffect(ReviewRequest, {
  onExcessProperty: "error",
  errors: "all",
});
