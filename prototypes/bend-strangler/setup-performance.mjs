import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {nativeCases} from "./setup-transition-parity.mjs"
import * as frozen from "./setup-reference.ts"
import {execFileSync} from "node:child_process"
import {pathToFileURL} from "node:url"
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??"/workspace/typescript/hapsland-bend-baseline"
const baselineModel=baselineRoot+"/packages/administration/dist/onboarding/setup-model.js"
const reference=await import(pathToFileURL(baselineModel))
const baselineRevision=execFileSync("git",["rev-parse","HEAD"],{cwd:baselineRoot,encoding:"utf8"}).trim()
for (const [model,event] of nativeCases) {
  assert.deepEqual(candidate.reduceSetup(model,event),frozen.reduceSetup(model,event))
  assert.deepEqual(candidate.setupCommand(model),frozen.setupCommand(model))
  assert.deepEqual(reference.reduceSetup(model,event),frozen.reduceSetup(model,event))
  assert.deepEqual(reference.setupCommand(model),frozen.setupCommand(model))
}
import * as candidate from "../../packages/administration/dist/onboarding/setup-model.js"
const consumeObservation = observation => {
  if(observation===undefined)return 0
  let checksum=observation.status.length+(observation.installDigest?.length??0)+(observation.rulesDigest?.length??0)+(observation.credential?.status.length??0)+((observation.credential?.generation??0)|0)
  for(const stage of observation.stages)checksum+=stage.stage.length+stage.status.length
  return checksum
}
const runReference = () => {
  const lane = reference
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<8;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceSetup(model,event), command=lane.setupCommand(result)
    checksum += (result.revision|0)+(result.progressSequence|0)+result.phase.length+(result.exitCode|0)+result.activation.length+(result.installApproved?.length??0)+(result.rulesApproved?.length??0)+(result.verification?.kind.length??0)+(result.readiness?.length??0)+consumeObservation(result.proposal)+(command?.kind.length??0)+((command?.id??0)|0)
    for(const observation of result.observations)checksum+=consumeObservation(observation)
    checksum+=Number(lane.setupObservationReady(result.observations.at(-1)))
  }
  return {milliseconds:performance.now()-start,checksum}
}
const runCandidate = () => {
  const lane = candidate
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<8;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceSetup(model,event), command=lane.setupCommand(result)
    checksum += (result.revision|0)+(result.progressSequence|0)+result.phase.length+(result.exitCode|0)+result.activation.length+(result.installApproved?.length??0)+(result.rulesApproved?.length??0)+(result.verification?.kind.length??0)+(result.readiness?.length??0)+consumeObservation(result.proposal)+(command?.kind.length??0)+((command?.id??0)|0)
    for(const observation of result.observations)checksum+=consumeObservation(observation)
    checksum+=Number(lane.setupObservationReady(result.observations.at(-1)))
  }
  return {milliseconds:performance.now()-start,checksum}
}
const warmupRounds=Number(process.env.HAPSLAND_SETUP_WARMUP_ROUNDS??20), samplePairs=Number(process.env.HAPSLAND_SETUP_SAMPLE_PAIRS??31)
assert.ok(Number.isInteger(warmupRounds)&&warmupRounds>=3&&warmupRounds<=30)
assert.ok(Number.isInteger(samplePairs)&&samplePairs>=9&&samplePairs<=41&&samplePairs%2===1)
for(let round=0;round<warmupRounds;round++){ if(process.env.HAPSLAND_SETUP_TIMING_ORDER === "candidate-first") {runCandidate();runReference()} else {runReference();runCandidate()} }
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<samplePairs;round++) {
  const lanes=[["typescript",runReference],["integratedBend",runCandidate]]
  if(round%2)lanes.reverse()
  for(const [name,lane] of lanes)samples[name].push(lane())
}
assert.equal(new Set(Object.values(samples).flat().map(sample=>sample.checksum)).size,1)
const median=values=>values.map(value=>value.milliseconds).sort((a,b)=>a-b)[Math.floor(values.length/2)]
const ratio=median(samples.integratedBend)/median(samples.typescript)
const paths=[baselineModel,"evidence/bend-strangler/setup-reference.ts","packages/agent-flow-bend/setup-policy/core.bend","packages/agent-flow-bend/setup-policy/LAWS.bend","packages/agent-flow-bend/setup-policy/PROOF.bend","packages/agent-flow-bend/scripts/build-setup-policy.mjs","packages/canonical-policy/src/canonical/setup-adapter.ts","packages/administration/src/onboarding/setup-model.ts","packages/agent-flow-bend/dist/setup-policy.generated.js","packages/canonical-policy/dist/canonical/setup-adapter.js","packages/administration/dist/onboarding/setup-model.js"]
const sha256=Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))
const record={at:new Date().toISOString(),runtime:{kind:globalThis.Bun===undefined?"Node":"Bun",versions:process.versions,executable:process.execPath},baselineRevision,warmupRounds,samplePairs,warmupOrder:process.env.HAPSLAND_SETUP_TIMING_ORDER??"reference-first",timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:"emitted setup reducer/commands/readiness from both master and candidate; independent identical harness functions per lane; native finite-token cases with exact output field consumption; finite stage/status/digest/progress/correlation fixtures; no acquisition, owner IO, startup or platform claim"}
writeFileSync("evidence/bend-strangler/setup-performance.json",JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
