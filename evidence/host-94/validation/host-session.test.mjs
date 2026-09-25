import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createClaudeStreamDiagnostics, hostFailureAcceptance, manageChildProcess, matchesKnownHostVersion } from './host-session-helpers.mjs';

test('host-failure gate rejects timeout, output cap, and forced close after attributed admission', () => {
  const accepted = {
    status: 'recorded', hostTimedOut: false, outputCeilingExceeded: false,
    hostCloseForced: false, hostTerminatedBySignal: true, hostExitCode: null,
    exactAdmissionAttributionProven: true, hostFailureTriggeredAfterAdmission: true,
    completedSyntheticEdit: true, hostSubmissions: 0,
  };
  const limits = { stageBBounded: true, backendCallCount: 0 };
  assert.equal(hostFailureAcceptance(accepted, limits), true);
  for (const invalid of [
    { status: 'incomplete', hostTimedOut: true },
    { status: 'incomplete', outputCeilingExceeded: true },
    { status: 'incomplete', hostCloseForced: true },
    { hostTimedOut: true },
    { outputCeilingExceeded: true },
    { hostCloseForced: true },
    { hostExitCode: 0 },
    { hostTerminatedBySignal: false },
  ]) {
    assert.equal(hostFailureAcceptance({ ...accepted, ...invalid }, limits), false,
      `accepted invalid host closure: ${JSON.stringify(invalid)}`);
  }
  assert.equal(hostFailureAcceptance(accepted, { ...limits, backendCallCount: 1 }), false);
  assert.equal(hostFailureAcceptance(accepted, { ...limits, stageBBounded: false }), false);
});

test('Claude stream diagnostics retain only allowlisted categories and relative times', () => {
  const diagnostics = createClaudeStreamDiagnostics();
  diagnostics.observe(JSON.stringify({ type: 'system', subtype: 'init', secret: 'system-secret' }), 2);
  diagnostics.observe(JSON.stringify({ type: 'assistant', message: { content: [
    { type: 'text', text: 'assistant-secret' },
    { type: 'tool_use', name: 'Read', input: { file_path: 'secret-path' } },
    { type: 'tool_use', name: 'Write', input: { content: 'source-secret' } },
    { type: 'tool_use', name: 'Bash', input: { command: 'command-secret' } },
  ] } }), 5);
  diagnostics.observe(JSON.stringify({ type: 'result', subtype: 'error_during_execution',
    is_error: true, result: 'error-secret' }), 8);
  diagnostics.observe(JSON.stringify({ type: 'invented-secret', subtype: 'subtype-secret' }), 9);
  diagnostics.observe('{"type":"assistant","message":"parse-secret"', 10);
  const summary = diagnostics.snapshot();
  assert.deepEqual(summary.eventTypeCounts, {
    system: 1, assistant: 1, user: 0, result: 1, stream_event: 0, unknown: 1,
  });
  assert.equal(summary.resultSubtypeCounts.error_during_execution, 1);
  assert.deepEqual(summary.assistantNativeToolCounts, { read: 1, edit: 0, write: 1, unknown: 1 });
  assert.equal(summary.resultIsError, true);
  assert.equal(summary.parseFailureCount, 1);
  assert.equal(summary.firstEventAtMs, 2);
  assert.equal(summary.lastEventAtMs, 9);
  assert.doesNotMatch(JSON.stringify(summary), /secret|Bash|invented/);
});

test('unknown Claude result values and missing timestamps stay source-free', () => {
  const diagnostics = createClaudeStreamDiagnostics();
  diagnostics.observe(JSON.stringify({ type: 'result', subtype: 'private-subtype',
    is_error: 'private-error', result: 'private-result' }), null);
  const summary = diagnostics.snapshot();
  assert.equal(summary.resultSubtypeCounts.unknown, 1);
  assert.equal(summary.resultIsError, null);
  assert.equal(summary.firstEventAtMs, null);
  assert.equal(summary.lastEventAtMs, null);
  assert.doesNotMatch(JSON.stringify(summary), /private/);
});

test('host version output must match the exact known version', () => {
  assert.equal(matchesKnownHostVersion('claude', '2.1.218 (Claude Code)\n'), true);
  assert.equal(matchesKnownHostVersion('claude', '2.1.2180 (Claude Code)\n'), false);
  assert.equal(matchesKnownHostVersion('claude', '2.1.218 (Claude Code) preview\n'), false);
  assert.equal(matchesKnownHostVersion('opencode', '1.14.44\n'), true);
  assert.equal(matchesKnownHostVersion('opencode', '1.14.440\n'), false);
  assert.equal(matchesKnownHostVersion('opencode', '1.14.44 nightly\n'), false);
});

test('a child that ignores SIGTERM is escalated to SIGKILL', { timeout: 3_000 }, async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000)"], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lifecycle = manageChildProcess(child, { terminationGraceMs: 50, killWaitMs: 500 });
  await new Promise(resolve => child.stdout.once('data', resolve));
  const started = Date.now();
  lifecycle.terminate();

  const result = await lifecycle.closed;
  assert.equal(result.signal, 'SIGKILL');
  assert.equal(result.forcedClose, false);
  assert.ok(Date.now() - started < 1_000);
});

test('cleanup settles and closes captured streams if SIGKILL has no close event', async () => {
  class UnresponsiveChild extends EventEmitter {
    exitCode = null;
    signalCode = null;
    signals = [];
    stdout = { destroyed: false, destroy() { this.destroyed = true; } };
    stderr = { destroyed: false, destroy() { this.destroyed = true; } };

    kill(signal) {
      this.signals.push(signal);
      return true;
    }
  }

  const child = new UnresponsiveChild();
  const lifecycle = manageChildProcess(child, { terminationGraceMs: 5, killWaitMs: 5 });
  lifecycle.terminate();
  const result = await lifecycle.closed;

  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(result.forcedClose, true);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});
