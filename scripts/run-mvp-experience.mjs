// Opt-in real Codex + real Jev demonstration. Retains only source-free evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { residentRequest } from '../src/resident/client.ts';
import { residentPaths } from '../src/resident/paths.ts';
const root = resolve(new URL('../', import.meta.url).pathname);
const declaration = { maximumProviderRequests: 6, deadlineMs: 15000, automaticRetries: 0, maximumFixtureFileBytes: 32768, syntheticRepositoryOnly: true };
if (!process.argv.includes('--execute-paid')) { console.error('Pass --execute-paid to run the declared live demonstration.'); process.exit(2); }
console.log(JSON.stringify({ milestone: 'real-codex-real-jev-repair', declaration }));
const run = (cmd, args, options = {}) => new Promise((res, rej) => {
  const p = spawn(cmd, args, {cwd: options.cwd, env: options.env ?? process.env, stdio:['pipe','pipe','pipe']});
  let stdout='', stderr=''; const timer = setTimeout(()=>p.kill('SIGTERM'), options.timeout ?? 240000);
  p.stdout.on('data', c=>stdout+=c); p.stderr.on('data', c=>stderr+=c);
  p.on('error', rej); p.on('close', code=>{clearTimeout(timer);res({code,stdout,stderr});}); p.stdin.end(options.input);
});
const json = s => {try{return JSON.parse(s)}catch{return undefined}};
const lines = s => s.split('\n').filter(Boolean).map(json).filter(Boolean);
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
let key=process.env.TYPESAFE_API_KEY;
if (!key) {
  const envText=await readFile(join(root,'.env'),'utf8').catch(()=> '');
  const value=envText.match(/^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/m)?.[1];
  key=value?.replace(/^(['"])(.*)\1$/, '$2');
}
if (!key) throw new Error('Jev credential unavailable');
const temp=await mkdtemp(join(tmpdir(),'mvp-experience-'));
const repo=join(temp,'repo'), home=join(temp,'codex'), runtime=join(temp,'runtime'), events=join(temp,'events.jsonl'), calls=join(temp,'calls.jsonl');
let owner, record;
try {
  await mkdir(repo); await mkdir(home,{mode:0o700});
  await copyFile('/home/node/.codex/auth.json',join(home,'auth.json')); await chmod(join(home,'auth.json'),0o600);
  await run('git',['init','--quiet','--initial-branch=master'],{cwd:repo});
  await writeFile(join(repo,'README.md'),'# Payment state example\nA payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result; success and failure are mutually exclusive.\n');
  await writeFile(join(repo,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],skipLibCheck:true},include:['*.ts']}));
  const tsc=join(root,'node_modules/typescript/bin/tsc');
  await writeFile(join(repo,'package.json'),JSON.stringify({private:true,scripts:{test:`${quote(process.execPath)} ${quote(tsc)} -p tsconfig.json`}}));
  // Instrument the actual fetch boundary without reading requests or responses.
  const observer=join(temp,'observe-fetch.mjs');
  await writeFile(observer,`import {appendFileSync,readFileSync} from 'node:fs';\nconst original=globalThis.fetch; globalThis.fetch=async (...args)=>{const url=String(args[0]?.url??args[0]);if(!url.includes('/v1/systemone'))return original(...args);let count=0;try{count=readFileSync(process.env.DEMO_CALLS,'utf8').trim().split('\\n').filter(Boolean).length}catch{}if(count>=6)throw new Error('demo provider request budget exhausted');const started=Date.now();appendFileSync(process.env.DEMO_CALLS,JSON.stringify({kind:'request',at:started})+'\\n',{mode:0o600});try{const response=await original(...args);appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'provider-response',at:Date.now(),durationMs:Date.now()-started,status:response.status})+'\\n',{mode:0o600});return response}catch(e){appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'provider-failure',at:Date.now()})+'\\n',{mode:0o600});throw e}};\n`);
  const hook=join(temp,'hook.mjs');
  await writeFile(hook,`import {readFileSync,appendFileSync,existsSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';\nconst input=readFileSync(0,'utf8');let event;try{event=JSON.parse(input)}catch{}const at=Date.now();const p=spawnSync(process.execPath,[${JSON.stringify(join(root,'src/cli.ts'))},'--codex-hook','--controlled-writer'],{input,encoding:'utf8',env:process.env,maxBuffer:1048576});let out;try{out=JSON.parse(p.stdout)}catch{}const context=out?.hookSpecificOutput?.additionalContext??'';const file=${JSON.stringify(join(repo,'payment.ts'))};const source=existsSync(file)?readFileSync(file,'utf8'):'';appendFileSync(process.env.DEMO_EVENTS,JSON.stringify({kind:'hook',at,doneAt:Date.now(),tool:event?.tool_name??'unknown',exitCode:p.status,findings:context.startsWith('Advisory direct-event review')&&!context.includes('Operational notice:'),notice:context.includes('Operational notice:'),rule2:context.includes('field combinations with no domain meaning'),sourceHash:source?createHash('sha256').update(source).digest('hex'):null,sourceBytes:Buffer.byteLength(source),draft:source.includes('receipt: string | null')&&source.includes('failureReason: string | null')})+'\\n',{mode:0o600});process.stdout.write(p.stdout??'');process.stderr.write(p.stderr??'');process.exitCode=p.status??1;\n`);
  await writeFile(join(home,'config.toml'),'[features]\nhooks = true\n');
  await writeFile(join(home,'hooks.json'),JSON.stringify({hooks:{PostToolUse:[{matcher:'^(apply_patch|Bash)$',hooks:[{type:'command',command:`${quote(process.execPath)} ${quote(hook)}`,timeout:20}]}]}}));
  const env={...process.env,CODEX_HOME:home,TYPESAFE_API_KEY:key,REVIEW_RESIDENT_DIR:runtime,REVIEW_USER_CONFIG_PATH:join(temp,'absent-user-config.jsonc'),DEMO_EVENTS:events,DEMO_CALLS:calls,NODE_OPTIONS:`--import=${observer}`};
  delete env.REVIEW_CONTROL_JSON; delete env.OPENAI_API_KEY;
  const prompt=`Implement the payment-state example described in README.md. First use apply_patch to add payment.ts with this initial draft exactly:\nexport interface PaymentState {\n  status: "pending" | "succeeded" | "failed";\n  receipt: string | null;\n  failureReason: string | null;\n}\nThen add examples.ts with examples of all three valid business states, document the API in README.md, and run npm test. The initial draft is a starting point, not a compatibility requirement. Address automated review feedback if it arrives, preserving the business meaning. Use apply_patch for source edits. Stay inside this repository; do not inspect integration configuration, environment variables, or credentials. Make at most three source-edit tool calls and keep each TypeScript file under 4 KiB. In your final reply explain whether automated review feedback affected your changes. Do not invent feedback. Work autonomously.`;
  const start=Date.now();
  const host=await run('codex',['exec','--ephemeral','--json','--dangerously-bypass-hook-trust','--dangerously-bypass-approvals-and-sandbox','--ignore-rules','-C',repo,prompt],{cwd:repo,env});
  const history=lines(await readFile(events,'utf8').catch(()=>''));
  const messages=lines(host.stdout).filter(e=>e.item?.type==='agent_message').map(e=>e.item.text??'');
  const source=await readFile(join(repo,'payment.ts'),'utf8').catch(()=> '');
  const test=await run('npm',['test'],{cwd:repo,env});
  // Independent compile-time rejection checks, after Codex exits; no review events fabricated.
  await writeFile(join(repo,'invalid-states.ts'),`import type { PaymentState } from './payment.js';\n// @ts-expect-error success requires receipt\nconst missing: PaymentState = { status: 'succeeded', receipt: null, failureReason: null };\n// @ts-expect-error pending cannot contain a successful result\nconst premature: PaymentState = { status: 'pending', receipt: 'r', failureReason: null };\n// @ts-expect-error success cannot also carry a failure\nconst contradictory: PaymentState = { status: 'succeeded', receipt: 'r', failureReason: 'failed' };\n`);
  const invalid=await run('npm',['test'],{cwd:repo,env});
  const paths=residentPaths(runtime);
  owner=json(await readFile(paths.owner,'utf8').catch(()=>''));
  const stats=owner?await residentRequest(paths,{version:1,operation:'stats',lifetime:owner.lifetime}).catch(()=>undefined):undefined;
  const finding=history.find(e=>e.kind==='hook'&&e.findings);
  const changedAfterFinding=!!finding&&history.some(e=>e.kind==='hook'&&e.tool==='apply_patch'&&e.at>finding.at&&e.sourceHash!==finding.sourceHash);
  record={schemaVersion:1,recordedAt:new Date().toISOString(),declaration,hostExitCode:host.code,elapsedMs:Date.now()-start,providerRequests:lines(await readFile(calls,'utf8').catch(()=>'')).length,timeline:history.map(e=>({...e,atMs:e.at-start,at:undefined,doneAt:undefined})),checks:{initialDraftObserved:history.some(e=>e.draft),realFindingSubmitted:!!finding,editAfterFinding:changedAfterFinding,validExamplesCompile:test.code===0,invalidStatesRejected:invalid.code===0,agentMentionsReview:messages.some(m=>/review|feedback|advisory/i.test(m)),finalSourceChanged:source.length>0&&!source.includes('receipt: string | null')},resident:stats?.status==='stats'?{queued:stats.queued,running:stats.running,successfulCacheEntries:stats.successfulCacheEntries,pendingFindingBatches:stats.pendingFindingBatches,pendingOperationalNotices:stats.pendingOperationalNotices}:null,rawTranscriptRetained:false,rawBackendMaterialRetained:false};
  record.verdict=host.code===0&&Object.values(record.checks).every(Boolean)?'demonstrated':'incomplete';
  await mkdir(join(root,'evidence/direct-event-v1'),{recursive:true});
  await writeFile(join(root,'evidence/direct-event-v1/mvp-experience.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify(record,null,2));
} finally {
  owner ??= json(await readFile(residentPaths(runtime).owner, 'utf8').catch(() => ''));
  if(owner){const paths=residentPaths(runtime);await residentRequest(paths,{version:1,operation:'cleanup',lifetime:owner.lifetime}).catch(()=>{});try{process.kill(owner.pid,'SIGTERM')}catch{}}
  await rm(temp,{recursive:true,force:true});
}
if(record?.verdict!=='demonstrated')process.exitCode=1;
