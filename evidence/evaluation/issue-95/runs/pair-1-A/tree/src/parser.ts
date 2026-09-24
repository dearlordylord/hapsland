import type {
  BeginRecord,
  CaseRecord,
  EndRecord,
  LogRecord,
  TraceTapeCase,
  TraceTapeDiagnostic,
  TraceTapeDocument,
  TraceTapeRecord,
} from "./types.js";
import { parseRecord } from "./validation.js";

interface MutableCase {
  declaration: CaseRecord;
  begin?: BeginRecord;
  logs: LogRecord[];
  end?: EndRecord;
}

export function parseTraceTape(text: string): TraceTapeDocument {
  const records: TraceTapeRecord[] = [];
  const cases: MutableCase[] = [];
  const casesById = new Map<string, MutableCase>();
  const diagnostics: TraceTapeDiagnostic[] = [];
  let run: Extract<TraceTapeRecord, { type: "RUN" }> | undefined;
  let done: Extract<TraceTapeRecord, { type: "DONE" }> | undefined;

  const addDiagnostic = (code: TraceTapeDiagnostic["code"], line: number, message: string): void => {
    diagnostics.push({ code, line, message });
  };

  const lines = text.split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const sourceLine = lines[index]!;
    const trimmedLine = sourceLine.trim();
    if (trimmedLine.length === 0 || sourceLine.trimStart().startsWith("#")) continue;

    if (done) {
      addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, "No record may follow DONE.");
      continue;
    }

    const parsed = parseRecord(sourceLine.split("|").map((field) => field.trim()), lineNumber);
    if (parsed.kind === "malformed") {
      addDiagnostic("MALFORMED_FIELDS", lineNumber, parsed.message);
      continue;
    }
    if (parsed.kind === "unknown") {
      addDiagnostic("UNKNOWN_RECORD", lineNumber, `Unknown record name '${parsed.name}'.`);
      continue;
    }

    const record = parsed.record;
    if (!run && record.type !== "RUN") {
      addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `${record.type} cannot appear before RUN.`);
      continue;
    }

    if (record.type === "RUN") {
      if (run) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, "A run may contain exactly one RUN record, first.");
        continue;
      }
      run = record;
      records.push(record);
      continue;
    }

    if (record.type === "CASE") {
      if (casesById.has(record.caseId)) {
        addDiagnostic("DUPLICATE_ID", lineNumber, `Case ID '${record.caseId}' is already declared.`);
        continue;
      }
      const testCase: MutableCase = {
        declaration: record,
        logs: [],
      };
      cases.push(testCase);
      casesById.set(testCase.declaration.caseId, testCase);
      records.push(record);
      continue;
    }

    if (record.type === "DONE") {
      done = record;
      records.push(record);
      continue;
    }

    const testCase = casesById.get(record.caseId);
    if (!testCase) {
      addDiagnostic("UNKNOWN_CASE_REFERENCE", lineNumber, `${record.type} references undeclared case '${record.caseId}'.`);
      continue;
    }

    if (record.type === "BEGIN") {
      if (testCase.begin !== undefined || testCase.end !== undefined) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `Case '${record.caseId}' may start only once.`);
        continue;
      }
      testCase.begin = record;
      records.push(record);
      continue;
    }

    if (record.type === "LOG") {
      if (testCase.begin === undefined) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `Case '${record.caseId}' must start before it can log.`);
        continue;
      }
      if (testCase.end !== undefined) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `Case '${record.caseId}' cannot log after END.`);
        continue;
      }
      testCase.logs.push(record);
      records.push(record);
      continue;
    }

    if (record.type === "END") {
      if (testCase.begin === undefined) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `Case '${record.caseId}' must start before it can end.`);
        continue;
      }
      if (testCase.end !== undefined) {
        addDiagnostic("INVALID_LIFECYCLE_ORDER", lineNumber, `Case '${record.caseId}' may end only once.`);
        continue;
      }
      testCase.end = record;
      records.push(record);
    }
  }

  const eofLine = Math.max(1, lines.length);
  if (!run) {
    addDiagnostic("INCOMPLETE_RUN", eofLine, "Run has no valid RUN record.");
  } else if (!done) {
    addDiagnostic("INCOMPLETE_RUN", run.line, "Run is missing its closing DONE record.");
  }

  for (const testCase of cases) {
    if (testCase.begin === undefined) {
      addDiagnostic(
        "INCOMPLETE_CASE",
        testCase.declaration.line,
        `Case '${testCase.declaration.caseId}' was declared but never started.`,
      );
    } else if (testCase.end === undefined) {
      addDiagnostic(
        "INCOMPLETE_CASE",
        testCase.begin.line,
        `Case '${testCase.declaration.caseId}' started but never ended.`,
      );
    }
  }

  const caseViews: TraceTapeCase[] = cases.map((testCase) => {
    const base = {
      caseId: testCase.declaration.caseId,
      suite: testCase.declaration.suite,
      name: testCase.declaration.name,
      line: testCase.declaration.line,
      logs: [...testCase.logs],
    };
    if (!testCase.begin) return { ...base, state: "declared" };
    if (!testCase.end) {
      return {
        ...base,
        state: "started",
        startedAt: testCase.begin.startedAt,
        beginLine: testCase.begin.line,
      };
    }

    const endFacts = testCase.end;
    if (endFacts.status === "fail") {
      return {
        ...base,
        state: "ended",
        startedAt: testCase.begin.startedAt,
        beginLine: testCase.begin.line,
        endLine: endFacts.line,
        status: endFacts.status,
        durationMs: endFacts.durationMs,
        detail: endFacts.detail,
      };
    }
    return {
      ...base,
      state: "ended",
      startedAt: testCase.begin.startedAt,
      beginLine: testCase.begin.line,
      endLine: endFacts.line,
      status: endFacts.status,
      durationMs: endFacts.durationMs,
      detail: "",
    };
  });

  return {
    records,
    cases: caseViews,
    diagnostics,
  };
}
