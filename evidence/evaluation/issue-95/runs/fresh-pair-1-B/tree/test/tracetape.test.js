import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTraceTape,
  parseTraceTape,
  summarizeRun,
} from "../dist/index.js";

const validTape = `
# a report can start with comments and whitespace
 RUN | run-7 | 2024-06-01T10:00:00Z
CASE | case-pass | suite | passing case
BEGIN | case-pass | 2024-06-01T10:00:00.010Z
LOG | case-pass | info |
END | case-pass | pass | 12 |
CASE|case-fail|suite|failing case
BEGIN|case-fail|2024-06-01T10:00:00.030Z
LOG|case-fail|error|assertion failed
END|case-fail|fail|4|expected true
CASE|case-skip|suite|skipped case
BEGIN|case-skip|2024-06-01T10:00:00.040Z
END|case-skip|skip|0|
DONE | 2024-06-01T10:00:02.500Z
`;

test("parses valid records, case views, line numbers, and summary", () => {
  const document = parseTraceTape(validTape);

  assert.equal(document.valid, true);
  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.run?.runId, "run-7");
  assert.equal(document.cases.length, 3);
  assert.deepEqual(
    document.records.map((record) => record.type),
    ["RUN", "CASE", "BEGIN", "LOG", "END", "CASE", "BEGIN", "LOG", "END", "CASE", "BEGIN", "END", "DONE"],
  );
  assert.equal(document.records[0]?.lineNumber, 3);
  assert.equal(document.cases[0]?.logs[0]?.message, "");
  assert.equal(document.cases[1]?.end?.detail, "expected true");
  assert.deepEqual(summarizeRun(document), {
    totalCases: 3,
    casesByStatus: { pass: 1, fail: 1, skip: 1 },
    elapsedRunTimeMs: 2500,
  });
});

test("collects mixed errors and keeps only accepted records", () => {
  const input = [
    "RUN|r|2024-01-01T00:00:00Z",
    "CASE|same|suite|first",
    "CASE|same|suite|duplicate",
    "LOG|unknown|info|hello",
    "CASE|broken||missing suite",
    "WHAT|ever",
    "BEGIN|same|2024-01-01T00:00:01Z",
    "DONE|2024-01-01T00:00:02Z",
  ].join("\n");
  const document = parseTraceTape(input);

  assert.equal(document.valid, false);
  assert.deepEqual(
    document.diagnostics.map(({ lineNumber, code }) => [lineNumber, code]),
    [
      [3, "DUPLICATE_CASE_ID"],
      [4, "UNKNOWN_CASE_REFERENCE"],
      [5, "MALFORMED_FIELDS"],
      [6, "UNKNOWN_RECORD"],
      [2, "INCOMPLETE_CASE"],
    ],
  );
  assert.deepEqual(
    document.records.map((record) => record.type),
    ["RUN", "CASE", "BEGIN", "DONE"],
  );
  assert.equal(document.cases[0]?.begin?.lineNumber, 7);
  assert.equal(document.cases[0]?.end, undefined);
});

test("reports invalid lifecycle transitions and records after DONE", () => {
  const input = [
    "RUN|r|2024-01-01T00:00:00Z",
    "CASE|c|suite|case",
    "LOG|c|info|too early",
    "BEGIN|c|2024-01-01T00:00:01Z",
    "BEGIN|c|2024-01-01T00:00:01Z",
    "END|c|pass|0|",
    "LOG|c|info|too late",
    "DONE|2024-01-01T00:00:02Z",
    "CASE|late|suite|record after done",
  ].join("\n");
  const document = parseTraceTape(input);

  assert.deepEqual(
    document.diagnostics.map(({ lineNumber, code }) => [lineNumber, code]),
    [
      [3, "INVALID_LIFECYCLE_ORDER"],
      [5, "INVALID_LIFECYCLE_ORDER"],
      [7, "INVALID_LIFECYCLE_ORDER"],
      [9, "INVALID_LIFECYCLE_ORDER"],
    ],
  );
  assert.deepEqual(
    document.records.map((record) => record.type),
    ["RUN", "CASE", "BEGIN", "END", "DONE"],
  );
});

test("formats a valid parse and preserves all record facts on reparse", () => {
  const original = parseTraceTape(validTape);
  const formatted = formatTraceTape(original);
  const reparsed = parseTraceTape(formatted);

  assert.equal(reparsed.valid, true);
  const facts = (document) =>
    document.records.map(({ lineNumber: _lineNumber, ...record }) => record);
  assert.deepEqual(facts(reparsed), facts(original));
  assert.equal(formatted.includes("LOG|case-pass|info|"), true);
  assert.equal(formatted.includes("END|case-pass|pass|12|"), true);
});

test("does not throw on malformed input and reports missing run structure", () => {
  const document = parseTraceTape("RUN|id|not-a-time\n");

  assert.equal(document.valid, false);
  assert.deepEqual(
    document.diagnostics.map(({ code }) => code),
    ["MALFORMED_FIELDS", "INCOMPLETE_RUN", "INCOMPLETE_RUN"],
  );
  assert.equal(document.records.length, 0);
});

test("accepts lowercase ISO timestamp separators", () => {
  const document = parseTraceTape(
    "RUN|r|2024-01-01t00:00:00z\nDONE|2024-01-01T00:00:01Z",
  );

  assert.equal(document.valid, true);
  assert.equal(document.run?.startedAt, "2024-01-01t00:00:00z");
  assert.equal(summarizeRun(document).elapsedRunTimeMs, 1000);
});
