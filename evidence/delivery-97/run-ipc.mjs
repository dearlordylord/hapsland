import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const codexBinary = process.env.HAPSLAND_DELIVERY_97_CODEX_BIN ?? 'codex';
const expectedCodexVersion = process.env.HAPSLAND_DELIVERY_97_CODEX_VERSION ?? 'codex-cli 0.156.1';
const evidencePath = process.env.HAPSLAND_DELIVERY_97_EVIDENCE_FILE ??
  join(here, 'codex-0.156.1-luna-max-ipc-2026-09-24.json');
const hook = join(here,'ipc-hook.mjs'), service = join(here,'ipc-service.mjs');
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const prompt = 'Use the native apply_patch tool to add synthetic.ts with exactly `export const state = "BAD";`. Then finish immediately. If a review finding arrives, repair the file to use GOOD with apply_patch and say REVIEW_REPAIRED. Do not proactively repair before receiving review feedback.';
const cases = [
  {id:'ipc-ready', delayMs:0, units:1},
  {id:'ipc-during-stop', delayMs:4000, units:1},
  {id:'ipc-timeout', delayMs:7500, units:1},
  {id:'ipc-late-after-stop', delayMs:12000, units:1},
  {id:'ipc-multi', delayMs:1500, units:2},
  {id:'ipc-unavailable', delayMs:1000, units:1, failure:true},
];
const waitFor = async (path, timeoutMs=3000) => {const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){try{await access(path);return true;}catch{}await new Promise(r=>setTimeout(r,20));}return false;};
const run = (cmd,args,options={}) => new Promise((resolvePromise,reject) => {
  const child=spawn(cmd,args,{...options,stdio:['ignore','pipe','pipe']});
  let out='',err='',pending=''; const timeline=[], started=Date.now();
  child.stdout.on('data',d=>{out+=d;pending+=d;const lines=pending.split('\n');pending=lines.pop();for(const line of lines){try{const x=JSON.parse(line);timeline.push({type:x.type,itemType:x.item?.type??null,at:Date.now()-started});}catch{}}});
  child.stderr.on('data',d=>err+=d);
  child.on('error',reject);child.on('close',(code,signal)=>resolvePromise({code,signal,out,err,timeline}));
});
const assertCodexVersion = async () => {
  const actual = await run(codexBinary,['--version']);
  if (actual.code !== 0 || actual.out.trim() !== expectedCodexVersion) {
    throw new Error('Configured Codex CLI did not match the expected version.');
  }
  return expectedCodexVersion;
};
const loadLines = async (path) => {try{return (await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{return [];}};
const codexVersion=await assertCodexVersion();
const parent=await mkdtemp(join(tmpdir(),'hapsland-97-ipc-'));
const results=[];
try {
  for(const c of cases.filter(c=>process.argv.length<3||process.argv.slice(2).includes(c.id))){
    const base=join(parent,c.id),repo=join(base,'repo'),home=join(base,'home'),probe=join(base,'probe'),socket=join(probe,'review.sock'),eventsPath=join(probe,'events.jsonl');
    await Promise.all([mkdir(repo,{recursive:true}),mkdir(home,{recursive:true}),mkdir(probe,{recursive:true})]);
    await chmod(home,0o700);await copyFile('/home/node/.codex/auth.json',join(home,'auth.json'));await chmod(join(home,'auth.json'),0o600);
    await writeFile(join(home,'config.toml'),'[features]\nhooks = true\n');
    await writeFile(join(home,'hooks.json'),JSON.stringify({description:'isolated issue 97 IPC probe',hooks:{PostToolUse:[{matcher:'^Edit$|^Write$',hooks:[{type:'command',command:`${quote(process.execPath)} ${quote(hook)}`,timeout:5}]}],Stop:[{hooks:[{type:'command',command:`${quote(process.execPath)} ${quote(hook)}`,timeout:5}]}],SessionEnd:[{hooks:[{type:'command',command:`${quote(process.execPath)} ${quote(hook)}`,timeout:2}]}]}}));
    await run('git',['init','--quiet','--initial-branch=main'],{cwd:repo});
    const env={...process.env,CODEX_HOME:home,HAPSLAND_PROBE_SOCKET:socket,HAPSLAND_PROBE_EVENTS:eventsPath,HAPSLAND_PROBE_DELAY_MS:String(c.delayMs),HAPSLAND_PROBE_UNITS:String(c.units),HAPSLAND_PROBE_FAILURE:c.failure?'1':'0'};
    for(const key of ['OPENAI_API_KEY','TYPESAFE_API_KEY'])delete env[key];
    const worker=spawn(process.execPath,[service],{cwd:repo,env,stdio:'ignore'});
    try {
      if(!await waitFor(socket))throw Error('local service unavailable');
      const start=Date.now();
      const args=['exec','--ephemeral','--json','--ignore-user-config','--ignore-rules','--dangerously-bypass-hook-trust','--dangerously-bypass-approvals-and-sandbox','-m','gpt-6-luna','-c','model_reasoning_effort="max"','-C',repo,prompt];
      const host=await run(codexBinary,args,{cwd:repo,env});
      const hostExitedAt=Date.now();
      const postSessionObservationMs=c.id==='ipc-late-after-stop'?6500:0;
      if(postSessionObservationMs>0)await sleep(postSessionObservationMs);
      const events=(await loadLines(eventsPath)).map(e=>({...e,at:e.at-start,...(e.recipient===undefined?{}:{recipient:'<session-agent-root>'})}));
      let file='absent';try{const source=await readFile(join(repo,'synthetic.ts'),'utf8');file=source.includes('GOOD')?'good':source.includes('BAD')?'bad':'other';}catch{}
      const finalText=host.out.split('\n').filter(Boolean).flatMap(line=>{try{const x=JSON.parse(line);return x.item?.type==='agent_message'?[x.item.text??'']:[];}catch{return [];}}).join('\n');
      const stops=events.filter(e=>e.kind==='stop-return');
      const result={id:c.id,delayMs:c.delayMs,units:c.units,failure:Boolean(c.failure),exitCode:host.code,durationMs:hostExitedAt-start,hostExitedAtMs:hostExitedAt-start,postSessionObservationMs,postSessionEvents:events.filter(e=>e.at>hostExitedAt-start).map(e=>e.kind),events,hostEventTimeline:host.timeline,finalFileState:file,modelClaimedRepair:finalText.includes('REVIEW_REPAIRED'),firstStopElapsedMs:stops[0]?.elapsedMs??null,stopBudgetPass:stops.every(e=>e.elapsedMs<=5000),backendCompleted:events.filter(e=>e.kind==='backend-complete').length,hostSubmissions:events.filter(e=>e.kind==='host-submission').length,stderrClass:host.err.includes('Error')?'error':host.err?'other':'empty'};
      results.push(result);
      process.stdout.write(`${c.id}: ${JSON.stringify({exit:result.exitCode,file,stopMs:result.firstStopElapsedMs,budgetPass:result.stopBudgetPass,completions:result.backendCompleted,submissions:result.hostSubmissions})}\n`);
    } finally {if(worker.exitCode===null){worker.kill('SIGTERM');await new Promise(r=>worker.once('close',r));}}
  }
} finally {await rm(parent,{recursive:true,force:true});}
let previous=[];try{previous=JSON.parse(await readFile(evidencePath,'utf8')).cases??[];}catch{}
await writeFile(evidencePath,JSON.stringify({issue:97,host:codexVersion,platform:`${process.platform}-${process.arch}`,node:process.version,model:'gpt-6-luna',reasoningEffort:'max',mode:'headless codex exec ephemeral',backend:'controlled offline Unix-socket service with real timers; no Jev',isolation:'temporary repositories and CODEX_HOME; raw host output and source discarded',cases:[...previous.filter(p=>!results.some(r=>r.id===p.id)),...results]},null,2)+'\n');
