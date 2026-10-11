import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {nativeCases} from "./update-parity.mjs"
import * as frozen from "./update-reference.ts"
import * as reference from "/workspace/typescript/hapsland-bend-baseline/packages/administration/dist/onboarding/update-model.js"
for (const [model,event] of nativeCases) {
  assert.deepEqual(reference.reduceUpdate(model,event),frozen.reduceUpdate(model,event))
  assert.deepEqual(reference.updateCommand(model),frozen.updateCommand(model))
}
import * as candidate from "../../../dist/onboarding/update-model.js"
const runReference = () => {
  const lane = reference
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<4;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceUpdate(model,event), command=lane.updateCommand(result)
    checksum+=result.revision+result.cursor+result.phase.length+result.agents.length+result.discoveryFailures.length+(result.activationReturn?.length??0)+(command?.kind.length??0)+(command?.id??0)+(command?.host?.length??0)+(command?.digest?.length??0)
    for(const agent of result.agents)checksum+=agent.host.length+(agent.digest?.length??0)+(agent.outcome?.length??0)+(agent.activation?.length??0)
  }
  return {milliseconds:performance.now()-start,checksum}
}
const runCandidate = () => {
  const lane = candidate
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<4;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceUpdate(model,event), command=lane.updateCommand(result)
    checksum+=result.revision+result.cursor+result.phase.length+result.agents.length+result.discoveryFailures.length+(result.activationReturn?.length??0)+(command?.kind.length??0)+(command?.id??0)+(command?.host?.length??0)+(command?.digest?.length??0)
    for(const agent of result.agents)checksum+=agent.host.length+(agent.digest?.length??0)+(agent.outcome?.length??0)+(agent.activation?.length??0)
  }
  return {milliseconds:performance.now()-start,checksum}
}
const warmupRounds=Number(process.env.HAPSLAND_UPDATE_WARMUP_ROUNDS??3), samplePairs=Number(process.env.HAPSLAND_UPDATE_SAMPLE_PAIRS??9)
assert.ok(Number.isInteger(warmupRounds)&&warmupRounds>=3&&warmupRounds<=30)
assert.ok(Number.isInteger(samplePairs)&&samplePairs>=9&&samplePairs<=41&&samplePairs%2===1)
for(let round=0;round<warmupRounds;round++){ if(process.env.HAPSLAND_UPDATE_TIMING_ORDER === "candidate-first") {runCandidate();runReference()} else {runReference();runCandidate()} }
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<samplePairs;round++) {
  const lanes=[["typescript",runReference],["integratedBend",runCandidate]]
  if(round%2)lanes.reverse()
  for(const [name,lane] of lanes)samples[name].push(lane())
}
assert.equal(new Set(Object.values(samples).flat().map(sample=>sample.checksum)).size,1)
const median=values=>values.map(value=>value.milliseconds).sort((a,b)=>a-b)[Math.floor(values.length/2)]
const ratio=median(samples.integratedBend)/median(samples.typescript)
const paths=["/workspace/typescript/hapsland-bend-baseline/packages/administration/dist/onboarding/update-model.js","packages/administration/src/onboarding/checks/update-reference.ts","packages/agent-flow-bend/update-policy/core.bend","packages/agent-flow-bend/update-policy/LAWS.bend","packages/agent-flow-bend/update-policy/PROOF.bend","packages/agent-flow-bend/scripts/build-update-policy.mjs","packages/canonical-policy/src/canonical/update-adapter.ts","packages/administration/src/onboarding/update-model.ts","packages/agent-flow-bend/dist/update-policy.generated.js","packages/canonical-policy/dist/canonical/update-adapter.js","packages/administration/dist/onboarding/update-model.js"]
const sha256=Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))
const record={at:new Date().toISOString(),baselineRevision:"a071b9b58",warmupRounds,samplePairs,warmupOrder:process.env.HAPSLAND_UPDATE_TIMING_ORDER??"reference-first",timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:"emitted update reducer/commands from both master and candidate; independent identical harness functions per lane; native current-cursor cases with exact output field consumption; finite array and correlation fixtures; no acquisition, owner IO, startup or platform claim"}
writeFileSync("evidence/bend-strangler/update-isolated-harness-performance.json",JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
