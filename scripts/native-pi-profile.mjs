// Installed Pi branch of the shared native cross-file harness; no CLI entry point.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assessPiAdoption, piModelProfile } from './native-pi-observation.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const lines = path => {try{return readFileSync(path,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return [];}};
const execute = (command,args,{cwd,env,input,timeout=240000}={}) => new Promise((resolve,reject)=>{
 const child=spawn(command,args,{cwd,env,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']});let stdout='',stderrBytes=0;
 const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 child.stdout.on('data',data=>{stdout+=data});child.stderr.on('data',data=>{stderrBytes+=data.length});
 child.once('error',reject);child.once('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderrBytes})});
 if(input!==undefined)child.stdin.end(input);
});
const jsonCommand=async(cli,flag,request,options)=>{
 const result=await execute(cli,[flag],{...options,input:JSON.stringify(request),timeout:30000});
 try{return {code:result.code,value:JSON.parse(result.stdout)}}catch{throw new Error(`Installed ${flag} did not produce structured output (exit ${result.code})`)}
};

// Documentation/evidence updates do not change the observed production runtime inventory.
export const piRuntimeAssetsDigest = packageRoot => {
 const assets=[];
 const visit=(path,prefix,onlyJavaScript=false)=>{
  if(!existsSync(path))return;
  for(const entry of readdirSync(path,{withFileTypes:true})){
   const child=join(path,entry.name),name=`${prefix}/${entry.name}`;
   if(entry.isDirectory())visit(child,name,onlyJavaScript);
   else if(!onlyJavaScript||entry.name.endsWith('.js'))assets.push([name,hash(readFileSync(child))]);
  }
 };
 visit(join(packageRoot,'dist'),'dist');visit(join(packageRoot,'native','prebuilt'),'native/prebuilt');visit(join(packageRoot,'schemas'),'schemas');
 for(const name of ['bin/launch.sh','package-runtime.json'])assets.push([name,hash(readFileSync(join(packageRoot,name)))]);
 assets.sort(([a],[b])=>a.localeCompare(b));
 return {sha256:hash(JSON.stringify(assets)),files:assets.length};
};

export async function runPiNativeProfile({project,fixture,language,scenario,mode,messages,runnerPath}) {
 if(language!=='typescript'||!['adoption','reviewer-unavailable','unsupported-write','unicode-edit'].includes(scenario)||mode!=='controlled-offline')
  throw new Error('Pi installed native profile currently accepts controlled TypeScript adoption/reviewer-unavailable/unsupported-write/unicode-edit only');
 if(process.platform!=='linux'||process.arch!=='arm64')throw new Error('Pi milestone is scoped to Linux arm64');
 const binary=process.env.HAPSLAND_TEST_PI??'/home/node/bin/pi';
 const version=spawnSync(binary,['--version'],{encoding:'utf8',timeout:10000}).stdout?.trim();
 if(version!=='1.0.0')throw new Error('Pi native milestone requires exact Pi 1.0.0');
 const ordinaryHome=process.env.PI_CODING_AGENT_DIR??'/home/node/.pi/agent';
 const settings=JSON.parse(readFileSync(join(ordinaryHome,'settings.json'),'utf8'));
 const model=piModelProfile(settings);
 const runnerHash=hash(readFileSync(runnerPath)),piProfileHash=hash(readFileSync(new URL(import.meta.url))),assertionHelperHash=hash(readFileSync(new URL('./native-pi-observation.mjs',import.meta.url))); 
 const temp=mkdtempSync(join(tmpdir(),'hapsland-pi-native-')),repo=join(temp,'repo'),home=join(temp,'agent'),install=join(temp,'install');
 const eventPath=join(temp,'events.jsonl'),summaryPath=join(temp,'summary.jsonl'),outcomePath=join(temp,'outcomes.jsonl');
 const runtime=join(temp,'resident'),activity=join(temp,'activity');
 const started=Date.now(),runId=`pi-${language}-${scenario}-${mode}-${started}`;
 const evidenceRoot=join(project,'evidence',scenario==='adoption'?'native-languages':'native-negative');mkdirSync(evidenceRoot,{recursive:true});
 const declaration={maximumProviderRequests:0,reviewer:'controlled-offline',agentModelAuthenticated:true,model,maximumSourceEditCalls:scenario==='adoption'?2:1,hostCeilingMs:240000,automaticHostRetries:0,syntheticRepositoryOnly:true,runtimeVersion:version,executionMode:'print-json-no-session',trust:'isolated global agent extension; no project-local files approved',packageInstallation:'production npm tarball with lifecycle scripts disabled',ordinaryProfileChanged:false};
 writeFileSync(join(evidenceRoot,`${runId}-declaration.json`),JSON.stringify({schemaVersion:1,declaredAt:new Date().toISOString(),host:'pi',language,scenario,mode,declaration},null,2)+'\n',{flag:'wx'});
 let record;
 try {
  mkdirSync(repo);mkdirSync(home,{mode:0o700});mkdirSync(install);
  for(const file of ['auth.json','models.json'])if(existsSync(join(ordinaryHome,file)))copyFileSync(join(ordinaryHome,file),join(home,file));
  writeFileSync(join(home,'settings.json'),JSON.stringify({...settings,extensions:[],packages:[],quietStartup:true}),{mode:0o600});
  spawnSync('git',['init','--quiet','--initial-branch=master',repo]);
  const initial=scenario==='unicode-edit'?fixture.initial.replace('PaymentState','PaymentStâte'):fixture.initial;
  const seed='// Native edit fixture\n';writeFileSync(join(repo,fixture.entry),seed);writeFileSync(join(repo,fixture.support),fixture.supportSource);
  writeFileSync(join(repo,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',types:[],skipLibCheck:true},include:['*.ts']}));
  writeFileSync(join(repo,'README.md'),'A payment is pending, succeeded with a receipt, or failed with a failure reason. Pending has neither result.\n');
  writeFileSync(join(repo,'package.json'),JSON.stringify({private:true,scripts:{test:`${JSON.stringify(process.execPath)} ${JSON.stringify(join(project,'node_modules/typescript/bin/tsc'))} -p tsconfig.json`}}));
  const packed=await execute('npm',['pack','--ignore-scripts','--json','--pack-destination',temp],{cwd:project,timeout:120000});
  if(packed.code!==0)throw new Error('Native package packing failed');
  const tarball=join(temp,JSON.parse(packed.stdout)[0].filename);
  const installed=await execute('npm',['install','--global=false','--legacy-peer-deps','--ignore-scripts=true','--prefer-offline','--omit=dev','--bin-links=true','--prefix',install,tarball],{cwd:temp,timeout:120000});
  if(installed.code!==0)throw new Error('Native production package installation failed');
  const cli=join(install,'node_modules','.bin','hapsland');
  const hapslandIdentity=JSON.parse((await execute(cli,['--runtime-identity'],{cwd:repo,timeout:10000})).stdout);
  const userConfig=join(temp,'review-config.jsonc');writeFileSync(userConfig,JSON.stringify({version:1}));
  const answers=Object.fromEntries(Object.keys(messages).map(id=>[id,{_tag:'Probability',probability:0}]));
  const env={...process.env,PI_CODING_AGENT_DIR:home,REVIEW_USER_CONFIG_PATH:userConfig,REVIEW_RESIDENT_DIR:runtime,REVIEW_ACTIVITY_PATH:activity,
   REVIEW_CONTROL_JSON:JSON.stringify({answers,requestSummaryPath:summaryPath,outcomePath,findingOnSourceIncludes:'interface PaymentState',...(scenario==='reviewer-unavailable'?{failure:'controlled reviewer unavailable'}:{})})};
  delete env.TYPESAFE_API_KEY;
  // Ordinary model credentials are copied to the disposable profile; they are never returned or retained.
  const request={version:1,operation:'setup',host:'pi',piHome:home,piExecutable:binary,scope:{cwd:repo,review:'enabled'},credential:'skip'};
  const preview=await jsonCommand(cli,'--setup',request,{cwd:repo,env});
  const digest=preview.value.actions?.find(action=>action.authorization?.installProposalDigest)?.authorization?.installProposalDigest;
  if(!digest)throw new Error('Pi setup omitted installation proposal digest');
  const setup=await jsonCommand(cli,'--setup',{...request,installProposalDigest:digest},{cwd:repo,env});
  const doctor=await jsonCommand(cli,'--doctor',{version:1,operation:'doctor',host:'pi',piHome:home,piExecutable:binary,cwd:repo},{cwd:repo,env});
  const observer=join(home,'extensions','z-native-observer.ts');
  writeFileSync(observer,`import { appendFileSync, readFileSync } from 'node:fs';\nimport { createHash } from 'node:crypto';\nconst log=${JSON.stringify(eventPath)}, root=${JSON.stringify(join(repo,fixture.entry))};\nconst hash=(s)=>createHash('sha256').update(s).digest('hex');\nconst finding=(s)=>Object.values(${JSON.stringify(messages)}).some(m=>s.includes(m));\nexport default function(pi){\n const emit=(o)=>appendFileSync(log,JSON.stringify({at:Date.now(),...o})+'\\n',{mode:0o600});\n emit({kind:'native-profile',nodeVersion:process.version,platform:process.platform,architecture:process.arch});\n pi.on('tool_result',async(event)=>{\n  let source='';try{source=readFileSync(root,'utf8')}catch{}\n  const text=event.content.filter(c=>c.type==='text').map(c=>c.text).join('\\n');\n  emit({kind:'tool-result',tool:event.toolName,toolUseHash:hash(event.toolCallId),isError:event.isError,finding:finding(text),initial:source===${JSON.stringify(initial)},final:source===${JSON.stringify(fixture.good)},patchPresent:typeof event.details?.patch==='string',pathMatches:event.input.path===${JSON.stringify(fixture.entry)},replacementsMatchCurrent:Array.isArray(event.input.edits)&&event.input.edits.every(e=>typeof e.newText==='string'&&source.includes(e.newText)),unsupported:/unsupported|incomplete|unicode/i.test(text)});\n });\n pi.on('before_provider_request',async(event)=>{emit({kind:'provider-request',finding:finding(JSON.stringify(event.payload))})});\n pi.on('after_provider_response',async(event)=>{emit({kind:'provider-response',status:event.status})});\n pi.on('agent_before_settle',async(event)=>{emit({kind:'before-settle',finding:finding(JSON.stringify(event.entries)),continued:event.continue,canContinue:event.context?.canContinue})});\n pi.on('agent_settled',async()=>{emit({kind:'settled'})});\n}`);
  const trace=join(temp,'transport-observer.mjs');
  writeFileSync(trace,`import {appendFileSync} from 'node:fs';\nconst nativeFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const url=String(args[0]?.url??args[0]);if(url.includes('/v1/systemone')){appendFileSync(${JSON.stringify(eventPath)},JSON.stringify({kind:'jev-blocked-attempt',at:Date.now()})+'\\n',{mode:0o600});throw new Error('zero-request controlled Pi milestone ceiling')}return nativeFetch(...args)};
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const originalSpawn=childProcess.spawn;
childProcess.spawn=function(command,args,...options){
 const child=originalSpawn.call(this,command,args,...options);
 if(args?.includes('--pi-hook')&&child.stdout){
  let buffered='';child.stdout.on('data',chunk=>{
   buffered+=String(chunk);
   for(let n;(n=buffered.indexOf('\\n'))>=0;){const line=buffered.slice(0,n);buffered=buffered.slice(n+1);try{const o=JSON.parse(line);appendFileSync(${JSON.stringify(eventPath)},JSON.stringify({kind:'hapsland-response',at:Date.now(),status:o.status,findingCount:o.findingCount??0,continued:o.continued??false})+'\\n',{mode:0o600})}catch{}}
  });
 }
 return child;
};
syncBuiltinESMExports();
`);
  if(spawnSync(process.execPath,['--check',trace],{encoding:'utf8'}).status!==0)throw new Error('Generated passive transport observer failed syntax validation');
  env.NODE_OPTIONS=`${env.NODE_OPTIONS??''} --import=${trace}`.trim();
  const action=scenario==='unsupported-write'?`Use write to replace ${fixture.entry} with this exact draft`:`Use edit (edits array) to replace the exact seed ${JSON.stringify(seed)} in ${fixture.entry} with this exact draft`;
  const prompt=`${action}:\n${initial}\nThen run npm test. ${scenario==='adoption'?`Act on actionable Hapsland advice that reaches you. If review is pending, run npm test again to receive advice. Only after receiving actionable advice, use edit to change only PaymentState to exactly this final design, preserving imports:\n${fixture.good}\nRun npm test after repair and if review is pending run npm test again. Use at most two source mutations. Finish with HAPSLAND_ADVICE_APPLIED only if you personally received and acted on Hapsland advice.`:'Do not repair or make another source mutation. Finish with HAPSLAND_ADVICE_NOT_APPLIED.'} Do not inspect settings, credentials or environment variables. Stay inside the repository.`;
  const result=await execute(binary,['--print','--mode','json','--no-session','--offline','--no-context-files','--no-skills','--no-prompt-templates','--tools','read,edit,write,bash',prompt],{cwd:repo,env});
  const nativeMessages=result.stdout.split('\n').flatMap(line=>{try{const item=JSON.parse(line);if(item.type!=='message_end')return [];const text=JSON.stringify(item.message?.content??'');return [{kind:'native-message',role:item.message?.role,finding:Object.values(messages).some(message=>text.includes(message))}]}catch{return []}});
  const events=[...lines(eventPath),...nativeMessages],requests=lines(summaryPath),outcomes=lines(outcomePath).map(o=>({toolUseHash:typeof o.toolUseId==='string'?hash(o.toolUseId):null,outcome:o.outcome}));
  const source=readFileSync(join(repo,fixture.entry),'utf8');
  const compile=spawnSync('npm',['test'],{cwd:repo,env,encoding:'utf8',timeout:30000});
  writeFileSync(join(repo,'invalid.ts'),"import type {PaymentState} from './payment';\n// @ts-expect-error success requires receipt\nconst missing: PaymentState = {status:'succeeded',receipt:null,failure_reason:null};\n// @ts-expect-error pending excludes simultaneous results\nconst both: PaymentState = {status:'pending',receipt:{value:''},failure_reason:'failed'};\n");
  const invalid=spawnSync('npm',['test'],{cwd:repo,env,encoding:'utf8',timeout:30000});
  const activityStages=[];
  const visit=path=>{if(!existsSync(path))return;for(const entry of readdirSync(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())visit(child);else{try{const marker=JSON.parse(readFileSync(child,'utf8'));if(typeof marker.stage==='string')activityStages.push(marker.stage)}catch{}}}};visit(activity);
  const setupReady=setup.value.stages?.some(stage=>stage.stage==='installation'&&stage.status==='complete')??false;
  const doctorReady=doctor.value.checks?.some(check=>check.stage==='configuration-ownership'&&check.status==='ready') === true;
  const checks=scenario==='adoption'?assessPiAdoption({events,requests,outcomes,finalMatches:source===fixture.good,compiles:compile.status===0,rejectsInvalid:invalid.status===0,setupReady,doctorReady}):{installedSetupReady:setupReady,nativeMutationObserved:events.some(e=>e.tool===(scenario==='unsupported-write'?'write':'edit')&&e.initial&&!e.isError),noActionableAdvice:!events.some(e=>e.finding),sourceLeftAtDraft:source===initial,...(scenario==='reviewer-unavailable'?{reviewAttempted:requests.length>0,unavailableRecorded:activityStages.some(stage=>stage==='incomplete'||stage==='unavailable')}:{noReviewRequest:requests.length===0})};
  checks.noJevRequestAttempt= !events.some(e=>e.kind==='jev-blocked-attempt');
  checks.nativeAgentResponseObserved=events.some(e=>e.kind==='native-message'&&e.role==='assistant');
  record={schemaVersion:1,recordedAt:new Date().toISOString(),runtime:'Pi',version,language,scenario,mode,declaration,executionProfile:{runtime:'installed-package',installedPackageValidated:true,normalTrustValidated:false,syntheticRepositoryOnly:true},hapslandRuntime:hapslandIdentity,package:{name:'@hapsland/hapsland',version:JSON.parse(readFileSync(join(install,'node_modules/@hapsland/hapsland/package.json'),'utf8')).version,tarballSha256:hash(readFileSync(tarball)),runtimeAssets:piRuntimeAssetsDigest(join(install,'node_modules/@hapsland/hapsland'))},runnerHash,piProfileHash,assertionHelperHash,platform:process.platform,architecture:process.arch,sourceWorktreeDirty:spawnSync('git',['-C',project,'diff','--quiet','--','src','scripts'],{encoding:'utf8'}).status!==0,commit:spawnSync('git',['-C',project,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),hostExitCode:result.code,hostSignal:result.signal,elapsedMs:Date.now()-started,providerCalls:events.filter(e=>e.kind==='jev-blocked-attempt').length,agentProvider:model,events:events.map(e=>({...e,atMs:e.at-started,at:undefined})),requestShapes:requests,outcomeSummaries:outcomes,activityStages,checks,rawHostStreamRetained:false,sourceRetained:false,providerBodyRetained:false,credentialsRetained:false,hostBytesDiscarded:Buffer.byteLength(result.stdout)+result.stderrBytes};
  record.verdict=result.code===0&&Object.values(checks).every(Boolean)?'demonstrated':'incomplete';
 }catch(error){record={schemaVersion:1,recordedAt:new Date().toISOString(),runtime:'Pi',version,language,scenario,mode,declaration,verdict:'incomplete',failureBoundary:error.message,rawHostStreamRetained:false,sourceRetained:false,providerBodyRetained:false,credentialsRetained:false};}
 finally {
  try{const owner=JSON.parse(readFileSync(join(runtime,'owner.json'),'utf8'));process.kill(owner.pid,'SIGTERM')}catch{}
  rmSync(temp,{recursive:true,force:true});
 }
 const output=join(evidenceRoot,`${runId}.json`);writeFileSync(output,JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({evidence:output,verdict:record.verdict,checks:record.checks,failureBoundary:record.failureBoundary,providerCalls:record.providerCalls}));
 if(record.verdict!=='demonstrated')process.exitCode=1;
}
