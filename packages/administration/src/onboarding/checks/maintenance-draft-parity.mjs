import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import * as reference from "./maintenance-reference.ts"
export const nativeCases=[]
const production=process.env.HAPSLAND_MAINTENANCE_PRODUCTION==="1"?await import(new URL("../../../dist/onboarding/maintenance-model.js",import.meta.url)):undefined
const directory=mkdtempSync(join(tmpdir(),"hapsland-maintenance-draft-"))
const root="packages/agent-flow-bend/maintenance-policy"
const tag=x=>({$:"Maintenance"+x})
const phases=["Discovering","Inspecting","Previewing","Review","Approval","Applying","Activating","ActivatingEmpty","Done","Cancelled"]
const actionNames=["Discovered","Inspected","ProposalPreviewed","OutcomePreviewed","Continue","Approve","Observed","Activated","ActivatedEmpty","Back","Exit","Failed"]
const factNames=["unique","nonempty","reinstall","valid_digest","digest_matches","yes","activate","more"]
try {
 let corePath=root+"/core.bend"
 if(process.env.HAPSLAND_MAINTENANCE_MUTANT){
  const original=readFileSync(corePath,"utf8")
  const edits={command:["case MaintenanceDiscovering{}: MaintenanceDiscoverCommand{}","case MaintenanceDiscovering{}: MaintenanceNoCommand{}"],step:[/(Bool.pick\(\s*Plan,\s*)current,(\s*current_step\()/,"$1True{},$2"]}
  const [before,after]=edits[process.env.HAPSLAND_MAINTENANCE_MUTANT]??[]
  assert.ok(before&&(typeof before==="string"?original.includes(before):before.test(original)));corePath=join(directory,"mutant.bend");writeFileSync(corePath,original.replace(before,after))
 }
 execFileSync("bend",[corePath,"-o",join(directory,"core.mjs")],{timeout:5000})
 const core=(await import(pathToFileURL(join(directory,"core.mjs")))).default
 const lawSource=readFileSync(root+"/LAWS.bend","utf8")
 const helpers=lawSource.slice(0,lawSource.indexOf("law command_exact:"))
 assert.ok(helpers.includes("def command_spec(")&&helpers.includes("def transition_spec("))
 symlinkSync(resolve(root+"/core.bend"),join(directory,"core.bend"))
 writeFileSync(join(directory,"spec.bend"),helpers)
 execFileSync("bend",[join(directory,"spec.bend"),"-o",join(directory,"spec.mjs")],{timeout:5000})
 const spec=(await import(pathToFileURL(join(directory,"spec.mjs")))).default
 const specPrefix=spec.command_spec({$:"invalid"},false,false,false).$.replace(/MaintenanceNoCommand$/,"")
 const specTag=x=>({$:specPrefix+"Maintenance"+x})
 const normalize=value=>Array.isArray(value)?value.map(normalize):value!==null&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==="$"?item.slice(item.lastIndexOf("Maintenance")):normalize(item)])):value
 let lawCases=0
 for(const phase of phases)for(let bits=0;bits<8;bits++) {
  const facts=[0,1,2].map(i=>Boolean(bits&(1<<i)))
  assert.deepEqual(core.command(tag(phase),...facts),normalize(spec.command_spec(specTag(phase),...facts)));lawCases++
 }
 for(const phase of phases)for(const action of actionNames)for(let bits=0;bits<512;bits++) {
  const current=Boolean(bits&1),facts=factNames.map((_,i)=>Boolean(bits&(1<<(i+1))))
  assert.deepEqual(core.step(tag(phase),tag(action),current,...facts),current?normalize(spec.transition_spec(specTag(phase),specTag(action),...facts)):tag("Hold"));lawCases++
 }
 const actionTag=action=>({discovered:"Discovered",inspected:"Inspected",previewed:action.result?.kind==="proposal"?"ProposalPreviewed":"OutcomePreviewed",continue:"Continue",approve:"Approve",observed:"Observed",activated:"Activated",activatedEmpty:"ActivatedEmpty",back:"Back",exit:"Exit",failed:"Failed"})[action.kind]
 const factsFor=(model,event)=>{
  const action=event.action,agent=model.agents[model.cursor]
  const current=event.revision===model.revision&&(!("commandId" in action)||action.commandId===model.revision)&&(!("host" in action)||action.host===agent?.host)
  return [current,action.kind==="discovered"&&new Set(action.hosts).size===action.hosts.length,action.kind==="discovered"&&action.hosts.length>0,model.command==="reinstall",action.kind==="previewed"&&action.result.kind==="proposal"&&/^[a-f0-9]{64}$/.test(action.result.digest),action.kind==="approve"&&action.digest===agent?.digest,action.kind==="approve"&&action.yes,action.kind==="observed"&&agent?.operation!=="uninstall"&&["restored","partial"].includes(action.outcome),model.cursor+1<model.agents.length]
 }
 const materialize=(model,action,plan)=>{
  if(plan.$==="MaintenanceHold")return model
  assert.equal(plan.$,"MaintenanceAdvance")
  const patchAgent=patch=>model.agents.map((agent,index)=>index===model.cursor?{...agent,...patch}:agent)
  const next=patch=>({agents:patchAgent(patch),cursor:model.cursor+1})
  let patch
  switch(plan.patch.$) {
   case "MaintenanceNoPatch":patch={};break
   case "MaintenanceDiscoveredPatch":patch={agents:action.hosts.map(host=>({host})),discoveryFailures:[...new Set(action.failures)]};break
   case "MaintenanceInspectedPatch":patch={agents:patchAgent({operation:action.operation,recovering:action.recovering})};break
   case "MaintenanceDigestPatch":patch={agents:patchAgent({digest:action.result.digest})};break
   case "MaintenanceOutcomeNextPatch":patch=next({outcome:action.result.kind});break
   case "MaintenanceSkippedNextPatch":patch=next({outcome:"skipped"});break
   case "MaintenanceObservedActivatePatch":patch={agents:patchAgent({outcome:action.outcome})};break
   case "MaintenanceObservedNextPatch":patch=next({outcome:action.outcome});break
   case "MaintenanceActivatedNextPatch":patch=next({activation:action.result});break
   case "MaintenanceEmptyActivationPatch":patch={emptyActivation:action.result};break
   case "MaintenanceSkipPendingPatch":patch={agents:model.agents.map(agent=>agent.outcome===undefined?{...agent,outcome:"skipped"}:agent)};break
   case "MaintenanceFailedNextPatch":patch=next({outcome:"failed"});break
   default:assert.fail(plan.patch.$)
  }
  return {...model,...patch,phase:plan.phase.$.slice("Maintenance".length),revision:model.revision+1}
 }
 const commandFor=model=>{
  const agent=model.agents[model.cursor],command=core.command(tag(model.phase),Boolean(agent),Boolean(agent?.operation),Boolean(agent?.digest)).$
  switch(command) {
   case "MaintenanceNoCommand":return undefined
   case "MaintenanceDiscoverCommand":return {kind:"discover",id:model.revision}
   case "MaintenanceActivateEmptyCommand":return {kind:"activateEmpty",id:model.revision}
   case "MaintenanceInspectCommand":return {kind:"inspect",id:model.revision,host:agent.host}
   case "MaintenanceActivateCommand":return {kind:"activate",id:model.revision,host:agent.host}
   case "MaintenancePreviewCommand":return {kind:"preview",id:model.revision,host:agent.host,operation:agent.operation}
   case "MaintenanceApplyCommand":return {kind:"apply",id:model.revision,host:agent.host,operation:agent.operation,digest:agent.digest}
   default:assert.fail(command)
  }
 }
 const valid="a".repeat(64)
 let transitions=0,commands=0,holds=0
 for(const phase of phases)for(const command of ["repair","reinstall","uninstall"])for(const cursor of [-1,0,1,2,NaN])for(const revision of [0,7,Infinity,NaN])for(const operation of [undefined,"install","update","uninstall"])for(const digest of [undefined,"",valid,"invalid"]) {
  const model={...reference.initialMaintenance(command),phase,cursor,revision,agents:[{host:"codex",operation,digest},{host:"claude",outcome:"intact"}],discoveryFailures:["pi"],emptyActivation:"failed"}
  assert.deepEqual(commandFor(model),reference.maintenanceEffectCommand(model));if(production)assert.deepEqual(production.maintenanceEffectCommand(model),reference.maintenanceEffectCommand(model));commands++
  const actions=[{kind:"discovered",hosts:[],failures:["pi","pi"]},{kind:"discovered",hosts:["codex","claude"],failures:[]},{kind:"discovered",hosts:["codex","codex"],failures:[]},{kind:"inspected",host:"codex",operation:"update",recovering:true},{kind:"failed",host:"codex"},{kind:"previewed",host:"codex",result:{kind:"proposal",digest:valid}},{kind:"previewed",host:"codex",result:{kind:"proposal",digest:"A".repeat(64)}},...["intact","already removed","partial","busy","indeterminate","failed"].map(kind=>({kind:"previewed",host:"codex",result:{kind}})),{kind:"continue"},{kind:"back"},{kind:"exit"},...[true,false].map(yes=>({kind:"approve",host:"codex",digest:valid,yes})),...["restored","removed","intact","already removed","skipped","partial","busy","indeterminate","failed"].map(outcome=>({kind:"observed",host:"codex",outcome})),...["complete","failed"].flatMap(result=>[{kind:"activated",host:"codex",result},{kind:"activatedEmpty",result}])]
  for(const original of actions)for(const correlation of ["current","current-host","stale-revision","stale-command","foreign-host"]) {
   const action={...original,...(["discovered","inspected","failed","previewed","observed","activated","activatedEmpty"].includes(original.kind)?{commandId:correlation==="stale-command"?revision+1:revision}:{}),...(correlation==="foreign-host"&&"host" in original?{host:"pi"}:correlation==="current-host"&&"host" in original?{host:model.agents[model.cursor]?.host??"codex"}:{})}
   const event={revision:correlation==="stale-revision"?revision+1:revision,action}
   const actual=materialize(model,action,core.step(tag(phase),tag(actionTag(action)),...factsFor(model,event))),expected=reference.reduceMaintenance(model,event)
   if(production){
    const integrated=production.reduceMaintenance(model,event)
    assert.deepEqual(integrated,expected)
    assert.equal(integrated===model,expected===model)
    assert.equal(integrated.agents===model.agents,expected.agents===model.agents)
    assert.equal(integrated.discoveryFailures===model.discoveryFailures,expected.discoveryFailures===model.discoveryFailures)
    for(let index=0;index<model.agents.length;index++)if(expected.agents[index]===model.agents[index])assert.equal(integrated.agents[index],model.agents[index])
   }
   if(revision===7&&cursor===0&&correlation==="current")nativeCases.push([model,event])
   assert.deepEqual(actual,expected)
   assert.equal(actual===model,expected===model)
   if(expected===model)holds++
   assert.equal(actual.discoveryFailures===model.discoveryFailures,expected.discoveryFailures===model.discoveryFailures)
   assert.equal(actual.agents===model.agents,expected.agents===model.agents)
   for(let index=0;index<model.agents.length;index++)if(expected.agents[index]===model.agents[index])assert.equal(actual.agents[index],model.agents[index])
   transitions++
  }
 }
 const record={at:new Date().toISOString(),passed:true,productionCompared:production!==undefined,lawCases,nativeTransitionCases:transitions,nativeCommandCases:commands,holds,sha256:Object.fromEntries([root+"/core.bend",root+"/LAWS.bend","packages/administration/src/onboarding/checks/maintenance-reference.ts","packages/administration/src/onboarding/checks/maintenance-draft-parity.mjs",...(production?["packages/administration/src/onboarding/maintenance-model.ts","packages/administration/dist/onboarding/maintenance-model.js","packages/canonical-policy/src/canonical/maintenance-adapter.ts","packages/canonical-policy/dist/canonical/maintenance-adapter.js","packages/agent-flow-bend/scripts/build-maintenance-policy.mjs","packages/agent-flow-bend/dist/maintenance-policy.generated.js"]:[])].map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),scope:"draft core plus byte-preserved draft spec helpers; finite closed phase/action/Boolean law domain; native materialized fixtures against verbatim TypeScript reference; actual emitted production bridge compared only when productionCompared is true; no kernel proof, owner IO or platform claim"}
 writeFileSync("evidence/bend-strangler/maintenance-draft-parity.json",JSON.stringify(record,null,2)+"\n")
 console.log(JSON.stringify(record))
}finally{rmSync(directory,{recursive:true,force:true})}
