import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"
import {pathToFileURL} from "node:url"
import {nativeCases} from "./rules-draft-parity.mjs"
import * as frozen from "./rules-reference.ts"
import * as candidate from "../../packages/administration/dist/rules/interaction-model.js"
assert.equal(globalThis.Bun?.version,"1.3.14","use pinned product Bun runtime")
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??"/workspace/typescript/hapsland-bend-baseline-current"
const baselineModel=baselineRoot+"/packages/administration/dist/rules/interaction-model.js"
const reference=await import(pathToFileURL(baselineModel))
const baselineRevision=execFileSync("git",["rev-parse","HEAD"],{cwd:baselineRoot,encoding:"utf8"}).trim()
for(const [model,event] of nativeCases){
 assert.deepEqual(candidate.reduceRules(model,event),frozen.reduceRules(model,event))
 assert.deepEqual(reference.reduceRules(model,event),frozen.reduceRules(model,event))
 assert.deepEqual(candidate.rulesCommand(model),frozen.rulesCommand(model))
 assert.deepEqual(reference.rulesCommand(model),frozen.rulesCommand(model))
}
const consumePlan = plan=>plan===undefined?0:plan.digest.length+plan.action.length+(plan.scope?.length??0)+plan.configuration.length+plan.rule.length+Number(plan.enabled)
const runReference = ()=>{
 const lane=reference
 const start=performance.now()
 let checksum=0
 for(let round=0;round<8;round++)for(const [model,event] of nativeCases){
  const result=lane.reduceRules(model,event),command=lane.rulesCommand(result)
  checksum+=(result.revision|0)+result.phase.length+result.action.length+(result.scope?.length??0)+(result.outcome?.length??0)+consumePlan(result.plan)+(command?.kind.length??0)+((command?.id??0)|0)+(command?.action?.length??0)+(command?.scope?.length??0)+consumePlan(command?.plan)
 }
 return {milliseconds:performance.now()-start,checksum}
}
const runCandidate = ()=>{
 const lane=candidate
 const start=performance.now()
 let checksum=0
 for(let round=0;round<8;round++)for(const [model,event] of nativeCases){
  const result=lane.reduceRules(model,event),command=lane.rulesCommand(result)
  checksum+=(result.revision|0)+result.phase.length+result.action.length+(result.scope?.length??0)+(result.outcome?.length??0)+consumePlan(result.plan)+(command?.kind.length??0)+((command?.id??0)|0)+(command?.action?.length??0)+(command?.scope?.length??0)+consumePlan(command?.plan)
 }
 return {milliseconds:performance.now()-start,checksum}
}
const warmupRounds=20,samplePairs=31
for(let round=0;round<warmupRounds;round++){runReference();runCandidate()}
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<samplePairs;round++){
 const lanes=round%2?[['integratedBend',runCandidate],['typescript',runReference]]:[['typescript',runReference],['integratedBend',runCandidate]]
 const pair=[]
 for(const [name,run] of lanes){const sample=run();samples[name].push(sample);pair.push(sample)}
 assert.equal(pair[0].checksum,pair[1].checksum)
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
const ratio=median(samples.integratedBend.map(x=>x.milliseconds))/median(samples.typescript.map(x=>x.milliseconds))
const paths=[baselineModel,'evidence/bend-strangler/rules-reference.ts','evidence/bend-strangler/rules-draft-parity.mjs','evidence/bend-strangler/rules-performance.mjs','packages/agent-flow-bend/rules-policy/core.bend','packages/agent-flow-bend/rules-policy/LAWS.bend','packages/agent-flow-bend/rules-policy/PROOF.bend','packages/agent-flow-bend/scripts/build-rules-policy.mjs','packages/canonical-policy/src/canonical/rules-adapter.ts','packages/administration/src/rules/interaction-model.ts','packages/agent-flow-bend/dist/rules-policy.generated.js','packages/canonical-policy/dist/canonical/rules-adapter.js','packages/administration/dist/rules/interaction-model.js']
const sha256=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))
const record={at:new Date().toISOString(),runtime:{kind:'Bun',versions:process.versions,executable:process.execPath},baselineRevision,warmupRounds,samplePairs,timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:'actual emitted rules conversation reducers and commands; independent identical full-field-consuming harness functions; finite native models/events; CPU11 nonexclusive; no acquisition, owner IO, startup or platform claim'}
writeFileSync('evidence/bend-strangler/rules-performance.json',JSON.stringify(record,null,2)+String.fromCharCode(10))
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
