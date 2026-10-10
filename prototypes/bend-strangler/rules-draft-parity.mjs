import assert from "node:assert/strict"
import {execFileSync} from "node:child_process"
import {mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {resolve,join} from "node:path"
import {pathToFileURL} from "node:url"
import {createHash} from "node:crypto"
import * as reference from "./rules-reference.ts"
export const nativeCases=[]
const production=process.env.HAPSLAND_RULES_PRODUCTION==="1"?await import(new URL("../../packages/administration/dist/rules/interaction-model.js",import.meta.url)):undefined
const directory=mkdtempSync(join(tmpdir(),"hapsland-rules-draft-"))
const root="packages/agent-flow-bend/rules-policy"
const tag=x=>({$:"Rules"+x})
const phases=["Scope","Previewing","Preview","Approval","Applying","Done","Cancelled"]
const actions=["ScopeSelected","Continue","Approve","Back","Exit","Previewed","Observed"]
try{
 let corePath=root+"/core.bend"
 if(process.env.HAPSLAND_RULES_MUTANT){
  const source=readFileSync(corePath,"utf8")
  const edits={command:[/(case RulesPreviewing\{\}:\s*Bool.pick\(\s*Command,\s*)scope_present,/,"$1True{},"],step:[/(Bool.pick\(\s*Plan,\s*)current,(\s*current_step\()/,"$1True{},$2"]}
  const [before,after]=edits[process.env.HAPSLAND_RULES_MUTANT]??[]
  assert.ok(before?.test(source));corePath=join(directory,"mutant.bend");writeFileSync(corePath,source.replace(before,after))
 }
 execFileSync("bend",[corePath,"-o",join(directory,"core.mjs")],{timeout:5000})
 const core=(await import(pathToFileURL(join(directory,"core.mjs")))).default
 const laws=readFileSync(root+"/LAWS.bend","utf8"),helpers=laws.slice(0,laws.indexOf("law command_exact:"))
 assert.ok(helpers.includes("def command_spec(")&&helpers.includes("def transition_spec("))
 symlinkSync(resolve(root+"/core.bend"),join(directory,"core.bend"));writeFileSync(join(directory,"spec.bend"),helpers)
 execFileSync("bend",[join(directory,"spec.bend"),"-o",join(directory,"spec.mjs")],{timeout:5000})
 const spec=(await import(pathToFileURL(join(directory,"spec.mjs")))).default
 const prefix=spec.command_spec({$:"invalid"},false,false).$.replace(/RulesNoCommand$/,"")
 const specTag=x=>({$:prefix+"Rules"+x})
 const normalize=value=>value!==null&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==="$"?item.slice(item.lastIndexOf("Rules")):normalize(item)])):value
 let lawCases=0
 for(const phase of phases)for(let bits=0;bits<4;bits++){
  const facts=[Boolean(bits&1),Boolean(bits&2)]
  assert.deepEqual(core.command(tag(phase),...facts),normalize(spec.command_spec(specTag(phase),...facts)));lawCases++
 }
 for(const phase of phases)for(const action of actions)for(let bits=0;bits<32;bits++){
  const [current,...facts]=[0,1,2,3,4].map(i=>Boolean(bits&(1<<i)))
  assert.deepEqual(core.step(tag(phase),tag(action),current,...facts),current?normalize(spec.transition_spec(specTag(phase),specTag(action),...facts)):tag("Hold"));lawCases++
 }
 const planFor=(action,scope,digest="current")=>({action,scope,digest,configuration:"/safe/config",rule:"team",enabled:true})
 const readTag=action=>({scope:"ScopeSelected",continue:"Continue",approve:"Approve",back:"Back",exit:"Exit",previewed:"Previewed",observed:"Observed"})[action.kind]
 const factsFor=(model,event)=>{
  const action=event.action
  return [event.revision===model.revision&&(!("commandId" in action)||action.commandId===model.revision),action.kind==="previewed"&&action.plan.scope===model.scope&&action.plan.action===model.action,action.kind==="approve"&&action.digest===model.plan?.digest,action.kind==="approve"&&action.yes,action.kind==="observed"&&action.outcome==="stale"]
 }
 const materialize=(model,action,plan)=>{
  if(plan.$==="RulesHold")return model
  assert.equal(plan.$,"RulesAdvance")
  const patches={RulesNoPatch:()=>({}),RulesScopePatch:()=>({scope:action.scope,plan:undefined,outcome:undefined}),RulesClearPlanOutcomePatch:()=>({plan:undefined,outcome:undefined}),RulesPreviewPatch:()=>({plan:action.plan}),RulesDeclinedPatch:()=>({outcome:"declined"}),RulesStalePatch:()=>({plan:undefined,outcome:"stale"}),RulesOutcomePatch:()=>({outcome:action.outcome}),RulesClearPlanPatch:()=>({plan:undefined})}
  assert.ok(patches[plan.patch.$])
  return {...model,...patches[plan.patch.$](),phase:plan.phase.$.slice("Rules".length),revision:model.revision+1}
 }
 const commandFor=model=>{
  const command=core.command(tag(model.phase),Boolean(model.scope),Boolean(model.plan)).$
  return command==="RulesNoCommand"?undefined:command==="RulesPreviewCommand"?{kind:"preview",id:model.revision,action:model.action,scope:model.scope}:{kind:"apply",id:model.revision,plan:model.plan}
 }
 let transitions=0,commands=0,holds=0
 for(const phase of phases)for(const revision of [0,7,Infinity,NaN])for(const ruleAction of ["create","connect","enable","disable"])for(const scope of [undefined,"project","personal"])for(const planKind of ["missing","matching","foreign-scope","foreign-action"])for(const outcome of [undefined,"stale","partial"])for(const properties of ["explicit","absent"]){
  const plan=planKind==="missing"?undefined:planFor(planKind==="foreign-action"?(ruleAction==="create"?"enable":"create"):ruleAction,planKind==="foreign-scope"?(scope==="project"?"personal":"project"):scope)
  const model={...reference.initialRules(ruleAction),phase,revision,scope,plan,outcome}
  if(properties==="absent")for(const key of ["scope","plan","outcome"])if(model[key]===undefined)delete model[key]
  assert.deepEqual(commandFor(model),reference.rulesCommand(model));if(production)assert.deepEqual(production.rulesCommand(model),reference.rulesCommand(model));commands++
  const nativeActions=[{kind:"scope",scope:"project"},{kind:"scope",scope:"personal"},{kind:"continue"},{kind:"back"},{kind:"exit"},...[true,false].flatMap(yes=>["current","foreign",""].map(digest=>({kind:"approve",yes,digest}))),...[planFor(ruleAction,scope),planFor(ruleAction,scope,""),planFor(ruleAction,scope==="project"?"personal":"project"),planFor(ruleAction==="create"?"enable":"create",scope)].map(plan=>({kind:"previewed",plan})),...["applied","failed","partial","stale"].map(outcome=>({kind:"observed",outcome}))]
  for(const original of nativeActions)for(const correlation of ["current","stale-revision","stale-command"]){
   const action={...original,...(["previewed","observed"].includes(original.kind)?{commandId:correlation==="stale-command"?revision+1:revision}:{})}
   const event={revision:correlation==="stale-revision"?revision+1:revision,action}
   const actual=materialize(model,action,core.step(tag(phase),tag(readTag(action)),...factsFor(model,event))),expected=reference.reduceRules(model,event)
   assert.deepEqual(actual,expected);assert.equal(actual===model,expected===model);assert.equal(actual.plan,expected.plan)
   if(production){const integrated=production.reduceRules(model,event);assert.deepEqual(integrated,expected);assert.equal(integrated===model,expected===model);assert.equal(integrated.plan,expected.plan);assert.deepEqual(production.rulesCommand(integrated),reference.rulesCommand(expected))}
   if(expected===model)holds++
   if(revision===7&&outcome===undefined&&correlation==="current")nativeCases.push([model,event])
   transitions++
  }
 }
 const paths=[root+"/core.bend",root+"/LAWS.bend","evidence/bend-strangler/rules-reference.ts","evidence/bend-strangler/rules-draft-parity.mjs",...(production?["packages/administration/src/rules/interaction-model.ts","packages/administration/dist/rules/interaction-model.js","packages/canonical-policy/src/canonical/rules-adapter.ts","packages/canonical-policy/dist/canonical/rules-adapter.js","packages/agent-flow-bend/scripts/build-rules-policy.mjs","packages/agent-flow-bend/dist/rules-policy.generated.js"]:[])]
 const record={at:new Date().toISOString(),passed:true,productionCompared:production!==undefined,lawCases,nativeTransitionCases:transitions,nativeCommandCases:commands,holds,sha256:Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),scope:"closed finite draft phase/action/Boolean law domain; verbatim spec helpers; native rule models/events including plan identity, metadata matches, missing plans, digests, stale outcomes and nonfinite correlation; emitted production compared only when productionCompared is true; no kernel, owner writes or platform claim"}
 writeFileSync("evidence/bend-strangler/rules-draft-parity.json",JSON.stringify(record,null,2)+String.fromCharCode(10));console.log(JSON.stringify(record))
}finally{rmSync(directory,{recursive:true,force:true})}
