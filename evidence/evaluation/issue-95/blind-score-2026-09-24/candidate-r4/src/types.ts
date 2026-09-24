export type CaseStatus = "pass" | "fail" | "skip";

export type LogLevel = "info" | "warn" | "error";

interface LineRecord {
  /** One-based source line where this record appeared. */
  lineNumber: number;
}

export interface RunRecord extends LineRecord {
  type: "RUN";
  runId: string;
  startedAt: string;
}

export interface CaseDeclarationRecord extends LineRecord {
  type: "CASE";
  caseId: string;
  suite: string;
  name: string;
}

export interface BeginRecord extends LineRecord {
  type: "BEGIN";
  caseId: string;
  startedAt: string;
}

export interface LogRecord extends LineRecord {
  type: "LOG";
  caseId: string;
  level: LogLevel;
  message: string;
}

export interface EndRecord extends LineRecord {
  type: "END";
  caseId: string;
  status: CaseStatus;
  durationMs: number;
  detail: string;
}

export interface DoneRecord extends LineRecord {
  type: "DONE";
  finishedAt: string;
}

/** A valid record accepted by the parser, in source order. */
export type TraceTapeRecord =
  | RunRecord
  | CaseDeclarationRecord
  | BeginRecord
  | LogRecord
  | EndRecord
  | DoneRecord;

export type DiagnosticCode =
  | "MALFORMED_FIELDS"
  | "UNKNOWN_RECORD"
  | "DUPLICATE_ID"
  | "INVALID_LIFECYCLE"
  | "UNKNOWN_CASE"
  | "INCOMPLETE_RUN"
  | "INCOMPLETE_CASE";

export interface TraceTapeDiagnostic {
  lineNumber: number;
  code: DiagnosticCode;
  message: string;
}

/** A declared case and its accepted lifecycle records. */
export interface TraceTapeCase {
  caseId: string;
  suite: string;
  name: string;
  declarationLine: number;
  begin?: BeginRecord;
  logs: LogRecord[];
  end?: EndRecord;
}

/**
 * Parsed output. `records` contains only accepted records. `cases` is a
 * case-centered index over accepted CASE/BEGIN/LOG/END records.
 */
export interface TraceTapeDocument {
  records: TraceTapeRecord[];
  cases: TraceTapeCase[];
  run?: RunRecord;
  done?: DoneRecord;
  diagnostics: TraceTapeDiagnostic[];
}

export interface StatusCounts {
  pass: number;
  fail: number;
  skip: number;
}

export interface RunSummary {
  /** Number of accepted CASE declarations. */
  caseCount: number;
  /** Counts of accepted END records, grouped by final status. */
  countsByStatus: StatusCounts;
  /** Difference in milliseconds, or undefined if either instant is invalid/missing. */
  elapsedMs: number | undefined;
}
