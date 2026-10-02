import { spawn, spawnSync } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlledAnswers } from './controlled-rule-answers.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const project = resolve(here, '../..');
const codexBinary = process.env.HAPSLAND_DELIVERY_97_CODEX_BIN ?? 'codex';
const expectedVersion = process.env.HAPSLAND_DELIVERY_97_CODEX_VERSION ?? 'codex-cli 0.155.1';
const evidencePath = process.env.HAPSLAND_DELIVERY_97_EVIDENCE_FILE ??
  join(here, 'codex-0.155.1-luna-max-resident-2026-09-25.json');
const cli = join(project, 'src/cli.ts');
const stopHook = join(here, 'resident-stop-hook.mjs');
const wrapperSource = join(here, 'resident-stop-wrapper.c');
const commandTraceSource = join(here, 'command-trace-wrapper.c');
const sessionEndHook = join(here, 'resident-session-end-hook.mjs');
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const prompt = 'Use the native apply_patch tool to add order-count.ts containing exactly `type OrderCount = number` and a final newline. Then end the turn immediately. If a Hapsland review finding arrives, repair the type as requested with apply_patch and finish by saying REVIEW_REPAIRED. Do not repair it before receiving feedback.';
const cases = [
  { id: 'resident-ready', delayMs: 0 },
  { id: 'resident-during-stop', delayMs: 4000 },
  { id: 'resident-timeout-retained', delayMs: 12000, observeAfterSessionMs: 14000 },
  { id: 'resident-later-turn', delayMs: 12000, observeAfterSessionMs: 14000, postSessionResume: true },
  { id: 'resident-multi-unit', delayMs: 0 },
];
const multiUnitPrompt = 'Use one native apply_patch call to add order-count.ts containing exactly `type OrderCount = number` and order-total.ts containing exactly `type OrderTotal = number`, each with a final newline. End the turn immediately. Do not edit either file before review feedback. If findings arrive for both files, repair both with apply_patch and finish by saying MULTI_REPAIRED.';
const initialPrompt = (testCase) => testCase.id === 'resident-multi-unit' ? multiUnitPrompt : prompt;
const waitFor = async (path, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await access(path); return true; } catch { await new Promise((resolvePromise) => setTimeout(resolvePromise, 20)); }
  }
  return false;
};
const run = (command, args, options = {}) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', pending = '';
  const started = Date.now(), timeline = [];
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines) {
      try {
        const value = JSON.parse(line);
        timeline.push({ type: value.type, itemType: value.item?.type ?? null, at: Date.now() - started });
      } catch { /* json-lines only */ }
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', (code, signal) => resolvePromise({ code, signal, stdout, stderr, timeline }));
  if (options.input !== undefined) child.stdin.end(options.input);
  else child.stdin.end();
});
const assertVersion = async () => {
  const result = await run(codexBinary, ['--version']);
  if (result.code !== 0 || result.stdout.trim() !== expectedVersion) {
    throw new Error('Configured Codex CLI did not match the expected version.');
  }
};
const enableConsent = async (repo, statePath, env) => {
  const base = { ...env, REVIEW_STATE_PATH: statePath };
  const proposalRun = spawnSync(process.execPath, [cli, '--enable'], {
    cwd: project, input: JSON.stringify({ version: 1, operation: 'enable', cwd: repo }),
    encoding: 'utf8', env: base,
  });
  if (proposalRun.status !== 0) throw new Error('Temporary review consent setup failed.');
  const proposal = JSON.parse(proposalRun.stdout);
  const confirmRun = spawnSync(process.execPath, [cli, '--enable-confirm'], {
    cwd: project,
    input: JSON.stringify({ version: 1, operation: 'enable-confirm', cwd: repo, proposalDigest: proposal.proposal.digest }),
    encoding: 'utf8', env: base,
  });
  if (confirmRun.status !== 0 || JSON.parse(confirmRun.stdout).status !== 'enabled') {
    throw new Error('Temporary review consent confirmation failed.');
  }
};
const outcomes = async (path) => {
  try {
    return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch { return []; }
};
const activityStages = async (directory) => {
  const stages = [];
  const visit = async (path) => {
    let entries;
    try { entries = await (await import('node:fs/promises')).readdir(path, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else {
        try { stages.push(JSON.parse(await readFile(child, 'utf8')).stage); } catch { /* ignore malformed local marker */ }
      }
    }
  };
  await visit(directory);
  return stages.filter((stage) => typeof stage === 'string');
};
const monitorResidentEvents = (outcomePath, admissionPath, startedAt, destination) => {
  let seen = 0, admitted = false, active = true;
  const task = (async () => {
    while (active) {
      if (!admitted && await waitFor(admissionPath, 1)) {
        admitted = true;
        const acceptedAt = (await stat(admissionPath)).mtimeMs - startedAt;
        destination.push({ kind: 'resident-admitted', at: acceptedAt });
      }
      const records = await outcomes(outcomePath);
      let completedAt = Date.now() - startedAt;
      if (records.length > seen) {
        try { completedAt = (await stat(outcomePath)).mtimeMs - startedAt; } catch { /* use observation time */ }
      }
      while (seen < records.length) {
        const record = records[seen++];
        destination.push({ kind: 'backend-complete', outcome: record.outcome, at: completedAt });
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 15));
    }
  })();
  return async () => { active = false; await task; };
};

await assertVersion();
const parent = await mkdtemp(join(tmpdir(), 'hapsland-97-resident-'));
const wrapper = join(parent, 'resident-stop-wrapper');
const compile = spawnSync('cc', ['-O2', '-Wall', '-Wextra', '-Werror', wrapperSource, '-o', wrapper], { encoding: 'utf8' });
if (compile.status !== 0) throw new Error('Could not build isolated Stop command measurement wrapper.');
const commandTrace = join(parent, 'resident-command-trace-wrapper');
const traceCompile = spawnSync('cc', ['-O2', '-Wall', '-Wextra', '-Werror', commandTraceSource, '-o', commandTrace], { encoding: 'utf8' });
if (traceCompile.status !== 0) throw new Error('Could not build isolated host command launch tracer.');
const results = [];
const residentDirectories = [];
try {
  for (const testCase of cases.filter((value) => process.argv.length < 3 || process.argv.slice(2).includes(value.id))) {
    const base = join(parent, testCase.id);
    const repo = join(base, 'repo'), home = join(base, 'home'), runtime = join(base, 'runtime');
    residentDirectories.push(runtime);
    const statePath = join(base, 'consent-state'), activityPath = join(base, 'activity-state');
    const outcomePath = join(base, 'backend-outcomes.jsonl'), eventsPath = join(base, 'events.jsonl');
    const capturePath = join(base, 'model-calls.jsonl');
    const admissionPath = join(base, 'admission.accepted');
    // The resident creates its own 0700 runtime directory; pre-creating it
    // with the runner's ordinary mkdir mode would correctly fail validation.
    await Promise.all([mkdir(repo, { recursive: true }), mkdir(home, { recursive: true })]);
    await chmod(home, 0o700);
    await copyFile('/home/node/.codex/auth.json', join(home, 'auth.json'));
    await chmod(join(home, 'auth.json'), 0o600);
    await writeFile(join(home, 'config.toml'), '[features]\nhooks = true\n');
    await writeFile(join(home, 'hooks.json'), JSON.stringify({
      description: 'isolated issue 97 production resident compatibility probe',
      hooks: {
        PostToolUse: [{ matcher: '^apply_patch$', hooks: [{
          type: 'command', command: `${quote(wrapper)} post-tool`, timeout: 5,
        }] }],
        Stop: [{ hooks: [{ type: 'command', command: `${quote(wrapper)} stop`, timeout: 5 }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: `${quote(process.execPath)} ${quote(sessionEndHook)}`, timeout: 2 }] }],
      },
    }));
    const init = spawnSync('git', ['init', '--quiet', '--initial-branch=main', repo], { encoding: 'utf8' });
    if (init.status !== 0) throw new Error('Could not create temporary Git repository.');
    const multiUnit = testCase.id === 'resident-multi-unit';
    const control = JSON.stringify({
      ...(multiUnit ? { answers: controlledAnswers } : { syntheticR6BrandedRepair: 'finding' }),
      delayMs: testCase.delayMs, outcomePath, capturePath,
    });
    const env = {
      ...process.env,
      CODEX_HOME: home,
      REVIEW_CONTROL_JSON: control,
      REVIEW_STATE_PATH: statePath,
      REVIEW_ACTIVITY_PATH: activityPath,
      REVIEW_RESIDENT_DIR: runtime,
      REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH: admissionPath,
      HAPSLAND_CONTROL_DELAY_MS: String(testCase.delayMs),
      HAPSLAND_CONTROL_OUTCOME_PATH: outcomePath,
      HAPSLAND_CONTROL_CAPTURE_PATH: capturePath,
      HAPSLAND_PROBE_MULTI_UNIT: multiUnit ? 'true' : 'false',
      HAPSLAND_NODE_BINARY: process.execPath,
      HAPSLAND_CLI: cli,
      HAPSLAND_STOP_HOOK_SCRIPT: stopHook,
      HAPSLAND_PROBE_EVENTS: eventsPath,
      HAPSLAND_PROBE_STARTED_AT_MS: String(Date.now()),
    };
    for (const key of ['OPENAI_API_KEY', 'TYPESAFE_API_KEY']) delete env[key];
    await enableConsent(repo, statePath, env);
    const startedAt = Date.now();
    env.HAPSLAND_PROBE_STARTED_AT_MS = String(startedAt);
    const observed = [];
    const stopMonitoring = monitorResidentEvents(outcomePath, admissionPath, startedAt, observed);
    const makeExecArgs = (message, ephemeral) => [
      'exec', ...(ephemeral ? ['--ephemeral'] : []), '--json', '--ignore-user-config', '--ignore-rules',
      '--dangerously-bypass-hook-trust', '--dangerously-bypass-approvals-and-sandbox',
      '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort="max"', '-C', repo, message,
    ];
    const sessionIdFrom = (stdout) => {
      for (const line of stdout.split('\n')) {
        try {
          const value = JSON.parse(line);
          if (typeof value.thread_id === 'string') return value.thread_id;
          if (typeof value.session_id === 'string') return value.session_id;
        } catch { /* ignore malformed JSONL */ }
      }
      return undefined;
    };
    let host, laterHost;
    const hostArgs = makeExecArgs(initialPrompt(testCase), !testCase.postSessionResume);
    host = await run(commandTrace, [wrapper, eventsPath, '--', codexBinary, ...hostArgs], { cwd: repo, env });
    const hostExitedAt = Date.now();
    if (testCase.observeAfterSessionMs !== undefined) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, testCase.observeAfterSessionMs));
    }
    const sessionId = sessionIdFrom(host.stdout);
    if (testCase.postSessionResume && sessionId !== undefined) {
      const laterPrompt = 'If a Hapsland review finding for order-count.ts arrives, repair that finding with apply_patch and finish by saying LATER_REVIEW_REPAIRED. If no finding arrives, make no changes and finish by saying NO_LATE_FINDING.';
      const resumeArgs = [
        'exec', 'resume', '--json', '--ignore-user-config', '--ignore-rules',
        '--dangerously-bypass-hook-trust', '--dangerously-bypass-approvals-and-sandbox',
        '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort="max"', sessionId, laterPrompt,
      ];
      laterHost = await run(commandTrace, [wrapper, eventsPath, '--', codexBinary, ...resumeArgs], { cwd: repo, env });
    }
    await stopMonitoring();

    const rawEvents = await outcomes(eventsPath);
    const safeEvents = rawEvents.map((event) => {
      const { kind, mode, at, launchAt, entryAt, elapsedMs, elapsedUs, exitCode, signal, findingCount, acknowledged, continuationCapped } = event;
      return { kind, ...(at === undefined ? {} : { at }), ...(elapsedMs === undefined ? {} : { elapsedMs }),
        ...(mode === undefined ? {} : { mode }), ...(launchAt === undefined ? {} : { launchAt }),
        ...(entryAt === undefined ? {} : { entryAt }), ...(elapsedUs === undefined ? {} : { elapsedUs }), ...(exitCode === undefined ? {} : { exitCode }),
        ...(signal === undefined ? {} : { signal }), ...(findingCount === undefined ? {} : { findingCount }),
        ...(acknowledged === undefined ? {} : { acknowledged }), ...(continuationCapped === undefined ? {} : { continuationCapped }) };
    });
    let sourceState = 'absent';
    try {
      const source = await readFile(join(repo, 'order-count.ts'), 'utf8');
      sourceState = source === 'type OrderCount = number\n' ? 'original' : 'changed';
    } catch { /* no source retained */ }
    const unitFileStates = {};
    for (const filename of multiUnit
      ? ['order-count.ts', 'order-total.ts']
      : ['order-count.ts']) {
      try {
        const source = await readFile(join(repo, filename), 'utf8');
        unitFileStates[filename] = source.endsWith(' = number\n') ? 'original' : 'changed';
      } catch { unitFileStates[filename] = 'absent'; }
    }
    const finalMessage = (stdout) => stdout.split('\n').filter(Boolean).flatMap((line) => {
      try { const value = JSON.parse(line); return value.item?.type === 'agent_message' ? [value.item.text ?? ''] : []; }
      catch { return []; }
    }).join('\n');
    const hostFinalMessage = finalMessage(host.stdout);
    const laterFinalMessage = laterHost === undefined ? '' : finalMessage(laterHost.stdout);
    let postSessionCollectable = false, postSessionAcknowledged = false;
    if (testCase.observeAfterSessionMs !== undefined && !testCase.postSessionResume &&
        observed.some((event) => event.kind === 'backend-complete')) {
      const postCheck = `
        import { collectReadyEffect as collectReady, makeResidentDispatchContextEffect as makeResidentDispatchContext, acknowledgeAdviceEffect as acknowledgeAdvice } from ${JSON.stringify(new URL('../../src/resident/client.ts', import.meta.url).href)};
import { runClient } from ${JSON.stringify(new URL('../../src/test-support/client-runtime.ts', import.meta.url).href)};
        import { residentPaths } from ${JSON.stringify(new URL('../../src/resident/paths.ts', import.meta.url).href)};
        import { realpath } from 'node:fs/promises';
        const root=await realpath(process.env.HAPSLAND_POST_ROOT);
        const dispatch=await runClient(makeResidentDispatchContext(root,process.env.REVIEW_STATE_PATH,process.env.REVIEW_ACTIVITY_PATH,undefined,{syntheticR6BrandedRepair:'finding',delayMs:Number(process.env.HAPSLAND_CONTROL_DELAY_MS),outcomePath:process.env.HAPSLAND_CONTROL_OUTCOME_PATH,capturePath:process.env.HAPSLAND_CONTROL_CAPTURE_PATH}));
        const advicee={host:'codex-cli',hostVersion:'0.155.1',sessionId:process.env.HAPSLAND_POST_SESSION_ID,turnId:'post-session-turn',toolUseId:'post-session-tool',agentId:null};
        const advice=await runClient(collectReady(root,advicee,dispatch,residentPaths(), 'turn-end')).catch(()=>undefined);
        const acknowledged=advice===undefined?false:await runClient(acknowledgeAdvice(advice)).catch(()=>false);
        process.stdout.write(JSON.stringify({collectable:advice!==undefined,acknowledged})+'\\n');
      `;
      if (sessionId !== undefined) {
        const checked = await run(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', postCheck], {
          cwd: project,
          env: { ...env, HAPSLAND_POST_ROOT: repo, HAPSLAND_POST_SESSION_ID: sessionId },
        });
        try {
          const value = JSON.parse(checked.stdout.trim());
          postSessionCollectable = value.collectable === true;
          postSessionAcknowledged = value.acknowledged === true;
        } catch { /* an unavailable post-session observation remains false */ }
      }
    }
    const stopCommand = safeEvents.find((event) => event.kind === 'stop-command-return');
    const stopHostCommand = safeEvents.find((event) => event.kind === 'host-command-window' && event.mode === 'stop');
    const stopHostCommands = safeEvents.filter((event) => event.kind === 'host-command-window' && event.mode === 'stop');
    const postToolHostCommands = safeEvents.filter((event) => event.kind === 'host-command-window' && event.mode === 'post-tool');
    const postToolCommandEvents = safeEvents.filter((event) => event.kind === 'post-tool-command-return');
    const responseEvent = safeEvents.find((event) => event.kind === 'stop-response-written');
    const responseCommand = responseEvent === undefined ? undefined : stopHostCommands.find((event) =>
      responseEvent.at >= event.launchAt && responseEvent.at <= event.at);
    const stopOutputEvent = safeEvents.find((event) => [
      'stop-response-written', 'stop-no-advice', 'stop-collection-deadline', 'stop-quiet',
      'stop-error', 'stop-stale-suppressed',
    ].includes(event.kind));
    const sessionEndEvents = safeEvents.filter((event) => event.kind === 'session-end');
    let controlledModelCalls = 0;
    try { controlledModelCalls = (await readFile(capturePath, 'utf8')).split('\n').filter(Boolean).length; } catch { /* no provider dispatch */ }
    const result = {
      id: testCase.id,
      delayMs: testCase.delayMs,
      exitCode: laterHost?.code ?? host.code,
      durationMs: hostExitedAt - startedAt,
      hostTimeline: host.timeline,
      laterTurnHostTimeline: laterHost?.timeline ?? [],
      events: [...observed, ...safeEvents].sort((left, right) =>
        (left.entryAt ?? left.at ?? 0) - (right.entryAt ?? right.at ?? 0)),
      backendCompletions: observed.filter((event) => event.kind === 'backend-complete').length,
      admissionAccepted: await waitFor(admissionPath, 1),
      controlledModelCalls,
      activityStages: await activityStages(activityPath),
      stopCommandElapsedUs: stopHostCommand?.elapsedUs ?? null,
      stopWrapperMainElapsedUs: stopCommand?.elapsedUs ?? null,
      postToolCommandElapsedUs: postToolCommandEvents.map((event) => event.elapsedUs),
      postToolHostCommandElapsedUs: postToolHostCommands.map((event) => event.elapsedUs),
      stopCommandUnderFiveSeconds: stopHostCommand !== undefined && stopHostCommand.exitCode === 0 && stopHostCommand.elapsedUs < 5_000_000,
      allStopCommandsUnderFiveSeconds: stopHostCommands.length > 0 && stopHostCommands.every((event) => event.exitCode === 0 && event.elapsedUs < 5_000_000),
      responseWrittenWithinFiveSeconds: stopOutputEvent !== undefined && stopHostCommand !== undefined &&
        stopOutputEvent.at - stopHostCommand.launchAt < 5_000,
      stopResponseWrittenWithinFiveSeconds: responseEvent !== undefined && responseCommand !== undefined &&
        responseEvent.at - responseCommand.launchAt < 5_000,
      stopResponseOutcome: responseEvent !== undefined
        ? 'finding-submitted'
        : safeEvents.find((event) => ['stop-no-advice', 'stop-collection-deadline', 'stop-quiet'].includes(event.kind))?.kind ?? 'unobserved',
      sessionEndObserved: sessionEndEvents.length > 0,
      sessionEndCount: sessionEndEvents.length,
      finalFileState: sourceState,
      unitFileStates,
      stopResponseFindingCount: responseEvent?.findingCount ?? 0,
      multiUnitBothRepaired: testCase.id === 'resident-multi-unit' &&
        unitFileStates['order-count.ts'] === 'changed' && unitFileStates['order-total.ts'] === 'changed',
      modelClaimedRepair: hostFinalMessage.includes(testCase.id === 'resident-multi-unit' ? 'MULTI_REPAIRED' : 'REVIEW_REPAIRED'),
      laterTurnFindingVisible: laterHost !== undefined && responseEvent !== undefined &&
        responseEvent.at > (sessionEndEvents[0]?.at ?? Number.POSITIVE_INFINITY),
      laterTurnModelClaimedRepair: laterFinalMessage.includes('LATER_REVIEW_REPAIRED'),
      postSessionCollectable,
      postSessionAcknowledged,
      stderrClass: host.stderr.includes('Error') ? 'error' : host.stderr ? 'other' : 'empty',
    };
    if (testCase.id === 'resident-multi-unit' &&
        (result.stopResponseFindingCount !== 2 || !result.multiUnitBothRepaired)) {
      throw new Error('The multi-unit host fixture did not deliver and repair both findings.');
    }
    results.push(result);
    process.stdout.write(`${testCase.id}: ${JSON.stringify({ exit: result.exitCode, stopUs: result.stopCommandElapsedUs, under5s: result.stopCommandUnderFiveSeconds, completions: result.backendCompletions, file: result.finalFileState, laterTurnVisible: result.laterTurnFindingVisible, postSessionCollectable })}\n`);
  }
} finally {
  for (const directory of residentDirectories) {
    try {
      const owner = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
      if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
        try { process.kill(owner.pid, 'SIGTERM'); } catch { /* already stopped */ }
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          try { process.kill(owner.pid, 0); await new Promise((resolvePromise) => setTimeout(resolvePromise, 20)); }
          catch { break; }
        }
      }
    } catch { /* resident did not start */ }
  }
  if (process.env.HAPSLAND_DELIVERY_97_KEEP_TEMP !== '1') {
    await rm(parent, { recursive: true, force: true });
  } else {
    process.stderr.write(`Isolated probe temporary files retained under ${parent}.\n`);
  }
}

let previous = [];
try { previous = JSON.parse(await readFile(evidencePath, 'utf8')).cases ?? []; } catch { /* first run */ }
await writeFile(evidencePath, JSON.stringify({
  issue: 97,
  host: expectedVersion,
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  model: 'gpt-6-luna',
  reasoningEffort: 'max',
  mode: 'headless Codex exec; one later-turn case resumed inside temporary CODEX_HOME',
  backend: 'Hapsland production resident with controlled offline Effect DecisionModel; no Jev',
  stopCommandMeasurement: 'Linux ptrace tracer timestamps the host child creation event for the configured command through final process exit; this includes executable loading and response writing. The compiled wrapper records an internal monotonic breakdown.',
  isolation: 'temporary repositories, consent state, CODEX_HOME and resident directory; raw host output, source, and backend outcome identifiers discarded',
  cases: [...previous.filter((value) => !results.some((result) => result.id === value.id)), ...results],
}, null, 2) + '\n');
