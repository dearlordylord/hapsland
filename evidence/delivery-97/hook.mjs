import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dir = process.env.HAPSLAND_PROBE_DIR;
const mode = process.env.HAPSLAND_PROBE_MODE;
const input = JSON.parse(readFileSync(0, 'utf8'));
const event = input.hook_event_name;
const now = Date.now();
const record = (kind, fields = {}) => appendFileSync(`${dir}/events.jsonl`, `${JSON.stringify({kind, at: Date.now(), ...fields})}\n`);
const read = (name) => { try { return JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')); } catch { return undefined; } };
const write = (name, value) => writeFileSync(`${dir}/${name}`, JSON.stringify(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const recipient = `${input.session_id ?? ''}:${input.agent_id ?? 'root'}:${input.cwd ?? ''}`;

if (event === 'PostToolUse') {
  if (input.tool_name !== 'apply_patch') process.exit(0);
  const command = input.tool_input?.command;
  if (mode === 'baseline' && typeof command === 'string' && command.includes('note.ts')) {
    const work = read('work.json');
    if (work?.recipient === recipient && work.units.some((unit) => !unit.failure && Date.now() >= unit.readyAt) && !existsSync(`${dir}/delivered`)) {
      writeFileSync(`${dir}/delivered`, '1');
      record('host-submission', {units:1, surface:'subsequent-post-tool-use'});
      process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:'Synthetic review finding: change the value in synthetic.ts from BAD to GOOD before finishing.'}}));
    }
    process.exit(0);
  }
  if (typeof command !== 'string' || !command.includes('synthetic.ts') || !/^\+.*BAD/m.test(command)) process.exit(0);
  const unitCount = Number(process.env.HAPSLAND_PROBE_UNITS ?? '1');
  const delayMs = Number(process.env.HAPSLAND_PROBE_DELAY_MS ?? '0');
  const failure = process.env.HAPSLAND_PROBE_FAILURE === '1';
  const work = {recipient, admittedAt: now, units: Array.from({length: unitCount}, (_, i) => ({id: i + 1, readyAt: now + delayMs + i * 30, failure}))};
  write('work.json', work);
  record('edit-hook-entry', {recipientMatched: true, units: unitCount});
  record('review-admitted', {units: unitCount});
  if (mode === 'background') {
    await sleep(delayMs);
    record('backend-complete', {units: unitCount, failure});
    if (!failure) process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:'Synthetic review finding: change the value in synthetic.ts from BAD to GOOD before finishing.'}}));
  }
  record('edit-hook-return');
  process.exit(0);
}

if (event === 'Stop') {
  record('stop-entry', {stopHookActive: input.stop_hook_active === true});
  const start = Date.now();
  let matched;
  if (mode === 'bounded') {
    while (Date.now() - start < 4850) {
      const work = read('work.json');
      if (work?.recipient === recipient && work.units.some((unit) => !unit.failure && Date.now() >= unit.readyAt)) { matched = work; break; }
      if (work?.recipient !== recipient || input.stop_hook_active === true || work?.units.every((unit) => unit.failure)) break;
      await sleep(25);
    }
  } else if (mode !== 'baseline' && mode !== 'background') {
    const work = read('work.json');
    if (work?.recipient === recipient && work.units.some((unit) => !unit.failure && Date.now() >= unit.readyAt)) matched = work;
  }
  let currentBad = false;
  try { currentBad = readFileSync(`${input.cwd}/synthetic.ts`, 'utf8').includes('"BAD"'); } catch {}
  if (matched && currentBad && input.stop_hook_active !== true && !existsSync(`${dir}/delivered`)) {
    writeFileSync(`${dir}/delivered`, '1');
    record('host-submission', {units: matched.units.filter((unit) => !unit.failure && Date.now() >= unit.readyAt).length});
    process.stdout.write(JSON.stringify({decision:'block',reason:'Synthetic review finding: change the value in synthetic.ts from BAD to GOOD before finishing.'}));
  }
  record('stop-return', {elapsedMs: Date.now() - start, submitted: Boolean(matched && currentBad)});
  process.exit(0);
}

if (event === 'SessionEnd') record('session-end');
