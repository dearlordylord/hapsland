/** A timestamp carried by a TraceTape record, in its original ISO form. */
export type TraceTapeTimestamp = string;

export interface RunRecord {
  type: "RUN";
  lineNumber: number;
  runId: string;
  startedAt: TraceTapeTimestamp;
}

export interface CaseRecord {
  type: "CASE";
  lineNumber: number;
  caseId: string;
  suite: string;
  name: string;
}

export interface BeginRecord {
  type: "BEGIN";
  lineNumber: number;
  caseId: string;
  startedAt: TraceTapeTimestamp;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogRecord {
  type: "LOG";
  lineNumber: number;
  caseId: string;
  level: LogLevel;
  message: string;
}

export type CaseStatus = "pass" | "fail" | "skip";

export interface EndRecord {
  type: "END";
  lineNumber: number;
  caseId: string;
  status: CaseStatus;
  durationMs: number;
  detail: string;
}

export interface DoneRecord {
  type: "DONE";
  lineNumber: number;
  finishedAt: TraceTapeTimestamp;
}

/** Records accepted by the parser, in their original source order. */
export type TraceTapeRecord =
  | RunRecord
  | CaseRecord
  | BeginRecord
  | LogRecord
  | EndRecord
  | DoneRecord;

/** A case declaration together with its accepted lifecycle records. */
export interface TraceTapeCase {
  declaration: CaseRecord;
  begin?: BeginRecord;
  logs: LogRecord[];
  end?: EndRecord;
}

export type DiagnosticCode =
  | "MALFORMED_FIELDS"
  | "UNKNOWN_RECORD"
  | "DUPLICATE_CASE_ID"
  | "INVALID_LIFECYCLE_ORDER"
  | "UNKNOWN_CASE_REFERENCE"
  | "INCOMPLETE_RUN"
  | "INCOMPLETE_CASE";

export interface TraceTapeDiagnostic {
  lineNumber: number;
  code: DiagnosticCode;
  message: string;
}

export interface TraceTapeDocument {
  /** Accepted records only. Rejected source lines are represented by diagnostics. */
  records: TraceTapeRecord[];
  /** Accepted run record, when one was found in the required first position. */
  run?: RunRecord;
  /** Accepted case declarations in declaration order. */
  cases: TraceTapeCase[];
  /** Accepted closing record, when present. */
  done?: DoneRecord;
  diagnostics: TraceTapeDiagnostic[];
  /** True when no errors or incomplete structures were found. */
  valid: boolean;
}

export interface RunSummary {
  /** Number of accepted case declarations, including incomplete cases. */
  totalCases: number;
  /** Counts include cases with an accepted END record for that status. */
  casesByStatus: Record<CaseStatus, number>;
  /** Difference between DONE and RUN timestamps in milliseconds, if available. */
  elapsedRunTimeMs?: number;
}
