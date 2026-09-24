import type {
  BeginRecord,
  CaseRecord,
  CaseId,
  CaseStatus,
  DoneRecord,
  DurationMs,
  EndRecord,
  IsoInstant,
  LogLevel,
  LogRecord,
  NonEmptyString,
  RunRecord,
  RunId,
  TraceTapeRecord,
} from "./types.js";

export type RecordParseResult =
  | { kind: "record"; record: TraceTapeRecord }
  | { kind: "malformed"; message: string }
  | { kind: "unknown"; name: string };

const isToken = (value: string): boolean => value.length > 0 && !/\s/.test(value);
const isCaseStatus = (value: string): value is CaseStatus =>
  value === "pass" || value === "fail" || value === "skip";
const isLogLevel = (value: string): value is LogLevel =>
  value === "info" || value === "warn" || value === "error";

/** Accepts the extended ISO 8601 date-time form with an explicit UTC offset. */
export function isIsoInstant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
    value,
  );
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[10] ?? 0);
  const offsetMinute = Number(match[11] ?? 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function malformed(message: string): RecordParseResult {
  return { kind: "malformed", message };
}

function hasFieldCount(fields: string[], count: number): boolean {
  return fields.length === count;
}

/** Parses field shape and value constraints without applying run lifecycle rules. */
export function parseRecord(fields: string[], line: number): RecordParseResult {
  const name = fields[0] ?? "";
  if (name.length === 0) return malformed("Record name is empty.");

  switch (name) {
    case "RUN": {
      if (!hasFieldCount(fields, 3)) return malformed("RUN requires 2 fields after its name.");
      const runId = fields[1]!;
      const startedAt = fields[2]!;
      if (!isToken(runId)) return malformed("Run ID must be nonempty and contain no whitespace.");
      if (!isIsoInstant(startedAt)) return malformed("RUN timestamp must be an ISO 8601 instant with a timezone.");
      const record: RunRecord = {
        type: "RUN",
        runId: runId as RunId,
        startedAt: startedAt as IsoInstant,
        line,
      };
      return { kind: "record", record };
    }
    case "CASE": {
      if (!hasFieldCount(fields, 4)) return malformed("CASE requires 3 fields after its name.");
      const caseId = fields[1]!;
      const suite = fields[2]!;
      const caseName = fields[3]!;
      if (!isToken(caseId)) return malformed("Case ID must be nonempty and contain no whitespace.");
      if (suite.length === 0) return malformed("CASE suite must be nonempty.");
      if (caseName.length === 0) return malformed("CASE name must be nonempty.");
      const record: CaseRecord = {
        type: "CASE",
        caseId: caseId as CaseId,
        suite: suite as NonEmptyString,
        name: caseName as NonEmptyString,
        line,
      };
      return { kind: "record", record };
    }
    case "BEGIN": {
      if (!hasFieldCount(fields, 3)) return malformed("BEGIN requires 2 fields after its name.");
      const caseId = fields[1]!;
      const startedAt = fields[2]!;
      if (!isToken(caseId)) return malformed("Case ID must be nonempty and contain no whitespace.");
      if (!isIsoInstant(startedAt)) return malformed("BEGIN timestamp must be an ISO 8601 instant with a timezone.");
      const record: BeginRecord = {
        type: "BEGIN",
        caseId: caseId as CaseId,
        startedAt: startedAt as IsoInstant,
        line,
      };
      return { kind: "record", record };
    }
    case "LOG": {
      if (!hasFieldCount(fields, 4)) return malformed("LOG requires 3 fields after its name.");
      const caseId = fields[1]!;
      const level = fields[2]!;
      const message = fields[3]!;
      if (!isToken(caseId)) return malformed("Case ID must be nonempty and contain no whitespace.");
      if (!isLogLevel(level)) return malformed("LOG level must be info, warn, or error.");
      const record: LogRecord = { type: "LOG", caseId: caseId as CaseId, level, message, line };
      return { kind: "record", record };
    }
    case "END": {
      if (!hasFieldCount(fields, 5)) return malformed("END requires 4 fields after its name.");
      const caseId = fields[1]!;
      const status = fields[2]!;
      const durationText = fields[3]!;
      const detail = fields[4]!;
      if (!isToken(caseId)) return malformed("Case ID must be nonempty and contain no whitespace.");
      if (!isCaseStatus(status)) return malformed("END status must be pass, fail, or skip.");
      if (!/^\d+$/.test(durationText) || !Number.isSafeInteger(Number(durationText))) {
        return malformed("END duration must be a nonnegative safe integer in milliseconds.");
      }
      if (status === "fail" && detail.length === 0) {
        return malformed("END detail must be nonempty for fail status.");
      }
      if (status !== "fail" && detail.length > 0) {
        return malformed("END detail must be empty for pass and skip status.");
      }
      const endBase = {
        type: "END" as const,
        caseId: caseId as CaseId,
        durationMs: Number(durationText) as DurationMs,
        line,
      };
      const record: EndRecord =
        status === "fail"
          ? { ...endBase, status, detail: detail as NonEmptyString }
          : { ...endBase, status, detail: "" };
      return { kind: "record", record };
    }
    case "DONE": {
      if (!hasFieldCount(fields, 2)) return malformed("DONE requires 1 field after its name.");
      const finishedAt = fields[1]!;
      if (!isIsoInstant(finishedAt)) return malformed("DONE timestamp must be an ISO 8601 instant with a timezone.");
      const record: DoneRecord = { type: "DONE", finishedAt: finishedAt as IsoInstant, line };
      return { kind: "record", record };
    }
    default:
      return { kind: "unknown", name };
  }
}
