export type CaseStatus = "pass" | "fail" | "skip";
export type LogLevel = "info" | "warn" | "error";

export interface RunRecord {
  type: "RUN";
  runId: string;
  startedAt: string;
  lineNumber: number;
}

export interface CaseRecord {
  type: "CASE";
  caseId: string;
  suite: string;
  name: string;
  lineNumber: number;
}

export interface BeginRecord {
  type: "BEGIN";
  caseId: string;
  startedAt: string;
  lineNumber: number;
}

export interface LogRecord {
  type: "LOG";
  caseId: string;
  level: LogLevel;
  message: string;
  lineNumber: number;
}

export interface EndRecord {
  type: "END";
  caseId: string;
  status: CaseStatus;
  durationMs: number;
  detail: string;
  lineNumber: number;
}

export interface DoneRecord {
  type: "DONE";
  finishedAt: string;
  lineNumber: number;
}

export type TraceRecord =
  | RunRecord
  | CaseRecord
  | BeginRecord
  | LogRecord
  | EndRecord
  | DoneRecord;

export type DiagnosticCode =
  | "malformed-fields"
  | "unknown-record"
  | "duplicate-id"
  | "invalid-lifecycle-order"
  | "unknown-case-reference"
  | "incomplete-run"
  | "incomplete-case";

export interface TraceTapeDiagnostic {
  code: DiagnosticCode;
  lineNumber: number;
  message: string;
}

/** A declared case and the accepted lifecycle records associated with it. */
export interface TraceCase {
  caseId: string;
  suite: string;
  name: string;
  lineNumber: number;
  declaration: CaseRecord;
  begin: BeginRecord | null;
  logs: LogRecord[];
  end: EndRecord | null;
}

/**
 * A parsed document. `records` contains accepted records in source order;
 * malformed, unknown, duplicate, or out-of-order records are omitted.
 */
export interface TraceTapeDocument {
  run: RunRecord | null;
  cases: TraceCase[];
  done: DoneRecord | null;
  records: TraceRecord[];
  diagnostics: TraceTapeDiagnostic[];
  isValid: boolean;
}

export interface RunSummary {
  byStatus: Record<CaseStatus, number>;
  /** Number of cases with an accepted END record. */
  totalCases: number;
  /** `DONE.finishedAt - RUN.startedAt`, or null when either timestamp is absent or invalid. */
  elapsedMilliseconds: number | null;
}
