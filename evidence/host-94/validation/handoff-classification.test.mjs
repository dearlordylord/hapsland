import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyHookResult } from './handoff-classification.mjs';

const neither = { findingSubmitted: false, noticeSubmitted: false, blockFindingSubmitted: false };
const hook = additionalContext => JSON.stringify({ hookSpecificOutput: {
  hookEventName: 'PostToolUse', additionalContext,
} });
const finding = 'fixture.ts :: SyntheticDeclaration [r6_bare_domain_value, p=0.90]: synthetic finding';
const unavailable = 'Operational notice: Jev was unavailable; some eligible edits were not reviewed.';

test('clear and generic nonempty handoffs classify as neither', () => {
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0, stdout: '{}' }), neither);
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: hook('The review completed without a finding.') }), neither);
  assert.deepEqual(classifyHookResult({ host: 'opencode', status: 0, stdout: '' }), neither);
});

test('explicit operational unavailability notice is classified without retaining text', () => {
  assert.deepEqual(classifyHookResult({ host: 'opencode', status: 0, stdout: unavailable }), {
    findingSubmitted: false, noticeSubmitted: true, blockFindingSubmitted: false,
  });
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0, stdout: hook(
    'Advisory direct-event review (the edit already succeeded):\n' +
    'Operational notice: review capacity was unavailable; some eligible edits were not reviewed. (2 similar failures were suppressed.)',
  ) }), { findingSubmitted: false, noticeSubmitted: true, blockFindingSubmitted: false });
});

test('the exact synthetic rule marker classifies a finding', () => {
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: hook(`Advisory direct-event review (the edit already succeeded):\n${finding}`) }), {
    findingSubmitted: true, noticeSubmitted: false, blockFindingSubmitted: false,
  });
});

test('malformed, failed, and unknown results stay neither', () => {
  assert.deepEqual(classifyHookResult(), neither);
  assert.deepEqual(classifyHookResult(null), neither);
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0, stdout: '{not json' }), neither);
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: finding } }) }), neither);
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: hook('fixture.ts :: SyntheticDeclaration [r6_bare_domain_value_extra, p=0.90]: synthetic finding') }), neither);
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: hook('fixture.ts :: SyntheticDeclaration [r6_bare_domain_value, p=unknown]: synthetic finding') }), neither);
  assert.deepEqual(classifyHookResult({ host: 'opencode', status: 0,
    stdout: 'Operational notice: backend trouble; retry later.' }), neither);
  assert.deepEqual(classifyHookResult({ host: 'opencode', status: 1, stdout: finding }), neither);
  assert.deepEqual(classifyHookResult({ host: 'unknown', status: 0, stdout: finding }), neither);
});

test('duplicate known lines are idempotent and combined handoffs preserve both signals', () => {
  const duplicateContext = `${finding}\n${finding}\n${unavailable}\n${unavailable}`;
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: hook(duplicateContext) }), { findingSubmitted: true, noticeSubmitted: true, blockFindingSubmitted: false });
});

test('top-level Claude block classifies only a known rule finding in reason', () => {
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: JSON.stringify({ decision: 'block', reason: `Repair this edit.\n${finding}` }) }), {
    findingSubmitted: true, noticeSubmitted: false, blockFindingSubmitted: true,
  });
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: JSON.stringify({ decision: 'block', reason: unavailable }) }), {
    findingSubmitted: false, noticeSubmitted: true, blockFindingSubmitted: false,
  });
  assert.deepEqual(classifyHookResult({ host: 'claude', status: 0,
    stdout: JSON.stringify({ decision: 'block', reason: finding, hookSpecificOutput: {
      hookEventName: 'PostToolUse', additionalContext: finding,
    } }) }), neither);
});
