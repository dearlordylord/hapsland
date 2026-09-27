import { diagnostic } from "./diagnostics.js";
import { isIsoInstant } from "./instant.js";
import type {
  BeginRecord,
  CaseDeclarationRecord,
  CaseStatus,
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

interface MutableCase {
  view: TraceTapeCase;
  began: boolean;
  ended: boolean;
}

const LOG_LEVELS = new Set<LogLevel>(["info", "warn", "error"]);
const CASE_STATUSES = new Set<CaseStatus>(["pass", "fail", "skip"]);
const RECORD_NAMES = new Set(["RUN", "CASE", "BEGIN", "LOG", "END", "DONE"]);

/** Parse TraceTape text without throwing; rejected records are reported and omitted. */
export function parseTraceTape(text: string): TraceTapeDocument {
  const lines = text.split(/\r\n|\n|\r/);
  const records: TraceTapeRecord[] = [];
  const cases = new Map<string, MutableCase>();
  const diagnostics: TraceTapeDiagnostic[] = [];
  let run: RunRecord | undefined;
  let done: DoneRecord | undefined;
  let sawContentLine = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index] ?? "";
    const trimmedLine = rawLine.trim();
    if (trimmedLine.length === 0 || /^\s*#/.test(rawLine)) continue;

    const isFirstContentLine = !sawContentLine;
    sawContentLine = true;
    const fields = rawLine.split("|").map((field) => field.trim());
    const kind = fields[0] ?? "";

    if (done !== undefined) {
      if (!RECORD_NAMES.has(kind)) {
        diagnostics.push(diagnostic(lineNumber, "UNKNOWN_RECORD", `Unknown record name ${JSON.stringify(kind)}.`));
      }
      diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "No records may follow DONE."));
      continue;
    }

    if (kind.length === 0) {
      diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "A record name is required."));
      continue;
    }

    if (kind === "RUN") {
      if (!hasFieldCount(fields, 3)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "RUN requires exactly 3 fields."));
        continue;
      }
      const runId = fields[1] ?? "";
      const startedAt = fields[2] ?? "";
      if (!runId || /\s/.test(runId) || !isIsoInstant(startedAt)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "RUN needs a nonempty run ID without whitespace and a timezone-qualified ISO instant."));
        continue;
      }
      if (run !== undefined) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "A run may contain only one RUN record."));
        continue;
      }
      if (!isFirstContentLine) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "RUN must be the first non-comment record."));
        continue;
      }
      run = { type: "RUN", runId, startedAt, lineNumber };
      records.push(run);
      continue;
    }

    if (kind === "CASE") {
      if (!hasFieldCount(fields, 4)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "CASE requires exactly 4 fields."));
        continue;
      }
      const caseId = fields[1] ?? "";
      const suite = fields[2] ?? "";
      const name = fields[3] ?? "";
      if (!caseId || !suite || !name) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "CASE needs a nonempty ID, suite, and name."));
        continue;
      }
      if (!run || done) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "CASE must appear after RUN and before DONE."));
        continue;
      }
      if (cases.has(caseId)) {
        diagnostics.push(diagnostic(lineNumber, "DUPLICATE_ID", `Case ID ${JSON.stringify(caseId)} is already declared.`));
        continue;
      }
      const record: CaseDeclarationRecord = { type: "CASE", caseId, suite, name, lineNumber };
      records.push(record);
      cases.set(caseId, {
        view: { caseId, suite, name, declarationLine: lineNumber, logs: [] },
        began: false,
        ended: false,
      });
      continue;
    }

    if (kind === "BEGIN") {
      if (!hasFieldCount(fields, 3)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "BEGIN requires exactly 3 fields."));
        continue;
      }
      const caseId = fields[1] ?? "";
      const startedAt = fields[2] ?? "";
      if (!caseId || !isIsoInstant(startedAt)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "BEGIN needs a nonempty case ID and a timezone-qualified ISO instant."));
        continue;
      }
      if (!run || done) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "BEGIN must appear after RUN and before DONE."));
        continue;
      }
      const testCase = cases.get(caseId);
      if (!testCase) {
        diagnostics.push(diagnostic(lineNumber, "UNKNOWN_CASE", `BEGIN refers to undeclared case ${JSON.stringify(caseId)}.`));
        continue;
      }
      if (testCase.began || testCase.ended) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", `Case ${JSON.stringify(caseId)} may begin only once.`));
        continue;
      }
      const record: BeginRecord = { type: "BEGIN", caseId, startedAt, lineNumber };
      testCase.began = true;
      testCase.view.begin = record;
      records.push(record);
      continue;
    }

    if (kind === "LOG") {
      if (!hasFieldCount(fields, 4)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "LOG requires exactly 4 fields."));
        continue;
      }
      const caseId = fields[1] ?? "";
      const level = fields[2] ?? "";
      const message = fields[3] ?? "";
      if (!caseId || !LOG_LEVELS.has(level as LogLevel)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "LOG needs a nonempty case ID and level info, warn, or error."));
        continue;
      }
      if (!run || done) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "LOG must appear after RUN and before DONE."));
        continue;
      }
      const testCase = cases.get(caseId);
      if (!testCase) {
        diagnostics.push(diagnostic(lineNumber, "UNKNOWN_CASE", `LOG refers to undeclared case ${JSON.stringify(caseId)}.`));
        continue;
      }
      if (!testCase.began || testCase.ended) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", `LOG for case ${JSON.stringify(caseId)} requires a begun, unfinished case.`));
        continue;
      }
      const record: LogRecord = { type: "LOG", caseId, level: level as LogLevel, message, lineNumber };
      testCase.view.logs.push(record);
      records.push(record);
      continue;
    }

    if (kind === "END") {
      if (!hasFieldCount(fields, 5)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "END requires exactly 5 fields."));
        continue;
      }
      const caseId = fields[1] ?? "";
      const status = fields[2] ?? "";
      const durationText = fields[3] ?? "";
      const detail = fields[4] ?? "";
      const durationMs = Number(durationText);
      const detailValid = status === "fail" ? detail.length > 0 : detail.length === 0;
      if (
        !caseId ||
        !CASE_STATUSES.has(status as CaseStatus) ||
        !/^\d+$/.test(durationText) ||
        !Number.isSafeInteger(durationMs) ||
        !detailValid
      ) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "END needs a valid case ID, status, safe nonnegative integer duration, and status-appropriate detail."));
        continue;
      }
      if (!run || done) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "END must appear after RUN and before DONE."));
        continue;
      }
      const testCase = cases.get(caseId);
      if (!testCase) {
        diagnostics.push(diagnostic(lineNumber, "UNKNOWN_CASE", `END refers to undeclared case ${JSON.stringify(caseId)}.`));
        continue;
      }
      if (!testCase.began || testCase.ended) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", `END for case ${JSON.stringify(caseId)} requires a begun, unfinished case.`));
        continue;
      }
      const record: EndRecord = {
        type: "END",
        caseId,
        status: status as CaseStatus,
        durationMs,
        detail,
        lineNumber,
      };
      testCase.ended = true;
      testCase.view.end = record;
      records.push(record);
      continue;
    }

    if (kind === "DONE") {
      if (!hasFieldCount(fields, 2)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "DONE requires exactly 2 fields."));
        continue;
      }
      const finishedAt = fields[1] ?? "";
      if (!isIsoInstant(finishedAt)) {
        diagnostics.push(diagnostic(lineNumber, "MALFORMED_FIELDS", "DONE needs a timezone-qualified ISO instant."));
        continue;
      }
      if (!run) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "DONE must appear after RUN."));
        continue;
      }
      if (done) {
        diagnostics.push(diagnostic(lineNumber, "INVALID_LIFECYCLE", "DONE may appear only once and must be last."));
        continue;
      }
      const record: DoneRecord = { type: "DONE", finishedAt, lineNumber };
      done = record;
      records.push(record);
      continue;
    }

    diagnostics.push(diagnostic(lineNumber, "UNKNOWN_RECORD", `Unknown record name ${JSON.stringify(kind)}.`));
  }

  const eofLine = lines.length + (lines[lines.length - 1] === "" ? 0 : 1);
  if (!run) {
    diagnostics.push(diagnostic(eofLine, "INCOMPLETE_RUN", "No valid RUN record was found."));
  }
  if (run && !done) {
    diagnostics.push(diagnostic(eofLine, "INCOMPLETE_RUN", "Run has no valid DONE record."));
  }

  for (const testCase of cases.values()) {
    if (!testCase.began) {
      diagnostics.push(diagnostic(testCase.view.declarationLine, "INCOMPLETE_CASE", `Case ${JSON.stringify(testCase.view.caseId)} was declared but never began.`));
    } else if (!testCase.ended) {
      const beginLine = testCase.view.begin?.lineNumber ?? testCase.view.declarationLine;
      diagnostics.push(diagnostic(beginLine, "INCOMPLETE_CASE", `Case ${JSON.stringify(testCase.view.caseId)} began but has no END record.`));
    }
  }

  const document: TraceTapeDocument = {
    records,
    cases: [...cases.values()].map(({ view }) => view),
    diagnostics,
  };
  if (run !== undefined) document.run = run;
  if (done !== undefined) document.done = done;
  return document;
}

function hasFieldCount(fields: string[], expected: number): boolean {
  return fields.length === expected;
}
