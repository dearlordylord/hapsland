// Linux-only ownership checks for disposable #94 timing descendants.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const command = pid => read(`/proc/${pid}/cmdline`).replaceAll('\0', ' ');
const group = pid => {
  const stat = read(`/proc/${pid}/stat`);
  const close = stat.lastIndexOf(') ');
  return close < 0 ? null : Number(stat.slice(close + 2).split(' ')[2]);
};
const signal = (pid, name) => { try { process.kill(pid, name); return true; } catch { return false; } };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const entries = log => read(log).split('\n').filter(Boolean).flatMap(line => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const processes = () => { try { return readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(Number); }
  catch { return []; } };
const residentPids = sessionRoot => processes().filter(pid => {
  const argv = command(pid);
  return argv.includes('/resident/main.js') && argv.includes(join(sessionRoot, 'resident'));
});
const groupOwned = (pgid, log, sessionRoot) => entries(log).some(item => {
  if (!['runner', 'scripted-host', 'bridge', 'hook-cli'].includes(item.role) ||
    !Number.isInteger(item.pid) || group(item.pid) !== pgid) return false;
  const argv = command(item.pid);
  return item.role === 'runner' ? argv.includes('/host-session.mjs')
    : item.role === 'scripted-host' ? argv.includes('/scripted-host.mjs')
    : item.role === 'bridge' ? argv.includes('/bridge.mjs') : argv.includes('/cli.js');
}) || processes().some(pid => group(pid) === pgid && (
  command(pid).includes(sessionRoot) || command(pid).includes('/host-session.mjs') ||
  command(pid).includes('/dist/cli.js')));

export const cleanupTimingProcesses = async ({ sessionRoot, log, processGroupPid }) => {
  if (process.platform !== 'linux') return { supported: false, remainingResidents: null };
  const ownershipKnown = Number.isInteger(processGroupPid);
  const stop = name => {
    if (ownershipKnown && groupOwned(processGroupPid, log, sessionRoot))
      signal(-processGroupPid, name);
    for (const pid of residentPids(sessionRoot)) signal(pid, name);
  };
  stop('SIGTERM');
  await delay(350);
  stop('SIGKILL');
  await delay(150);
  return { supported: true, ownershipKnown, remainingResidents: residentPids(sessionRoot).length,
    groupStillOwned: ownershipKnown && groupOwned(processGroupPid, log, sessionRoot) };
};
