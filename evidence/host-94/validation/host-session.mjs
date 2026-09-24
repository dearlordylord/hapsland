// Opt-in real-model #94 probe. Run one host/scenario at a time after login.
// Raw host output and native events live in memory or a deleted temporary repo only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { configuredRules } from '../../../src/policy/rules.ts';
import { nativeEditEvents, reactionEvidence } from './reaction-events.mjs';

const [host, scenario] = process.argv.slice(2);
assert.ok(['claude', 'opencode'].includes(host) && ['control', 'finding', 'stale', 'timeout', 'failure'].includes(scenario),
  'usage: node host-session.mjs claude|opencode control|finding|stale|timeout|failure');
assert.ok(process.argv.includes('--auth-confirmed'), 'authenticated run requires explicit --auth-confirmed');
const project = resolve(import.meta.dirname, '../../..');
const cli = join(project, 'src/cli.ts');
const root = mkdtempSync(join(tmpdir(), `hapsland-94-session-${host}-`));
const repo = join(root, 'repo');
const trace = join(root, 'trace.jsonl');
const source = join(repo, 'order-count.ts');
const statePath = join(root, 'consent');
const bridge = join(root, 'bridge.mjs');
const salt = randomUUID();
const maxSessionMs = 90_000;
const expectedVersion = host === 'claude' ? '2.1.218' : '1.14.44';
const evidence = { schemaVersion: 1, host, hostVersion: expectedVersion, scenario,
  mode: host === 'claude' ? 'headless-print' : 'headless-run', controlledOfflineBackend: true,
  normalHostProviderAndModel: true, sessionLimit: 1, hostCallLimit: 1, sessionCeilingMs: maxSessionMs,
  rawHostOutputRetained: false, nativePayloadRetained: false, credentialRetained: false };
const callCli = (operation, digest) => {
  const result = spawnSync(process.execPath, [cli, `--${operation}`], {
    cwd: project, env: { ...process.env, REVIEW_STATE_PATH: statePath },
    input: JSON.stringify({ version: 1, operation, cwd: repo, ...(digest ? { proposalDigest: digest } : {}) }),
    encoding: 'utf8', timeout: 8_000, maxBuffer: 262_144,
  });
  assert.equal(result.status, 0, `${operation} failed (output withheld)`);
  return JSON.parse(result.stdout);
};
const controlled = scenario === 'timeout' ? { delayMs: 10_000 } : scenario === 'stale' ? { delayMs: 2_000 } :
  scenario === 'failure' ? { failure: 'synthetic backend unavailable' } : {};
const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, 'resident'),
  REVIEW_CONTROL_JSON: JSON.stringify({ ...controlled, answers: Object.fromEntries(configuredRules.map(rule => [
    rule.id, { _tag: 'Probability', probability: scenario !== 'control' && rule.id === 'r6_bare_domain_value' ? 0.9 : 0 },
  ])) }), HAPSLAND_94_CLI: cli, HAPSLAND_94_TRACE: trace, HAPSLAND_94_SALT: salt };
const prompt = 'Use a native file edit or write tool to create order-count.ts with exactly one line: type OrderCount = number. Then stop unless a Hapsland review finding tells you to repair it. If such a finding arrives, use a native edit tool to change number to string, then finish. Do not use shell commands and do not repair proactively.';

try {
  const version = spawnSync(host, ['--version'], { encoding: 'utf8', timeout: 2_000 });
  assert.equal(version.status, 0);
  assert.ok(host === 'claude' ? version.stdout.trim().startsWith(expectedVersion) : version.stdout.trim() === expectedVersion);
  mkdirSync(repo);
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  const preview = callCli('enable');
  assert.equal(preview.status, 'preview');
  assert.equal(callCli('enable-confirm', preview.proposal.digest).status, 'enabled');

  writeFileSync(bridge, `import { spawnSync } from 'node:child_process';\n` +
    `import { createHash } from 'node:crypto';\n` +
    `import { appendFileSync } from 'node:fs';\n` +
    `const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);\n` +
    `let native={}; try{native=JSON.parse(Buffer.concat(chunks).toString());}catch{}\n` +
    `const id=process.argv[2]==='claude'?native.tool_use_id:native.input?.callID;\n` +
    `const tool=process.argv[2]==='claude'?native.tool_name:native.input?.tool;\n` +
    `const key=typeof id==='string'?createHash('sha256').update(process.env.HAPSLAND_94_SALT+':'+id).digest('hex'):null;\n` +
    `const start=Date.now(); const result=spawnSync(process.execPath,[process.env.HAPSLAND_94_CLI,'--'+process.argv[2]+'-hook','--controlled','--controlled-writer'],` +
    `{input:Buffer.concat(chunks),encoding:'utf8',env:process.env,timeout:4400,maxBuffer:262144});\n` +
    `const body=result.status===0?result.stdout:''; let submitted=false;\n` +
    `try { const value=JSON.parse(body); submitted=Boolean(value?.hookSpecificOutput?.additionalContext); } catch { submitted=Boolean(body.trim()); }\n` +
    `appendFileSync(process.env.HAPSLAND_94_TRACE,JSON.stringify({key,tool,submitted,elapsedMs:Date.now()-start,` +
    `finishedAtMs:Date.now()-Number(process.env.HAPSLAND_94_LAUNCH_AT),ok:result.status===0})+'\\n');\n` +
    `if(result.status===0) process.stdout.write(body);\n`, { mode: 0o700 });
  if (host === 'claude') {
    mkdirSync(join(repo, '.claude'));
    writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ hooks: { PostToolUse: [{
      matcher: 'Edit|Write', hooks: [{ type: 'command', command: `${process.execPath} ${bridge} claude`, timeout: 5 }],
    }] } }));
  } else {
    mkdirSync(join(repo, '.opencode', 'plugins'), { recursive: true });
    writeFileSync(join(repo, '.opencode', 'plugins', 'hapsland-validation.mjs'),
      `import {spawnSync} from 'node:child_process';\n` +
      `export const HapslandValidation=async({directory})=>({'tool.execute.after':async(input,output)=>{` +
      `if(!['edit','write'].includes(input?.tool))return;` +
      `const result=spawnSync(${JSON.stringify(process.execPath)},[${JSON.stringify(bridge)},'opencode'],` +
      `{input:JSON.stringify({input,output,cwd:directory}),encoding:'utf8',env:process.env,timeout:4500,maxBuffer:262144});` +
      `if(result.status===0&&result.stdout.trim())output.output+='\\n\\n'+result.stdout.trim();` +
      `}});\n`);
  }

  const args = host === 'claude'
    ? ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
      '--allowedTools', 'Read,Edit,Write', '--permission-mode', 'acceptEdits', prompt]
    : ['run', '--format', 'json', '--dangerously-skip-permissions', prompt];
  const started = Date.now();
  env.HAPSLAND_94_LAUNCH_AT = String(started);
  const child = spawn(host, args, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdoutBytes = 0; let stderrBytes = 0; let exceededOutput = false; let timedOut = false;
  let incompleteLine = '';
  const nativeEvents = [];
  const consume = line => {
    for (const event of nativeEditEvents(host, line, Date.now() - started, salt)) nativeEvents.push(event);
  };
  child.stdout.on('data', chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > 2_000_000) { exceededOutput = true; child.kill('SIGTERM'); return; }
    incompleteLine += chunk.toString();
    let boundary;
    while ((boundary = incompleteLine.indexOf('\n')) >= 0) {
      consume(incompleteLine.slice(0, boundary));
      incompleteLine = incompleteLine.slice(boundary + 1);
    }
  });
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
  let staleMutation = false;
  const poll = scenario === 'stale' ? setInterval(() => {
    if (staleMutation || !existsSync(source)) return;
    try { if (readFileSync(source, 'utf8').includes('type OrderCount = number')) {
      writeFileSync(source, 'type OrderCount = string\n'); staleMutation = true;
    } } catch { /* host may have an in-progress write */ }
  }, 10) : undefined;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, maxSessionMs);
  const exit = await new Promise(resolveExit => child.on('close', (code, signal) => resolveExit({ code, signal })));
  clearTimeout(timer); if (poll) clearInterval(poll);
  if (incompleteLine) consume(incompleteLine);
  const final = existsSync(source) ? readFileSync(source, 'utf8') : '';
  const events = existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)) : [];
  evidence.hostExitCode = exit.code;
  evidence.hostTerminatedBySignal = Boolean(exit.signal);
  evidence.elapsedMs = Date.now() - started;
  evidence.hostTimedOut = timedOut;
  evidence.outputCeilingExceeded = exceededOutput;
  evidence.hostStdoutBytes = stdoutBytes;
  evidence.hostStderrBytes = stderrBytes;
  evidence.nativeDirectHookCalls = events.length;
  evidence.nativeModelEditEvents = new Set(nativeEvents.map(x => x.key)).size;
  evidence.hostSubmissions = events.filter(x => x.submitted).length;
  evidence.hookDurationMs = events.map(x => x.elapsedMs);
  evidence.completedSyntheticEdit = final.includes('type OrderCount = number') || final.includes('type OrderCount = string');
  evidence.finalRepairObserved = final.includes('type OrderCount = string');
  evidence.externalStaleMutation = staleMutation;
  evidence.modelReaction = reactionEvidence({ host, nativeEvents, hookEvents: events,
    finalRepairObserved: evidence.finalRepairObserved, externalStaleMutation: staleMutation, scenario });
  evidence.controlNoAdviceAndNoRepair = scenario === 'control'
    ? evidence.completedSyntheticEdit && evidence.hostSubmissions === 0 && !evidence.finalRepairObserved : null;
  evidence.adviceAfterStaleMutation = scenario === 'stale' ? evidence.hostSubmissions > 0 : null;
  evidence.hostOutputParsedForSourceFreeSignalsOnly = true;
  evidence.status = timedOut || exceededOutput ? 'incomplete' : 'recorded';
} catch (cause) {
  evidence.status = 'incomplete';
  evidence.failure = cause instanceof Error ? cause.message.replaceAll(root, '<fixture>') : 'unknown';
  process.exitCode = 1;
} finally {
  try {
    const owner = JSON.parse(readFileSync(join(root, 'resident', 'owner.json'), 'utf8'));
    if (Number.isInteger(owner.pid)) process.kill(owner.pid, 'SIGTERM');
  } catch { /* no resident owner */ }
  rmSync(root, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
