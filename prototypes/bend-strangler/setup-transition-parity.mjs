import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {reduceSetup as reference,initialSetup} from './setup-reference.ts'
export const nativeCases=[]
const production=process.env.HAPSLAND_SETUP_PRODUCTION==='1'?await import(new URL('../../packages/administration/dist/onboarding/setup-model.js',import.meta.url)):undefined
const temporary=mkdtempSync(join(tmpdir(),'hapsland-setup-transition-'))
const corePath='packages/agent-flow-bend/setup-policy/core.bend'
const lawPath='packages/agent-flow-bend/setup-policy/LAWS.bend'
try {
 const output=join(temporary,'core.mjs')
 execFileSync('bend',[corePath,'-o',output],{timeout:5000})
 const core=(await import(pathToFileURL(output))).default
 const phases=['Previewing','HookApproval','RulesApproval','Applying','Activating','Verifying','Diagnosing','Done','Cancelled','Back','Failed']
 const tag=value=>({$:'Setup'+value})
 const status=value=>tag(({complete:'Complete',pending:'Pending',partial:'Partial',skipped:'Skipped'})[value]??(value===undefined?'Missing':'Other'))
 const stage=(observation,name)=>observation?.stages.find(x=>x.stage===name)?.status
 const ready=observation=>core.observation_ready(...['installation','credential','repository','rules'].map(name=>status(stage(observation,name))))
 const actionTags={progressed:'Progressed',previewed:'Previewed',applied:'Applied',approveHooks:'ApproveHooks',approveRules:'ApproveRules',activated:'Activated',stale:'Stale',failed:'ActionFailed',verified:'Verified',diagnosed:'Diagnosed',back:'NavigateBack',exit:'Exit'}
 function planned(model,event){
  const action=event.action
  const observation='observation' in action?action.observation:model.observations.at(-1)
  const proposal=model.proposal
  const install=stage(observation,'installation')
  const facts=[stage(observation,'compatibility')==='complete',core.installation_can_proceed(status(install)),core.installation_was_written(status(install)),install==='pending',Boolean(observation?.installDigest),observation?.installDigest!==undefined,Boolean(action.kind==='approveHooks'?proposal?.rulesDigest:observation?.rulesDigest),action.digest===(action.kind==='approveHooks'?proposal?.installDigest:proposal?.rulesDigest),action.yes===true,ready(observation),action.kind==='verified'?action.outcome.kind==='cancelled':observation?.credential?.status==='cancelled',observation?.status==='partial',action.sequence===model.progressSequence+1,action.succeeded===true]
  const current=event.revision===model.revision&&(!('commandId' in action)||action.commandId===model.revision)
  return core.step(tag(model.phase),tag(actionTags[action.kind]),current,...facts)
 }
 function materialize(model,event,plan){
  const a=event.action
  if(plan.$==='SetupHold')return model
  if(plan.$==='SetupProgress')return {...model,progressSequence:a.sequence,observations:[...model.observations,a.observation]}
  let patch={}
  switch(plan.patch.$){
   case 'SetupPreviewPatch':case 'SetupFreshProposalPatch':patch={proposal:a.observation,observations:[...model.observations,a.observation],installApproved:undefined,rulesApproved:undefined};break
   case 'SetupAppendPatch':patch={observations:[...model.observations,a.observation]};break
   case 'SetupInstallApprovalPatch':patch={installApproved:a.digest};break
   case 'SetupRulesApprovalPatch':patch={rulesApproved:a.digest};break
   case 'SetupClearApprovalsPatch':patch={installApproved:undefined,rulesApproved:undefined};break
   case 'SetupActivatedPatch':patch={activation:'completed'};break
   case 'SetupVerificationPatch':patch={verification:a.outcome};break
   case 'SetupDiagnosisPatch':patch={readiness:a.status};break
   case 'SetupFailedActivationPatch':patch={activation:'failed'};break
   case 'SetupNoPatch':break
   default:throw Error(plan.patch.$)
  }
  const exits={SetupExitZero:0,SetupExitThree:3,SetupExitFour:4,SetupExitFive:5,SetupExitSix:6}
  if(plan.exit.$!=='SetupKeepExit')patch.exitCode=exits[plan.exit.$]
  return {...model,...patch,progressSequence:0,phase:plan.phase.$.slice(5),revision:model.revision+1}
 }
 let cases=0,holdCases=0
 function check(model,action,revision=model.revision){
  const event={revision,action};const plan=planned(model,event);const expected=reference(model,event);const actual=materialize(model,event,plan)
  assert.deepEqual(actual,expected,JSON.stringify({phase:model.phase,action,plan}))
  if(expected===model){assert.equal(actual,model);holdCases++}
  if(actual.proposal!==undefined)assert.equal(actual.proposal,expected.proposal)
  if(actual.verification!==undefined)assert.equal(actual.verification,expected.verification)
  if(production){
   const integrated=production.reduceSetup(model,event)
   assert.deepEqual(integrated,expected)
   if(expected===model)assert.equal(integrated,model)
   if(integrated.proposal!==undefined)assert.equal(integrated.proposal,expected.proposal)
   if(integrated.verification!==undefined)assert.equal(integrated.verification,expected.verification)
  }
  if(model.revision===7&&model.progressSequence===3&&event.revision===7)nativeCases.push([model,event])
  cases++
 }
 const baseline={...initialSetup(),revision:7,progressSequence:3,activation:'failed',exitCode:91,installApproved:'old-install',rulesApproved:'old-rules',verification:{kind:'old'},readiness:'old'}
 let observationCases=0
 const observations=[]
 for(const compatibility of ['complete','failed'])for(const installation of ['complete','pending','partial','skipped',undefined,'failed'])for(const credential of ['complete','failed'])for(const repository of ['complete','failed'])for(const rules of ['complete','skipped',undefined,'pending'])for(const overall of ['complete','partial'])for(const cancelled of [false,true])for(const installDigest of [undefined,'','install'])for(const rulesDigest of [undefined,'','rules']){
  const values={compatibility,installation,credential,repository,rules}
  const observation={status:overall,stages:Object.entries(values).flatMap(([stage,status])=>status===undefined?[]:[{stage,status}]),credential:{status:cancelled?'cancelled':'saved'},...(installDigest===undefined?{}:{installDigest}),...(rulesDigest===undefined?{}:{rulesDigest})}
  observations.push(observation)
  if(production)assert.equal(production.setupObservationReady(observation),ready(observation))
  for(const phase of ['Previewing','Applying','Activating']){
   const model={...baseline,phase,observations:[observation],proposal:observation}
   const kinds={Previewing:'previewed',Applying:'applied',Activating:'activated'}
   check(model,{kind:kinds[phase],commandId:7,...(phase==='Activating'?{}:{observation})})
   observationCases++
  }
 }
 const selected=[observations[0],observations.at(-1),{status:'partial',stages:[{stage:'installation',status:'failed'},{stage:'installation',status:'complete'},{stage:'rules',status:'missing'}]},undefined]
 for(const phase of phases)for(const observation of selected)for(const revision of [0,7,Number.MAX_SAFE_INTEGER,Infinity,NaN])for(const progressSequence of [0,3,Number.MAX_SAFE_INTEGER,Infinity,NaN]){
  const model={...baseline,phase,revision,progressSequence,observations:observation?[observation]:[],proposal:observation}
  const actions=[{kind:'previewed',observation:observations[0]},{kind:'applied',observation:observations.at(-1)},{kind:'activated'},{kind:'stale'},{kind:'failed'},{kind:'back'},{kind:'exit'}]
  for(const kind of ['approveHooks','approveRules'])for(const digest of ['', 'install','rules','wrong',undefined])for(const yes of [false,true])actions.push({kind,digest,yes})
  for(const kind of ['cancelled','verified','unavailable'])actions.push({kind:'verified',outcome:{kind}})
  for(const succeeded of [false,true])actions.push({kind:'diagnosed',status:'native-status',succeeded})
  for(const sequence of [progressSequence+1,progressSequence,0,Infinity,NaN])actions.push({kind:'progressed',sequence,observation:observations[0]})
  for(const action of actions)for(const id of ['absent','current','stale','undefined']){
   const a=id==='absent'?action:{...action,commandId:id==='current'?revision:id==='stale'?revision+1:undefined}
   check(model,a)
   check(model,a,revision+1)
  }
 }
 if(production)for(const phase of phases)for(const revision of [0,7,Number.MAX_SAFE_INTEGER,Infinity,NaN])assert.deepEqual(production.setupCommand({...baseline,phase,revision}),core.command(tag(phase)).$==='SetupNoCommand'?undefined:{kind:({SetupPreview:'preview',SetupApply:'apply',SetupActivate:'activate',SetupVerify:'verify',SetupDiagnose:'diagnose'})[core.command(tag(phase)).$],id:revision})
 const record={productionCompared:production!==undefined,at:new Date().toISOString(),passed:true,transitionCases:cases,observationCases,holdCases,sourceSha256:Object.fromEntries([corePath,lawPath,'evidence/bend-strangler/setup-reference.ts',...(production?['packages/administration/src/onboarding/setup-model.ts','packages/administration/dist/onboarding/setup-model.js','packages/canonical-policy/src/canonical/setup-adapter.ts','packages/agent-flow-bend/dist/setup-policy.generated.js']:[])].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),scope:'draft full setup transition plans materialized into native model versus frozen master; exact fields/hold/payload identity, stage classifications including first duplicate stage, empty/present digests, partial/cancelled observations, finite and nonfinite correlation/progress; compiled production comparison only when productionCompared is true; no IO or platform claim'}
 writeFileSync(new URL('./setup-transition-parity.json',import.meta.url),JSON.stringify(record,null,2)+'\n')
 console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
