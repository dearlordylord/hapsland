import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = resolve(fileURLToPath(new URL('./hook.mjs', import.meta.url)));
const codexBinary = process.env.HAPSLAND_DELIVERY_97_CODEX_BIN ?? 'codex';
const expectedCodexVersion = process.env.HAPSLAND_DELIVERY_97_CODEX_VERSION ?? 'codex-cli 0.156.1';
const evidencePath = process.env.HAPSLAND_DELIVERY_97_EVIDENCE_FILE ??
  resolve(fileURLToPath(new URL('./codex-0.156.1-luna-max-2026-09-24.json', import.meta.url)));
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const prompt = 'Use the native apply_patch tool to add synthetic.ts with exactly `export const state = "BAD";`. Then finish immediately. If a review finding arrives, repair the file to use GOOD with apply_patch and say REVIEW_REPAIRED. Do not proactively repair before receiving review feedback.';
const nextEventPrompt = 'Use native apply_patch to add synthetic.ts with exactly `export const state = "BAD";`. Next, use a separate native apply_patch call to add note.ts with exactly `export const note = 1;`. Then finish. If a review finding arrives, repair synthetic.ts to use GOOD with apply_patch and say REVIEW_REPAIRED. Do not proactively repair.';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cases = [
  {id:'baseline-before-stop', mode:'baseline', delay:0, units:1},
  {id:'baseline-next-hook', mode:'baseline', delay:0, units:1, prompt:nextEventPrompt},
  {id:'bounded-before-stop', mode:'bounded', delay:0, units:1},
  {id:'bounded-delayed', mode:'bounded', delay:1500, units:1},
  {id:'bounded-during-stop', mode:'bounded', delay:4000, units:1},
  {id:'bounded-timeout', mode:'bounded', delay:7500, units:1},
  {id:'bounded-multi', mode:'bounded', delay:1000, units:2},
  {id:'bounded-failure', mode:'bounded', delay:400, units:1, failure:true},
  {id:'background-delayed', mode:'background', delay:1500, units:1},
  {id:'background-during-stop', mode:'background', delay:4000, units:1},
  {id:'background-after-end', mode:'background', delay:7500, units:1},
];
const run = (cmd,args,options={}) => new Promise((resolvePromise,reject) => {
  const child=spawn(cmd,args,{...options,stdio:['ignore','pipe','pipe']});
  let out='',err='',pending=''; const timeline=[]; const started=Date.now();
  child.stdout.on('data', d=>{
    out+=d; pending+=d;
    const lines=pending.split('\n'); pending=lines.pop();
    for(const line of lines){try{const x=JSON.parse(line);timeline.push({type:x.type,itemType:x.item?.type??null,at:Date.now()-started});}catch{}}
  });
  child.stderr.on('data', d=>err+=d);
  child.on('error',reject); child.on('close',(code,signal)=>resolvePromise({code,signal,out,err,timeline}));
});
const assertCodexVersion = async () => {
  const actual = await run(codexBinary,['--version']);
  if (actual.code !== 0 || actual.out.trim() !== expectedCodexVersion) {
    throw new Error('Configured Codex CLI did not match the expected version.');
  }
  return expectedCodexVersion;
};
const loadLines = async (path) => {try{return (await readFile(path,'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));}catch{return [];}};
const main = async () => {
  const codexVersion = await assertCodexVersion();
  const parent=await mkdtemp(join(tmpdir(),'hapsland-97-'));
  const results=[];
  try {
    for (const c of cases.filter(c => process.argv.length < 3 || process.argv.slice(2).includes(c.id))) {
      const repo=join(parent, c.id, 'repo'), home=join(parent,c.id,'home'), dir=join(parent,c.id,'probe');
      await Promise.all([mkdir(repo,{recursive:true}),mkdir(home,{recursive:true}),mkdir(dir,{recursive:true})]);
      await chmod(home,0o700);
      await copyFile('/home/node/.codex/auth.json',join(home,'auth.json'));
      await chmod(join(home,'auth.json'),0o600);
      await writeFile(join(home,'config.toml'),'[features]\nhooks = true\n');
      const command=`${quote(process.execPath)} ${quote(hook)}`;
      const handler={type:'command',command,timeout:10};
      const hooks={
        PostToolUse:[{matcher:'^Edit$|^Write$',hooks:[{...handler, ...(c.mode==='background'?{async:true}:{})}]}],
        Stop:[{hooks:[handler]}],
        SessionEnd:[{hooks:[handler]}],
      };
      await writeFile(join(home,'hooks.json'),JSON.stringify({description:'isolated issue 97 probe',hooks}));
      await run('git',['init','--quiet','--initial-branch=main'],{cwd:repo});
      const env={...process.env,CODEX_HOME:home,HAPSLAND_PROBE_DIR:dir,HAPSLAND_PROBE_MODE:c.mode,HAPSLAND_PROBE_DELAY_MS:String(c.delay),HAPSLAND_PROBE_UNITS:String(c.units),HAPSLAND_PROBE_FAILURE:c.failure?'1':'0'};
      for (const key of ['OPENAI_API_KEY','TYPESAFE_API_KEY']) delete env[key];
      const start=Date.now();
      const args=['exec','--ephemeral','--json','--ignore-user-config','--ignore-rules','--dangerously-bypass-hook-trust','--dangerously-bypass-approvals-and-sandbox','-m','gpt-6-luna','-c','model_reasoning_effort="max"','-C',repo,c.prompt??prompt];
      const host=await run(codexBinary,args,{cwd:repo,env});
      const hostExitedAt=Date.now();
      const postSessionObservationMs=c.mode==='background'?8500:0;
      if (postSessionObservationMs > 0) await sleep(postSessionObservationMs);
      const hookEvents=await loadLines(join(dir,'events.jsonl'));
      const hostEvents=host.out.split('\n').filter(Boolean).flatMap(line=>{try{const x=JSON.parse(line);return [{type:x.type,at:x.timestamp??null, itemType:x.item?.type??null, text:x.item?.type==='agent_message'?x.item.text??'':undefined}];}catch{return [];}});
      const finalText=hostEvents.filter(e=>e.itemType==='agent_message').map(e=>e.text??'').join('\n');
      let fileState='absent';try{const source=await readFile(join(repo,'synthetic.ts'),'utf8');fileState=source.includes('GOOD')?'good':source.includes('BAD')?'bad':'other';}catch{}
      const result={id:c.id,mode:c.mode,delayMs:c.delay,units:c.units,failure:Boolean(c.failure),exitCode:host.code,signal:host.signal,durationMs:hostExitedAt-start,hostExitedAtMs:hostExitedAt-start,postSessionObservationMs,postSessionHookEvents:hookEvents.filter(e=>e.at>hostExitedAt).map(e=>e.kind),hookEvents:hookEvents.map(e=>({...e,at:e.at-start})),hostEventTypes:hostEvents.map(e=>e.type).filter(Boolean),hostEventTimeline:host.timeline,finalFileState:fileState,modelClaimedRepair:finalText.includes('REVIEW_REPAIRED'),hostStderrClass:host.err.includes('Error')?'error':host.err?'other':'empty',eligibleDirectEdits:hookEvents.filter(e=>e.kind==='edit-hook-entry').length,admittedReviews:hookEvents.filter(e=>e.kind==='review-admitted').reduce((n,e)=>n+e.units,0),hostSubmissions:hookEvents.filter(e=>e.kind==='host-submission').length};
      results.push(result);
      process.stdout.write(`${c.id}: ${JSON.stringify({exit:result.exitCode,durationMs:result.durationMs,file:result.finalFileState,edits:result.eligibleDirectEdits,admitted:result.admittedReviews,submitted:result.hostSubmissions,events:hookEvents.map(e=>e.kind)})}\n`);
    }
  } finally {await rm(parent,{recursive:true,force:true});}
  let prior=[]; try { prior=JSON.parse(await readFile(evidencePath,'utf8')).cases ?? []; } catch {}
  const combined=[...prior.filter(c=>!results.some(r=>r.id===c.id)),...results];
  await writeFile(evidencePath,JSON.stringify({issue:97,host:codexVersion,platform:`${process.platform}-${process.arch}`,node:process.version,agentModel:'gpt-6-luna',reasoningEffort:'max',mode:'headless codex exec ephemeral',isolation:'disposable repos and temporary CODEX_HOME; no Jev credentials or live backend; raw host output and source discarded',cases:combined},null,2)+'\n');
};
await main();
