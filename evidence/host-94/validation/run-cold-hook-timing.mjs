// One disposable, bounded, offline scripted Claude control timing probe.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTimingProcesses } from './timing-process-cleanup.mjs';

const temporary = mkdtempSync(join(tmpdir(), 'hapsland-94-cold-timing-'));
const log = join(temporary, 'boundaries.jsonl');
const sessionRoot = join(temporary, 'session');
const preload = join(import.meta.dirname, 'cold-hook-timing-preload.cjs');
const test = join(import.meta.dirname, 'host-session-integration.test.mjs');
const beforeLoad = loadavg();
const timeoutSessionMs = 60_000;
const cleanupHeadroomMs = 30_000;
const timeoutHarnessMs = timeoutSessionMs + cleanupHeadroomMs;
let cleanup;
let runnerPid;
try {
  const started = Date.now();
  const child = spawn(process.execPath, [
    '--test', '--test-name-pattern=one bounded offline Claude control with production CLI', test,
  ], {
    env: { ...process.env, HAPSLAND_94_SINGLE_CONTROL: '1', HAPSLAND_94_TIMING_LOG: log,
      HAPSLAND_94_TIMING_SESSION_ROOT: sessionRoot,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${preload}`.trim(), TYPESAFE_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let stdout = '';
  let outputBytes = 0;
  let outputExceeded = false;
  const collect = chunk => {
    outputBytes += chunk.length;
    if (outputBytes > 262_144) { outputExceeded = true; terminateTestGroup(); return; }
    stdout += chunk.toString();
  };
  const terminateTestGroup = () => {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already closed */ }
    setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already closed */ } }, 350).unref();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', chunk => {
    outputBytes += chunk.length;
    if (outputBytes > 262_144) { outputExceeded = true; terminateTestGroup(); }
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; terminateTestGroup(); }, timeoutHarnessMs);
  const run = await new Promise(resolve => {
    child.once('close', (status, signal) => resolve({ status, signal }));
    child.once('error', error => resolve({ status: null, signal: null, error }));
  });
  clearTimeout(timer);
  runnerPid = (() => {
    try { return readFileSync(log, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
      .find(item => item.role === 'runner' && item.event === 'preload')?.pid; }
    catch { return undefined; }
  })();
  cleanup = await cleanupTimingProcesses({ sessionRoot, log, processGroupPid: runnerPid });
  const match = stdout.match(/source-free production-CLI control: (\{[^\n]+\})/);
  const summary = match ? JSON.parse(match[1]) : null;
  const boundaries = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line)).filter(item => item.role !== 'other');
  const origin = boundaries.find(item => item.role === 'bridge' && item.event === 'preload')?.atMs
    ?? boundaries[0]?.atMs ?? started;
  const timeline = boundaries.map(({ role, event, operation, status, stage, atMs }) => ({
    role, event, ...(operation === undefined ? {} : { operation }),
    ...(status === undefined ? {} : { status }), ...(stage === undefined ? {} : { stage }),
    atMs: atMs - origin,
  }));
  const collections = timeline.filter(item => item.operation === 'collect');
  const firstReady = timeline.find(item => item.operation === 'hello' && item.status === 'ready');
  const keyEvents = timeline.filter(item => item.event === 'preload' || item.event === 'first-read' ||
    item.event === 'resident-spawn' || item.event === 'activity' || item.event === 'exit' ||
    item.operation === 'admit' || item === firstReady);
  const outputSummary = summary === null ? null : { ...summary,
    bridgeInnerStartAtMs: summary.timingHostLaunchEpochMs + summary.bridgeInnerStartAtMs - origin,
    bridgeInnerReturnAtMs: summary.timingHostLaunchEpochMs + summary.bridgeInnerReturnAtMs - origin,
    admissionMarkerAtMs: summary.admissionMarkerAtMs === null ? null
      : summary.timingHostLaunchEpochMs + summary.admissionMarkerAtMs - origin,
    reviewOutcomeFileAtMs: summary.reviewOutcomeFileAtMs === null ? null
      : summary.timingHostLaunchEpochMs + summary.reviewOutcomeFileAtMs - origin,
  };
  if (outputSummary) delete outputSummary.timingHostLaunchEpochMs;
  const result = { schemaVersion: 1, probe: 'one-offline-compiled-cli-cold-control',
    clock: 'Date.now() wall milliseconds; timeline relative to bridge preload',
    observationLimit: 'Node preload adds tracing overhead; source-free process and IPC boundaries only',
    timeoutInnerMs: 4_400, timeoutNativeFixtureMs: 5_000, timeoutSessionMs, cleanupHeadroomMs, timeoutHarnessMs,
    processExit: run.status, processSignal: run.signal, processErrorCode: run.error?.code ?? null,
    timedOut, outputExceeded, descendantCleanup: cleanup,
    elapsedHarnessMs: Date.now() - started, loadAverageBefore: beforeLoad,
    loadAverageAfter: loadavg(), summary: outputSummary, keyEvents,
    collection: { requests: collections.filter(item => item.event === 'ipc-send').length,
      first: collections[0] ?? null, last: collections.at(-1) ?? null } };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  cleanup ??= await cleanupTimingProcesses({ sessionRoot, log, processGroupPid: runnerPid });
  if (cleanup.supported && cleanup.ownershipKnown && cleanup.remainingResidents === 0 && !cleanup.groupStillOwned)
    rmSync(temporary, { recursive: true, force: true });
  else process.stderr.write(`Timing fixture retained for manual descendant audit: ${temporary}\n`);
}
