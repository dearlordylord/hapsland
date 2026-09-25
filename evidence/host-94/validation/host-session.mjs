// Opt-in real-model #94 probe. Run one host/scenario at a time after login.
// Raw host output and native events live in memory or a deleted temporary repo only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuredRules } from '../../../src/policy/rules.ts';
import { HOST_VERSIONS, createClaudeStreamDiagnostics, hostFailureAcceptance, manageChildProcess, matchesKnownHostVersion } from './host-session-helpers.mjs';
import { nativeEditEvents, reactionEvidence } from './reaction-events.mjs';
import { readPassLedger, claimPassStart, finishPass } from './pass-ledger.mjs';
import { initializeRestartScratch, restartScratchDirectory, verifyRestartScratch } from './restart-scratch.mjs';

const [host, scenario] = process.argv.slice(2);
assert.ok(['claude', 'opencode'].includes(host) &&
  ['control', 'finding', 'stale', 'timeout', 'failure', 'host-failure', 'restart-old', 'restart-new'].includes(scenario),
  'usage: node host-session.mjs claude|opencode control|finding|stale|timeout|failure|host-failure|restart-old|restart-new');
const offlineScripted = process.argv.includes('--offline-scripted');
const blockTrial = process.argv.includes('--claude-block-trial');
const blockStageB = process.argv.includes('--claude-block-stage-b');
assert.ok(!(blockTrial && blockStageB), 'select one Claude block pass');
assert.ok(offlineScripted !== process.argv.includes('--auth-confirmed'),
  'select exactly one of --offline-scripted or --auth-confirmed');
assert.ok(!blockTrial || (host === 'claude' && ['control', 'finding'].includes(scenario)),
  'Claude block trial permits only control then finding');
assert.ok(!blockStageB || (host === 'claude' &&
  ['stale', 'timeout', 'failure', 'host-failure', 'restart-old', 'restart-new'].includes(scenario)),
  'Claude block Stage B permits only its six bounded scenarios');
assert.ok(offlineScripted || host !== 'claude' || blockTrial || blockStageB,
  'authenticated Claude requires an explicit block pass gate');
const blockMode = blockTrial || blockStageB;
const admissionTraceFault = offlineScripted && blockStageB
  ? process.env.HAPSLAND_94_FAKE_ADMISSION_TRACE_MODE : undefined;
assert.ok(admissionTraceFault === undefined || ['missing', 'wrong', 'duplicate'].includes(admissionTraceFault),
  'unknown offline admission trace fault');
const ledgerDirectory = process.env.HAPSLAND_94_PASS_LEDGER;
assert.ok(ledgerDirectory, 'an initialized HAPSLAND_94_PASS_LEDGER is required');
const project = resolve(import.meta.dirname, '../../..');
const cli = join(project, 'dist/cli.js');
const assertFreshProductionBuild = () => {
  const artifacts = [cli, join(project, 'dist/resident/main.js')];
  assert.ok(artifacts.every(existsSync), 'production CLI artifacts missing; run npm run build before this pass');
  const builtAt = Math.min(...artifacts.map(path => statSync(path).mtimeMs));
  const sources = [join(project, 'package.json'), join(project, 'bun.lock'),
    join(project, 'tsconfig.json'), join(project, 'tsconfig.build.json')];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.ts')) sources.push(path);
    }
  };
  visit(join(project, 'src'));
  assert.ok(sources.every(path => statSync(path).mtimeMs <= builtAt),
    'production CLI artifacts stale; run npm run build before this pass');
};
const restartOld = scenario === 'restart-old';
const restartNew = scenario === 'restart-new';
const timingRoot = offlineScripted ? process.env.HAPSLAND_94_TIMING_SESSION_ROOT : undefined;
const root = timingRoot ?? (restartOld || restartNew
  ? restartScratchDirectory(ledgerDirectory)
  : mkdtempSync(join(tmpdir(), `hapsland-94-session-${host}-`)));
if (timingRoot !== undefined) mkdirSync(root, { recursive: true, mode: 0o700 });
const repo = join(root, 'repo');
const trace = join(root, 'trace.jsonl');
const source = join(repo, 'order-count.ts');
const initialSource = 'type OrderCount = number';
const repairedSource = 'type OrderCount = number & { readonly __brand: "OrderCount" }';
const exactLine = (content, line) => content === line || content === `${line}\n` || content === `${line}\r\n`;
const statePath = join(root, 'consent');
const userConfigPath = join(root, 'user-config.jsonc');
const bridge = join(root, 'bridge.mjs');
const saltPath = join(root, 'correlation-salt');
const checkpointPath = join(root, 'restart-checkpoint.json');
const outcomePath = join(root, 'outcome.jsonl');
const admissionTracePath = join(root, 'admission.jsonl');
const capturePath = join(root, 'backend-calls.txt');
let salt = randomUUID();
const maxSessionMs = 90_000;
const expectedVersion = HOST_VERSIONS[host];
const executable = offlineScripted
  ? process.env.HAPSLAND_94_SCRIPTED_EXECUTABLE
  : host === 'claude'
  ? (process.env.HAPSLAND_94_CLAUDE_EXECUTABLE ?? '/home/node/.local/share/claude/versions/2.1.218')
  : 'opencode';
assert.ok(executable, 'offline scripted executable is required');
const evidence = { schemaVersion: 1, host, hostVersion: expectedVersion, scenario,
  ...(blockMode ? { claudeFeedbackMode: 'block-current-findings', trial: blockStageB ? 'claude-block-stage-b' : 'claude-block' } : {}),
  mode: host === 'claude' ? 'headless-print' : 'headless-run', controlledOfflineBackend: true,
  platform: platform(), timestampSource: 'runner-wall-clock-relative-to-host-spawn',
  timestampBoundary: 'native-event-stdout-observed-to-bridge-hook-finish',
  normalHostProviderAndModel: !offlineScripted, sessionLimit: 1, hostCallLimit: 1, sessionCeilingMs: maxSessionMs,
  rawHostOutputRetained: false, nativePayloadRetained: false, credentialRetained: false };
const callCli = (operation, digest) => {
  const result = spawnSync(process.execPath, [cli, `--${operation}`], {
    cwd: project, env: { ...process.env, REVIEW_STATE_PATH: statePath,
      ...(blockMode ? { REVIEW_USER_CONFIG_PATH: userConfigPath } : {}) },
    input: JSON.stringify({ version: 1, operation, cwd: repo, ...(digest ? { proposalDigest: digest } : {}) }),
    encoding: 'utf8', timeout: 8_000, maxBuffer: 262_144,
  });
  assert.equal(result.status, 0, `${operation} failed (output withheld)`);
  return JSON.parse(result.stdout);
};
const controlled = scenario === 'timeout' ? { delayMs: 10_000 } : scenario === 'stale' ? { delayMs: 2_000 } :
  scenario === 'failure' ? { failure: 'synthetic backend unavailable' } : {};
const env = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_RESIDENT_DIR: join(root, 'resident'),
  ...(blockMode ? { REVIEW_USER_CONFIG_PATH: userConfigPath } : {}),
  REVIEW_CONTROL_JSON: JSON.stringify({ ...controlled, outcomePath, capturePath,
    ...(blockMode ? { syntheticR6BrandedRepair: scenario === 'control' || (blockStageB && restartNew) ? 'control' : 'finding' } : { answers: Object.fromEntries(configuredRules.map(rule => [
      rule.id, { _tag: 'Probability', probability: scenario !== 'control' && rule.id === 'r6_bare_domain_value' ? 0.9 : 0 },
    ])) }) }),
  HAPSLAND_94_CLI: offlineScripted && process.env.HAPSLAND_94_SCRIPTED_CLI
    ? process.env.HAPSLAND_94_SCRIPTED_CLI : cli,
  HAPSLAND_94_TRACE: trace, HAPSLAND_94_SALT: salt,
  ...(offlineScripted ? { HAPSLAND_94_FAKE_SESSION: scenario } : {}),
  ...(offlineScripted && blockMode ? { HAPSLAND_94_FAKE_BRANDED_REPAIR: '1' } : {}),
  REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: join(root, 'admitted'),
  REVIEW_RESIDENT_ADMISSION_TRACE_PATH: admissionTracePath,
  ...(scenario === 'stale' || scenario === 'host-failure' || restartOld || restartNew ? {
    REVIEW_RESIDENT_BACKEND_GATE_PATH: join(root, 'backend-gate'),
  } : {}) };
const prompt = `Use a native file edit or write tool to create order-count.ts with exactly one line: ${initialSource}. Then stop unless a Hapsland review finding tells you to repair it. If such a finding arrives, use a native edit tool to replace the entire line with exactly: ${repairedSource}. Then finish. Do not use shell commands and do not repair proactively.`;
let hostLifecycle;
let sessionTimer;
let poll;
let ledgerStart;
let admissionObserved = false;
let rootOwned = !restartOld && !restartNew;
let failureCategory = 'runner-exception';

const checkStage = entries => {
  const prior = entries.filter(entry => entry.host === host);
  assert.ok(!prior.some(entry => !entry.finish || entry.finish.status !== 'recorded'),
    'a prior host scenario did not pass; stop this host pass');
  if (blockStageB) {
    assert.ok(entries.every(entry => entry.host === 'claude'),
      'Claude Stage B ledger contains another host');
    const order = ['stale', 'timeout', 'failure'].includes(scenario)
      ? ['stale', 'timeout', 'failure']
      : scenario === 'host-failure' ? ['host-failure'] : ['restart-old', 'restart-new'];
    assert.deepEqual(prior.map(entry => entry.scenario), order.slice(0, order.indexOf(scenario)),
      'Claude Stage B needs a fresh ordered ledger for this pass');
    return;
  }
  if (blockTrial) assert.deepEqual(prior.map(entry => entry.scenario),
    scenario === 'control' ? [] : ['control'],
    'Claude block trial requires a fresh ledger and at most two sequential sessions');
  assert.ok(!prior.some(entry => entry.scenario === scenario), 'scenario already consumed for this host');
  if (scenario === 'control') assert.equal(prior.length, 0, 'control must be first');
  else if (scenario === 'finding') assert.ok(prior.some(entry => entry.scenario === 'control'),
    'a passing control is required before finding');
  else assert.ok(prior.some(entry => entry.scenario === 'control') &&
    prior.some(entry => entry.scenario === 'finding'), 'Stage A must pass before Stage B');
  if (restartNew) assert.ok(prior.some(entry => entry.scenario === 'restart-old'),
    'restart-new requires passing restart-old');
};

try {
  failureCategory = 'stale-build';
  assertFreshProductionBuild();
  failureCategory = 'blocked-stage-b-admission';
  assert.ok(offlineScripted || blockStageB || (scenario !== 'stale' && scenario !== 'host-failure'),
    'real-host stale and host-failure require an exact source-free admission alias');
  failureCategory = 'runner-exception';
  if (blockStageB) {
    const manifest = JSON.parse(readFileSync(join(ledgerDirectory, 'manifest.json'), 'utf8'));
    const expectedPurpose = ['stale', 'timeout', 'failure'].includes(scenario)
      ? 'claude-block-stage-b-core' : scenario === 'host-failure'
        ? 'claude-block-stage-b-host-failure' : 'claude-block-stage-b-restart';
    assert.equal(manifest.purpose, expectedPurpose, 'fresh scenario-specific Stage B ledger required');
  }
  checkStage(readPassLedger(ledgerDirectory));
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 2_000 });
  assert.equal(version.status, 0);
  assert.ok(matchesKnownHostVersion(host, version.stdout));
  if (!offlineScripted) {
    const auth = spawnSync(executable, host === 'claude' ? ['auth', 'status', '--json'] : ['auth', 'list'],
      { encoding: 'utf8', timeout: 5_000, maxBuffer: 64_000 });
    let ready = false;
    if (auth.status === 0 && host === 'claude') {
      try { ready = JSON.parse(auth.stdout).loggedIn === true; } catch { /* fail closed */ }
    } else if (auth.status === 0) {
      const count = auth.stdout.match(/\b(\d+) credentials\b/);
      ready = count !== null && Number(count[1]) > 0;
    }
    assert.ok(ready, 'selected exact host profile is not authenticated');
  }
  if (restartOld) {
    assert.equal(initializeRestartScratch(ledgerDirectory), root);
    rootOwned = true;
    writeFileSync(saltPath, salt, { mode: 0o600 });
  }
  if (restartNew) {
    assert.equal(verifyRestartScratch(ledgerDirectory), root);
    assert.ok(existsSync(checkpointPath), 'restart-old checkpoint missing');
    assert.ok(!existsSync(outcomePath), 'old backend completed before restart-new');
    salt = readFileSync(saltPath, 'utf8');
    env.HAPSLAND_94_SALT = salt;
    rootOwned = true;
    rmSync(source, { force: true });
    rmSync(trace, { force: true });
    rmSync(admissionTracePath, { force: true });
    rmSync(capturePath, { force: true });
    rmSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH, { force: true });
    writeFileSync(env.REVIEW_RESIDENT_BACKEND_GATE_PATH, 'open\n');
  } else {
    mkdirSync(repo);
    assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
    if (blockMode) writeFileSync(userConfigPath,
      '{"version":1,"claudeFeedbackMode":"block-current-findings"}\n', { mode: 0o600 });
    const preview = callCli('enable');
    assert.equal(preview.status, 'preview');
    assert.equal(callCli('enable-confirm', preview.proposal.digest).status, 'enabled');
  }

  writeFileSync(bridge, `import { spawnSync } from 'node:child_process';\n` +
    `import { createHash } from 'node:crypto';\n` +
    `import { appendFileSync } from 'node:fs';\n` +
    `import { classifyHookResult } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'handoff-classification.mjs')).href)};\n` +
    `const chunks=[]; for await (const chunk of process.stdin) chunks.push(chunk);\n` +
    `let native={}; try{native=JSON.parse(Buffer.concat(chunks).toString());}catch{}\n` +
    `const id=process.argv[2]==='claude'?native.tool_use_id:native.input?.callID;\n` +
    `const tool=process.argv[2]==='claude'?native.tool_name:native.input?.tool;\n` +
    `const session=process.argv[2]==='claude'?native.session_id:native.input?.sessionID;\n` +
    `const key=typeof id==='string'?createHash('sha256').update(process.env.HAPSLAND_94_SALT+':'+id).digest('hex'):null;\n` +
    `const sessionKey=typeof session==='string'?createHash('sha256').update(process.env.HAPSLAND_94_SALT+':'+session).digest('hex'):null;\n` +
    `appendFileSync(process.env.HAPSLAND_94_TRACE,JSON.stringify({phase:'start',key,sessionKey,tool})+'\\n');\n` +
    `const start=Date.now(); const result=spawnSync(process.execPath,[process.env.HAPSLAND_94_CLI,'--'+process.argv[2]+'-hook','--controlled-reviewer','--controlled-writer'],` +
    `{input:Buffer.concat(chunks),encoding:'utf8',env:process.env,timeout:4400,maxBuffer:262144});\n` +
    `const body=result.status===0?result.stdout:'';\n` +
    `const {findingSubmitted,noticeSubmitted,blockFindingSubmitted}=classifyHookResult({host:process.argv[2],status:result.status,stdout:body});\n` +
    `const handoffNonempty=Boolean(body.trim())&&(process.argv[2]==='opencode'||body.trim()!=='{}');\n` +
    `const submitted=handoffNonempty||findingSubmitted||noticeSubmitted;\n` +
    `appendFileSync(process.env.HAPSLAND_94_TRACE,JSON.stringify({phase:'finish',key,sessionKey,tool,submitted,findingSubmitted,blockFindingSubmitted,noticeSubmitted,` +
    `unclassifiedSubmitted:submitted&&!findingSubmitted&&!noticeSubmitted,elapsedMs:Date.now()-start,` +
    `finishedAtMs:Date.now()-Number(process.env.HAPSLAND_94_LAUNCH_AT),ok:result.status===0})+'\\n');\n` +
    `if(result.status===0) process.stdout.write(body);\n`, { mode: 0o700 });
  if (host === 'claude') {
    mkdirSync(join(repo, '.claude'), { recursive: true });
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
  if (process.env.HAPSLAND_94_TIMING_LOG) evidence.timingHostLaunchEpochMs = started;
  env.HAPSLAND_94_LAUNCH_AT = String(started);
  ledgerStart = claimPassStart(ledgerDirectory, { host, scenario });
  const child = spawn(executable, args, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const outputCeilingBytes = 2_000_000;
  let stdoutBytes = 0; let stderrBytes = 0; let exceededOutput = false; let timedOut = false;
  let incompleteLine = '';
  const nativeEvents = [];
  const claudeStreamDiagnostics = host === 'claude' ? createClaudeStreamDiagnostics() : null;
  const consume = line => {
    const observedAtMs = offlineScripted && env.HAPSLAND_94_FAKE_MISSING_TIMESTAMP === '1'
      ? null : Date.now() - started;
    claudeStreamDiagnostics?.observe(line, observedAtMs);
    const parsed = nativeEditEvents(host, line, observedAtMs, salt);
    if (blockMode) {
      let message;
      try { message = JSON.parse(line); } catch { message = null; }
      const parts = message?.type === 'assistant' && Array.isArray(message?.message?.content)
        ? message.message.content : [];
      for (const event of parsed) {
        const part = parts.find(part => part?.type === 'tool_use' &&
          typeof part.id === 'string' &&
          createHash('sha256').update(`${salt}:${part.id}`).digest('hex') === event.key);
        const initial = part?.name === 'Write' && exactLine(part.input?.content, initialSource);
        const repaired = part?.name === 'Edit'
          ? part.input?.old_string === initialSource && part.input?.new_string === repairedSource
          : part?.name === 'Write' && exactLine(part.input?.content, repairedSource);
        nativeEvents.push({ ...event, initialInput: Boolean(initial), repairInput: Boolean(repaired) });
      }
    } else nativeEvents.push(...parsed);
  };
  child.stdout.on('data', chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes + stderrBytes > outputCeilingBytes) {
      exceededOutput = true;
      hostLifecycle?.terminate('output-cap');
      return;
    }
    incompleteLine += chunk.toString();
    let boundary;
    while ((boundary = incompleteLine.indexOf('\n')) >= 0) {
      consume(incompleteLine.slice(0, boundary));
      incompleteLine = incompleteLine.slice(boundary + 1);
    }
  });
  child.stderr.on('data', chunk => {
    stderrBytes += chunk.length;
    if (stdoutBytes + stderrBytes > outputCeilingBytes) {
      exceededOutput = true;
      hostLifecycle?.terminate('output-cap');
    }
  });
  const traceEvents = () => {
    try { return readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch { return []; }
  };
  const admissionEvents = () => {
    try {
      const records = readFileSync(admissionTracePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      if (admissionTraceFault === 'missing') return [];
      if (admissionTraceFault === 'wrong') return records.map(item => ({ ...item, key: '0'.repeat(64) }));
      if (admissionTraceFault === 'duplicate') return records.flatMap(item => [item, item]);
      return records;
    }
    catch { return []; }
  };
  const matchedAdmission = () => {
    if (!existsSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH)) return false;
    const trace = traceEvents();
    const starts = trace.filter(item => item.phase === 'start');
    const admissions = admissionEvents();
    if (starts.length !== 1 || admissions.length !== 1 || trace.some(item => item.phase === 'finish') || nativeEvents.length !== 1) return false;
    return Boolean(starts[0].key && starts[0].key === nativeEvents[0].key &&
      starts[0].tool === nativeEvents[0].tool && nativeEvents[0].initialInput &&
      starts[0].key === admissions[0].key && starts[0].sessionKey === admissions[0].sessionKey);
  };
  let staleMutation = false;
  let staleGateReleased = false;
  let hostFailureTriggered = false;
  poll = scenario === 'stale' || scenario === 'host-failure' ? setInterval(() => {
    if ((staleMutation || hostFailureTriggered) ||
      !existsSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH) || !existsSync(source)) return;
    admissionObserved = true;
    if (!matchedAdmission()) return;
    try { if (readFileSync(source, 'utf8').includes('type OrderCount = number')) {
      if (scenario === 'stale') {
        if (blockStageB && !staleGateReleased) {
          staleGateReleased = true;
          writeFileSync(env.REVIEW_RESIDENT_BACKEND_GATE_PATH, 'open\n');
          return;
        }
        if (blockStageB && !existsSync(capturePath)) return;
        writeFileSync(source, 'export const ready = true\n');
        staleMutation = true;
        if (!blockStageB) writeFileSync(env.REVIEW_RESIDENT_BACKEND_GATE_PATH, 'open\n');
      } else {
        hostFailureTriggered = true;
        hostLifecycle?.terminate('host-failure');
      }
    } } catch { /* host may have an in-progress write */ }
  }, 10) : undefined;
  hostLifecycle = manageChildProcess(child);
  sessionTimer = setTimeout(() => { timedOut = true; hostLifecycle.terminate('session-timeout'); }, maxSessionMs);
  const exit = await hostLifecycle.closed;
  if (exit.error) throw exit.error;
  if (incompleteLine) consume(incompleteLine);
  const final = existsSync(source) ? readFileSync(source, 'utf8') : '';
  const allTraceEvents = traceEvents();
  const allAdmissions = admissionEvents();
  const events = allTraceEvents.filter(item => item.phase === 'finish');
  const initialNative = nativeEvents.filter(item => item.initialInput && item.key && item.tool &&
    Number.isFinite(item.observedAtMs) && item.observedAtMs >= 0);
  const candidateInitialHooks = initialNative.length === 1 ? events.filter(item =>
    item.key === initialNative[0].key && item.tool === initialNative[0].tool) : [];
  const initialHookComplete = candidateInitialHooks.length === 1 &&
    candidateInitialHooks[0].ok === true && Number.isFinite(candidateInitialHooks[0].finishedAtMs) &&
    candidateInitialHooks[0].finishedAtMs >= 0;
  const initialHooks = initialHookComplete ? candidateInitialHooks : [];
  const initialCallComplete = initialNative.length === 1 && initialHookComplete;
  const initialAdmissionMatched = initialCallComplete && allAdmissions.filter(item =>
    item.key === initialNative[0].key && item.sessionKey === initialHooks[0].sessionKey).length === 1;
  const backendCalls = existsSync(capturePath)
    ? readFileSync(capturePath, 'utf8').split('\n').filter(Boolean) : [];
  const reviewOutcomes = (() => {
    try { return readFileSync(outcomePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch { return []; }
  })();
  const initialOutcomes = initialCallComplete ? reviewOutcomes.filter(item =>
    typeof item.toolUseId === 'string' &&
    createHash('sha256').update(`${salt}:${item.toolUseId}`).digest('hex') === initialNative[0].key &&
    typeof item.sessionId === 'string' &&
    createHash('sha256').update(`${salt}:${item.sessionId}`).digest('hex') === initialHooks[0].sessionKey &&
    ['completed-clear', 'completed-findings'].includes(item.outcome)) : [];
  const repairNative = blockTrial && scenario === 'finding' && initialCallComplete
    ? nativeEvents.filter(item => item.key !== initialNative[0].key && item.repairInput && item.key && item.tool &&
      Number.isFinite(item.observedAtMs) && item.observedAtMs >= 0) : [];
  const repairHooks = repairNative.length === 1 ? events.filter(item =>
    item.key === repairNative[0].key && item.tool === repairNative[0].tool && item.ok === true &&
    Number.isFinite(item.finishedAtMs) && item.finishedAtMs >= repairNative[0].observedAtMs) : [];
  const repairOutcomes = repairHooks.length === 1 ? reviewOutcomes.filter(item =>
    typeof item.toolUseId === 'string' &&
    createHash('sha256').update(`${salt}:${item.toolUseId}`).digest('hex') === repairNative[0].key &&
    typeof item.sessionId === 'string' &&
    createHash('sha256').update(`${salt}:${item.sessionId}`).digest('hex') === repairHooks[0].sessionKey &&
    item.outcome === 'completed-clear') : [];
  const initialSubmission = initialCallComplete && initialHooks[0].submitted ? initialHooks[0] : null;
  const submissionInterval = initialSubmission
    ? initialSubmission.finishedAtMs - initialNative[0].observedAtMs : null;
  evidence.hostExitCode = exit.code;
  evidence.hostExitSignal = exit.signal;
  evidence.hostTerminatedBySignal = Boolean(exit.signal);
  evidence.hostCloseForced = exit.forcedClose;
  evidence.runnerTerminationReason = hostLifecycle.termination.reason;
  evidence.runnerSigtermSent = hostLifecycle.termination.sigtermSent;
  evidence.runnerCloseAfterSigterm = hostLifecycle.termination.closeAfterSigterm;
  evidence.runnerSigkillAttempted = hostLifecycle.termination.sigkillAttempted;
  evidence.elapsedMs = Date.now() - started;
  evidence.hostTimedOut = timedOut;
  evidence.outputCeilingExceeded = exceededOutput;
  evidence.hostStdoutBytes = stdoutBytes;
  evidence.hostStderrBytes = stderrBytes;
  evidence.hostOutputBytes = stdoutBytes + stderrBytes;
  if (claudeStreamDiagnostics) evidence.claudeStreamDiagnostics = claudeStreamDiagnostics.snapshot();
  evidence.nativeDirectHookCalls = events.length;
  evidence.nativeModelEditEvents = new Set(nativeEvents.map(x => x.key)).size;
  evidence.initialNativeEditMatched = initialCallComplete;
  evidence.initialHookCallKeyMatched = candidateInitialHooks.length === 1;
  evidence.initialHookSucceeded = initialHookComplete;
  evidence.initialNativeEditObservedAtMs = initialCallComplete ? initialNative[0].observedAtMs : null;
  evidence.initialHookFinishedAtMs = initialCallComplete ? initialHooks[0].finishedAtMs : null;
  evidence.reviewAdmissionMarkerObserved = existsSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH);
  evidence.initialAdmissionMatched = initialAdmissionMatched;
  evidence.admissionTraceCount = allAdmissions.length;
  evidence.backendCallCount = backendCalls.length;
  if (process.env.HAPSLAND_94_TIMING_LOG) {
    evidence.admissionMarkerAtMs = evidence.reviewAdmissionMarkerObserved
      ? Math.round(statSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH).mtimeMs - started) : null;
    evidence.reviewOutcomeFileAtMs = existsSync(outcomePath)
      ? Math.round(statSync(outcomePath).mtimeMs - started) : null;
  }
  evidence.reviewAdmissionAttribution = initialAdmissionMatched
    ? 'hashed-session-and-tool-call' : evidence.reviewAdmissionMarkerObserved
      ? 'unattributed-global-marker' : 'not-observed';
  evidence.reviewCompletedOutcome = initialOutcomes.length === 1 ? initialOutcomes[0].outcome : 'not-observed';
  if (blockTrial && scenario === 'finding') {
    evidence.repairReviewCompletedClear = repairOutcomes.length === 1;
    evidence.reviewOutcomeCount = reviewOutcomes.length;
    evidence.repairNativeCount = repairNative.length;
    evidence.repairHookCount = repairHooks.length;
    evidence.repairOutcomeCount = repairOutcomes.length;
  }
  evidence.editObservedToSubmissionMs = Number.isFinite(submissionInterval) && submissionInterval >= 0
    ? submissionInterval : null;
  evidence.editToSubmissionIncludesHostOutputDelay = true;
  evidence.hostSubmissions = events.filter(x => x.submitted).length;
  evidence.findingSubmissions = events.filter(x => x.findingSubmitted).length;
  evidence.blockFindingSubmissions = events.filter(x => x.blockFindingSubmitted).length;
  evidence.operationalNoticeSubmissions = events.filter(x => x.noticeSubmitted).length;
  evidence.unclassifiedSubmissions = events.filter(x => x.unclassifiedSubmitted).length;
  evidence.hookDurationMs = events.map(x => x.elapsedMs);
  if (process.env.HAPSLAND_94_TIMING_LOG) {
    evidence.bridgeInnerReturnAtMs = events[0]?.finishedAtMs ?? null;
    evidence.bridgeInnerStartAtMs = events[0] === undefined
      ? null : events[0].finishedAtMs - events[0].elapsedMs;
  }
  evidence.completedSyntheticEdit = final.includes(initialSource) ||
    final.includes(blockTrial ? repairedSource : 'type OrderCount = string') ||
    (scenario === 'stale' && staleMutation && nativeEvents.some(item => item.initialInput) && events.length > 0);
  evidence.finalRepairObserved = final.includes(blockTrial ? repairedSource : 'type OrderCount = string');
  evidence.finalFileExact = scenario === 'control'
    ? exactLine(final, initialSource)
    : scenario === 'finding' ? exactLine(final, blockTrial ? repairedSource : 'type OrderCount = string') : null;
  evidence.externalStaleMutation = staleMutation;
  evidence.staleAdmissionObservedBeforeMutation = scenario === 'stale' ? admissionObserved && staleMutation : null;
  evidence.admissionMatchedInitialNativeCall = scenario === 'stale' || scenario === 'host-failure'
    ? Boolean(staleMutation || hostFailureTriggered) : null;
  evidence.exactAdmissionAttributionProven = scenario === 'stale' || scenario === 'host-failure'
    ? evidence.admissionMatchedInitialNativeCall : null;
  evidence.admissionAttributionLimit = scenario === 'stale' || scenario === 'host-failure'
    ? evidence.exactAdmissionAttributionProven ? 'hashed-session-and-tool-call' : 'unproven-admission' : null;
  evidence.hostFailureTriggeredAfterAdmission = scenario === 'host-failure'
    ? admissionObserved && hostFailureTriggered : null;
  if (restartOld || restartNew) {
    evidence.restartAdmissionObserved = existsSync(env.REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH);
    const sessionKey = events.find(x => x.sessionKey)?.sessionKey;
    if (restartOld) {
      evidence.restartOldOutcomeAbsent = !existsSync(outcomePath);
      evidence.restartOldSessionAttributionPresent = Boolean(sessionKey);
    } else {
      const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'));
      const outcomes = existsSync(outcomePath)
        ? readFileSync(outcomePath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
      evidence.restartNewRecipientDistinct = Boolean(sessionKey && sessionKey !== checkpoint.oldSessionKey);
      evidence.restartOutcomesOnlyNewRecipient = Boolean(sessionKey && outcomes.length > 0 &&
        outcomes.every(item => typeof item.sessionId === 'string' &&
          createHash('sha256').update(`${salt}:${item.sessionId}`).digest('hex') === sessionKey));
      evidence.restartNewFindingSubmitted = evidence.findingSubmissions > 0;
    }
  }
  evidence.modelReaction = reactionEvidence({ host, nativeEvents, hookEvents: events,
    finalRepairObserved: evidence.finalRepairObserved, externalStaleMutation: staleMutation, scenario });
  if (blockTrial && initialCallComplete && initialHooks[0].blockFindingSubmitted === true &&
      evidence.modelReaction.status === 'observed-native-repair-after-advice') {
    evidence.modelReaction.status = 'observed-native-repair-after-block';
  }
  evidence.noLaterEventOutcome = scenario === 'finding' || scenario === 'timeout'
    ? ['observed-native-repair-after-advice', 'observed-native-repair-after-block']
      .includes(evidence.modelReaction.status) ? 'observed-reaction'
      : evidence.findingSubmissions > 0 ? 'submitted-unreacted' : 'undelivered'
    : null;
  evidence.controlNoAdviceAndNoRepair = scenario === 'control'
    ? initialCallComplete && evidence.reviewAdmissionMarkerObserved &&
      evidence.reviewCompletedOutcome === 'completed-clear' && evidence.completedSyntheticEdit &&
      evidence.hostSubmissions === 0 && evidence.blockFindingSubmissions === 0 &&
      !evidence.finalRepairObserved &&
      (!blockTrial || (evidence.finalFileExact && nativeEvents.length === 1 && events.length === 1 &&
        reviewOutcomes.length === 1)) : null;
  const stageBBounded = !blockStageB || (backendCalls.length <= 1 &&
    allAdmissions.length === 1 && evidence.hostSubmissions <= 1 &&
    evidence.blockFindingSubmissions === 0 && evidence.findingSubmissions === 0 &&
    evidence.unclassifiedSubmissions === 0);
  evidence.adviceAfterStaleMutation = scenario === 'stale' ? evidence.findingSubmissions > 0 : null;
  evidence.hostOutputParsedForSourceFreeSignalsOnly = true;
  evidence.status = timedOut || exceededOutput || exit.forcedClose ? 'incomplete' : 'recorded';
  evidence.acceptanceStatus = scenario === 'host-failure'
    ? hostFailureAcceptance(evidence, { stageBBounded, backendCallCount: backendCalls.length })
      ? 'passed' : 'incomplete'
    : evidence.status !== 'recorded' || exit.code !== 0 || !evidence.completedSyntheticEdit ||
      !initialCallComplete || !evidence.reviewAdmissionMarkerObserved || !stageBBounded ||
      (blockStageB && !initialAdmissionMatched)
    ? 'incomplete'
    : scenario === 'control'
      ? evidence.controlNoAdviceAndNoRepair ? 'passed' : 'failed'
      : scenario === 'finding'
        ? evidence.reviewCompletedOutcome === 'completed-findings' && evidence.findingSubmissions === 1 &&
          (!blockTrial || (evidence.blockFindingSubmissions === 1 && evidence.hostSubmissions === 1 &&
            evidence.operationalNoticeSubmissions === 0 && nativeEvents.length === 2 &&
            events.length === 2 && evidence.nativeModelEditEvents === 2 &&
            reviewOutcomes.length === 2 && evidence.repairReviewCompletedClear &&
            evidence.finalFileExact)) &&
          evidence.modelReaction.status === (blockTrial
            ? 'observed-native-repair-after-block' : 'observed-native-repair-after-advice')
          && evidence.unclassifiedSubmissions === 0 ? 'passed' : 'failed'
        : scenario === 'stale'
          ? evidence.exactAdmissionAttributionProven && admissionObserved && staleMutation &&
            evidence.hostSubmissions === 0 && (!blockStageB || (backendCalls.length === 1 &&
              initialOutcomes.length === 1 && initialOutcomes[0].outcome === 'completed-findings'))
              ? 'passed' : 'incomplete'
          : restartOld
            ? evidence.restartAdmissionObserved && evidence.restartOldOutcomeAbsent &&
              evidence.restartOldSessionAttributionPresent && evidence.hostSubmissions === 0 &&
              (!blockStageB || backendCalls.length === 0) ? 'passed' : 'incomplete'
            : restartNew
              ? evidence.restartAdmissionObserved && evidence.restartNewRecipientDistinct &&
              evidence.restartOutcomesOnlyNewRecipient &&
                (blockStageB ? evidence.reviewCompletedOutcome === 'completed-clear' &&
                  evidence.hostSubmissions === 0 && backendCalls.length === 1
                  : evidence.restartNewFindingSubmitted) ? 'passed' : 'incomplete'
          : scenario === 'timeout'
            ? evidence.hostSubmissions === 0 && events.every(x => x.elapsedMs < 5_000) &&
              (!blockStageB || (backendCalls.length === 1 && reviewOutcomes.length === 0)) ? 'passed' : 'failed'
            : evidence.findingSubmissions === 0 && evidence.unclassifiedSubmissions === 0 &&
              evidence.operationalNoticeSubmissions <= 1 &&
              (!blockStageB || (backendCalls.length === 1 && reviewOutcomes.length === 0)) ? 'passed' : 'failed';
} catch {
  evidence.status = 'incomplete';
  evidence.acceptanceStatus = 'incomplete';
  evidence.failure = failureCategory;
  process.exitCode = 1;
} finally {
  if (sessionTimer) clearTimeout(sessionTimer);
  if (poll) clearInterval(poll);
  if (hostLifecycle && !hostLifecycle.settled) {
    hostLifecycle.terminate('cleanup');
    await hostLifecycle.closed;
  }
  if (evidence.hostFailureTriggeredAfterAdmission) {
    // The host is gone, but its already spawned bridge may still be unwinding
    // under the 4.4-second inner limit. Wait before deleting its fixture paths.
    await new Promise(resolve => setTimeout(resolve, 4_600));
  }
  let residentStopped = true;
  try { if (rootOwned) {
    const owner = JSON.parse(readFileSync(join(root, 'resident', 'owner.json'), 'utf8'));
    if (Number.isInteger(owner.pid)) {
      process.kill(owner.pid, 'SIGTERM');
      if (restartOld || restartNew) {
        for (let attempt = 0; attempt < 100 && existsSync(join(root, 'resident', 'owner.json')); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        residentStopped = !existsSync(join(root, 'resident', 'owner.json'));
      }
    }
  } } catch { /* no resident owner */ }
  if (restartOld) {
    evidence.restartResidentStopped = residentStopped;
    if (!residentStopped) evidence.acceptanceStatus = 'incomplete';
    if (evidence.acceptanceStatus === 'passed') {
      try {
        const oldSessionKey = readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean)
          .map(line => JSON.parse(line)).find(item => item.sessionKey)?.sessionKey;
        assert.ok(oldSessionKey, 'old recipient missing');
        writeFileSync(checkpointPath, JSON.stringify({ oldSessionKey, oldAdmissionObserved: true,
          oldOutcomeAbsent: true }), { mode: 0o600 });
        rmSync(source, { force: true });
      } catch { evidence.acceptanceStatus = 'incomplete'; }
    }
  }
  if (ledgerStart) {
    try {
      finishPass(ledgerDirectory, ledgerStart.sequence,
        evidence.acceptanceStatus === 'passed' ? 'recorded' : evidence.acceptanceStatus === 'failed' ? 'failed' : 'incomplete',
        Date.now() - ledgerStart.startedAt);
    } catch { evidence.status = 'incomplete'; evidence.acceptanceStatus = 'incomplete'; process.exitCode = 1; }
  }
  if (rootOwned && timingRoot === undefined && (!restartOld || evidence.acceptanceStatus !== 'passed'))
    rmSync(root, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
