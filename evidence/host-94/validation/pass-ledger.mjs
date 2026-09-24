// Offline gate for a separately authorized #94 pass. No host session is launched here.
// A ledger directory is explicit: missing/corrupt state fails closed, and old evidence is never imported.
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOSTS = new Set(['claude', 'opencode']);
const FINISH_STATUSES = new Set(['recorded', 'incomplete', 'failed', 'abandoned']);
const MANIFEST = { schemaVersion: 1, purpose: 'issue-94-new-pass', perHostStartLimit: 8, totalStartLimit: 16 };
const eventName = (sequence, kind) => `${String(sequence).padStart(3, '0')}-${kind}.json`;
const assert = (condition, message) => { if (!condition) throw new Error(`pass ledger: ${message}`); };
const sameKeys = (value, keys) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const parse = path => {
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error('pass ledger: missing or corrupt required state'); }
  assert(value && typeof value === 'object' && !Array.isArray(value), 'invalid record');
  return value;
};
const syncDirectory = directory => { const fd = openSync(directory, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
const putImmutable = (directory, name, value) => {
  const temporary = join(directory, `.pending-${randomUUID()}`);
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(temporary, join(directory, name)); syncDirectory(directory); }
  finally { unlinkSync(temporary); }
};
const withLock = (directory, action) => {
  // A crash during a critical section leaves .lock. It must be inspected and removed
  // explicitly; guessing whether its owner is dead could permit concurrent sessions.
  try { mkdirSync(join(directory, '.lock'), 0o700); }
  catch { throw new Error('pass ledger: locked or missing'); }
  try { return action(); }
  finally { rmdirSync(join(directory, '.lock')); }
};
const load = directory => {
  const manifest = parse(join(directory, 'manifest.json'));
  assert(sameKeys(manifest, Object.keys(MANIFEST)) && Object.entries(MANIFEST).every(([key, value]) => manifest[key] === value), 'manifest mismatch');
  const names = readdirSync(directory).filter(name => name !== 'manifest.json' && name !== '.lock' && !name.startsWith('.pending-'));
  assert(names.every(name => /^\d{3}-(start|finish)\.json$/.test(name)), 'unknown ledger entry');
  const starts = names.filter(name => name.endsWith('-start.json')).sort();
  assert(starts.length <= 16, 'total start limit exceeded');
  const entries = starts.map((name, index) => {
    const sequence = index + 1;
    assert(name === eventName(sequence, 'start'), 'missing or unordered start');
    const start = parse(join(directory, name));
    assert(sameKeys(start, ['schemaVersion', 'sequence', 'host', 'scenario', 'startedAt', 'ownerPid']) &&
      start.schemaVersion === 1 && start.sequence === sequence && HOSTS.has(start.host) &&
      typeof start.scenario === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(start.scenario) &&
      Number.isSafeInteger(start.startedAt) && start.startedAt >= 0 &&
      Number.isSafeInteger(start.ownerPid) && start.ownerPid > 0, 'invalid start');
    const finishName = eventName(sequence, 'finish');
    const finish = names.includes(finishName) ? parse(join(directory, finishName)) : null;
    if (finish) assert(sameKeys(finish, ['schemaVersion', 'sequence', 'status', 'finishedAt', 'elapsedMs']) &&
      finish.schemaVersion === 1 && finish.sequence === sequence && FINISH_STATUSES.has(finish.status) &&
      Number.isSafeInteger(finish.finishedAt) && finish.finishedAt >= start.startedAt &&
      Number.isSafeInteger(finish.elapsedMs) && finish.elapsedMs >= 0, 'invalid finish');
    return { ...start, finish };
  });
  assert(names.length === starts.length + entries.filter(entry => entry.finish).length, 'orphan finish');
  for (const host of HOSTS) assert(entries.filter(entry => entry.host === host).length <= 8, 'per-host start limit exceeded');
  assert(entries.filter(entry => !entry.finish).length <= 1, 'multiple unfinished starts');
  return entries;
};

export function initializePassLedger(directory) {
  assert(!existsSync(directory), 'ledger already exists; never overwrite or reset a pass');
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  putImmutable(directory, 'manifest.json', MANIFEST);
  return readPassLedger(directory);
}

export function readPassLedger(directory) {
  return withLock(directory, () => load(directory));
}

export function claimPassStart(directory, { host, scenario }) {
  assert(HOSTS.has(host), 'host is not allowlisted');
  assert(typeof scenario === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(scenario), 'invalid scenario label');
  return withLock(directory, () => {
    const entries = load(directory);
    assert(!entries.some(entry => !entry.finish), 'an earlier start is unfinished');
    assert(entries.length < 16, 'total start limit exhausted');
    assert(entries.filter(entry => entry.host === host).length < 8, 'host start limit exhausted');
    const start = { schemaVersion: 1, sequence: entries.length + 1, host, scenario,
      startedAt: Date.now(), ownerPid: process.pid };
    putImmutable(directory, eventName(start.sequence, 'start'), start);
    return start;
  });
}

export function finishPass(directory, sequence, status, elapsedMs) {
  assert(FINISH_STATUSES.has(status) && status !== 'abandoned', 'invalid finish status');
  return withLock(directory, () => {
    const entry = load(directory).find(item => item.sequence === sequence);
    assert(entry && !entry.finish, 'start missing or already finished');
    assert(entry.ownerPid === process.pid, 'only the start owner may finish');
    const finish = makeFinish(entry, status, elapsedMs);
    putImmutable(directory, eventName(sequence, 'finish'), finish);
    return finish;
  });
}

const makeFinish = (entry, status, elapsedMs) => {
  const finishedAt = Math.max(Date.now(), entry.startedAt);
  const duration = elapsedMs ?? finishedAt - entry.startedAt;
  assert(Number.isSafeInteger(duration) && duration >= 0, 'invalid elapsed milliseconds');
  return { schemaVersion: 1, sequence: entry.sequence, status, finishedAt, elapsedMs: duration };
};

export function recoverAbandonedStart(directory, sequence) {
  return withLock(directory, () => {
    const entry = load(directory).find(item => item.sequence === sequence);
    assert(entry && !entry.finish, 'start missing or already finished');
    try { process.kill(entry.ownerPid, 0); }
    catch (error) {
      assert(error?.code === 'ESRCH', 'cannot establish that start owner exited');
      const finish = makeFinish(entry, 'abandoned');
      putImmutable(directory, eventName(sequence, 'finish'), finish);
      return finish;
    }
    throw new Error('pass ledger: start owner is still running; recovery refused');
  });
}
