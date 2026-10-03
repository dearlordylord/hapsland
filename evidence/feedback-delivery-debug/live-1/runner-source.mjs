// Bounded, preregistered synthetic detection and native-agent comparison.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cases, tasks as auditTasks } from './abide-quality-fixtures.mjs';
import { configuredRules } from '../src/policy/rules.ts';
const project = resolve(import.meta.dirname, '..');
const observer = join(project, 'scripts/abide-quality-observer.mjs');
const capture = join(project, 'scripts/abide-quality-capture.mjs');
const codex = '/tmp/hapsland-codex-01551/node_modules/.bin/codex';
const abideRoot = '/tmp/hapsland-abide-007/node_modules/@coldtea/abide';
const live = process.argv.includes('--live');
const deliveryDebug = process.argv.includes('--delivery-debug');
const nativeSmoke = process.argv.includes('--native-smoke');
const receiptProbe = process.argv.includes('--feedback-receipt');
const onlyCandidate = process.argv.find(x => x.startsWith('--only-candidate='))?.slice(17);
if (onlyCandidate && !['baseline', 'hapsland', 'abide'].includes(onlyCandidate)) throw new Error('Unknown candidate');
const selectedTaskIds = process.argv.find(x => x.startsWith('--only-tasks='))?.slice(13).split(',');
if (selectedTaskIds?.some(id => !auditTasks.some(task => task.caseId === id))) throw new Error('Unknown task selection');
const taskProfile = process.argv.find(x => x.startsWith('--task-profile='))?.slice(15) ?? 'explicit-domain-audit';
const instructionProfiles = {
  'apply-feedback': 'Reviewer feedback is part of this task. If review feedback reports a code problem, apply a correction before finishing, then run the checks again. Do not merely repeat the warning in your final report. If no feedback arrives, complete the original maintenance task.',
  'authorized-repair': 'The user authorizes the installed reviewer to identify defects in any touched declaration. Its feedback is a requested correction, including defects that existed before the rename. Correct those defects before finishing; do not dismiss them as outside the rename task. Preserve the documented domain and independent facts. If no feedback arrives, complete the original maintenance task.',
  'feedback-protocol': 'When a reviewer message arrives: acknowledge the reported rule and declaration; inspect the relevant declaration and its supporting definitions; make a correction addressing the reported problem; run typecheck and tests; then report the received rule and the correction. The user authorizes those repairs, including pre-existing defects in the touched declaration. If the feedback is demonstrably incorrect or the repair cannot preserve the documented domain, explicitly report that conflict instead of claiming a repair. If no feedback arrives, complete the original maintenance task.',
};
const instructionVariant = Object.hasOwn(instructionProfiles, taskProfile);
if (!['explicit-domain-audit', 'ordinary-maintenance', ...Object.keys(instructionProfiles)].includes(taskProfile)) throw new Error('Unknown task profile');
const profileTasks = taskProfile === 'ordinary-maintenance' || instructionVariant ? auditTasks.map(task => ({ ...task,
  prompt: 'Rename the presentation field label to displayLabel in subject.ts using apply_patch. Keep CaseState exported and preserve the domain semantics and independent facts described in README.md. Run npm run typecheck and npm test, then report what you changed. Do not add runtime dependencies.' + (instructionVariant ? ` ${instructionProfiles[taskProfile]}` : ''),
})) : auditTasks;
const tasks = profileTasks.filter(task => !selectedTaskIds || selectedTaskIds.includes(task.caseId)).map(task => ({ ...task,
  ...(receiptProbe ? { prompt: task.prompt + ' Stay in the repository; do not inspect integration settings, credentials or environment variables. If reviewer feedback reaches you, report REVIEW_FEEDBACK_APPLIED if you used it to change the type, or REVIEW_FEEDBACK_NOT_APPLIED if you left the type as it was; briefly explain your choice. If no feedback reaches you, report REVIEW_FEEDBACK_NO_FEEDBACK. These are diagnostic reports, not instructions to fabricate receipt or to change otherwise correct code.' } : {}),
}));
const out = resolve(process.argv.find(x => x.startsWith('--out='))?.slice(6) ?? 'evidence/abide-quality');
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const records = path => { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const cmd = (args, cwd) => { const r = spawnSync(args[0], args.slice(1), { cwd, encoding: 'utf8', timeout: 15000 }); if (r.status !== 0) throw new Error(`Offline command failed: ${args[0]}`); return r.stdout.trim(); };
const globalLog = resolve(process.argv.find(x => x.startsWith('--shared-attempt-log='))?.slice(21) ?? join(out, 'attempts.jsonl'));
const requestCap = Number(process.argv.find(x => x.startsWith('--request-cap='))?.slice(14) ?? 180);
if (!Number.isInteger(requestCap) || requestCap < 1 || requestCap > 180) throw new Error('Request cap must be an integer between 1 and 180');
const totalTokens = { count: 0 };
function credential() {
  if (!live) return 'synthetic-offline-key';
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const raw = readFileSync(join(project, '.env'), 'utf8').match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1];
  const key = raw?.replace(/^(['"])(.*)\1$/, '$2');
  if (!key) throw new Error('Jev credential unavailable');
  return key;
}
const key = credential();
const run = (binary, args, env, cwd, input, timeout = 45000) => new Promise(resolveRun => {
  const child = spawn(binary, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  let stdout = '', stderrBytes = 0, timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} }, timeout);
  child.stdout.on('data', x => { stdout += x; });
  child.stderr.on('data', x => { stderrBytes += x.length; });
  child.on('error', () => { clearTimeout(timer); resolveRun({ code: null, signal: 'spawn-error', stdout, stderrBytes, timedOut }); });
  child.on('close', (code, signal) => { clearTimeout(timer); resolveRun({ code, signal, stdout, stderrBytes, timedOut }); });
  child.stdin.end(input ?? '');
});
function repoFor(fixture, stage, candidate, pass) {
  const temp = mkdtempSync(join(tmpdir(), 'hq-'));
  const repo = join(temp, 'repo'), home = join(temp, 'profile/.codex');
  mkdirSync(repo); mkdirSync(home, { recursive: true, mode: 0o700 });
  for (const [path, content] of Object.entries(fixture.support)) writeFileSync(join(repo, path), content);
  writeFileSync(join(repo, 'subject.ts'), fixture.before ?? fixture.initial);
  writeFileSync(join(repo, 'README.md'), fixture.readme ?? '# Synthetic domain\n');
  writeFileSync(join(repo, '.gitignore'), '.abide/\nnode_modules/\n');
  write(join(repo, 'tsconfig.json'), { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', types: [], skipLibCheck: true }, include: ['*.ts'] });
  write(join(repo, 'package.json'), { private: true, scripts: { typecheck: `${quote(process.execPath)} ${quote(join(project, 'node_modules/typescript/bin/tsc'))} -p tsconfig.json`, test: `${quote(process.execPath)} ${quote(join(project, 'node_modules/typescript/bin/tsc'))} -p tsconfig.json` } });
  cmd(['git', 'init', '-q', '--initial-branch=master'], repo);
  cmd(['git', 'config', 'user.email', 'quality@example.invalid'], repo);
  cmd(['git', 'config', 'user.name', 'Synthetic study'], repo);
  cmd(['git', 'add', '.'], repo); cmd(['git', 'commit', '-qm', 'Frozen synthetic baseline'], repo);
  const log = join(temp, 'requests.jsonl'), hookLog = join(temp, 'hooks.jsonl');
  const env = { ...process.env, CODEX_HOME: home, ABIDE_HOME_DIR: join(temp, 'profile'),
    REVIEW_USER_CONFIG_PATH: join(temp, 'user.json'), REVIEW_RESIDENT_DIR: join(temp, 'resident'), REVIEW_ACTIVITY_PATH: join(temp, 'activity'),
    TYPESAFE_API_KEY: key, TYPESAFE_AI_API_KEY: key, AI_GATEWAY_API_KEY: '', TYPESAFE_AI_BASE_URL: '',
    QUALITY_REQUEST_LOG: log, QUALITY_GLOBAL_LOG: globalLog, QUALITY_GLOBAL_CAP: String(requestCap),
    QUALITY_LOCAL_CAP: stage === 'A' ? '1' : '4', QUALITY_CANDIDATE: candidate, QUALITY_CASE: fixture.id,
    QUALITY_STAGE: stage, QUALITY_PASS: String(pass), QUALITY_PHASE: 'edit',
    NODE_OPTIONS: `--import=${observer}`, ...(live ? {} : { QUALITY_OFFLINE: process.argv.find(x => x.startsWith('--offline-response='))?.slice(19) ?? 'finding' }) };
  delete env.OPENAI_API_KEY; delete env.REVIEW_CONTROL_JSON;
  const overrides = Object.fromEntries(configuredRules.map(rule => [rule.id, { enabled: rule.id === fixture.ruleId, threshold: 0.7 }]));
  write(env.REVIEW_USER_CONFIG_PATH, { version: 1, includes: ['**/*'], excludes: fixture.excludedPaths ?? [], ruleOverrides: overrides });
  return { temp, repo, home, env, log, hookLog, receiptNonce: receiptProbe ? `${instructionVariant ? 'REVIEW_RECEIPT' : 'HAPSLAND_RECEIPT'}_${randomUUID().replaceAll('-', '')}` : undefined };
}
function rubric(repo, ruleId) {
  const rule = configuredRules.find(x => x.id === ruleId);
  const instruction = `Review CaseState using ${ruleId}.\n`;
  writeFileSync(join(repo, 'AGENTS.md'), instruction);
  mkdirSync(join(repo, '.abide'), { recursive: true });
  write(join(repo, '.abide/rubric.json'), { version: 1, compiledAt: new Date().toISOString(), compiledBy: 'frozen-quality-fixture',
    sources: [{ path: 'AGENTS.md', sha: hash(instruction), scope: '**/*' }], thresholds: { act: 0.7, flag: 0.3 },
    rules: [{ id: rule.id.replaceAll('_', '-'), text: rule.message, source: { path: 'AGENTS.md', line: 1 }, scope: ['subject.ts'], when: 'edit', status: 'active',
      check: { type: 'model', question: { type: 'boolean', instructions: rule.decision.instructions.replaceAll('`artifact`', 'the changed CaseState declaration shown in the diff'), criteria: rule.decision.criteria } } }] });
}
async function cleanup(cell) {
  try { const ownerPath = join(cell.temp, 'resident/owner.json'); if (existsSync(ownerPath)) { const owner = JSON.parse(readFileSync(ownerPath)); process.kill(owner.pid, 'SIGTERM'); } } catch {}
  rmSync(cell.temp, { recursive: true, force: true });
}
function typecheck(repo) { const r = spawnSync(process.execPath, [join(project, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: repo, encoding: 'utf8', timeout: 15000 }); return { passes: r.status === 0, diagnosticCodes: [...new Set([...String(r.stdout).matchAll(/error TS(\d+)/g)].map(x => Number(x[1])))] }; }
async function detection(fixture, candidate, pass) {
  const cell = repoFor(fixture, 'A', candidate, pass);
  try {
    if (candidate === 'abide') rubric(cell.repo, fixture.ruleId);
    const result = await run(process.execPath, [capture], cell.env, project, JSON.stringify({ fixture, repo: cell.repo, candidate, abideRoot }));
    let summary; try { summary = JSON.parse(result.stdout.trim().split('\n').at(-1)); } catch { summary = { status: 'harness-failed' }; }
    const record = { stage: 'A', caseId: fixture.id, candidate, pass, exitCode: result.code,
      timedOut: result.timedOut, stderrBytes: result.stderrBytes, summary, requests: records(cell.log),
      finalTypecheck: typecheck(cell.repo), rawOutputRetained: false };
    write(join(out, `A-${fixture.id}-${candidate}-${pass}.json`), record);
    console.log(JSON.stringify({ stage: 'A', caseId: fixture.id, candidate, pass, status: summary.status, requests: record.requests.filter(x => x.kind === 'request').length }));
    return record;
  } finally { await cleanup(cell); }
}
function nativeHooks(cell, candidate) {
  const wrapper = join(cell.temp, 'hook.mjs');
  writeFileSync(wrapper, `import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process'; import {createHash} from 'node:crypto';
const kind=process.argv[2],input=readFileSync(0,'utf8'),at=Date.now();
let native;try{native=JSON.parse(input)}catch{}
const invocation=createHash('sha256').update(String(process.pid)+':'+at).digest('hex').slice(0,16);
if(${deliveryDebug})appendFileSync(${JSON.stringify(cell.hookLog)},JSON.stringify({trace:'start',invocation,kind,at,event:native?.hook_event_name??null,tool:native?.tool_name??null})+'\\n');
const env={...process.env,QUALITY_PHASE:kind,...(${deliveryDebug}?{QUALITY_DELIVERY_TRACE:${JSON.stringify(join(cell.temp, 'delivery.jsonl'))},QUALITY_INVOCATION:invocation}:{})};
const flags=${JSON.stringify(candidate)}==='hapsland'?(kind==='edit'?['--codex-hook','--controlled-writer','--composed-edit-hook']:['--composed-'+kind+'-hook','--composed-host=codex-cli']):[kind];
const script=${JSON.stringify(candidate)}==='hapsland'?${JSON.stringify(join(project, 'src/cli.ts'))}:${JSON.stringify(join(abideRoot, 'dist/abide-hook.js'))};
const result=spawnSync(process.execPath,[script,...flags],{input,env,encoding:'utf8',timeout:35000,maxBuffer:1048576});
let output;try{output=JSON.parse(result.stdout)}catch{}
const message=String(output?.reason??output?.hookSpecificOutput?.additionalContext??output?.systemMessage??'');
const ids=${JSON.stringify(configuredRules.map(x => x.id))}.filter(x=>message.replaceAll('-', '_').includes(x));
const receiptNonce=${JSON.stringify(cell.receiptNonce ?? null)};
const receiptInserted=Boolean(receiptNonce&&ids.length);
if(receiptInserted){const suffix='\\nDiagnostic receipt: include '+receiptNonce+' in your final report only if this feedback reached you.';
if(typeof output.reason==='string')output.reason+=suffix;else if(typeof output.hookSpecificOutput?.additionalContext==='string')output.hookSpecificOutput.additionalContext+=suffix;else if(typeof output.systemMessage==='string')output.systemMessage+=suffix;}
let source='';try{source=readFileSync(${JSON.stringify(join(cell.repo, 'subject.ts'))},'utf8')}catch{}
appendFileSync(${JSON.stringify(cell.hookLog)},JSON.stringify({...(${deliveryDebug}?{trace:'complete',invocation,signal:result.signal,errorCode:result.error?.code??null,stdoutBytes:Buffer.byteLength(result.stdout??''),stderrBytes:Buffer.byteLength(result.stderr??'')}:{}),kind,at,doneAt:Date.now(),event:native?.hook_event_name??null,tool:native?.tool_name??null,exit:result.status,findingIds:ids,decision:output?.decision??null,receiptInserted,sourceHash:createHash('sha256').update(source).digest('hex')})+'\\n');
if(result.status===0)process.stdout.write(receiptInserted?JSON.stringify(output)+'\\n':result.stdout??'');process.exitCode=result.status??1;`);
  const command = kind => `${quote(process.execPath)} ${quote(wrapper)} ${kind}`;
  if (candidate === 'hapsland') {
    write(join(cell.home, 'hooks.json'), { hooks: {
      PreToolUse: [{ matcher: '^(apply_patch|Edit|Write|Bash)$', hooks: [{ type: 'command', command: command('before-edit'), timeout: 5 }] }],
      PostToolUse: [{ matcher: '^(apply_patch|Edit|Write|Bash)$', hooks: [{ type: 'command', command: command('edit'), timeout: 10 }, { type: 'command', command: command('background'), timeout: 25, async: true }] }],
      Stop: [{ hooks: [{ type: 'command', command: command('stop'), timeout: 5 }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: command('prompt'), timeout: 4 }] }],
    } });
  } else {
    const init = spawnSync(process.execPath, [join(abideRoot, 'dist/bin.js'), 'init', 'codex'], { cwd: cell.repo, env: cell.env, encoding: 'utf8', timeout: 20000 });
    if (init.status !== 0) throw new Error('Actual Abide init failed');
    const path = join(cell.home, 'hooks.json'), settings = JSON.parse(readFileSync(path));
    for (const groups of Object.values(settings.hooks)) for (const group of groups) for (const hook of group.hooks) {
      if (hook.command?.includes('abide-hook.js')) hook.command = command(hook.command.trim().split(/\s+/).at(-1));
    }
    write(path, settings);
  }
}
async function native(fixture, candidate, ordinal) {
  const cell = repoFor(fixture, 'B', candidate, ordinal);
  const mask = hash(randomUUID()).slice(0, 12);
  try {
    copyFileSync(join(process.env.CODEX_HOME ?? '/home/node/.codex', 'auth.json'), join(cell.home, 'auth.json')); chmodSync(join(cell.home, 'auth.json'), 0o600);
    writeFileSync(join(cell.home, 'config.toml'), '[features]\nhooks = true\n');
    if (candidate === 'abide') rubric(cell.repo, fixture.ruleId);
    if (candidate !== 'baseline') nativeHooks(cell, candidate);
    const startedAt = Date.now();
    const args = ['exec', '--ephemeral', '--json', '--dangerously-bypass-hook-trust', '--dangerously-bypass-approvals-and-sandbox', '--ignore-rules',
      '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort="max"', '-C', cell.repo, fixture.prompt];
    const result = await run(codex, args, cell.env, cell.repo, '', 300000);
    const stream = result.stdout.split('\n').flatMap(x => { try { return [JSON.parse(x)]; } catch { return []; } });
    const usage = stream.findLast(x => x.type === 'turn.completed')?.usage ?? null;
    const tokens = usage ? Math.max(0, usage.input_tokens - (usage.cached_input_tokens ?? 0)) + usage.output_tokens : null;
    const finalAgentText = stream.findLast(x => x.item?.type === 'agent_message')?.item?.text ?? '';
    const receiptReports = [...new Set([...finalAgentText.matchAll(/(?:HAPSLAND|REVIEW)_FEEDBACK_(APPLIED|NOT_APPLIED|NO_FEEDBACK)/g)].map(x => x[1]))];
    totalTokens.count += tokens ?? 0;
    const record = { stage: 'B', taskId: fixture.id, candidate, ordinal, blindId: mask,
      code: result.code, signal: result.signal, timedOut: result.timedOut, durationMs: Date.now() - startedAt,
      usage, uncachedPlusOutputTokens: tokens, tokenCapExceeded: tokens !== null && tokens > 100000,
      stderrBytes: result.stderrBytes, rawHostStreamRetained: false, providerBodyRetained: false,
      ...(deliveryDebug ? { nativeEvents: stream.map(x => ({type:x.type,itemType:x.item?.type??null})), deliveryDebug: true, transportTrace: records(join(cell.temp, 'delivery.jsonl')) } : {}),
      hookEvents: records(cell.hookLog), requests: records(cell.log),
      agentMentionsRule: configuredRules.map(x => x.id).filter(id => stream.some(x => String(x.item?.text ?? '').includes(id))),
      ...(receiptProbe ? { feedbackReceipt: { nonceSha256: hash(cell.receiptNonce), requestedByHook: records(cell.hookLog).some(h => h.receiptInserted), echoedInFinalAgentMessage: finalAgentText.includes(cell.receiptNonce), reportedOutcome: receiptReports.length === 1 ? receiptReports[0] : 'ambiguous-or-absent', markerChangesFeedbackContent: true,
        reasonCategories: [['task-scope', /pre.?existing|out(?:side| of).*scope|unrelated|only.*rename|narrow.*task/i], ['uncertain-action', /unclear|ambiguous|insufficient|cannot|unable/i], ['review-disagreement', /false positive|incorrect feedback|disagree|not a (?:bug|defect|violation)/i]].filter(([,pattern]) => pattern.test(finalAgentText)).map(([category]) => category), reasonClassifierIsNotSemanticProof: true } } : {}),
      hostErrors: stream.filter(x => x.type === 'error' || x.type === 'turn.failed').map(x => ({ type: x.type })),
    };
    // Save source-free runtime ledger before compiler/probe/snapshot operations.
    write(join(out, `B-${fixture.id}-${candidate}.json`), record);
    const artifact = join(out, 'blind', mask); mkdirSync(artifact, { recursive: true });
    for (const name of readdirSync(cell.repo).filter(x => x.endsWith('.ts') || ['tsconfig.json'].includes(x))) copyFileSync(join(cell.repo, name), join(artifact, name));
    write(join(artifact, 'task.json'), { id: fixture.id, probe: fixture.probe, validWitnesses: fixture.validWitnesses, domain: fixture.readme, prompt: fixture.prompt });
    record.finalTypecheck = typecheck(cell.repo);
    record.finalSourceSha256 = hash(readFileSync(join(cell.repo, 'subject.ts')));
    record.changed = readFileSync(join(cell.repo, 'subject.ts'), 'utf8') !== fixture.initial;
    write(join(out, `B-${fixture.id}-${candidate}.json`), record);
    console.log(JSON.stringify({ stage: 'B', taskId: fixture.id, candidate, code: result.code, requests: record.requests.filter(x => x.kind === 'request').length, typecheck: record.finalTypecheck.passes, durationMs: record.durationMs }));
    return record;
  } finally { await cleanup(cell); }
}
mkdirSync(out, { recursive: true });
if (existsSync(join(out, 'declaration.json'))) throw new Error('Evidence directory already has a declaration; never overwrite a declared run');
const frozen = { cases, tasks, rules: configuredRules.filter(x => ['r2_meaningless_combinations', 'r4_duplicate_encoding', 'r5_absence_confusion'].includes(x.id)).map(x => ({ id: x.id, decision: x.decision, threshold: x.threshold, message: x.message })) };
write(join(out, 'fixtures.json'), frozen);
write(join(out, 'declaration.json'), { schemaVersion: 1, declaredAt: new Date().toISOString(), mode: live ? 'live' : 'offline',
  fixturesSha256: hash(JSON.stringify(frozen)), scripts: Object.fromEntries(['run-abide-quality.mjs', 'abide-quality-capture.mjs', 'abide-quality-observer.mjs', 'abide-quality-fixtures.mjs'].map(x => [x, hash(readFileSync(join(project, 'scripts', x)))])),
  hapslandCommit: cmd(['git', 'rev-parse', 'HEAD'], project), codexVersion: cmd([codex, '--version'], project), model: 'gpt-6-luna', reasoning: 'max',
  abideVersion: JSON.parse(readFileSync(join(abideRoot, 'package.json'))).version, abideHookSha256: hash(readFileSync(join(abideRoot, 'dist/abide-hook.js'))),
  requestCap, sharedAttemptLog: globalLog, stageACells: process.argv.includes('--skip-capture') ? 0 : 48, stageBSessions: live ? tasks.length * (onlyCandidate ? 1 : 3) : nativeSmoke ? (onlyCandidate ? 1 : 3) : 0,
  deliveryDebug, feedbackReceiptProbe: receiptProbe, onlyCandidate: onlyCandidate ?? null, selectedTaskIds: tasks.map(task => task.caseId),
  taskProfile, sourceCheckoutHapsland: true, manuallyActiveAbideNoulRubric: true, nativeTrustBypassed: true, hostSandboxBypassed: true,
  automaticRetries: 0, maximumHostMs: 300000, tokenCaps: { perSession: 100000, cumulative: 1000000, observedAtCompletionOnly: true },
  amendment: instructionVariant ? 'Owner explicitly requested artificially tightening agent instructions and trying different variants. Fixed six tasks/three arms per variant: apply-feedback, authorized-repair, feedback-protocol. Same model, rules, fixtures, oracle and native hooks. All variants and arms receive the same generic receipt-reporting instruction; fresh nonces are appended only to actual rule-bearing hook output for either reviewer, including Abide flag-band feedback. The nonce proves cooperative receipt, not correctness or mandatory application. No per-case diagnosis or target repair is supplied. Baseline controls spontaneous repair from prompting; clean cases and Hapsland support exclusion retained. Shared144-request cap across all three variants, at most4 per reviewer session, zero retries, five-minute timeout. This is exploratory reused-case research, not held-out superiority confirmation or an optimization keep.' : receiptProbe ? 'User requested tracing Jev answer, finding, delivery, model receipt and application, including possible flow failures. Separate three-task Hapsland-only diagnostic on invoice, rendering and local payment, using ordinary-maintenance tasks. Fresh per-session nonce is appended only to actual finding-bearing hook output; the task does not contain the nonce. A final assistant echo plus self-reported applied/not-applied status tests cooperative receipt, with compiler probes separately testing repair. Instrumented receipt text changes feedback and prompting, so this cannot retroactively prove exposure or refusal in the unmodified pilot, nor count as a head-to-head quality comparison. At most12 physical Jev attempts, zero automatic retries, same five-minute timeout and model as prior study.' : taskProfile === 'ordinary-maintenance' ? 'Exploratory follow-up authorized by user request to identify conditions of advantage, with prior broad live Jev authorization. Fixed six tasks/three arms, same model, rules, source fixtures and independent scoring as prior native pilot; only task prompt changes to ordinary maintenance without an explicit domain-audit step. Existing flaws are deliberately seeded before the rename: this measures inspection of a touched declaration, not only newly introduced defects. Two clean controls and one Hapsland support-exclusion diagnostic retained. No outcome-selected additions or repeats; corrected native hook profile unchanged; fresh physical-attempt ledger capped at48. This is exploratory discovery on previously tested fixtures, not held-out confirmation or general superiority.' : 'User authorized live execution on 2026-10-02; finite original sample/cap retained. Native rerun amends omitted async background hook; matching production owned matcher/timeouts/post/background/prompt/Stop; original started native matrix retained separately, Stage A not repeated. Request ceiling180 shared across original and corrected passes. First native edit is restricted to field rename before self-review, giving every arm the same initial observation opportunity; refined before scored calls after infrastructure smoke. Native triple concurrency 3; observed token ceilings raised before live from25k/300k to100k/1m based on offline-native infrastructure smoke, user authorized broad budget. One target rule per case; Abide act threshold 0.7/flag 0.3; Hapsland threshold 0.7. Abide IDs map underscores to hyphens and artifact locator maps to changed CaseState in diff; semantic wording otherwise unchanged. All fixtures frozen before provider calls.' });
const results = [];
const selectedCases = process.argv.includes('--skip-capture') ? [] : cases;
for (const fixture of selectedCases) for (let pass = 0; pass < (live ? 2 : 1); pass++) {
  for (const candidate of pass % 2 ? ['abide', 'hapsland'] : ['hapsland', 'abide']) results.push(await detection(fixture, candidate, pass));
}
if (live || nativeSmoke) {
  const nativeTasks = live ? tasks : tasks.slice(0, 1);
  const orders = [['baseline', 'hapsland', 'abide'], ['hapsland', 'abide', 'baseline'], ['abide', 'baseline', 'hapsland'], ['baseline', 'abide', 'hapsland'], ['abide', 'hapsland', 'baseline'], ['hapsland', 'baseline', 'abide']];
  for (let i = 0; i < nativeTasks.length; i++) {
    if (totalTokens.count >= 1000000) {
      for (const candidate of orders[i]) appendFileSync(join(out, 'stops.jsonl'), JSON.stringify({ taskId: tasks[i].id, candidate, reason: 'cumulative-host-token-cap' }) + '\n');
      continue;
    }
    const candidates = orders[i].filter(candidate => !onlyCandidate || candidate === onlyCandidate);
    const triple = await Promise.allSettled(candidates.map(candidate => native(tasks[i], candidate, i)));
    for (let j = 0; j < triple.length; j++) {
      if (triple[j].status === 'fulfilled') results.push(triple[j].value);
      else {
        const failure = { stage: 'B', taskId: tasks[i].id, candidate: candidates[j], ordinal: i, setupFailed: true };
        write(join(out, `B-${tasks[i].id}-${candidates[j]}.json`), failure); results.push(failure);
      }
    }
  }
}
write(join(out, 'index.json'), { mode: live ? 'live' : 'offline', completedAt: new Date().toISOString(), records: results.map(x => ({ stage: x.stage, id: x.caseId ?? x.taskId, candidate: x.candidate, pass: x.pass, blindId: x.blindId })), attempts: records(globalLog).length, hostUncachedPlusOutputTokens: totalTokens.count });
console.log(JSON.stringify({ complete: true, out, records: results.length, physicalAttempts: records(globalLog).length }));
