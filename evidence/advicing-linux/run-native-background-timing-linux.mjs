// Opt-in pinned native background timing probe. Raw output and source stay in deleted scratch directories.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, chmod, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const cli = join(project, 'src/cli.ts');
const tracerSource = join(project, 'evidence/advicing-linux/command-trace-background-wrapper.c');
const codex = process.env.HAPSLAND_105_CODEX ?? '/tmp/hapsland-105-hosts/node_modules/.bin/codex';
const claude = process.env.HAPSLAND_105_CLAUDE ?? '/tmp/hapsland-105-hosts/node_modules/.bin/claude';
if (process.platform !== 'linux') throw new Error('This timing probe requires Linux');
const selected = process.argv.slice(2);
const cases = ['codex', 'claude'].flatMap(host => ['tool', 'final', 'after-end', 'race'].map(phase => ({host, phase})))
  .filter(({host, phase}) => selected.length === 0 || selected.includes(`${host}-${phase}`));
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const run = (command, args, options) => new Promise((resolveRun, reject) => {
  const started = Date.now();
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', pending = ''; const nativeEvents = [];
  const inspect = (line) => { let r; try { r=JSON.parse(line); } catch { return; }
    const item=r.item, event=r.event; nativeEvents.push({at:Date.now()-started,type:r.type, subtype:r.subtype??null,itemType:item?.type??null,eventType:event?.type??null,deltaType:event?.delta?.type??null, hasText:typeof event?.delta?.text==='string'}); };
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} child.stdout.destroy(); child.stderr.destroy(); }, 100_000);
  child.stdout.on('data', (chunk) => { stdout += chunk; pending += chunk; let n; while((n=pending.indexOf('\n'))>=0){inspect(pending.slice(0,n));pending=pending.slice(n+1);} });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', (code, signal) => { clearTimeout(timer); resolveRun({ code, signal, timedOut, stdout, stderr, nativeEvents, elapsedMs: Date.now() - started }); });
});
const exact = (binary, expected) => {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0 || !result.stdout.includes(expected)) throw new Error(`Exact ${expected} binary unavailable`);
};
const activityStages = async (directory) => {
  const stages = [];
  const visit = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else {
        try { stages.push(JSON.parse(await readFile(child, 'utf8')).stage); } catch { /* ignore */ }
      }
    }
  };
  await visit(directory);
  return stages.filter((stage) => typeof stage === 'string');
};
const nativeToolNames = (stdout) => {
  const names = [];
  const allowed = new Set(['Read', 'Edit', 'Write', 'apply_patch', 'read_file', 'functions.exec_command']);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object' || value === null) return;
    for (const [key, item] of Object.entries(value)) {
      if (['name', 'tool_name', 'tool'].includes(key) && typeof item === 'string' && allowed.has(item)) names.push(item);
      else if (typeof item === 'object') visit(item);
    }
  };
  for (const line of stdout.split('\n')) {
    try { visit(JSON.parse(line)); } catch { /* ignore non-JSON host text */ }
  }
  return names;
};
if (cases.some(({ host }) => host === 'codex')) exact(codex, '0.155.1');
if (cases.some(({ host }) => host === 'claude')) exact(claude, '2.1.218');
const results = [];
for (const entry of cases) {
  const scratch = await mkdtemp(join(tmpdir(), `hapsland-105-${entry.host}-${entry.phase}-`));
  const repo = join(scratch, 'repo'), runtime = join(scratch, 'runtime');
  const trace = join(scratch, 'hook-trace.jsonl'), statePath = join(scratch, 'state');
  const windowsPath = join(scratch, 'command-windows.jsonl');
  const activityPath = join(scratch, 'activity'), outcomePath = join(scratch, 'outcomes.jsonl');
  const capturePath = join(scratch, 'calls.jsonl'), bridge = join(scratch, 'bridge.mjs');
  const observer=join(scratch,'observer.mjs'), ipcPath=join(scratch,'ipc.jsonl');
  try {
    const candidate = true;
    await mkdir(repo);
    if (spawnSync('git', ['init', '--quiet', repo]).status !== 0) throw new Error('scratch Git init failed');
    await writeFile(join(repo, 'README.md'), 'Background delivery fixture.\n');
    await writeFile(observer, `import {Socket} from 'node:net';
import {appendFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const original=Socket.prototype.write;const hash=v=>typeof v==='string'?createHash('sha256').update(v).digest('hex'):null;
const emit=x=>appendFileSync(process.env.HAPSLAND_PROBE_IPC,JSON.stringify({at:Date.now()-Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS),mode:process.env.HAPSLAND_PROBE_MODE,...x})+'\\n');
Socket.prototype.write=function(chunk,...rest){let q;try{q=JSON.parse(String(chunk).trim())}catch{}if(q?.version&&q?.operation){emit({direction:'request',operation:q.operation,token:hash(q.token),surface:q.surface??null});let text='';this.prependListener('data',c=>{text+=c;const n=text.indexOf('\\n');if(n<0)return;let r;try{r=JSON.parse(text.slice(0,n))}catch{return}emit({direction:'response',operation:q.operation,status:r.status??null,token:hash(r.token),findingCount:r.findingCount??null,ok:r.ok??null});text='';});}return original.call(this,chunk,...rest);};
`);
    await writeFile(bridge, `import {spawnSync} from 'node:child_process';\n` +
      `import {appendFileSync,readFileSync} from 'node:fs';\n` +
      `const mode=process.argv[2], host=process.argv[3];\n` +
      `if(mode==='background'&&process.env.HAPSLAND_105_BACKGROUND_DELAY_MS)await new Promise(r=>setTimeout(r,Number(process.env.HAPSLAND_105_BACKGROUND_DELAY_MS)));\n` +
      `let input=''; try{input=readFileSync(0,'utf8')}catch{}\n` +
      `let native={}; try{native=JSON.parse(input)}catch{}\n` +
      `const started=Date.now();\n` +
      `if(mode==='observe'){appendFileSync(process.env.HAPSLAND_105_TRACE,JSON.stringify({mode,at:started-Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS),event:native.hook_event_name,nativeTool:native.tool_name,runInBackground:native.tool_input?.run_in_background===true,toolTimeoutMs:typeof native.tool_input?.timeout==='number'?native.tool_input.timeout:null,toolResponseKeys:native.tool_response&&typeof native.tool_response==='object'?Object.keys(native.tool_response).sort():[],toolExitCode:typeof native.tool_response?.exitCode==='number'?native.tool_response.exitCode:null,toolInterrupted:native.tool_response?.interrupted===true,toolBackgroundTask:typeof native.tool_response?.backgroundTaskId==='string',toolIdHash:typeof native.tool_use_id==='string'?(await import('node:crypto')).createHash('sha256').update(native.tool_use_id).digest('hex'):null,ok:true})+'\\n');process.stdout.write('{}\\n');process.exit(0); }\n` +
      `const args=['--import',process.env.HAPSLAND_PROBE_OBSERVER,process.env.HAPSLAND_105_CLI,'--controlled-reviewer','--controlled-writer',` +
      `mode==='edit'?'--'+host+'-hook':'--composed-'+mode+'-hook',` +
      `...(mode==='edit'?(process.env.HAPSLAND_105_COMPOSED_EDIT==='1'?['--composed-edit-hook']:[]):` +
      `['--composed-host='+ (host==='claude'?'claude-code':'codex-cli')])];\n` +
      `const result=spawnSync(process.execPath,args,{input,encoding:'utf8',env:{...process.env,HAPSLAND_PROBE_MODE:mode},timeout:mode==='background'?21000:mode==='stop'?4800:5000,maxBuffer:262144});\n` +
      `let output={}; try{output=JSON.parse(result.stdout)}catch{}\n` +
      `const message=output?.hookSpecificOutput?.additionalContext??output?.reason??output?.systemMessage??'';\n` +
      `appendFileSync(process.env.HAPSLAND_105_TRACE,JSON.stringify({mode,host,at:Date.now()-Number(process.env.HAPSLAND_PROBE_STARTED_AT_MS),ok:result.status===0,` +
      `nativeTool:['Edit','Write','apply_patch'].includes(native.tool_name)?native.tool_name:null,` +
      `eventKeys:Object.keys(native).sort(),hasPrompt:typeof native.prompt==='string',hasTurnId:typeof native.turn_id==='string',stopActive:native.stop_hook_active===true,` +
      `inputKeys:typeof native.tool_input==='object'&&native.tool_input!==null&&!Array.isArray(native.tool_input)?Object.keys(native.tool_input).sort():[],` +
      `responseKeys:typeof native.tool_response==='object'&&native.tool_response!==null&&!Array.isArray(native.tool_response)?Object.keys(native.tool_response).sort():[],` +
      `responseKind:typeof native.tool_response,` +
      `userModified:native.tool_response?.userModified??null,pathMatches:['Edit','Write'].includes(native.tool_name)?native.tool_input?.file_path===native.tool_response?.filePath:null,` +
      `stringsMatch:native.tool_name==='Edit'?native.tool_input?.old_string===native.tool_response?.oldString&&native.tool_input?.new_string===native.tool_response?.newString:null,` +
      `elapsedMs:Date.now()-started,finding:typeof message==='string'&&/r6_|bare domain|primitive type/i.test(message),` +
      `messageLength:typeof message==='string'?message.length:0,` +
      `submitted:result.status===0&&Boolean(result.stdout.trim())&&result.stdout.trim()!=='{}',` +
      `blocked:output?.decision==='block'})+'\\n');\n` +
      `if(result.status===0)process.stdout.write(result.stdout);\n`, { mode: 0o700 });
    const env = { ...process.env,
      REVIEW_STATE_PATH: statePath, REVIEW_ACTIVITY_PATH: activityPath,
      REVIEW_RESIDENT_DIR: runtime, REVIEW_CONTROL_JSON: JSON.stringify({
        syntheticR6BrandedRepair: 'finding',
        // Native event timing is observed, never inferred from this requested delay.
        delayMs: entry.phase === 'after-end' ? 30000 : entry.phase === 'tool' ? 10000 : entry.phase === 'race' ? 3000 : 1200,
        outcomePath, capturePath,
      }), HAPSLAND_105_TRACE: trace, HAPSLAND_105_CLI: cli,HAPSLAND_PROBE_OBSERVER:observer,HAPSLAND_PROBE_IPC:ipcPath,
      ...(candidate ? { HAPSLAND_105_BACKGROUND_DELAY_MS: '0',
        HAPSLAND_105_COMPOSED_EDIT: '1' } : {}) };
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TYPESAFE_API_KEY']) delete env[key];
    const enable = (operation, proposalDigest) => spawnSync(process.execPath, [cli, `--${operation}`], {
      cwd: project, env,
      input: JSON.stringify({ version: 1, operation, cwd: repo, ...(proposalDigest ? { proposalDigest } : {}) }),
      encoding: 'utf8', timeout: 10_000,
    });
    const proposal = enable('enable');
    if (proposal.status !== 0) throw new Error('consent preview failed');
    const confirmation = enable('enable-confirm', JSON.parse(proposal.stdout).proposal.digest);
    if (confirmation.status !== 0 || JSON.parse(confirmation.stdout).status !== 'enabled') throw new Error('consent failed');
    // Compare delivery with the same ready resident in both phases. Cold
    // startup has a separate host-timeout gate; it can exceed the legacy
    // five-second edit hook and confound the before/after delivery outcome.
    const warm = spawnSync(process.execPath, ['--input-type=module', '-e',
      'import { ensureResident } from "./src/resident/client.ts"; import { residentPaths } from "./src/resident/paths.ts"; await ensureResident(residentPaths(), 10000);'],
    { cwd: project, env, encoding: 'utf8', timeout: 12_000 });
    if (warm.status !== 0) throw new Error('resident warmup failed');
    const command = (mode) => `${mode === 'before-edit' ? 'exec ' : ''}${quote(process.execPath)} ${quote(bridge)} ${mode} ${entry.host}`;
    const edit = { type: 'command', command: command('edit'), timeout: 5 };
    const beforeEdit = { type: 'command', command: command('before-edit'), timeout: 5 };
    const background = { type: 'command', command: command('background'), timeout: 25, async: true };
    const stop = { type: 'command', command: command('stop'), timeout: 5 };
    const promptHook = { type: 'command', command: command('prompt'), timeout: 4 };
    if (entry.host === 'codex') {
      const home = join(scratch, 'codex-home');
      await mkdir(home, { mode: 0o700 });
      await copyFile('/home/node/.codex/auth.json', join(home, 'auth.json'));
      await chmod(join(home, 'auth.json'), 0o600);
      await writeFile(join(home, 'config.toml'), '[features]\nhooks = true\n');
      await writeFile(join(home, 'hooks.json'), JSON.stringify({ hooks: {
        ...(candidate ? { PreToolUse: [{ matcher: '^apply_patch$', hooks: [beforeEdit] }, {matcher:'.*',hooks:[{type:'command',command:command('observe'),timeout:3}]}] } : {}),
        PostToolUse: [{ matcher: '^apply_patch$', hooks: candidate ? [edit, background] : [edit] }, {matcher:'.*',hooks:[{type:'command',command:command('observe'),timeout:3}]}],
        ...(candidate ? { UserPromptSubmit: [{ hooks: [promptHook] }], Stop: [{ hooks: [stop] }] } : {}),
      } }));
      env.CODEX_HOME = home;
    } else {
      const claudeSettings = join(repo, '.claude');
      await mkdir(claudeSettings);
      await writeFile(join(claudeSettings, 'settings.json'), JSON.stringify({ hooks: {
        ...(candidate ? { PreToolUse: [{ matcher: 'Edit|Write', hooks: [beforeEdit] }, {matcher:'.*',hooks:[{type:'command',command:command('observe'),timeout:3}]}] } : {}),
        PostToolUse: [{ matcher: 'Edit|Write', hooks: candidate ? [edit, background] : [edit] }, {matcher:'.*',hooks:[{type:'command',command:command('observe'),timeout:3}]}],
        ...(candidate ? { UserPromptSubmit: [{ hooks: [promptHook] }], Stop: [{ hooks: [stop] }] } : {}),
      } }));
    }
    const instruction = entry.host === 'codex'
      ? 'Use native apply_patch to create order-count.ts containing exactly one line: type OrderCount = number.'
      : 'Use the native Write tool to create order-count.ts containing exactly one line: type OrderCount = number.';
    const continuation = 'If a Hapsland review finding arrives, use a native edit tool to change the line to: type OrderCount = number & { readonly __brand: "OrderCount" }. Then finish by saying REVIEW_REPAIRED. Do not proactively repair.';
    const prompt = `${instruction} ${entry.phase === 'tool' ? (entry.host === 'claude' ? 'Your first tool-use message must contain both the requested Write and Bash with command sleep 15, timeout 20000, run_in_background false. These two calls are independent; run them together. Do not issue other shell commands or repeat the sleep. After a repair, do not run Bash again.' : 'Immediately afterward, use your native shell tool to run sleep 25 in the foreground, never run_in_background, and wait for command completion before finishing.') : entry.phase === 'final' ? 'Afterward write a final response consisting of 800 words explaining basic arithmetic; do not make other tool calls unless advice arrives.' : 'Finish immediately after that edit.'} ${continuation}`;
    if (entry.host === 'claude' && entry.phase === 'tool') env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
    const binary = entry.host === 'codex' ? codex : claude;
    const claudeSettingsPath = join(repo, '.claude', 'settings.json');
    const args = entry.host === 'codex'
      ? ['exec', '--json', '--ephemeral', '--dangerously-bypass-hook-trust',
        '--dangerously-bypass-approvals-and-sandbox', '-m', 'gpt-6-luna', '-c',
        'model_reasoning_effort="medium"', '-C', repo, prompt]
      : ['-p', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--no-session-persistence',
        '--setting-sources', 'user', '--settings', claudeSettingsPath, ...(entry.phase === 'tool' ? ['--effort', 'low'] : []),
        '--tools', 'Read,Edit,Write,Bash', '--allowedTools', 'Read,Edit,Write,Bash', '--permission-mode', 'acceptEdits', prompt];
    const launchTracing = true;
    let tracedCommand = binary, tracedArgs = args;
    if (launchTracing) {
      const tracer = join(scratch, 'command-trace-wrapper');
      const compiled = spawnSync('cc', ['-O2', '-Wall', '-Wextra', '-Werror', tracerSource, '-o', tracer], { encoding: 'utf8' });
      if (compiled.status !== 0) throw new Error('Linux command tracer could not be compiled');
      tracedCommand = tracer;
      tracedArgs = [bridge, windowsPath, '--', binary, ...args];
    }
    const hostStartedAt = Date.now();
    env.HAPSLAND_PROBE_STARTED_AT_MS = String(hostStartedAt);
    const backendCompletionTimes = [];
    let monitoring = true;
    const monitor = (async () => {
      let seen = 0;
      while (monitoring) {
        const count = (await readFile(outcomePath, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
        if (count > seen) {
          const observedAt = (await stat(outcomePath)).mtimeMs - hostStartedAt;
          while (seen < count) { backendCompletionTimes.push(Math.round(observedAt)); seen += 1; }
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 15));
      }
    })();
    const hostRun = await run(tracedCommand, tracedArgs, { cwd: repo, env }).catch(async (cause) => {
      monitoring = false;
      await monitor;
      throw cause;
    });
    const completionAtHostExit = (await readFile(outcomePath, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
    const windows = (await readFile(windowsPath, 'utf8').catch(() => '')).split('\n').filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event.kind === 'host-command-window')
      .map(({ mode, launchAt, at, elapsedUs, exitCode, signal }) =>
        ({ mode, launchAt, at, elapsedUs, exitCode, signal }));
    const expectedCompletions = candidate ? 2 : 1;
    const completionDeadline = Date.now() + (entry.phase === 'after-end' ? 2000 : 1000);
    while (Date.now() < completionDeadline) {
      const count = (await readFile(outcomePath, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
      if (count >= expectedCompletions) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    monitoring = false;
    await monitor;
    const rawTrace = await readFile(trace, 'utf8').catch(() => '');
    const hooks = rawTrace.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const file = await readFile(join(repo, 'order-count.ts'), 'utf8').catch(() => '');
    const modelClaimedRepair = hostRun.stdout.includes('REVIEW_REPAIRED');
    const backendCompletions = (await readFile(outcomePath, 'utf8').catch(() => '')).split('\n').filter(Boolean).length;
    const stages = await activityStages(activityPath);
    const result = { ...entry, hostVersion: entry.host === 'codex' ? '0.155.1' : '2.1.218',
      residentReadyBeforeHost: true,
      ...(entry.host === 'claude' && entry.phase === 'tool' ? { toolScenario: { explicitAvailableTools: ['Read','Edit','Write','Bash'], effort: 'low', backgroundAgentTasksDisabled: true, pairedInitialWriteAndSleepRequested: true, sleepSeconds: 15 } } : {}),
      exitCode: hostRun.code, signal: hostRun.signal, timedOut: hostRun.timedOut, elapsedMs: hostRun.elapsedMs,
      hookCounts: Object.fromEntries(['before-edit', 'edit', 'background', 'stop', 'prompt'].map((mode) => [mode, hooks.filter((hook) => hook.mode === mode).length])),
      hookSequence: hooks.map(({ mode, at, ok, elapsedMs, finding, submitted, blocked, eventKeys, hasPrompt, hasTurnId, stopActive }) =>
        ({ mode, at, ok, elapsedMs, finding, submitted, blocked, eventKeys, hasPrompt, hasTurnId, stopActive })),
      nativeHookShapes: hooks.filter((hook) => hook.mode === 'edit').map(({ nativeTool, inputKeys, responseKeys, responseKind,
        userModified, pathMatches, stringsMatch }) =>
        ({ nativeTool, inputKeys, responseKeys, responseKind, userModified, pathMatches, stringsMatch })),
      nativeToolNames: nativeToolNames(hostRun.stdout),
      nativeEvents:hostRun.nativeEvents,
      observedToolHooks:hooks.filter(h=>h.mode==='observe'),
      ipc:(await readFile(ipcPath,'utf8').catch(()=>'')).split('\n').filter(Boolean).map(l=>JSON.parse(l)),
      ...(launchTracing ? { commandWindows: windows } : {}),
      backendCompletions,
      backendCompletionTimes,
      backendCompletedAfterHostExit: completionAtHostExit === 0 && backendCompletions > 0,
      clearFollowUp: stages.includes('clear'),
      activityStages: stages,
      submissionAfterNativeExit: hooks.some(hook=>hook.submitted&&hook.finding&&hook.at>hostRun.elapsedMs),
      findingSubmission: hooks.some((hook) => hook.finding && hook.submitted),
      stopBlock: hooks.some((hook) => hook.mode === 'stop' && hook.blocked),
      originalFile: /^type OrderCount = number\r?\n?$/.test(file),
      repairedFile: /__brand: "OrderCount"/.test(file), modelClaimedRepair,
      hookFailures: hooks.filter((hook) => !hook.ok).map((hook) => hook.mode),
      hostError: hostRun.code !== 0 || hostRun.stderr.includes('Error'),
    };
    results.push(result);
    process.stdout.write(`${entry.host}-${entry.phase}: ${JSON.stringify({
      exitCode: result.exitCode, timedOut: result.timedOut, hooks: result.hookCounts,
      backendCompletions: result.backendCompletions, findingSubmission: result.findingSubmission,
      stopBlock: result.stopBlock, repairedFile: result.repairedFile,
      clearFollowUp: result.clearFollowUp, hookFailures: result.hookFailures,
    })}\n`);
  } finally {
    try {
      const owner = JSON.parse(await readFile(join(runtime, 'owner.json'), 'utf8'));
      if (Number.isSafeInteger(owner.pid) && owner.pid > 0) process.kill(owner.pid, 'SIGTERM');
    } catch { /* resident already stopped or never started */ }
    if (process.env.HAPSLAND_105_KEEP_TEMP === '1') process.stderr.write(`Scratch retained: ${scratch}\n`);
    else await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
const compact = (items) => { const result=[]; for(const item of items){const previous=result.at(-1);const {at,...shape}=item; const key=JSON.stringify(shape); if(previous?.key===key){previous.value.lastAt=at;previous.value.count=(previous.value.count??1)+1;}else result.push({key,value:{...item}});} return result.map(x=>x.value); };
for(const result of results){ result.nativeEvents=compact(result.nativeEvents);result.ipc=compact(result.ipc.filter(x=>x.operation!=='hello'&&!(x.direction==='request'&&x.operation==='collect'))); }
const out = process.env.HAPSLAND_105_EVIDENCE_FILE ?? join(project, 'evidence/advicing-linux/linux-native-background-timing' + (selected.length ? '-' + selected.join('-') : '') + '.json');
await writeFile(out, JSON.stringify({issue:105, candidateCommit:spawnSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).stdout.trim(), platform:process.platform,node:process.version,backend:'controlled offline Effect DecisionModel',commandTiming:'Linux ptrace child launch through exit, observer overhead included',limitations:['No live Jev','No direct network request start/end instrumentation','Output submission is not proof of agent observation','Only explicit native stream/tool events support timing classifications'],cases:results},null,2)+'\n');
