import { appendFileSync, readFileSync } from 'node:fs';

const startedAt = Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS ?? Date.now());
const eventsPath = process.env.HAPSLAND_PROBE_EVENTS;
let reason;
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (typeof input.reason === 'string' && /^(clear|logout|prompt_exit|other|completed|interrupted)$/i.test(input.reason)) {
    reason = input.reason;
  }
} catch { /* no source-bearing payload is retained */ }
if (typeof eventsPath === 'string') {
  appendFileSync(eventsPath, `${JSON.stringify({ kind: 'session-end', at: Date.now() - startedAt, ...(reason === undefined ? {} : { reason }) })}\n`, { mode: 0o600 });
}
process.stdout.write('{}\n');
