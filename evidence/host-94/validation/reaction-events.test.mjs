import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callKey, nativeEditEvents, reactionEvidence } from './reaction-events.mjs';

const salt = 'synthetic-test-salt';
const claude = (id, tool, input) => JSON.stringify({ type: 'assistant', message: { content: [
  { type: 'tool_use', id, name: tool, input },
] } });
const opencode = (id, tool, input) => JSON.stringify({ type: 'tool_use', part: {
  type: 'tool', callID: id, messageID: `message-${id}`, tool, state: { status: 'completed', input },
} });
const check = (host, first, second) => {
  const nativeEvents = [
    ...nativeEditEvents(host, first, 100, salt),
    ...nativeEditEvents(host, second, 400, salt),
  ];
  const hookEvents = [
    { key: callKey(salt, 'first'), tool: host === 'claude' ? 'Write' : 'write', submitted: true,
      findingSubmitted: true, finishedAtMs: 250 },
    { key: callKey(salt, 'second'), tool: host === 'claude' ? 'Edit' : 'edit', submitted: false, finishedAtMs: 550 },
  ];
  assert.equal(reactionEvidence({ host, nativeEvents, hookEvents, scenario: 'finding',
    finalRepairObserved: true, externalStaleMutation: false }).status, 'observed-native-repair-after-advice');
  assert.equal(reactionEvidence({ host, nativeEvents: nativeEvents.slice(0, 1), hookEvents,
    scenario: 'finding', finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
  assert.equal(reactionEvidence({ host, nativeEvents, hookEvents: hookEvents.slice(1),
    scenario: 'finding', finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
  assert.equal(reactionEvidence({ host, nativeEvents,
    hookEvents: [{ ...hookEvents[0], findingSubmitted: false, noticeSubmitted: true }, hookEvents[1]],
    scenario: 'finding', finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
  assert.equal(reactionEvidence({ host, nativeEvents, hookEvents,
    scenario: 'control', finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
};

test('Claude reaction requires an attributed later assistant tool call', () => {
  check('claude',
    claude('first', 'Write', { file_path: '/fixture/order-count.ts', content: 'type OrderCount = number\n' }),
    claude('second', 'Edit', { file_path: '/fixture/order-count.ts', old_string: 'number', new_string: 'string' }));
});

test('OpenCode reaction requires an attributed later tool part', () => {
  check('opencode',
    opencode('first', 'write', { filePath: '/fixture/order-count.ts', content: 'type OrderCount = number\n' }),
    opencode('second', 'edit', { filePath: '/fixture/order-count.ts', oldString: 'number', newString: 'string' }));
});

test('unknown, unmatched, and premature events stay unproven', () => {
  assert.deepEqual(nativeEditEvents('opencode', JSON.stringify({ type: 'text', part: { callID: 'second' } }), 400, salt), []);
  assert.deepEqual(nativeEditEvents('claude', 'not json', 400, salt), []);
  const nativeEvents = [
    ...nativeEditEvents('claude', claude('first', 'Write', { file_path: '/fixture/order-count.ts',
      content: 'type OrderCount = number\n' }), 100, salt),
    ...nativeEditEvents('claude', claude('second', 'Edit', { file_path: '/fixture/order-count.ts',
      old_string: 'number', new_string: 'string' }), 200, salt),
  ];
  const hookEvents = [
    { key: callKey(salt, 'first'), tool: 'Write', submitted: true, findingSubmitted: true, finishedAtMs: 250 },
    { key: callKey(salt, 'second'), tool: 'Edit', submitted: false, finishedAtMs: 550 },
  ];
  assert.equal(reactionEvidence({ host: 'claude', nativeEvents, hookEvents, scenario: 'finding',
    finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
});
