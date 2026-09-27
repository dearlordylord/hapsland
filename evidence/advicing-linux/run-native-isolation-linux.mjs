// Opt-in pinned native-agent isolation probes; raw output/source/auth stay in scratch.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { configuredRules } from '../../src/policy/rules.ts';
const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cli = join(project, 'src/cli.ts');
const binaries = { codex: process.env.HAPSLAND_105_CODEX ?? '/tmp/hapsland-105-hosts/node_modules/.bin/codex',
  claude: process.env.HAPSLAND_105_CLAUDE ?? '/tmp/hapsland-105-hosts/node_modules/.bin/claude' };
if (process.platform !== 'linux') throw new Error('This probe requires Linux');
const selected = process.argv.slice(2);
const cases = [{ host: 'codex', kind: 'worktrees' }, { host: 'claude', kind: 'worktrees' },
  { host: 'claude', kind: 'children' }, { host: 'codex', kind: 'children' },
  ...['codex', 'claude'].filter(host => selected.includes(host+'-background-worktrees')).map(host => ({host,kind:'background-worktrees'}))]
  .filter(({ host, kind }) => selected.length === 0 || selected.includes(`${host}-${kind}`));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) throw new Error('scratch Git operation failed');
  return result.stdout.trim();
};
const run = (binary, args, env, cwd) => new Promise((done, reject) => {
  const startedAt = Date.now();
  const child = spawn(binary, args, { env, cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 100_000);
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', (exitCode, signal) => { clearTimeout(timer); done({ exitCode, signal, timedOut, startedAt,
    endedAt: Date.now(), ackTextFields: stdout.split('\n').flatMap((line) => {
      let record; try { record = JSON.parse(line); } catch { return []; }
      const seen = [];
      const walk = (value, path) => {
        if (typeof value === 'string' && (value.includes('ACK_A') || value.includes('ACK_B'))) seen.push({ path, recordSubtype: typeof record.subtype === 'string' ? record.subtype : null, a: value.includes('ACK_A'), b: value.includes('ACK_B') });
        else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, path + '.' + key);
      };
      walk(record, typeof record.type === 'string' ? record.type : 'record'); return seen;
    }), reportedNoSubagent: stdout.includes('NO_SUBAGENT'),
    reportedAckA: stdout.includes('ACK_A'), reportedAckB: stdout.includes('ACK_B'),
    stderrCategories: ['authentication', 'unsupported', 'rate limit', 'error'].filter((label) => stderr.toLowerCase().includes(label)) }); });
});
const bridgeSource = `import {spawnSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const mode=process.argv[2],host=process.argv[3];
let input='';try{input=readFileSync(0,'utf8')}catch{}
let event={};try{event=JSON.parse(input)}catch{}
const hash=v=>typeof v==='string'?createHash('sha256').update(v).digest('hex'):null;
const childKey=hash(event.agent_id),sessionKey=hash(event.session_id);
let destination=process.env.PROBE_DESTINATION;
if(destination==='children'){
 const path=event.tool_input?.file_path??event.tool_input?.path??'';
 const command=event.tool_input?.command??'';
 if(mode==='edit')destination=String(path).endsWith('/alpha.ts')||String(command).includes('alpha.ts')?'a':String(path).endsWith('/bravo.ts')||String(command).includes('bravo.ts')?'b':'unknown';
 else if(childKey!==null){let prior=[];try{prior=readFileSync(process.env.PROBE_TRACE,'utf8').split('\\n').filter(Boolean).map(l=>JSON.parse(l))}catch{}destination=prior.find(v=>v.childKey===childKey&&v.mode==='edit')?.destination??'unknown';}
 else destination='parent';
}
const startedAt=Date.now();
const args=[process.env.PROBE_CLI,'--controlled-reviewer','--controlled-writer',mode==='edit'?'--'+host+'-hook':'--composed-'+mode+'-hook',...(mode==='edit'?['--composed-edit-hook']:['--composed-host='+ (host==='codex'?'codex-cli':'claude-code')])];
const result=spawnSync(process.execPath,args,{input,encoding:'utf8',env:process.env,timeout:mode==='background'?21000:mode==='stop'?4800:5000,maxBuffer:262144});
let output={};try{output=JSON.parse(result.stdout)}catch{}
const text=output.reason??output.systemMessage??output.hookSpecificOutput?.additionalContext??'';
const a=typeof text==='string'&&text.includes('AlphaCount'),b=typeof text==='string'&&text.includes('BravoCount');
appendFileSync(process.env.PROBE_TRACE,JSON.stringify({mode,event:event.hook_event_name,destination,sessionKey,childKey,suppliedChildIdentity:childKey!==null,startedAt:startedAt-Number(process.env.PROBE_STARTED_AT),elapsedMs:Date.now()-startedAt,ok:result.status===0,blocked:output.decision==='block',expectedFinding:destination==='a'?a:destination==='b'?b:false,foreignFinding:destination==='a'?b:destination==='b'?a:a||b})+'\\n');
if(result.status===0)process.stdout.write(result.stdout);
`;
const results = [];
for (const item of cases) {
  const expectedVersion = item.host === 'codex' ? '0.155.1' : '2.1.218';
  const version = spawnSync(binaries[item.host], ['--version'], { encoding: 'utf8', timeout: 15_000 });
  if (version.status !== 0 || !version.stdout.includes(expectedVersion)) throw new Error('Pinned native runtime unavailable');
  console.error(JSON.stringify({ case: `${item.host}-${item.kind}`, phase: 'start' }));
  const scratch = await mkdtemp(join(tmpdir(), 'hapsland-native-isolation-'));
  const base = join(scratch, 'base'), runtime = join(scratch, 'resident'), trace = join(scratch, 'trace.jsonl');
  const statePath = join(scratch, 'consent'), activityPath = join(scratch, 'activity'), bridge = join(scratch, 'bridge.mjs');
  try {
    await mkdir(base); git('init', '-q', base);
    await writeFile(join(base, 'README.md'), 'Disposable native isolation fixture.\n');
    git('-C', base, 'add', 'README.md'); git('-C', base, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    await writeFile(bridge, bridgeSource, { mode: 0o700 });
    const roots = item.kind.endsWith('worktrees') ? [join(scratch, 'work-a'), join(scratch, 'work-b')] : [base];
    if (item.kind.endsWith('worktrees')) for (const root of roots) git('-C', base, 'worktree', 'add', '--quiet', '--detach', root, 'HEAD');
    const envBase = { ...process.env, REVIEW_STATE_PATH: statePath, REVIEW_ACTIVITY_PATH: activityPath,
      REVIEW_RESIDENT_DIR: runtime, REVIEW_CONTROL_JSON: JSON.stringify({ delayMs: 2_500,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: 'Probability', probability: rule.id === 'r6_bare_domain_value' ? 0.9 : 0 }])) }),
      PROBE_TRACE: trace, PROBE_CLI: cli, PROBE_STARTED_AT: String(Date.now()) };
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY']) delete envBase[key];
    for (const root of roots) {
      const consent = (operation, digest) => spawnSync(process.execPath, [cli, '--'+operation], { cwd: project, env: envBase,
        input: JSON.stringify({ version: 1, operation, cwd: root, ...(digest ? { proposalDigest: digest } : {}) }), encoding: 'utf8', timeout: 10_000 });
      const preview = consent('enable'); if (preview.status !== 0) throw new Error('Consent preview failed');
      const enabled = consent('enable-confirm', JSON.parse(preview.stdout).proposal.digest);
      if (enabled.status !== 0 || JSON.parse(enabled.stdout).status !== 'enabled') throw new Error('Consent enable failed');
    }
    const warm = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {ensureResident} from "./src/resident/client.ts";await ensureResident(undefined,10000);'],
      { cwd: project, env: envBase, encoding: 'utf8', timeout: 12_000 });
    if (warm.status !== 0) throw new Error('Resident warmup failed');
    const jobs = [];
    for (const [index, root] of roots.entries()) {
      const destination = item.kind === 'children' ? 'children' : index === 0 ? 'a' : 'b';
      const env = { ...envBase, PROBE_DESTINATION: destination };
      const hostName = item.host === 'codex' ? 'codex-cli' : 'claude-code';
      const command = (mode) => `${quote(process.execPath)} ${quote(bridge)} ${mode} ${item.host}`;
      const matcher = item.host === 'codex' ? '^apply_patch$' : 'Edit|Write';
      const before = { type: 'command', command: `exec ${quote(process.execPath)} ${quote(cli)} --controlled-reviewer --composed-before-edit-hook --composed-host=${hostName}`, timeout: 5 };
      const hooks = { PreToolUse: [{ matcher, hooks: [before] }],
        PostToolUse: [{ matcher, hooks: [{ type: 'command', command: command('edit'), timeout: 5 }, ...(item.kind==='background-worktrees'?[{type:'command',command:command('background'),timeout:25,async:true}]:[])] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: command('prompt'), timeout: 4 }] }],
        Stop: [{ hooks: [{ type: 'command', command: command('stop'), timeout: 5 }] }],
        SubagentStop: [{ hooks: [{ type: 'command', command: command('stop'), timeout: 5 }] }] };
      const nativeEdit = item.host === 'codex' ? 'native apply_patch' : 'native Write';
      const task = (label, type, file) => `Use ${nativeEdit} to create ${file} containing exactly: type ${type} = number. ${item.kind==='background-worktrees'?'After the write use your native shell tool to run sleep 6, then finish.':'Finish after that write.'} If Hapsland review advice names ${type}, respond ACK_${label} and finish without making another edit. Do not proactively acknowledge review before it arrives.`;
      const prompt = item.kind === 'children'
        ? `This is a child-agent isolation probe. Delegate TWO separate general-purpose subagents concurrently. First task: ${task('A', 'AlphaCount', 'alpha.ts')} Second task: ${task('B', 'BravoCount', 'bravo.ts')} Wait for both. You must not edit either file in the parent. If no subagent tool is available, respond NO_SUBAGENT and make no edits.`
        : destination === 'a' ? task('A', 'AlphaCount', 'alpha.ts') : task('B', 'BravoCount', 'bravo.ts');
      let args;
      if (item.host === 'codex') {
        const home = join(scratch, `codex-${index}`); await mkdir(home, { mode: 0o700 });
        await copyFile('/home/node/.codex/auth.json', join(home, 'auth.json')); await chmod(join(home, 'auth.json'), 0o600);
        await writeFile(join(home, 'config.toml'), '[features]\nhooks=true\nmulti_agent=true\nmulti_agent_v2=true\n');
        await writeFile(join(home, 'hooks.json'), JSON.stringify({ hooks })); env.CODEX_HOME = home;
        args = ['exec', '--json', '--ephemeral', '--dangerously-bypass-hook-trust', '--dangerously-bypass-approvals-and-sandbox',
          '-m', item.kind === 'children' ? 'gpt-6-sol' : 'gpt-6-luna', '-c', 'model_reasoning_effort="medium"', '-C', root, prompt];
      } else {
        const settings = join(scratch, `claude-${index}.json`); await writeFile(settings, JSON.stringify({ hooks }));
        args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--setting-sources', 'user',
          '--settings', settings, '--allowedTools', 'Agent,Task,Read,Write,Edit,Bash', '--permission-mode', 'acceptEdits', prompt];
      }
      jobs.push(run(binaries[item.host], args, env, root));
    }
    const runs = await Promise.all(jobs);
    const events = (await readFile(trace, 'utf8').catch(() => '')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const editEvents = events.filter((event) => event.mode === 'edit');
    const deliveries = events.filter((event) => event.expectedFinding || event.foreignFinding);
    const backgroundDestinations = [...new Set(deliveries.filter(event=>event.mode==='background'&&event.expectedFinding).map(event=>event.destination))];
    const childKeys = [...new Set(editEvents.flatMap((event) => event.childKey === null ? [] : [event.childKey]))];
    const destinations = [...new Set(deliveries.filter((event) => event.expectedFinding).map((event) => event.destination))];
    const concurrentRuns = runs.length === 2 && Math.max(...runs.map((run) => run.startedAt)) < Math.min(...runs.map((run) => run.endedAt));
    const observed = (item.kind!=='background-worktrees'||(backgroundDestinations.includes('a')&&backgroundDestinations.includes('b'))) && runs.every((run) => run.exitCode === 0 && !run.timedOut) && events.every((event) => event.ok) &&
      (!item.kind.endsWith('worktrees') || concurrentRuns) && destinations.includes('a') && destinations.includes('b') &&
      deliveries.every((event) => !event.foreignFinding) && (item.kind !== 'children' || childKeys.length >= 2);
    results.push({ ...item, hostVersion: expectedVersion,
      status: observed ? 'observed-isolated-deliveries' : editEvents.length === 0 && runs.some((run) => run.reportedNoSubagent) ? 'child-route-not-observed' : 'inconclusive',
      distinctPhysicalWorktrees: item.kind.endsWith('worktrees') && (await realpath(roots[0])) !== (await realpath(roots[1])),
      backgroundDestinations, sharedResident: true, concurrentNativeRuns: concurrentRuns,
      distinctEditSessions: new Set(editEvents.map((event) => event.sessionKey)).size,
      suppliedChildIdentities: childKeys.length, expectedDestinationsObserved: destinations,
      foreignFindingDeliveries: deliveries.filter((event) => event.foreignFinding).length,
      parentReceivedChildFinding: deliveries.some((event) => event.destination === 'parent' && event.foreignFinding),
      hookFailures: events.filter((event) => !event.ok).map((event) => ({ mode: event.mode, event: event.event, destination: event.destination })),
      runs: runs.map(({ startedAt, endedAt, ...run }) => ({ ...run, elapsedMs: endedAt - startedAt })), events });
  } catch (cause) {
    results.push({ ...item, status: 'probe-failed', failure: cause instanceof Error ? cause.message : 'unknown probe failure' });
  } finally {
    try { const owner = JSON.parse(await readFile(join(runtime, 'owner.json'), 'utf8')); if (Number.isInteger(owner.pid)) process.kill(owner.pid, 'SIGTERM'); } catch {}
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
const report = { schema: 'hapsland-105-native-isolation-v1', recordedAt: new Date().toISOString(),
  candidateCommit: git('-C', project, 'rev-parse', 'HEAD'), platform: process.platform, architecture: process.arch, node: process.version,
  boundary: 'Pinned native headless runtimes; production composed hooks and shared resident; controlled Effect reviewer; fixture source and advice markers',
  limitations: ['No live Jev requests', 'Finding-marker routing is observed at native hook output; raw model/source output is not retained',
    'Child isolation is established only when native supplied child identities and both distinct finding destinations are observed',
    'Concurrent native runs do not by themselves prove simultaneous backend evaluations', 'Background delivery is only exercised by explicit background-worktrees cases'], results };
const output = join(project, 'evidence/advicing-linux', selected.length === 0 ? 'linux-native-isolation.json' : 'linux-native-isolation-' + selected.join('-') + '.json');
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ output, cases: results.map(({ host, kind, status, suppliedChildIdentities, foreignFindingDeliveries }) => ({ host, kind, status, suppliedChildIdentities, foreignFindingDeliveries })) }));
