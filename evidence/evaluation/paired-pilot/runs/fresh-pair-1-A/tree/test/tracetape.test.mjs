import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTraceTape,
  parseTraceTape,
  summarizeRun,
} from "../dist/index.js";

const validTape = `# sample run

RUN|nightly-7|2026-03-01T10:00:00Z
CASE|c1|auth|accepts login
BEGIN|c1|2026-03-01T10:00:01Z
LOG|c1|info|starting
END|c1|pass|25|
CASE|c2|auth|rejects bad password
BEGIN|c2|2026-03-01T10:00:02Z
LOG|c2|warn|
END|c2|fail|41|expected rejection
CASE|c3|setup|optional backend
BEGIN|c3|2026-03-01T10:00:03Z
END|c3|skip|0|
DONE|2026-03-01T10:00:05Z`;

test("parses valid records in order and builds a case-centered view", () => {
  const document = parseTraceTape(validTape);

  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.run?.runId, "nightly-7");
  assert.equal(document.done?.finishedAt, "2026-03-01T10:00:05Z");
  assert.deepEqual(document.records.map(({ type }) => type), [
    "RUN", "CASE", "BEGIN", "LOG", "END", "CASE", "BEGIN", "LOG", "END",
    "CASE", "BEGIN", "END", "DONE",
  ]);
  assert.equal(document.records[0]?.lineNumber, 3);
  assert.equal(document.cases.length, 3);
  assert.equal(document.cases[1]?.logs[0]?.message, "");
  assert.equal(document.cases[1]?.end?.detail, "expected rejection");
});

test("collects mixed errors and omits each rejected record", () => {
  const input = [
    "RUN|r1|2026-03-01T10:00:00Z",
    "CASE|x|suite|first",
    "CASE|x|suite|duplicate",
    "CASE|broken|suite|",
    "BOGUS|x",
    "BEGIN|missing|2026-03-01T10:00:01Z",
    "BEGIN|x|not-a-date",
    "DONE|2026-03-01T10:00:02Z",
  ].join("\n");
  const document = parseTraceTape(input);

  assert.deepEqual(
    document.diagnostics.map(({ code }) => code),
    [
      "DUPLICATE_ID",
      "MALFORMED_FIELDS",
      "UNKNOWN_RECORD",
      "UNKNOWN_CASE",
      "MALFORMED_FIELDS",
      "INCOMPLETE_CASE",
    ],
  );
  assert.deepEqual(document.records.map(({ type }) => type), ["RUN", "CASE", "DONE"]);
  assert.equal(document.cases.length, 1);
  assert.equal(document.diagnostics[0]?.lineNumber, 3);
  assert.equal(document.diagnostics.at(-1)?.lineNumber, 2);
});

test("reports lifecycle violations and records after DONE", () => {
  const input = [
    "RUN|r1|2026-03-01T10:00:00Z",
    "CASE|x|suite|name",
    "LOG|x|info|before begin",
    "BEGIN|x|2026-03-01T10:00:01Z",
    "BEGIN|x|2026-03-01T10:00:01Z",
    "END|x|pass|2|",
    "LOG|x|error|after end",
    "DONE|2026-03-01T10:00:02Z",
    "CASE|late|suite|late",
  ].join("\n");
  const document = parseTraceTape(input);

  assert.deepEqual(
    document.diagnostics.map(({ code }) => code),
    ["INVALID_LIFECYCLE", "INVALID_LIFECYCLE", "INVALID_LIFECYCLE", "INVALID_LIFECYCLE"],
  );
  assert.deepEqual(document.records.map(({ type }) => type), ["RUN", "CASE", "BEGIN", "END", "DONE"]);
  assert.equal(document.cases[0]?.logs.length, 0);
});

test("formats and reparses a valid document without changing facts", () => {
  const first = parseTraceTape(validTape);
  const formatted = formatTraceTape(first);
  const second = parseTraceTape(formatted);

  const facts = (document) => document.records.map(({ lineNumber: _line, ...record }) => record);
  assert.equal(second.diagnostics.length, 0);
  assert.deepEqual(facts(second), facts(first));
  assert.deepEqual(summarizeRun(second), {
    caseCount: 3,
    countsByStatus: { pass: 1, fail: 1, skip: 1 },
    elapsedMs: 5000,
  });
});

test("reports missing run and done without throwing", () => {
  const document = parseTraceTape("# nothing yet\n");
  assert.deepEqual(document.diagnostics.map(({ code }) => code), ["INCOMPLETE_RUN"]);
  assert.equal(document.diagnostics[0]?.lineNumber, 2);
  assert.throws(() => formatTraceTape(document), /diagnostics/);

  const openRun = parseTraceTape("RUN|r1|2026-03-01T10:00:00Z");
  assert.deepEqual(openRun.diagnostics.map(({ code }) => code), ["INCOMPLETE_RUN"]);
  assert.equal(openRun.diagnostics[0]?.lineNumber, 2);
});
