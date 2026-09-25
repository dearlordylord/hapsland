// Offline #94 contract probes. All source and controlled output are synthetic and
// confined to a temporary repository that is removed after each case.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { configuredRules } from '../../../src/policy/rules.ts';

const project = resolve(import.meta.dirname, '../../..');
const cli = join(project, 'src/cli.ts');
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const waitFor = (predicate, label, limitMs = 8_000) => {
  const end = Date.now() + limitMs;
  while (Date.now() < end) {
    if (predicate()) return;
    sleep(20);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const readLines = path => existsSync(path)
  ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];

function fixture({ delayMs = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-offline-'));
  const repo = join(root, 'repo');
  const state = join(root, 'consent');
  const runtime = join(root, 'resident');
  const gate = join(root, 'release');
  const accepted = join(root, 'accepted');
  const outcome = join(root, 'outcome.jsonl');
  const capture = join(root, 'backend-called');
  const source = join(repo, 'order-count.ts');
  const git = spawnSync('git', ['init', '-q', repo]);
  assert.equal(git.status, 0, 'git init failed');
  const answers = Object.fromEntries(configuredRules.map(rule => [rule.id, {
    _tag: 'Probability', probability: rule.id === 'r6_bare_domain_value' ? 0.9 : 0,
  }]));
  const env = { ...process.env, REVIEW_STATE_PATH: state, REVIEW_RESIDENT_DIR: runtime,
    REVIEW_RESIDENT_BACKEND_GATE_PATH: gate, REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: accepted,
    REVIEW_CONTROL_JSON: JSON.stringify({ answers, outcomePath: outcome, capturePath: capture, delayMs }) };
  const invoke = (flag, input) => {
    const result = spawnSync(process.execPath, [cli, flag], { cwd: project, env,
      input: JSON.stringify(input), encoding: 'utf8', timeout: 10_000, maxBuffer: 262_144 });
    assert.equal(result.status, 0, `${flag} failed (raw output withheld)`);
    return JSON.parse(result.stdout);
  };
  const preview = invoke('--enable', { version: 1, operation: 'enable', cwd: repo });
  assert.equal(preview.status, 'preview');
  assert.equal(invoke('--enable-confirm', { version: 1, operation: 'enable-confirm',
    cwd: repo, proposalDigest: preview.proposal.digest }).status, 'enabled');
  // Keep the production native hook flags, which are intentionally separate
  // from the JSON command flags used by invoke above.
  const nativeHook = event => {
    const result = spawnSync(process.execPath,
      [cli, '--codex-hook', '--controlled-reviewer', '--controlled-writer'],
      { cwd: project, env, input: JSON.stringify(event), encoding: 'utf8', timeout: 10_000,
        maxBuffer: 262_144 });
    assert.equal(result.status, 0, 'native hook failed (raw output withheld)');
    return JSON.parse(result.stdout);
  };
  const event = (session, tool, kind = 'apply_patch') => ({
    hook_event_name: 'PostToolUse', tool_name: kind, cwd: repo,
    session_id: session, turn_id: 'turn-1', tool_use_id: tool,
    tool_input: kind === 'Bash' ? { command: 'true' } : {
      command: '*** Begin Patch\n*** Add File: order-count.ts\n+type OrderCount = number\n*** End Patch',
    }, tool_response: {},
  });
  const stopResident = () => {
    try {
      const { pid } = JSON.parse(readFileSync(join(runtime, 'owner.json'), 'utf8'));
      if (Number.isInteger(pid)) process.kill(pid, 'SIGTERM');
    } catch { /* already stopped */ }
  };
  return { root, repo, runtime, gate, accepted, outcome, capture, source, nativeHook, event,
    stopResident, close() { stopResident(); rmSync(root, { recursive: true, force: true }); } };
}

test('accepted edit becomes stale before controlled backend completion and emits no advice', { timeout: 35_000 }, () => {
  const f = fixture({ delayMs: 3_000 });
  try {
    writeFileSync(f.source, 'type OrderCount = number\n');
    assert.deepEqual(f.nativeHook(f.event('stale-session', 'edit-1')), {});
    waitFor(() => existsSync(f.accepted), 'source-free admission acknowledgment');
    assert.equal(readFileSync(f.accepted, 'utf8'), 'accepted\n');
    assert.equal(existsSync(f.outcome), false, 'backend completed before external mutation');
    writeFileSync(f.gate, 'release\n');
    waitFor(() => existsSync(f.capture), 'controlled backend request start');
    writeFileSync(f.source, 'export const ready = true\n');
    assert.equal(existsSync(f.outcome), false, 'backend completed before external mutation');
    waitFor(() => readLines(f.outcome).length > 0, 'controlled backend completion');
    const outcomes = readLines(f.outcome);
    assert.ok(outcomes.every(item => item.sessionId === 'stale-session'));
    assert.ok(outcomes.some(item => item.outcome === 'completed-findings'),
      'controlled finding did not complete after the mutation');
    assert.deepEqual(f.nativeHook(f.event('stale-session', 'collect-1', 'Bash')), {});
    assert.equal(readFileSync(f.source, 'utf8'), 'export const ready = true\n');
  } finally { f.close(); }
});

test('resident restart discards old queued work and keeps new session recipient isolated', { timeout: 45_000 }, () => {
  const f = fixture();
  try {
    writeFileSync(f.source, 'type OrderCount = number\n');
    assert.deepEqual(f.nativeHook(f.event('old-session', 'old-edit')), {});
    waitFor(() => existsSync(f.accepted), 'old admission acknowledgment');
    const owner = join(f.runtime, 'owner.json');
    f.stopResident();
    waitFor(() => !existsSync(owner), 'old resident shutdown');
    assert.equal(existsSync(f.outcome), false, 'old evaluation completed before restart');
    writeFileSync(f.gate, 'release\n');
    assert.deepEqual(f.nativeHook(f.event('new-session', 'new-edit')), {});
    waitFor(() => readLines(f.outcome).some(item => item.sessionId === 'new-session'),
      'new session backend completion');
    assert.ok(readLines(f.outcome).every(item => item.sessionId === 'new-session'),
      'old queued work completed after restart');
    assert.deepEqual(f.nativeHook(f.event('old-session', 'old-collect', 'Bash')), {},
      'old work reached an old recipient after restart');
    const delivered = f.nativeHook(f.event('new-session', 'new-collect', 'Bash'));
    assert.match(delivered.hookSpecificOutput?.additionalContext ?? '', /\[r6_bare_domain_value, p=/,
      'new session did not receive its own finding');
  } finally { f.close(); }
});
