import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ImmediateErrors from './immediate-errors.mjs';

test('retains case and collection failures independently of later console output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hapsland-reporter-'));
  const previous = process.env.HAPSLAND_TEST_FAILURES_FILE;
  process.env.HAPSLAND_TEST_FAILURES_FILE = join(directory, 'failures.jsonl');
  try {
    const reporter = new ImmediateErrors();
    reporter.onTestCaseResult({ module: { moduleId: 'case.ts' }, fullName: 'rejects stale work',
      result: () => ({ state: 'failed', errors: [{ message: 'mismatch', actual: 1, expected: 2 }] }) });
    reporter.onTestCaseResult({ module: { moduleId: 'case.ts' }, fullName: 'passing',
      result: () => ({ state: 'passed', errors: [] }) });
    reporter.onTestModuleEnd({ moduleId: 'broken.ts', errors: () => [{ message: 'import failed' }] });
    const errors = readFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(errors.length, 2);
    assert.deepEqual(errors.map(({ file, message }) => ({ file, message })), [
      { file: 'case.ts', message: 'mismatch' }, { file: 'broken.ts', message: 'import failed' },
    ]);
    assert.equal(errors[0].actual, '1');
    assert.equal(errors[0].expected, '2');
  } finally {
    if (previous === undefined) delete process.env.HAPSLAND_TEST_FAILURES_FILE;
    else process.env.HAPSLAND_TEST_FAILURES_FILE = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});


test('focused all-skipped structured results retain a failure; partial skips and full runs do not', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hapsland-reporter-selection-'));
  const priorFailures = process.env.HAPSLAND_TEST_FAILURES_FILE;
  const priorSelection = process.env.HAPSLAND_FOCUSED_TEST_SELECTION;
  process.env.HAPSLAND_TEST_FAILURES_FILE = join(directory, 'failures.jsonl');
  process.env.HAPSLAND_FOCUSED_TEST_SELECTION = JSON.stringify({ files: ['case.ts'], options: ['--testNamePattern=missing'] });
  const module = states => ({ children: { *allTests() { for (const state of states) yield { result: () => ({ state }) }; } } });
  try {
    const reporter = new ImmediateErrors();
    reporter.onTestRunEnd([module(['skipped', 'skipped'])]);
    const errors = readFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /zero tests \(2 skipped, 0 pending\)/);
    assert.match(errors[0].message, /testNamePattern=missing/);
    const summary = JSON.parse(readFileSync(join(directory, `focused-selection-${process.pid}.json`), 'utf8'));
    assert.equal(summary.executed, 0);
    reporter.onTestRunEnd([module(['passed', 'skipped'])]);
    assert.equal(readFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, 'utf8').trim().split('\n').length, 1);
    delete process.env.HAPSLAND_FOCUSED_TEST_SELECTION;
    reporter.onTestRunEnd([module(['skipped'])]);
    assert.equal(readFileSync(process.env.HAPSLAND_TEST_FAILURES_FILE, 'utf8').trim().split('\n').length, 1);
  } finally {
    if (priorFailures === undefined) delete process.env.HAPSLAND_TEST_FAILURES_FILE;
    else process.env.HAPSLAND_TEST_FAILURES_FILE = priorFailures;
    if (priorSelection === undefined) delete process.env.HAPSLAND_FOCUSED_TEST_SELECTION;
    else process.env.HAPSLAND_FOCUSED_TEST_SELECTION = priorSelection;
    rmSync(directory, { recursive: true, force: true });
  }
});
