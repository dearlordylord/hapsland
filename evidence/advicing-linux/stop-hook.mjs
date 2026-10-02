import { runClient } from "../../src/test-support/client-runtime.ts";
import { appendFileSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { controlledAnswers } from '../delivery-97/controlled-rule-answers.mjs';

const startedAt = Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS ?? Date.now());
const hookStarted = performance.now();
const eventsPath = process.env.HAPSLAND_PROBE_EVENTS;
const log = (kind, fields = {}) => {
  if (typeof eventsPath !== 'string') return;
  appendFileSync(eventsPath, `${JSON.stringify({ kind, at: Date.now() - startedAt, ...fields })}\n`, { mode: 0o600 });
};
const writeOutput = (value) => new Promise((resolvePromise) => {
  process.stdout.write(`${JSON.stringify(value)}\n`, resolvePromise);
});
const quiet = async (kind, fields = {}) => {
  await writeOutput({});
  log(kind, { elapsedMs: Math.round(performance.now() - hookStarted), ...fields });
};

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  log('stop-entry', { continuationCapped: input.stop_hook_active === true });
  if (input.hook_event_name !== 'Stop' || typeof input.session_id !== 'string' ||
      typeof input.cwd !== 'string' || input.stop_hook_active === true) {
    await quiet('stop-quiet', { continuationCapped: input.stop_hook_active === true });
    process.exit(0);
  }

  if (process.env.HAPSLAND_STOP_WAIT_FOR_BACKGROUND === 'true') {
    const waitUntil = hookStarted + 3_500;
    while (performance.now() < waitUntil) {
      try {
        if (readFileSync(eventsPath, 'utf8').includes('"kind":"background-response-written"')) break;
      } catch { /* background has not written its marker */ }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
    }
    log('stop-background-handoff-observed', { observed: (() => {
      try { return readFileSync(eventsPath, 'utf8').includes('"kind":"background-response-written"'); }
      catch { return false; }
    })() });
  }

  const { acknowledgeAdviceEffect: acknowledgeAdvice, collectReadyEffect: collectReady, makeResidentDispatchContextEffect: makeResidentDispatchContext } =
    await import('../../src/resident/client.ts');
  const { residentPaths } = await import('../../src/resident/paths.ts');
  const root = await realpath(input.cwd);
  const statePath = process.env.REVIEW_STATE_PATH;
  const activityPath = process.env.REVIEW_ACTIVITY_PATH;
  const runtimeDirectory = process.env.REVIEW_RESIDENT_DIR;
  if (!statePath || !activityPath || !runtimeDirectory) {
    await quiet('stop-unconfigured');
    process.exit(0);
  }

  const delayMs = Number(process.env.HAPSLAND_CONTROL_DELAY_MS ?? '0');
  const controlled = process.env.HAPSLAND_PROBE_FAILURE === 'true'
    ? { failure: 'fixture backend unavailable' }
    : process.env.HAPSLAND_PROBE_MULTI_UNIT === 'true'
    ? { answers: controlledAnswers }
    : { syntheticR6BrandedRepair: 'finding' };
  const dispatch = await runClient(makeResidentDispatchContext(
    root,
    statePath,
    activityPath,
    undefined,
    { ...controlled, outcomePath: process.env.HAPSLAND_CONTROL_OUTCOME_PATH,
      capturePath: process.env.HAPSLAND_CONTROL_CAPTURE_PATH, delayMs },
  ));
  const advicee = {
    host: 'codex-cli',
    hostVersion: '0.155.1',
    sessionId: input.session_id,
    turnId: input.turn_id ?? 'stop-probe-turn',
    toolUseId: 'stop-probe-tool',
    agentId: input.agent_id ?? null,
  };
  const paths = residentPaths(runtimeDirectory);
  const deadline = hookStarted + 4_200;
  let advice;
  while (performance.now() < deadline) {
    const remaining = Math.max(1, deadline - performance.now());
    let timer;
    const result = await Promise.race([
      runClient(collectReady(root, advicee, dispatch, paths, 'turn-end')).catch(() => undefined),
      new Promise((resolvePromise) => { timer = setTimeout(() => resolvePromise('deadline'), remaining); }),
    ]);
    clearTimeout(timer);
    if (result === 'deadline') {
      await quiet('stop-collection-deadline', { deadlineMs: 4_200 });
      process.exit(0);
    }
    advice = result;
    if (advice !== undefined) break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
  }

  if (advice === undefined) {
    await quiet('stop-no-advice', { deadlineMs: 4_200 });
    process.exit(0);
  }
  if (advice.findingCount === 0) {
    await quiet('stop-unavailable-notice');
    process.exit(0);
  }

  const checkedFiles = process.env.HAPSLAND_PROBE_MULTI_UNIT === 'true'
    ? ['order-count.ts', 'order-total.ts']
    : ['order-count.ts'];
  const stillBad = checkedFiles.some((filename) => {
    try { return readFileSync(join(root, filename), 'utf8') === `type ${filename === 'order-count.ts' ? 'OrderCount' : 'OrderTotal'} = number\n`; }
    catch { return false; }
  });
  if (!stillBad) {
    await quiet('stop-stale-suppressed');
    process.exit(0);
  }

  const reason = advice.output.hookSpecificOutput.additionalContext;
  await writeOutput({ decision: 'block', reason });
  log('stop-response-written', {
    elapsedMs: Math.round(performance.now() - hookStarted),
    findingCount: advice.findingCount,
  });
  const acknowledged = await runClient(acknowledgeAdvice(advice)).catch(() => false);
  log('stop-advice-finalized', { acknowledged });
} catch {
  await quiet('stop-error');
}
