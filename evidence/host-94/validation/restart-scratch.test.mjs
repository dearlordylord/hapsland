import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { initializePassLedger } from './pass-ledger.mjs';
import {
  cleanupAbandonedRestartScratch, initializeRestartScratch, restartScratchDirectory,
  verifyRestartScratch,
} from './restart-scratch.mjs';

test('abandoned restart scratch is private, outside ledger, and explicitly recoverable', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'hapsland-restart-cleanup-test-'));
  const ledger = join(temporary, 'ledger');
  initializePassLedger(ledger, 'claude-block-stage-b-restart');
  const scratch = restartScratchDirectory(ledger);
  try {
    assert.equal(initializeRestartScratch(ledger), scratch);
    assert.equal(verifyRestartScratch(ledger), scratch);
    assert.ok(scratch.startsWith(tmpdir()));
    assert.ok(!scratch.startsWith(ledger));
    mkdirSync(join(scratch, 'repo'));
    writeFileSync(join(scratch, 'repo', 'order-count.ts'), 'synthetic source');
    mkdirSync(join(scratch, 'resident'));
    writeFileSync(join(scratch, 'resident', 'owner.json'), JSON.stringify({ pid: process.pid }));
    assert.throws(() => cleanupAbandonedRestartScratch(ledger), /still running/);
    rmSync(join(scratch, 'resident', 'owner.json'));
    cleanupAbandonedRestartScratch(ledger);
    assert.equal(existsSync(scratch), false);
  } finally {
    if (existsSync(scratch)) rmSync(scratch, { recursive: true, force: true });
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('cleanup refuses a scratch directory without the exact ownership marker', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'hapsland-restart-marker-test-'));
  const ledger = join(temporary, 'ledger');
  initializePassLedger(ledger, 'claude-block-stage-b-restart');
  const scratch = restartScratchDirectory(ledger);
  try {
    mkdirSync(scratch, { mode: 0o700 });
    const sentinel = join(scratch, 'unrelated-file');
    writeFileSync(sentinel, 'preserve');
    assert.throws(() => cleanupAbandonedRestartScratch(ledger));
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(temporary, { recursive: true, force: true });
  }
});
