import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { cleanupTimingProcesses } from './timing-process-cleanup.mjs';

test('timing cleanup terminates a probe group and its detached resident', {
  skip: process.platform !== 'linux', timeout: 10_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-cleanup-test-'));
  const sessionRoot = join(root, 'session');
  const residentDir = join(sessionRoot, 'resident');
  const log = join(root, 'boundaries.jsonl');
  const runnerFile = join(sessionRoot, 'host-session.mjs');
  const residentFile = join(residentDir, 'main.js');
  mkdirSync(residentDir, { recursive: true });
  writeFileSync(residentFile, 'setInterval(() => {}, 1000);\n');
  writeFileSync(runnerFile, `import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
appendFileSync(process.argv[2], JSON.stringify({ role: 'runner', event: 'preload', pid: process.pid }) + '\\n');
const resident = spawn(process.execPath, [process.argv[3], process.argv[4]],
  { detached: true, stdio: 'ignore' });
resident.unref();
appendFileSync(process.argv[2], JSON.stringify({ role: 'resident', event: 'preload', pid: resident.pid }) + '\\n');
setInterval(() => {}, 1000);
`);
  const runner = spawn(process.execPath, [runnerFile, log, residentFile, residentDir], {
    detached: true, stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + 3_000;
    let entries = [];
    while (Date.now() < deadline) {
      try { entries = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); }
      catch { /* process has not published both entries yet */ }
      if (entries.some(item => item.role === 'resident')) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(entries.some(item => item.role === 'resident'), 'detached resident was not started');
    const cleanup = await cleanupTimingProcesses({ sessionRoot, log, processGroupPid: runner.pid });
    assert.deepEqual(cleanup, { supported: true, ownershipKnown: true,
      remainingResidents: 0, groupStillOwned: false });
  } finally {
    try { process.kill(-runner.pid, 'SIGKILL'); } catch { /* already stopped */ }
    try {
      const entries = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      for (const item of entries.filter(item => item.role === 'resident'))
        try { process.kill(item.pid, 'SIGKILL'); } catch { /* already stopped */ }
    } catch { /* no log */ }
    rmSync(root, { recursive: true, force: true });
  }
});
