import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { manageChildProcess, matchesKnownHostVersion } from './host-session-helpers.mjs';

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
