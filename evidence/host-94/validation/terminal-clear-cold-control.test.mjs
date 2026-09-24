import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { initializePassLedger } from './pass-ledger.mjs';

const scriptedClaude = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

if (process.argv.includes('--version')) {
  process.stdout.write('2.1.218 (Claude Code)\\n');
  process.exit(0);
}

const repo = process.cwd();
const path = join(repo, 'order-count.ts');
const content = 'type OrderCount = number\\n';
const callId = 'terminal-clear-cold-call';
const sessionId = 'terminal-clear-cold-session';
const toolInput = { file_path: path, content };
writeFileSync(path, content);
writeSync(1, JSON.stringify({ type: 'assistant', message: { content: [{
  type: 'tool_use', id: callId, name: 'Write', input: toolInput,
}] } }) + '\\n');

const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'));
const command = settings.hooks.PostToolUse[0].hooks[0].command;
const event = {
  hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: repo,
  session_id: sessionId, tool_use_id: callId, tool_input: toolInput,
  tool_response: { filePath: path, content, originalFile: null, userModified: false },
};
const result = spawnSync(command, {
  shell: true, input: JSON.stringify(event), encoding: 'utf8', env: process.env,
  timeout: 5_000, maxBuffer: 262_144,
});
process.exit(result.status === 0 ? 0 : 20);
`;

const testName = 'one bounded offline Claude cold ticketed terminal-clear control';
test(testName, {
  skip: process.env.HAPSLAND_94_TERMINAL_CLEAR_CONTROL !== '1', timeout: 70_000,
}, () => {
  const log = process.env.HAPSLAND_94_TIMING_LOG;
  const sessionRoot = process.env.HAPSLAND_94_TIMING_SESSION_ROOT;
  assert.ok(log && sessionRoot, 'cold timing paths must be supplied by run-cold-hook-timing.mjs');

  const temporary = mkdtempSync(join(tmpdir(), 'hapsland-94-terminal-clear-control-'));
  try {
    const executable = join(temporary, 'scripted-host.mjs');
    const ledger = join(temporary, 'ledger');
    writeFileSync(executable, scriptedClaude, { mode: 0o700 });
    initializePassLedger(ledger);
    const project = resolve(import.meta.dirname, '../../..');
    const result = spawnSync(process.execPath, [join(project, 'evidence/host-94/validation/host-session.mjs'),
      'claude', 'control', '--offline-scripted'], {
      env: { ...process.env, HAPSLAND_94_PASS_LEDGER: ledger,
        HAPSLAND_94_SCRIPTED_EXECUTABLE: executable, HAPSLAND_94_FAKE_HOST: 'claude',
        HAPSLAND_94_TIMING_LOG: log, HAPSLAND_94_TIMING_SESSION_ROOT: sessionRoot,
        TYPESAFE_API_KEY: '' },
      encoding: 'utf8', timeout: 65_000, maxBuffer: 262_144, detached: true,
    });
    assert.equal(result.status, 0, 'offline scripted host control failed (output withheld)');
    const evidence = JSON.parse(result.stdout);

    const ipc = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(item => item.role === 'hook-cli' &&
        (item.event === 'ipc-send' || item.event === 'ipc-receive'));
    const acceptedTickets = ipc.filter(item => item.event === 'ipc-receive' && item.operation === 'admit' &&
      item.version === 2 && item.status === 'accepted');
    const ticketCollections = ipc.filter(item => item.event === 'ipc-receive' && item.operation === 'collect' &&
      item.version === 2);
    const clear = ticketCollections.find(item => item.status === 'clear');
    assert.equal(acceptedTickets.length, 1, 'expected one accepted v2 admission ticket');
    assert.ok(ticketCollections.length >= 1, 'expected at least one ticketed collection');
    assert.ok(clear, 'expected a terminal clear collection response');
    assert.ok(acceptedTickets[0].atMs <= clear.atMs, 'terminal clear must follow accepted ticket');
    assert.ok(ticketCollections.every(item => ['pending', 'clear'].includes(item.status)),
      'successful all-clear control must only collect pending before clear');
    assert.equal(ticketCollections.at(-1).status, 'clear', 'clear must be the final ticket collection');

    const hookDurationMs = evidence.hookDurationMs[0] ?? null;
    const nativeToHookFinishMs = evidence.initialHookFinishedAtMs - evidence.initialNativeEditObservedAtMs;
    const bridgeInnerDurationMs = evidence.bridgeInnerReturnAtMs - evidence.bridgeInnerStartAtMs;
    assert.equal(evidence.nativeModelEditEvents, 1);
    assert.equal(evidence.nativeDirectHookCalls, 1);
    assert.equal(evidence.initialNativeEditMatched, true);
    assert.equal(evidence.initialHookCallKeyMatched, true);
    assert.equal(evidence.initialHookSucceeded, true);
    assert.equal(evidence.reviewAdmissionMarkerObserved, true);
    assert.equal(evidence.reviewCompletedOutcome, 'completed-clear');
    assert.equal(evidence.hostSubmissions, 0);
    assert.equal(evidence.finalRepairObserved, false);
    assert.equal(evidence.acceptanceStatus, 'passed');
    assert.equal(evidence.hostTimedOut, false);
    assert.equal(evidence.outputCeilingExceeded, false);
    assert.ok(Number.isFinite(hookDurationMs) && hookDurationMs >= 0,
      'CLI subprocess duration must be available');
    assert.ok(Number.isFinite(bridgeInnerDurationMs) && bridgeInnerDurationMs >= 0 && bridgeInnerDurationMs < 4_400,
      'bridge hook must finish inside the unchanged 4,400 ms ceiling');
    assert.ok(Number.isFinite(nativeToHookFinishMs) && nativeToHookFinishMs >= 0 && nativeToHookFinishMs < 5_000,
      'native fixture hook must finish inside the unchanged five-second ceiling');

    const summary = {
      acceptanceStatus: evidence.acceptanceStatus,
      nativeEditCount: evidence.nativeModelEditEvents,
      nativeEditMatched: evidence.initialNativeEditMatched,
      initialHookSucceeded: evidence.initialHookSucceeded,
      acceptedTicketCount: acceptedTickets.length,
      controlledOutcome: evidence.reviewCompletedOutcome,
      terminalCollection: clear.status,
      hostSubmissions: evidence.hostSubmissions,
      finalRepairObserved: evidence.finalRepairObserved,
      hookDurationMs,
      bridgeInnerDurationMs,
      nativeToHookFinishMs,
      admissionAtMs: evidence.admissionMarkerAtMs ?? null,
      reviewOutcomeAtMs: evidence.reviewOutcomeFileAtMs ?? null,
      ticketAcceptedAtMs: acceptedTickets[0].atMs,
      terminalClearAtMs: clear.atMs,
      cliDeadlineMsUnchanged: 3_900,
      bridgeInnerStartAtMs: evidence.bridgeInnerStartAtMs,
      bridgeInnerReturnAtMs: evidence.bridgeInnerReturnAtMs,
      timingHostLaunchEpochMs: evidence.timingHostLaunchEpochMs,
    };
    process.stdout.write(`source-free ticketed terminal-clear control: ${JSON.stringify(summary)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
