import {
  BeginRecord,
  CaseRecord,
  CaseStatus,
  DiagnosticCode,
  DoneRecord,
  EndRecord,
  LogLevel,
  LogRecord,
  RunRecord,
  TraceCase,
  TraceRecord,
  TraceTapeDiagnostic,
  TraceTapeDocument,
} from "./types";
import { isIsoInstant, isValidIdentifier, parseNonnegativeSafeInteger } from "./validation";

interface MutableCase {
  declaration: CaseRecord;
  begin: BeginRecord | null;
  logs: LogRecord[];
  end: EndRecord | null;
}

const CASE_STATUSES: readonly CaseStatus[] = ["pass", "fail", "skip"];
const LOG_LEVELS: readonly LogLevel[] = ["info", "warn", "error"];

/** Parse TraceTape text. Malformed rows produce diagnostics and are omitted. */
export function parseTraceTape(text: string): TraceTapeDocument {
  const lines = text.split(/\r\n|\n|\r/u);
  const records: TraceRecord[] = [];
  const diagnostics: TraceTapeDiagnostic[] = [];
  const caseMap = new Map<string, MutableCase>();
  let run: RunRecord | null = null;
  let done: DoneRecord | null = null;
  let recordNumber = 0;

  const addDiagnostic = (code: DiagnosticCode, lineNumber: number, message: string): void => {
    diagnostics.push({ code, lineNumber, message });
  };

  const malformed = (lineNumber: number, message: string): void => {
    addDiagnostic("malformed-fields", lineNumber, message);
  };

  const wrongFieldCount = (fields: string[], expected: number, lineNumber: number): boolean => {
    if (fields.length === expected) return false;
    malformed(lineNumber, `Expected ${expected} fields but found ${fields.length}.`);
    return true;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = lines[index];
    const trimmedLine = sourceLine.trim();
    if (trimmedLine.length === 0 || sourceLine.trimStart().startsWith("#")) continue;

    recordNumber += 1;
    const lineNumber = index + 1;
    const fields = sourceLine.split("|").map((field) => field.trim());
    const recordName = fields[0] ?? "";

    if (done !== null) {
      addDiagnostic(
        "invalid-lifecycle-order",
        lineNumber,
        "No records may follow DONE.",
      );
      continue;
    }

    const firstRowIsNotRun = recordNumber === 1 && recordName !== "RUN";
    if (firstRowIsNotRun) {
      addDiagnostic(
        "invalid-lifecycle-order",
        lineNumber,
        "RUN must be the first record.",
      );
    }

    switch (recordName) {
      case "RUN": {
        const misplaced = recordNumber !== 1 || run !== null;
        if (misplaced) {
          addDiagnostic(
            "invalid-lifecycle-order",
            lineNumber,
            "RUN must appear exactly once as the first record.",
          );
        }
        if (wrongFieldCount(fields, 3, lineNumber)) continue;
        const runId = fields[1];
        const startedAt = fields[2];
        if (!isValidIdentifier(runId)) {
          malformed(lineNumber, "Run ID must be nonempty and contain no whitespace.");
          continue;
        }
        if (!isIsoInstant(startedAt)) {
          malformed(lineNumber, "RUN timestamp must be an ISO 8601 instant with a timezone.");
          continue;
        }
        if (misplaced) continue;

        run = { type: "RUN", runId, startedAt, lineNumber };
        records.push(run);
        break;
      }

      case "CASE": {
        if (wrongFieldCount(fields, 4, lineNumber)) continue;
        const caseId = fields[1];
        const suite = fields[2];
        const name = fields[3];
        if (!isValidIdentifier(caseId)) {
          malformed(lineNumber, "Case ID must be nonempty and contain no whitespace.");
          continue;
        }
        if (suite.length === 0 || name.length === 0) {
          malformed(lineNumber, "CASE suite and name must be nonempty.");
          continue;
        }
        if (run === null) {
          if (!firstRowIsNotRun) {
            addDiagnostic("invalid-lifecycle-order", lineNumber, "CASE cannot appear before RUN.");
          }
          continue;
        }
        if (caseMap.has(caseId)) {
          addDiagnostic("duplicate-id", lineNumber, `Case ID '${caseId}' is already declared.`);
          continue;
        }

        const declaration: CaseRecord = { type: "CASE", caseId, suite, name, lineNumber };
        caseMap.set(caseId, { declaration, begin: null, logs: [], end: null });
        records.push(declaration);
        break;
      }

      case "BEGIN": {
        if (wrongFieldCount(fields, 3, lineNumber)) continue;
        const caseId = fields[1];
        const startedAt = fields[2];
        if (!isValidIdentifier(caseId)) {
          malformed(lineNumber, "Case ID must be nonempty and contain no whitespace.");
          continue;
        }
        if (!isIsoInstant(startedAt)) {
          malformed(lineNumber, "BEGIN timestamp must be an ISO 8601 instant with a timezone.");
          continue;
        }
        if (run === null) {
          if (!firstRowIsNotRun) {
            addDiagnostic("invalid-lifecycle-order", lineNumber, "BEGIN cannot appear before RUN.");
          }
          continue;
        }
        const testCase = caseMap.get(caseId);
        if (testCase === undefined) {
          addDiagnostic(
            "unknown-case-reference",
            lineNumber,
            `BEGIN refers to undeclared case '${caseId}'.`,
          );
          continue;
        }
        if (testCase.begin !== null || testCase.end !== null) {
          addDiagnostic(
            "invalid-lifecycle-order",
            lineNumber,
            `Case '${caseId}' may begin only once and before END.`,
          );
          continue;
        }

        const begin: BeginRecord = { type: "BEGIN", caseId, startedAt, lineNumber };
        testCase.begin = begin;
        records.push(begin);
        break;
      }

      case "LOG": {
        if (wrongFieldCount(fields, 4, lineNumber)) continue;
        const caseId = fields[1];
        const rawLevel = fields[2];
        const message = fields[3];
        if (!isValidIdentifier(caseId)) {
          malformed(lineNumber, "Case ID must be nonempty and contain no whitespace.");
          continue;
        }
        if (!LOG_LEVELS.includes(rawLevel as LogLevel)) {
          malformed(lineNumber, "LOG level must be info, warn, or error.");
          continue;
        }
        if (run === null) {
          if (!firstRowIsNotRun) {
            addDiagnostic("invalid-lifecycle-order", lineNumber, "LOG cannot appear before RUN.");
          }
          continue;
        }
        const testCase = caseMap.get(caseId);
        if (testCase === undefined) {
          addDiagnostic(
            "unknown-case-reference",
            lineNumber,
            `LOG refers to undeclared case '${caseId}'.`,
          );
          continue;
        }
        if (testCase.begin === null || testCase.end !== null) {
          addDiagnostic(
            "invalid-lifecycle-order",
            lineNumber,
            `LOG for case '${caseId}' must follow BEGIN and precede END.`,
          );
          continue;
        }

        const log: LogRecord = {
          type: "LOG",
          caseId,
          level: rawLevel as LogLevel,
          message,
          lineNumber,
        };
        testCase.logs.push(log);
        records.push(log);
        break;
      }

      case "END": {
        if (wrongFieldCount(fields, 5, lineNumber)) continue;
        const caseId = fields[1];
        const rawStatus = fields[2];
        const durationMs = parseNonnegativeSafeInteger(fields[3]);
        const detail = fields[4];
        if (!isValidIdentifier(caseId)) {
          malformed(lineNumber, "Case ID must be nonempty and contain no whitespace.");
          continue;
        }
        if (!CASE_STATUSES.includes(rawStatus as CaseStatus)) {
          malformed(lineNumber, "END status must be pass, fail, or skip.");
          continue;
        }
        if (durationMs === null) {
          malformed(lineNumber, "END duration must be a nonnegative safe integer.");
          continue;
        }
        const status = rawStatus as CaseStatus;
        if ((status === "fail" && detail.length === 0) || (status !== "fail" && detail.length > 0)) {
          malformed(lineNumber, "END detail must be nonempty for fail and empty for pass or skip.");
          continue;
        }
        if (run === null) {
          if (!firstRowIsNotRun) {
            addDiagnostic("invalid-lifecycle-order", lineNumber, "END cannot appear before RUN.");
          }
          continue;
        }
        const testCase = caseMap.get(caseId);
        if (testCase === undefined) {
          addDiagnostic(
            "unknown-case-reference",
            lineNumber,
            `END refers to undeclared case '${caseId}'.`,
          );
          continue;
        }
        if (testCase.begin === null || testCase.end !== null) {
          addDiagnostic(
            "invalid-lifecycle-order",
            lineNumber,
            `END for case '${caseId}' must follow BEGIN and may appear only once.`,
          );
          continue;
        }

        const end: EndRecord = { type: "END", caseId, status, durationMs, detail, lineNumber };
        testCase.end = end;
        records.push(end);
        break;
      }

      case "DONE": {
        const misplaced = run === null;
        if (misplaced && !firstRowIsNotRun) {
          addDiagnostic("invalid-lifecycle-order", lineNumber, "DONE cannot appear before RUN.");
        }
        if (wrongFieldCount(fields, 2, lineNumber)) continue;
        const finishedAt = fields[1];
        if (!isIsoInstant(finishedAt)) {
          malformed(lineNumber, "DONE timestamp must be an ISO 8601 instant with a timezone.");
          continue;
        }
        if (misplaced) continue;

        done = { type: "DONE", finishedAt, lineNumber };
        records.push(done);
        break;
      }

      default: {
        if (run === null && !firstRowIsNotRun) {
          addDiagnostic("invalid-lifecycle-order", lineNumber, "Records cannot appear before RUN.");
        }
        addDiagnostic("unknown-record", lineNumber, `Unknown record name '${recordName}'.`);
      }
    }
  }

  const eofLineNumber = Math.max(1, lines.length);
  if (run === null) {
    addDiagnostic("incomplete-run", eofLineNumber, "Run has no accepted RUN record.");
  }
  if (done === null) {
    addDiagnostic("incomplete-run", eofLineNumber, "Run has no accepted DONE record.");
  }

  const cases: TraceCase[] = [...caseMap.values()].map((testCase) => {
    if (testCase.begin === null) {
      addDiagnostic(
        "incomplete-case",
        testCase.declaration.lineNumber,
        `Case '${testCase.declaration.caseId}' has no accepted BEGIN record.`,
      );
    } else if (testCase.end === null) {
      addDiagnostic(
        "incomplete-case",
        testCase.begin.lineNumber,
        `Case '${testCase.declaration.caseId}' has no accepted END record.`,
      );
    }

    return {
      caseId: testCase.declaration.caseId,
      suite: testCase.declaration.suite,
      name: testCase.declaration.name,
      lineNumber: testCase.declaration.lineNumber,
      declaration: testCase.declaration,
      begin: testCase.begin,
      logs: testCase.logs,
      end: testCase.end,
    };
  });

  return {
    run,
    cases,
    done,
    records,
    diagnostics,
    isValid: diagnostics.length === 0,
  };
}
