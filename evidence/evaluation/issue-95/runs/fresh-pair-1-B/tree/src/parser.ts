import { isValidTimestamp } from "./timestamps.js";
import type {
  BeginRecord,
  CaseRecord,
  CaseStatus,
  DiagnosticCode,
  DoneRecord,
  EndRecord,
  LogLevel,
  LogRecord,
  RunRecord,
  TraceTapeCase,
  TraceTapeDiagnostic,
  TraceTapeDocument,
  TraceTapeRecord,
} from "./types.js";

type ParsedLine =
  | RunRecord
  | CaseRecord
  | BeginRecord
  | LogRecord
  | EndRecord
  | DoneRecord;

/** Parse TraceTape text without throwing; rejected lines are reported as diagnostics. */
export function parseTraceTape(text: string): TraceTapeDocument {
  const records: TraceTapeRecord[] = [];
  const diagnostics: TraceTapeDiagnostic[] = [];
  const casesById = new Map<string, TraceTapeCase>();
  let run: RunRecord | undefined;
  let done: DoneRecord | undefined;
  let firstRecordLine: number | undefined;

  const lines = text.split(/\r\n|\n|\r/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index] ?? "";
    const trimmedLine = rawLine.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) continue;
    if (firstRecordLine === undefined) firstRecordLine = lineNumber;

    if (done !== undefined) {
      addDiagnostic(
        diagnostics,
        lineNumber,
        "INVALID_LIFECYCLE_ORDER",
        "No record may follow DONE.",
      );
      continue;
    }

    const fields = rawLine.split("|").map((field) => field.trim());
    const parsed = parseLine(fields, lineNumber, diagnostics);
    if (parsed === undefined) continue;

    if (parsed.type === "RUN") {
      if (run !== undefined) {
        addDiagnostic(
          diagnostics,
          lineNumber,
          "INVALID_LIFECYCLE_ORDER",
          "A run may contain exactly one RUN record.",
        );
        continue;
      }
      if (lineNumber !== firstRecordLine) {
        addDiagnostic(
          diagnostics,
          lineNumber,
          "INVALID_LIFECYCLE_ORDER",
          "RUN must be the first nonblank, noncomment record.",
        );
        continue;
      }
      run = parsed;
      records.push(parsed);
      continue;
    }

    if (run === undefined) {
      addDiagnostic(
        diagnostics,
        lineNumber,
        "INVALID_LIFECYCLE_ORDER",
        `${parsed.type} cannot appear before RUN.`,
      );
      continue;
    }

    if (parsed.type === "DONE") {
      done = parsed;
      records.push(parsed);
      continue;
    }

    if (parsed.type === "CASE") {
      if (casesById.has(parsed.caseId)) {
        addDiagnostic(
          diagnostics,
          lineNumber,
          "DUPLICATE_CASE_ID",
          `Case ID "${parsed.caseId}" has already been declared.`,
        );
        continue;
      }
      const caseView: TraceTapeCase = { declaration: parsed, logs: [] };
      casesById.set(parsed.caseId, caseView);
      records.push(parsed);
      continue;
    }

    const caseView = casesById.get(parsed.caseId);
    if (caseView === undefined) {
      addDiagnostic(
        diagnostics,
        lineNumber,
        "UNKNOWN_CASE_REFERENCE",
        `${parsed.type} refers to undeclared case ID "${parsed.caseId}".`,
      );
      continue;
    }

    if (parsed.type === "BEGIN") {
      if (caseView.begin !== undefined || caseView.end !== undefined) {
        addDiagnostic(
          diagnostics,
          lineNumber,
          "INVALID_LIFECYCLE_ORDER",
          `Case "${parsed.caseId}" may begin only once and before END.`,
        );
        continue;
      }
      caseView.begin = parsed;
      records.push(parsed);
      continue;
    }

    if (parsed.type === "LOG") {
      if (caseView.begin === undefined || caseView.end !== undefined) {
        addDiagnostic(
          diagnostics,
          lineNumber,
          "INVALID_LIFECYCLE_ORDER",
          `LOG for case "${parsed.caseId}" requires a started, unfinished case.`,
        );
        continue;
      }
      caseView.logs.push(parsed);
      records.push(parsed);
      continue;
    }

    if (caseView.begin === undefined) {
      addDiagnostic(
        diagnostics,
        lineNumber,
        "INVALID_LIFECYCLE_ORDER",
        `END for case "${parsed.caseId}" requires a prior BEGIN.`,
      );
      continue;
    }
    if (caseView.end !== undefined) {
      addDiagnostic(
        diagnostics,
        lineNumber,
        "INVALID_LIFECYCLE_ORDER",
        `Case "${parsed.caseId}" has already ended.`,
      );
      continue;
    }
    caseView.end = parsed;
    records.push(parsed);
  }

  const endOfInputLine = Math.max(1, lines.length);
  if (run === undefined) {
    addDiagnostic(
      diagnostics,
      endOfInputLine,
      "INCOMPLETE_RUN",
      "The document has no accepted RUN record.",
    );
  }
  if (done === undefined) {
    addDiagnostic(
      diagnostics,
      endOfInputLine,
      "INCOMPLETE_RUN",
      "The document has no accepted DONE record.",
    );
  }
  for (const caseView of casesById.values()) {
    if (caseView.begin === undefined || caseView.end === undefined) {
      const missing: string[] = [];
      if (caseView.begin === undefined) missing.push("BEGIN");
      if (caseView.end === undefined) missing.push("END");
      addDiagnostic(
        diagnostics,
        caseView.declaration.lineNumber,
        "INCOMPLETE_CASE",
        `Case "${caseView.declaration.caseId}" is missing ${missing.join(" and ")}.`,
      );
    }
  }

  return {
    records,
    ...(run === undefined ? {} : { run }),
    cases: [...casesById.values()],
    ...(done === undefined ? {} : { done }),
    diagnostics,
    valid: diagnostics.length === 0,
  };
}

function parseLine(
  fields: string[],
  lineNumber: number,
  diagnostics: TraceTapeDiagnostic[],
): ParsedLine | undefined {
  const type = fields[0] ?? "";
  const malformed = (message: string): undefined => {
    addDiagnostic(diagnostics, lineNumber, "MALFORMED_FIELDS", message);
    return undefined;
  };

  switch (type) {
    case "RUN": {
      if (fields.length !== 3) return malformed("RUN requires exactly 3 fields.");
      const runId = fields[1] ?? "";
      const startedAt = fields[2] ?? "";
      if (runId === "" || /\s/.test(runId)) {
        return malformed("RUN ID must be nonempty and contain no whitespace.");
      }
      if (!isValidTimestamp(startedAt)) {
        return malformed("RUN timestamp must be an ISO 8601 instant with a timezone.");
      }
      return { type, lineNumber, runId, startedAt };
    }
    case "CASE": {
      if (fields.length !== 4) return malformed("CASE requires exactly 4 fields.");
      const caseId = fields[1] ?? "";
      const suite = fields[2] ?? "";
      const name = fields[3] ?? "";
      if (caseId === "") return malformed("CASE ID must be nonempty.");
      if (suite === "" || name === "") {
        return malformed("CASE suite and name must be nonempty.");
      }
      return { type, lineNumber, caseId, suite, name };
    }
    case "BEGIN": {
      if (fields.length !== 3) return malformed("BEGIN requires exactly 3 fields.");
      const caseId = fields[1] ?? "";
      const startedAt = fields[2] ?? "";
      if (caseId === "") return malformed("BEGIN case ID must be nonempty.");
      if (!isValidTimestamp(startedAt)) {
        return malformed("BEGIN timestamp must be an ISO 8601 instant with a timezone.");
      }
      return { type, lineNumber, caseId, startedAt };
    }
    case "LOG": {
      if (fields.length !== 4) return malformed("LOG requires exactly 4 fields.");
      const caseId = fields[1] ?? "";
      const level = fields[2] ?? "";
      const message = fields[3] ?? "";
      if (caseId === "") return malformed("LOG case ID must be nonempty.");
      if (!isLogLevel(level)) return malformed("LOG level must be info, warn, or error.");
      return { type, lineNumber, caseId, level, message };
    }
    case "END": {
      if (fields.length !== 5) return malformed("END requires exactly 5 fields.");
      const caseId = fields[1] ?? "";
      const status = fields[2] ?? "";
      const duration = fields[3] ?? "";
      const detail = fields[4] ?? "";
      if (caseId === "") return malformed("END case ID must be nonempty.");
      if (!isCaseStatus(status)) return malformed("END status must be pass, fail, or skip.");
      if (!/^\d+$/.test(duration)) {
        return malformed("END duration-ms must be a nonnegative integer.");
      }
      const durationMs = Number(duration);
      if (!Number.isSafeInteger(durationMs)) {
        return malformed("END duration-ms must be a safe integer.");
      }
      if (status === "fail" && detail === "") {
        return malformed("END detail must be nonempty when status is fail.");
      }
      if (status !== "fail" && detail !== "") {
        return malformed("END detail must be empty when status is pass or skip.");
      }
      return { type, lineNumber, caseId, status, durationMs, detail };
    }
    case "DONE": {
      if (fields.length !== 2) return malformed("DONE requires exactly 2 fields.");
      const finishedAt = fields[1] ?? "";
      if (!isValidTimestamp(finishedAt)) {
        return malformed("DONE timestamp must be an ISO 8601 instant with a timezone.");
      }
      return { type, lineNumber, finishedAt };
    }
    case "":
      return malformed("Record name must be nonempty.");
    default:
      addDiagnostic(
        diagnostics,
        lineNumber,
        "UNKNOWN_RECORD",
        `Unknown record name "${type}".`,
      );
      return undefined;
  }
}

function isLogLevel(value: string): value is LogLevel {
  return value === "info" || value === "warn" || value === "error";
}

function isCaseStatus(value: string): value is CaseStatus {
  return value === "pass" || value === "fail" || value === "skip";
}

function addDiagnostic(
  diagnostics: TraceTapeDiagnostic[],
  lineNumber: number,
  code: DiagnosticCode,
  message: string,
): void {
  diagnostics.push({ lineNumber, code, message });
}
