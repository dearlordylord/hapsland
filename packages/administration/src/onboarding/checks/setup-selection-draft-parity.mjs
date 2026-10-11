import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {reduceSelection} from './setup-selection-reference.ts'
export const nativeCases=[]
const production=process.env.HAPSLAND_SELECTION_PRODUCTION==='1'?await import(new URL('../../../dist/onboarding/setup-selection.js',import.meta.url)):undefined
const root='packages/agent-flow-bend/setup-selection-policy'
const directory=mkdtempSync(join(tmpdir(),'hapsland-selection-draft-'))
const phases=['SelectingAgents','RunningAgents','Done','Cancelled']
const phaseTag=p=>({$:p==='Done'?'SelectionDone':p==='Cancelled'?'SelectionCancelled':p})
const actionTag=k=>({$:({selected:'HostsSelected',ended:'SelectionEnded',observed:'HostObserved'})[k]})
const outcomeTag=o=>({$:({completed:'HostCompleted',back:'HostBack',cancelled:'HostCancelled'})[o??'completed']})
try {
 let path=root+'/core.bend'
 if(process.env.HAPSLAND_SELECTION_MUTANT){
  const source=readFileSync(path,'utf8')
  const [before,after]=process.env.HAPSLAND_SELECTION_MUTANT==='back'?['case HostBack{}: SelectingAgents{}','case HostBack{}: SelectionDone{}']:['nonempty,','True{},']
  assert.ok(source.includes(before));path=join(directory,'mutant.bend');writeFileSync(path,source.replace(before,after))
 }
 execFileSync('bend',[path,'-o',join(directory,'core.mjs')],{timeout:5000})
 const core=(await import(pathToFileURL(join(directory,'core.mjs')))).default
 const laws=readFileSync(root+'/LAWS.bend','utf8')
 symlinkSync(resolve(root+'/core.bend'),join(directory,'core.bend'))
 writeFileSync(join(directory,'spec.bend'),laws.slice(0,laws.indexOf('law step_exact:')))
 execFileSync('bend',[join(directory,'spec.bend'),'-o',join(directory,'spec.mjs')],{timeout:5000})
 const spec=(await import(pathToFileURL(join(directory,'spec.mjs')))).default
 const prefix=spec.step_spec({$:'invalid'},{$:'invalid'},{$:'invalid'},false,false).$.replace(/SelectionHold$/,'')
 const st=x=>({$:prefix+x.$})
 const normalize=x=>x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,k==='$'&&v.startsWith(prefix)?v.slice(prefix.length):normalize(v)])):x
 let lawCases=0,transitions=0,holds=0
 for(const p of phases)for(const k of ['selected','ended','observed'])for(const o of ['completed','back','cancelled'])for(const n of [false,true])for(const h of [false,true]){
  assert.deepEqual(core.step(phaseTag(p),actionTag(k),outcomeTag(o),n,h),normalize(spec.step_spec(st(phaseTag(p)),st(actionTag(k)),st(outcomeTag(o)),n,h)));lawCases++
 }
 const events=[{kind:'ended'},...([[],['claude'],['codex','claude']].map(hosts=>({kind:'selected',hosts}))),...(['completed','back','cancelled'].map(outcome=>({kind:'observed',outcome})))]
 for(const phase of phases)for(const revision of [0,7,Infinity,NaN])for(const index of [-1,0,1,2,7,Infinity,NaN])for(const selected of [[],['claude'],['claude','codex']])for(const event of events){
  const model={phase,revision,index,selected}
  const plan=core.step(phaseTag(phase),actionTag(event.kind),outcomeTag(event.outcome),event.kind==='selected'&&event.hosts.length>0,index+1<selected.length)
  const actual=plan.$==='SelectionHold'?model:plan.$==='SelectionStart'?{phase:'RunningAgents',selected:[...event.hosts],index:0,revision:revision+1}:plan.$==='SelectionEnd'?{...model,phase:'Done',revision:revision+1}:{...model,phase:plan.phase.$.replace(/^Selection/,''),index:index+1,revision:revision+1}
  const expected=reduceSelection(model,event);assert.deepEqual(actual,expected)
  if(production){const emitted=production.reduceSelection(model,event);assert.deepEqual(emitted,expected);if(expected===model)assert.equal(emitted,model);else if(event.kind==='selected')assert.notEqual(emitted.selected,event.hosts);else assert.equal(emitted.selected,selected)}
  nativeCases.push([model,event])
  if(expected===model){assert.equal(actual,model);holds++}else if(event.kind==='selected'){assert.notEqual(actual.selected,event.hosts)}else assert.equal(actual.selected,selected)
  transitions++
 }
 const paths=[root+'/core.bend',root+'/LAWS.bend','packages/administration/src/onboarding/checks/setup-selection-reference.ts', 'packages/administration/src/onboarding/checks/setup-selection-draft-parity.mjs',...(production?['packages/administration/src/onboarding/setup-selection.ts','packages/administration/dist/onboarding/setup-selection.js','packages/canonical-policy/src/canonical/setup-selection-adapter.ts','packages/canonical-policy/dist/canonical/setup-selection-adapter.js','packages/agent-flow-bend/scripts/build-setup-selection-policy.mjs','packages/agent-flow-bend/dist/setup-selection-policy.generated.js']:[])]
 const result={at:new Date().toISOString(),passed:true,productionCompared:Boolean(production),lawCases,nativeTransitionCases:transitions,holds,sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),scope:'draft finite closed phase/action/outcome/Bool law domain and native revision/index/payload identity parity; production compared only when productionCompared is true; no proof or effect claim'}
 if(!process.env.HAPSLAND_SELECTION_MUTANT)writeFileSync('evidence/bend-strangler/setup-selection-draft-parity.json',JSON.stringify(result,null,2)+'\n')
 console.log(JSON.stringify(result))
}finally{rmSync(directory,{recursive:true,force:true})}
