import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatTraceTape, parseTraceTape, summarizeRun } from "../dist/index.js";

const validTape = `# run report
RUN | run-1 | 2026-09-24T10:00:00-04:00

CASE|c1|math|adds
BEGIN|c1|2026-09-24T10:00:01-04:00
LOG|c1|info|
END|c1|pass|12|
CASE|c2|math|rejects bad input
BEGIN|c2|2026-09-24T10:00:02-04:00
LOG|c2|warn|input was empty
END|c2|fail|8|expected a value
CASE|c3|network|not configured
BEGIN|c3|2026-09-24T10:00:03-04:00
END|c3|skip|0|
DONE|2026-09-24T10:00:05-04:00`;

test("parses valid input into ordered records and a case-centered view", () => {
  const document = parseTraceTape(validTape);
  assert.deepEqual(document.diagnostics, []);
  assert.deepEqual(document.records.map((record) => record.type), [
    "RUN", "CASE", "BEGIN", "LOG", "END", "CASE", "BEGIN", "LOG", "END", "CASE", "BEGIN", "END", "DONE",
  ]);
  assert.equal(document.records[0].line, 2);
  assert.deepEqual(document.cases.map(({ caseId, status, logs }) => ({ caseId, status, logs: logs.length })), [
    { caseId: "c1", status: "pass", logs: 1 },
    { caseId: "c2", status: "fail", logs: 1 },
    { caseId: "c3", status: "skip", logs: 0 },
  ]);
  assert.deepEqual(summarizeRun(document), {
    totalCases: 3,
    byStatus: { pass: 1, fail: 1, skip: 1 },
    incompleteCases: 0,
    elapsedMs: 5000,
  });
});

test("recovers from mixed malformed, unknown, duplicate, and reference errors", () => {
  const document = parseTraceTape(`RUN|run-a|2026-01-01T00:00:00Z
CASE|c1|suite|
WHAT|x
CASE|c1|suite|first
CASE|c1|suite|duplicate
BEGIN|missing|2026-01-01T00:00:01Z
END|c1|mystery|4|
CASE|c2|suite|never started
DONE|2026-01-01T00:00:04Z`);

  assert.deepEqual(document.diagnostics.map(({ code }) => code), [
    "MALFORMED_FIELDS",
    "UNKNOWN_RECORD",
    "DUPLICATE_ID",
    "UNKNOWN_CASE_REFERENCE",
    "MALFORMED_FIELDS",
    "INCOMPLETE_CASE",
    "INCOMPLETE_CASE",
  ]);
  assert.deepEqual(document.diagnostics.map(({ line }) => line), [2, 3, 5, 6, 7, 4, 8]);
  assert.deepEqual(document.records.map((record) => record.type), ["RUN", "CASE", "CASE", "DONE"]);
  assert.deepEqual(document.cases.map(({ caseId }) => caseId), ["c1", "c2"]);
});

test("rejects lifecycle violations and diagnoses missing completion", () => {
  const document = parseTraceTape(`CASE|early|suite|before run
RUN|r|2026-01-01T00:00:00Z
LOG|later|info|before declaration
CASE|c|suite|does not start
LOG|c|info|before start
BEGIN|c|2026-01-01T00:00:01Z
BEGIN|c|2026-01-01T00:00:01Z
LOG|c|info|ok
END|c|pass|1|
LOG|c|error|after end
END|c|pass|2|
DONE|2026-01-01T00:00:04Z
CASE|late|suite|after done`);

  assert.deepEqual(document.diagnostics.map(({ code }) => code), [
    "INVALID_LIFECYCLE_ORDER",
    "UNKNOWN_CASE_REFERENCE",
    "INVALID_LIFECYCLE_ORDER",
    "INVALID_LIFECYCLE_ORDER",
    "INVALID_LIFECYCLE_ORDER",
    "INVALID_LIFECYCLE_ORDER",
    "INVALID_LIFECYCLE_ORDER",
  ]);
  assert.deepEqual(document.diagnostics.map(({ line }) => line), [1, 3, 5, 7, 10, 11, 13]);
  assert.deepEqual(document.records.map((record) => record.type), ["RUN", "CASE", "BEGIN", "LOG", "END", "DONE"]);

  const incomplete = parseTraceTape("RUN|r|2026-01-01T00:00:00Z\nCASE|c|suite|x\nBEGIN|c|2026-01-01T00:00:01Z");
  assert.deepEqual(incomplete.diagnostics.map(({ code }) => code), ["INCOMPLETE_RUN", "INCOMPLETE_CASE"]);
  assert.equal(summarizeRun(incomplete).incompleteCases, 1);
  assert.equal(summarizeRun(incomplete).elapsedMs, undefined);
});

test("formats and reparses without changing run, case, log, or end facts", () => {
  const first = parseTraceTape(validTape);
  const second = parseTraceTape(formatTraceTape(first));
  assert.deepEqual(second.diagnostics, []);
  assert.deepEqual(second.records.map(({ line: _line, ...record }) => record), first.records.map(({ line: _line, ...record }) => record));
  assert.deepEqual(second.cases.map(({ line: _line, beginLine: _begin, endLine: _end, logs, ...testCase }) => ({
    ...testCase,
    logs: logs.map(({ line: _logLine, ...log }) => log),
  })), first.cases.map(({ line: _line, beginLine: _begin, endLine: _end, logs, ...testCase }) => ({
    ...testCase,
    logs: logs.map(({ line: _logLine, ...log }) => log),
  })));
});

test("malformed arbitrary text returns diagnostics instead of throwing", () => {
  assert.doesNotThrow(() => parseTraceTape("|||\nRUN|x|not-a-date\nEND|oops"));
  assert.ok(parseTraceTape("|||\nRUN|x|not-a-date\nEND|oops").diagnostics.length >= 3);
});

test("the checked-in example is a valid run", () => {
  const example = readFileSync(new URL("../examples/basic.trace", import.meta.url), "utf8");
  const document = parseTraceTape(example);
  assert.deepEqual(document.diagnostics, []);
  assert.deepEqual(summarizeRun(document).byStatus, { pass: 1, fail: 0, skip: 0 });
});
