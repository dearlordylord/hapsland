// Source-free transport accounting for the declared synthetic comparison.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const original = globalThis.fetch;
const records = path => { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
globalThis.fetch = async (...args) => {
  const url = String(args[0]?.url ?? args[0]);
  if (!url.includes('/v1/systemone')) return original(...args);
  const log = process.env.QUALITY_REQUEST_LOG;
  const globalLog = process.env.QUALITY_GLOBAL_LOG;
  if (!log || !globalLog) throw new Error('Quality metering unavailable');
  const lock = `${globalLog}.lock`;
  const deadline = Date.now() + 5000;
  for (;;) {
    try { mkdirSync(lock); break; } catch {
      if (Date.now() > deadline) throw new Error('Quality metering lock timeout');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  const id = randomUUID();
  const at = Date.now();
  const phase = process.env.QUALITY_PHASE ?? 'edit';
  let parsed;
  try { parsed = JSON.parse(String(args[1]?.body ?? '')); } catch {}
  const base = { id, at, candidate: process.env.QUALITY_CANDIDATE, caseId: process.env.QUALITY_CASE,
    phase, stage: process.env.QUALITY_STAGE, pass: Number(process.env.QUALITY_PASS ?? 0) };
  try {
    if (records(globalLog).length >= Number(process.env.QUALITY_GLOBAL_CAP ?? 120) ||
      records(log).filter(x => x.kind === 'request').length >= Number(process.env.QUALITY_LOCAL_CAP ?? 1)) {
      appendFileSync(log, JSON.stringify({ ...base, kind: 'budget-stop' }) + '\n');
      throw new Error('Declared quality request ceiling reached');
    }
    appendFileSync(globalLog, JSON.stringify(base) + '\n', { mode: 0o600 });
    appendFileSync(log, JSON.stringify({ ...base, kind: 'request',
      bytes: Buffer.byteLength(String(args[1]?.body ?? '')),
      stateKeys: Object.keys(parsed?.state ?? {}).sort(),
      questionIds: Object.keys(parsed?.questions ?? {}),
      taskIncluded: parsed?.state?.task !== undefined }) + '\n', { mode: 0o600 });
  } finally { rmdirSync(lock); }
  try {
    let response;
    if (process.env.QUALITY_OFFLINE) {
      if (process.env.QUALITY_OFFLINE === 'unavailable') response = new Response('{}', { status: 503 });
      else response = new Response(JSON.stringify({ model: 'jev-latest',
        answers: Object.fromEntries(Object.keys(parsed?.questions ?? {}).map(key => [key, { type: 'noul', noul: (process.env.QUALITY_OFFLINE === 'finding' || (process.env.QUALITY_OFFLINE === 'finding-first' && records(log).filter(x => x.kind === 'request').length === 1)) ? 0.99 : 0.01 }])),
        usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
    } else response = await original(...args);
    let result; try { result = await response.clone().json(); } catch {}
    const answers = Object.fromEntries(Object.entries(result?.answers ?? {}).map(([key, value]) => {
      const p = value?.noul ?? value?.probability;
      return [key.replaceAll('-', '_'), typeof p === 'number' ? { finding: p >= 0.7, band: p >= 0.7 ? 'finding' : p < 0.3 ? 'clear' : 'middle' } : { unrecognized: true }];
    }));
    appendFileSync(log, JSON.stringify({ ...base, kind: 'response', status: response.status,
      durationMs: Date.now() - at, answers, usage: result?.usage ? {
        input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens } : null }) + '\n');
    return response;
  } catch {
    appendFileSync(log, JSON.stringify({ ...base, kind: 'transport-error', durationMs: Date.now() - at }) + '\n');
    throw new Error('Quality provider transport failed');
  }
};
