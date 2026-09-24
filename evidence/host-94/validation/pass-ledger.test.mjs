import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { claimPassStart, finishPass, initializePassLedger, readPassLedger, recoverAbandonedStart } from './pass-ledger.mjs';

const fixture = action => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-ledger-'));
  const ledger = join(root, 'new-pass');
  try { initializePassLedger(ledger); return action(ledger); }
  finally { rmSync(root, { recursive: true, force: true }); }
};
const childClaim = ledger => new Promise(resolve => {
  const code = `import { claimPassStart } from ${JSON.stringify(new URL('./pass-ledger.mjs', import.meta.url).href)};
try { const entry = claimPassStart(process.argv[1], {host:'claude', scenario:'control'}); process.stdout.write(String(entry.sequence)); }
catch { process.exitCode = 2; }`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, ledger], { stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.on('close', code => resolve({ code, output }));
});

test('concurrent invocations commit exactly one exclusive start', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hapsland-94-ledger-'));
  const ledger = join(root, 'new-pass');
  try {
    initializePassLedger(ledger);
    const results = await Promise.all(Array.from({ length: 12 }, () => childClaim(ledger)));
    assert.equal(results.filter(result => result.code === 0).length, 1);
    assert.equal(readPassLedger(ledger).length, 1);
    assert.equal(readPassLedger(ledger)[0].finish, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('host and cumulative caps count every start, including incomplete ones', () => fixture(ledger => {
  for (let i = 0; i < 8; i++) {
    const entry = claimPassStart(ledger, { host: 'claude', scenario: 'control' });
    finishPass(ledger, entry.sequence, i === 0 ? 'incomplete' : 'recorded', i);
  }
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'control' }), /host start limit exhausted/);
  for (let i = 0; i < 8; i++) {
    const entry = claimPassStart(ledger, { host: 'opencode', scenario: 'finding' });
    finishPass(ledger, entry.sequence, 'recorded');
  }
  assert.equal(readPassLedger(ledger).length, 16);
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'control' }), /total start limit exhausted/);
  assert.throws(() => initializePassLedger(ledger), /never overwrite/);
}));

test('crashed owner is marked abandoned without refunding a start', () => fixture(ledger => {
  const code = `import { claimPassStart } from ${JSON.stringify(new URL('./pass-ledger.mjs', import.meta.url).href)};
claimPassStart(process.argv[1], {host:'claude', scenario:'control'});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, ledger]);
  assert.equal(result.status, 0);
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'finding' }), /unfinished/);
  const finish = recoverAbandonedStart(ledger, 1);
  assert.equal(finish.status, 'abandoned');
  assert.throws(() => recoverAbandonedStart(ledger, 1), /already finished/);
  assert.equal(claimPassStart(ledger, { host: 'claude', scenario: 'finding' }).sequence, 2);
}));

test('missing or corrupt required state and a leftover lock fail closed', () => fixture(ledger => {
  const entry = claimPassStart(ledger, { host: 'claude', scenario: 'control' });
  finishPass(ledger, entry.sequence, 'recorded');
  assert.throws(() => recoverAbandonedStart(ledger, 1), /already finished/);
  writeFileSync(join(ledger, '001-finish.json'), '{');
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'finding' }), /corrupt required state/);
  unlinkSync(join(ledger, '001-finish.json'));
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'finding' }), /unfinished/);
  mkdirSync(join(ledger, '.lock'));
  assert.throws(() => readPassLedger(ledger), /locked/);
}));

test('missing manifest and orphan finish are rejected', () => fixture(ledger => {
  writeFileSync(join(ledger, '001-finish.json'), '{}');
  assert.throws(() => claimPassStart(ledger, { host: 'claude', scenario: 'control' }), /orphan finish/);
  unlinkSync(join(ledger, '001-finish.json'));
  unlinkSync(join(ledger, 'manifest.json'));
  assert.throws(() => readPassLedger(ledger), /missing or corrupt required state/);
}));
