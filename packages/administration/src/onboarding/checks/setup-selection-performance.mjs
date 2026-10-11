import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"
import {pathToFileURL} from "node:url"
import {nativeCases as allCases} from "./setup-selection-draft-parity.mjs"
const nativeCases=allCases.filter(([model])=>Number.isFinite(model.revision)&&Number.isFinite(model.index))
import * as frozen from "./setup-selection-reference.ts"
import * as candidate from "../../../dist/onboarding/setup-selection.js"
assert.equal(globalThis.Bun?.version,"1.3.14","use pinned product Bun runtime")
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??"/workspace/typescript/hapsland-bend-baseline-latest"
const baselineModel=baselineRoot+"/packages/administration/dist/onboarding/setup-selection.js"
const reference=await import(pathToFileURL(baselineModel))
const baselineRevision=execFileSync("git",["rev-parse","HEAD"],{cwd:baselineRoot,encoding:"utf8"}).trim()
for(const [model,event] of nativeCases){
 assert.deepEqual(candidate.reduceSelection(model,event),frozen.reduceSelection(model,event))
 assert.deepEqual(reference.reduceSelection(model,event),frozen.reduceSelection(model,event))
}
const consumeSelection=selected=>selected.reduce((n,host)=>n+host.length,0)
const runReference = ()=>{
 const lane=reference
 const start=performance.now()
 let checksum=0
 for(let round=0;round<128;round++)for(const [model,event] of nativeCases){
  const result=lane.reduceSelection(model,event)
  checksum+=(result.revision|0)+result.phase.length+(result.index|0)+consumeSelection(result.selected)
 }
 return {milliseconds:performance.now()-start,checksum}
}
const runCandidate = ()=>{
 const lane=candidate
 const start=performance.now()
 let checksum=0
 for(let round=0;round<128;round++)for(const [model,event] of nativeCases){
  const result=lane.reduceSelection(model,event)
  checksum+=(result.revision|0)+result.phase.length+(result.index|0)+consumeSelection(result.selected)
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
const paths=[baselineModel,'packages/administration/src/onboarding/checks/setup-selection-reference.ts','packages/administration/src/onboarding/checks/setup-selection-draft-parity.mjs','packages/administration/src/onboarding/checks/setup-selection-performance.mjs','packages/agent-flow-bend/setup-selection-policy/core.bend','packages/agent-flow-bend/setup-selection-policy/LAWS.bend','packages/agent-flow-bend/setup-selection-policy/PROOF.bend','packages/agent-flow-bend/scripts/build-setup-selection-policy.mjs','packages/canonical-policy/src/canonical/setup-selection-adapter.ts','packages/administration/src/onboarding/setup-selection.ts','packages/agent-flow-bend/dist/setup-selection-policy.generated.js','packages/canonical-policy/dist/canonical/setup-selection-adapter.js','packages/administration/dist/onboarding/setup-selection.js']
const sha256=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]))
const record={at:new Date().toISOString(),runtime:{kind:'Bun',versions:process.versions,executable:process.execPath},baselineRevision,roundsPerSample:128,warmupRounds,samplePairs,timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:'actual emitted outer setup selection reducer; independent identical full-field-consuming harness functions; finite native models/events; CPU11 nonexclusive; no acquisition, owner IO, startup or platform claim'}
writeFileSync('evidence/bend-strangler/setup-selection-performance.json',JSON.stringify(record,null,2)+String.fromCharCode(10))
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
