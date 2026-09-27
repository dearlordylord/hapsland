const assert = require("node:assert/strict");
const { test } = require("node:test");
const { formatTraceTape, parseTraceTape, summarizeRun } = require("../dist/src");

function facts(document) {
  const withoutLineNumbers = ({ lineNumber, ...record }) => record;
  return {
    records: document.records.map(withoutLineNumbers),
    cases: document.cases.map((testCase) => ({
      caseId: testCase.caseId,
      suite: testCase.suite,
      name: testCase.name,
      begin: testCase.begin && withoutLineNumbers(testCase.begin),
      logs: testCase.logs.map(withoutLineNumbers),
      end: testCase.end && withoutLineNumbers(testCase.end),
    })),
  };
}

test("parses a valid run, keeps source lines, and builds a case-centered view", () => {
  const document = parseTraceTape(`# header

RUN| run-1 |2026-04-11T10:00:00Z
CASE|c1|math|adds
CASE|c2|math|skips
BEGIN|c1|2026-04-11T10:00:00.010Z
LOG|c1|info| started 
END|c1|pass|12|
BEGIN|c2|2026-04-11T10:00:00.020Z
END|c2|skip|0|
DONE|2026-04-11T10:00:01.250Z`);

  assert.equal(document.isValid, true);
  assert.deepEqual(document.diagnostics, []);
  assert.equal(document.run.runId, "run-1");
  assert.deepEqual(document.records.map((record) => record.type), [
    "RUN", "CASE", "CASE", "BEGIN", "LOG", "END", "BEGIN", "END", "DONE",
  ]);
  assert.equal(document.records[0].lineNumber, 3);
  assert.equal(document.cases[0].logs[0].message, "started");
  assert.equal(document.cases[1].end.status, "skip");
  assert.deepEqual(summarizeRun(document), {
    byStatus: { pass: 1, fail: 0, skip: 1 },
    totalCases: 2,
    elapsedMilliseconds: 1250,
  });
});

test("collects mixed errors and keeps only accepted records", () => {
  const document = parseTraceTape(`RUN|r|2026-04-11T10:00:00Z
CASE|same|suite|first
CASE|same|suite|duplicate
BEGIN|missing|2026-04-11T10:00:00Z
LOG|missing|info|orphan
BEGIN|same|2026-04-11T10:00:00Z
LOG|same|debug|bad level
END|same|fail|nope|failure
WAT|something
DONE|2026-04-11T10:00:01Z`);

  assert.equal(document.isValid, false);
  const codes = document.diagnostics.map((diagnostic) => diagnostic.code);
  for (const expected of [
    "duplicate-id",
    "unknown-case-reference",
    "malformed-fields",
    "unknown-record",
    "incomplete-case",
  ]) {
    assert.ok(codes.includes(expected), `expected diagnostic ${expected}`);
  }
  assert.deepEqual(document.records.map((record) => record.type), [
    "RUN", "CASE", "BEGIN", "DONE",
  ]);
  assert.ok(document.diagnostics.every((diagnostic) => diagnostic.lineNumber >= 1));
  assert.throws(() => formatTraceTape(document), /invalid TraceTape document/u);
});

test("diagnoses lifecycle violations and records after DONE", () => {
  const document = parseTraceTape(`RUN|r|2026-04-11T10:00:00Z
CASE|c|suite|name
BEGIN|c|2026-04-11T10:00:00Z
END|c|pass|1|
LOG|c|info|too late for this case
BEGIN|c|2026-04-11T10:00:00Z
DONE|2026-04-11T10:00:01Z
CASE|after|suite|done`);

  assert.equal(document.isValid, false);
  assert.equal(
    document.diagnostics.filter((diagnostic) => diagnostic.code === "invalid-lifecycle-order").length,
    3,
  );
  assert.deepEqual(document.records.map((record) => record.type), [
    "RUN", "CASE", "BEGIN", "END", "DONE",
  ]);
});

test("reports missing run boundaries and rejects a non-RUN first record", () => {
  const empty = parseTraceTape("");
  assert.deepEqual(
    empty.diagnostics.map((diagnostic) => diagnostic.code),
    ["incomplete-run", "incomplete-run"],
  );
  assert.ok(empty.diagnostics.every((diagnostic) => diagnostic.lineNumber === 1));

  const misplaced = parseTraceTape(
    "CASE|c|suite|name\nRUN|r|2026-04-11T10:00:00Z\nDONE|2026-04-11T10:00:01Z",
  );
  assert.equal(misplaced.run, null);
  assert.ok(misplaced.diagnostics.some((diagnostic) => diagnostic.code === "invalid-lifecycle-order"));
  assert.ok(misplaced.diagnostics.some((diagnostic) => diagnostic.code === "incomplete-run"));
});

test("format then parse preserves all accepted run and case facts", () => {
  const source = `# preserve facts, not comments
RUN|run-roundtrip|2026-04-11T10:00:00-04:00
CASE|pass-case|suite|success
CASE|fail-case|suite|failure
CASE|skip-case|suite|skip
BEGIN|pass-case|2026-04-11T10:00:00.010-04:00
LOG|pass-case|info|
END|pass-case|pass|7|
BEGIN|fail-case|2026-04-11T10:00:00.020-04:00
LOG|fail-case|error|bad result
END|fail-case|fail|21|assertion failed
BEGIN|skip-case|2026-04-11T10:00:00.030-04:00
END|skip-case|skip|0|
DONE|2026-04-11T10:00:01-04:00`;
  const first = parseTraceTape(source);
  const formatted = formatTraceTape(first);
  const second = parseTraceTape(formatted);

  assert.equal(first.isValid, true);
  assert.equal(second.isValid, true);
  assert.deepEqual(facts(second), facts(first));
  assert.equal(formatTraceTape(second), formatted);
});

test("round trips a deterministic range of valid generated documents", () => {
  for (let index = 0; index < 32; index += 1) {
    const id = `case-${index}`;
    const status = ["pass", "fail", "skip"][index % 3];
    const detail = status === "fail" ? `failure ${index}` : "";
    const message = index % 2 === 0 ? "" : `message ${index}`;
    const source = [
      `RUN|run-${index}|2026-04-11T10:00:00Z`,
      `CASE|${id}|suite-${index % 4}|test ${index}`,
      `BEGIN|${id}|2026-04-11T10:00:00.100Z`,
      `LOG|${id}|info|${message}`,
      `END|${id}|${status}|${index}|${detail}`,
      `DONE|2026-04-11T10:00:01Z`,
    ].join("\n");
    const first = parseTraceTape(source);
    const second = parseTraceTape(formatTraceTape(first));

    assert.equal(first.isValid, true, `generated document ${index} should be valid`);
    assert.equal(second.isValid, true, `round trip ${index} should remain valid`);
    assert.deepEqual(facts(second), facts(first));
  }
});
