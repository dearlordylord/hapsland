import * as Schema from "effect/Schema";

/**
 * Session and event identities are host-owned values.  They are deliberately
 * bounded here because they are used as inputs to a local observation store;
 * the store hashes them before using them in a path or persisted record.
 */
export const ReceiptIdentity = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
  Schema.isPattern(/^[^\u0000\r\n]+$/),
);
export type ReceiptIdentity = typeof ReceiptIdentity.Type;

export const ReceiptSessionId = ReceiptIdentity.pipe(Schema.brand("ReceiptSessionId"));
export type ReceiptSessionId = typeof ReceiptSessionId.Type;

export const ReceiptEventId = ReceiptIdentity.pipe(Schema.brand("ReceiptEventId"));
export type ReceiptEventId = typeof ReceiptEventId.Type;

export const ReceiptOutcome = Schema.Literals(["reviewed", "skipped", "unavailable"]);
export type ReceiptOutcome = typeof ReceiptOutcome.Type;

/** Codes are intentionally a closed, source-free vocabulary. */
export const ReceiptCategoryCode = Schema.Literals([
  "excluded",
  "missing_consent",
  "unsupported_repository",
  "no_applicable_rule",
  "missing_credentials",
  "backend_unavailable",
  "invalid_configuration",
  "stale_snapshot",
  "review_timeout",
  "unknown",
]);
export type ReceiptCategoryCode = typeof ReceiptCategoryCode.Type;

export const ReceiptCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export type ReceiptCount = typeof ReceiptCount.Type;

export const ReceiptCounts = Schema.Struct({
  started: ReceiptCount,
  completed: ReceiptCount,
  incomplete: ReceiptCount,
  reviewed: ReceiptCount,
  skipped: ReceiptCount,
  unavailable: ReceiptCount,
});
export interface ReceiptCounts extends Schema.Schema.Type<typeof ReceiptCounts> {}

export const ReceiptTimes = Schema.Struct({
  firstStartedAt: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  lastStartedAt: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  firstCompletedAt: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  lastCompletedAt: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export interface ReceiptTimes extends Schema.Schema.Type<typeof ReceiptTimes> {}

/** One atomic start marker.  It contains no path, source, or provider data. */
export const ReceiptStart = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("start"),
  sessionKey: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  eventKey: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  startedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  expectedResults: ReceiptCount,
});
export interface ReceiptStart extends Schema.Schema.Type<typeof ReceiptStart> {}

/** One atomic completion marker.  Counts and categories are all bounded. */
export const ReceiptCompletion = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("completion"),
  sessionKey: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  eventKey: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  completedAt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  resultCount: ReceiptCount,
  expectedResults: ReceiptCount,
  reviewed: ReceiptCount,
  skipped: ReceiptCount,
  unavailable: ReceiptCount,
  findings: ReceiptCount,
  categories: Schema.Record(Schema.String, ReceiptCount),
});
export interface ReceiptCompletion extends Schema.Schema.Type<typeof ReceiptCompletion> {}

/**
 * A paired event is the only information the status reducer needs.  The event
 * key is intentionally retained only in memory and is never emitted by status.
 */
export interface ReceiptEventObservation {
  readonly eventKey: string;
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly expectedResults?: number;
  readonly resultCount?: number;
  readonly reviewed: number;
  readonly skipped: number;
  readonly unavailable: number;
  readonly findings: number;
  readonly categories: Readonly<Record<string, number>>;
  readonly hasStart: boolean;
  readonly hasCompletion: boolean;
}

export type ReceiptLimitationCode =
  | "receipt_state_unreadable"
  | "receipt_state_corrupt"
  | "receipt_state_unwritable"
  | "session_id_required"
  | "completion_without_start";

export interface ReceiptObservation {
  readonly events: ReadonlyArray<ReceiptEventObservation>;
  readonly limitation?: ReceiptLimitationCode;
}

export const emptyReceiptCounts = (): ReceiptCounts => ({
  started: 0,
  completed: 0,
  incomplete: 0,
  reviewed: 0,
  skipped: 0,
  unavailable: 0,
});
