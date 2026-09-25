// Private, deterministic scratch for a two-invocation restart pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPassLedger } from './pass-ledger.mjs';

const fingerprint = ledger => createHash('sha256').update(resolve(ledger)).digest('hex');
// Keep the path short enough for the resident's Unix-domain socket.
export const restartScratchDirectory = ledger => join(tmpdir(), `hapsland-94-restart-${fingerprint(ledger).slice(0, 24)}`);
const markerPath = root => join(root, '.hapsland-restart-owner.json');

export function initializeRestartScratch(ledger) {
  const root = restartScratchDirectory(ledger);
  assert.ok(!existsSync(root), 'restart scratch already exists; inspect or clean it explicitly');
  mkdirSync(root, { mode: 0o700 });
  writeFileSync(markerPath(root), JSON.stringify({ schemaVersion: 1, ledgerFingerprint: fingerprint(ledger) }),
    { flag: 'wx', mode: 0o600 });
  return root;
}

export function verifyRestartScratch(ledger) {
  const root = restartScratchDirectory(ledger);
  const metadata = lstatSync(root);
  assert.ok(metadata.isDirectory() && (metadata.mode & 0o077) === 0,
    'restart scratch is not a private directory');
  const marker = JSON.parse(readFileSync(markerPath(root), 'utf8'));
  assert.deepEqual(marker, { schemaVersion: 1, ledgerFingerprint: fingerprint(ledger) },
    'restart scratch ownership marker mismatch');
  return root;
}

const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error?.code === 'ESRCH') return false; throw error; }
};

export function cleanupAbandonedRestartScratch(ledger) {
  const root = verifyRestartScratch(ledger);
  const entries = readPassLedger(ledger);
  assert.ok(entries.every(entry => entry.finish || !alive(entry.ownerPid)),
    'restart pass owner is still running');
  const ownerPath = join(root, 'resident', 'owner.json');
  if (existsSync(ownerPath)) {
    const owner = JSON.parse(readFileSync(ownerPath, 'utf8'));
    assert.ok(!Number.isInteger(owner.pid) || !alive(owner.pid), 'restart resident is still running');
  }
  rmSync(root, { recursive: true, force: false });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2], '--cleanup-abandoned',
    'usage: node restart-scratch.mjs --cleanup-abandoned LEDGER_DIRECTORY');
  assert.ok(process.argv[3] && process.argv.length === 4, 'ledger directory required');
  cleanupAbandonedRestartScratch(process.argv[3]);
}
