export type CaseStatus = "pass" | "fail" | "skip";
export type LogLevel = "info" | "warn" | "error";

declare const runIdBrand: unique symbol;
declare const caseIdBrand: unique symbol;
declare const isoInstantBrand: unique symbol;
declare const nonEmptyStringBrand: unique symbol;
declare const durationMsBrand: unique symbol;

/** A parser-validated, nonempty ID token without whitespace. */
export type RunId = string & { readonly [runIdBrand]: "RunId" };
/** A parser-validated, nonempty ID token without whitespace. */
export type CaseId = string & { readonly [caseIdBrand]: "CaseId" };
/** A parser-validated extended ISO 8601 date-time with an explicit timezone. */
export type IsoInstant = string & { readonly [isoInstantBrand]: "IsoInstant" };
/** A parser-validated string that is nonempty after trimming. */
export type NonEmptyString = string & { readonly [nonEmptyStringBrand]: "NonEmptyString" };
/** A nonnegative safe integer duration in milliseconds. */
export type DurationMs = number & { readonly [durationMsBrand]: "DurationMs" };

export type DiagnosticCode =
  | "MALFORMED_FIELDS"
  | "UNKNOWN_RECORD"
  | "DUPLICATE_ID"
  | "INVALID_LIFECYCLE_ORDER"
  | "UNKNOWN_CASE_REFERENCE"
  | "INCOMPLETE_RUN"
  | "INCOMPLETE_CASE";

export interface TraceTapeDiagnostic {
  readonly code: DiagnosticCode;
  readonly line: number;
  readonly message: string;
}

export interface RunRecord {
  readonly type: "RUN";
  readonly runId: RunId;
  readonly startedAt: IsoInstant;
  readonly line: number;
}

export interface CaseRecord {
  readonly type: "CASE";
  readonly caseId: CaseId;
  readonly suite: NonEmptyString;
  readonly name: NonEmptyString;
  readonly line: number;
}

export interface BeginRecord {
  readonly type: "BEGIN";
  readonly caseId: CaseId;
  readonly startedAt: IsoInstant;
  readonly line: number;
}

export interface LogRecord {
  readonly type: "LOG";
  readonly caseId: CaseId;
  readonly level: LogLevel;
  readonly message: string;
  readonly line: number;
}

export type EndFacts =
  | { readonly status: "fail"; readonly durationMs: DurationMs; readonly detail: NonEmptyString }
  | { readonly status: "pass" | "skip"; readonly durationMs: DurationMs; readonly detail: "" };

export type EndRecord = { readonly type: "END"; readonly caseId: CaseId; readonly line: number } & EndFacts;

export interface DoneRecord {
  readonly type: "DONE";
  readonly finishedAt: IsoInstant;
  readonly line: number;
}

export type TraceTapeRecord =
  | RunRecord
  | CaseRecord
  | BeginRecord
  | LogRecord
  | EndRecord
  | DoneRecord;

export interface TraceTapeCaseBase {
  readonly caseId: CaseId;
  readonly suite: NonEmptyString;
  readonly name: NonEmptyString;
  /** Source line of the CASE declaration. */
  readonly line: number;
  readonly logs: readonly LogRecord[];
}

export interface DeclaredTraceTapeCase extends TraceTapeCaseBase {
  readonly state: "declared";
}

export interface StartedTraceTapeCase extends TraceTapeCaseBase {
  readonly state: "started";
  readonly startedAt: IsoInstant;
  readonly beginLine: number;
}

export type EndedTraceTapeCase = TraceTapeCaseBase & {
  readonly state: "ended";
  readonly startedAt: IsoInstant;
  readonly beginLine: number;
  readonly endLine: number;
} & EndFacts;

/** A declaration with one of the three valid lifecycle states attached. */
export type TraceTapeCase = DeclaredTraceTapeCase | StartedTraceTapeCase | EndedTraceTapeCase;

/** A recoverable parse result. Only accepted records are present in `records`. */
export interface TraceTapeDocument {
  readonly records: readonly TraceTapeRecord[];
  readonly cases: readonly TraceTapeCase[];
  readonly diagnostics: readonly TraceTapeDiagnostic[];
}

export interface RunSummary {
  readonly totalCases: number;
  readonly byStatus: Readonly<Record<CaseStatus, number>>;
  readonly incompleteCases: number;
  /** Wall-clock difference in milliseconds; absent unless both run boundaries exist. */
  readonly elapsedMs?: number;
}
