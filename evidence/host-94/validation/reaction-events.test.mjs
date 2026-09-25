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
    { key: callKey(salt, 'second'), tool: host === 'claude' ? 'Edit' : 'edit', submitted: false, finishedAtMs: 550, ok: true },
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
    { key: callKey(salt, 'second'), tool: 'Edit', submitted: false, finishedAtMs: 550, ok: true },
  ];
  assert.equal(reactionEvidence({ host: 'claude', nativeEvents, hookEvents, scenario: 'finding',
    finalRepairObserved: true, externalStaleMutation: false }).status, 'unproven');
});

test('a finding must be attributable to and submitted after the initiating native edit', () => {
  const initial = nativeEditEvents('claude', claude('first', 'Write', {
    file_path: '/fixture/order-count.ts', content: 'type OrderCount = number\n',
  }), 100, salt)[0];
  const repair = nativeEditEvents('claude', claude('second', 'Edit', {
    file_path: '/fixture/order-count.ts', old_string: 'number', new_string: 'string',
  }), 400, salt)[0];
  const repairHook = { key: callKey(salt, 'second'), tool: 'Edit', finishedAtMs: 500, ok: true };
  const evidence = hookEvents => reactionEvidence({ host: 'claude', nativeEvents: [initial, repair],
    hookEvents: [...hookEvents, repairHook], scenario: 'finding', finalRepairObserved: true,
    externalStaleMutation: false });
  const validFinding = { key: callKey(salt, 'first'), tool: 'Write', findingSubmitted: true, finishedAtMs: 250 };

  assert.equal(evidence([validFinding]).status, 'observed-native-repair-after-advice');
  assert.equal(evidence([{ ...validFinding, finishedAtMs: 100 }]).status, 'unproven');
  assert.equal(evidence([{ ...validFinding, finishedAtMs: 99 }]).status, 'unproven');
  assert.equal(evidence([{ ...validFinding, key: callKey(salt, 'unmatched') }]).status, 'unproven');
  assert.equal(evidence([{ ...validFinding, tool: 'Edit' }]).status, 'unproven');
});

test('repair requires a successful hook for the later native call', () => {
  const nativeEvents = [
    ...nativeEditEvents('claude', claude('first', 'Write', {
      file_path: '/fixture/order-count.ts', content: 'type OrderCount = number\n',
    }), 100, salt),
    ...nativeEditEvents('claude', claude('second', 'Edit', {
      file_path: '/fixture/order-count.ts', old_string: 'number', new_string: 'string',
    }), 400, salt),
  ];
  const finding = { key: callKey(salt, 'first'), tool: 'Write', findingSubmitted: true,
    finishedAtMs: 250, ok: true };
  const repair = { key: callKey(salt, 'second'), tool: 'Edit', finishedAtMs: 550, ok: true };
  const evidence = repairHook => reactionEvidence({ host: 'claude', nativeEvents,
    hookEvents: [finding, repairHook], scenario: 'finding', finalRepairObserved: true,
    externalStaleMutation: false });

  assert.equal(evidence(repair).status, 'observed-native-repair-after-advice');
  assert.equal(evidence({ ...repair, ok: false }).status, 'unproven');
  assert.equal(evidence({ ...repair, ok: undefined }).status, 'unproven');
  assert.equal(evidence({ ...repair, key: callKey(salt, 'other') }).status, 'unproven');
  assert.equal(evidence({ ...repair, tool: 'Write' }).status, 'unproven');
  assert.equal(evidence({ ...repair, finishedAtMs: 399 }).status, 'unproven');
});
