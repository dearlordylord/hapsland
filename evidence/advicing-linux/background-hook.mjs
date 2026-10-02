import { runClient } from "../../src/test-support/client-runtime.ts";
import { appendFileSync, readFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { controlledAnswers } from '../delivery-97/controlled-rule-answers.mjs';

const startedAt = Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS ?? Date.now());
const enteredAt = performance.now();
const eventsPath = process.env.HAPSLAND_PROBE_EVENTS;
const log = (kind, fields = {}) => {
  if (typeof eventsPath === 'string') {
    appendFileSync(eventsPath, `${JSON.stringify({ kind, at: Date.now() - startedAt, ...fields })}\n`, { mode: 0o600 });
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeOutput = (value) => new Promise((resolve) => process.stdout.write(`${JSON.stringify(value)}\n`, resolve));

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  log('background-entry');
  if (input.hook_event_name !== 'PostToolUse' || input.tool_name !== 'apply_patch' ||
      typeof input.cwd !== 'string' || typeof input.session_id !== 'string' ||
      typeof input.turn_id !== 'string' || typeof input.tool_use_id !== 'string') {
    log('background-unsupported');
    process.exit(0);
  }

  const { collectReadyEffect: collectReady, acknowledgeAdviceEffect: acknowledgeAdvice, makeResidentDispatchContextEffect: makeResidentDispatchContext } =
    await import('../../src/resident/client.ts');
  const { residentPaths } = await import('../../src/resident/paths.ts');
  const root = await realpath(input.cwd);
  const controlled = process.env.HAPSLAND_PROBE_FAILURE === 'true'
    ? { failure: 'fixture backend unavailable' }
    : process.env.HAPSLAND_PROBE_MULTI_UNIT === 'true'
    ? { answers: controlledAnswers }
    : { syntheticR6BrandedRepair: 'finding' };
  const dispatch = await runClient(makeResidentDispatchContext(
    root, process.env.REVIEW_STATE_PATH, process.env.REVIEW_ACTIVITY_PATH, undefined,
    { ...controlled, outcomePath: process.env.HAPSLAND_CONTROL_OUTCOME_PATH,
      capturePath: process.env.HAPSLAND_CONTROL_CAPTURE_PATH,
      delayMs: Number(process.env.HAPSLAND_CONTROL_DELAY_MS ?? '0') },
  ));
  const advicee = {
    host: 'codex-cli', hostVersion: '0.155.1', sessionId: input.session_id,
    turnId: input.turn_id, toolUseId: input.tool_use_id, agentId: input.agent_id ?? null,
  };
  const deadline = enteredAt + Number(process.env.HAPSLAND_BACKGROUND_WAIT_MS ?? '10000');
  await sleep(Number(process.env.HAPSLAND_BACKGROUND_INITIAL_MS ?? '0'));
  while (performance.now() < deadline) {
    const advice = await runClient(collectReady(root, advicee, dispatch, undefined, 'ordinary')).catch(() => undefined);
    if (advice !== undefined) {
      log('background-collected', { findingCount: advice.findingCount });
      await writeOutput(advice.output);
      log('background-response-written', { findingCount: advice.findingCount,
        elapsedMs: Math.round(performance.now() - enteredAt) });
      log('background-advice-finalized', { acknowledged: await runClient(acknowledgeAdvice(advice)).catch(() => false) });
      process.exit(0);
    }
    await sleep(30);
  }
  log('background-deadline', { elapsedMs: Math.round(performance.now() - enteredAt) });
} catch {
  log('background-error');
}
