import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {nativeCases} from "./e31-host-repaired-direct-login-parity.mjs"
import * as frozen from "./direct-login-reference.ts"
import {execFileSync} from "node:child_process"
import {pathToFileURL} from "node:url"
assert.equal(globalThis.Bun?.version,"1.3.14","use pinned product Bun runtime")
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??"/workspace/typescript/hapsland-bend-baseline-latest"
const baselineModel=baselineRoot+"/packages/administration/dist/credentials/direct-login-model.js"
const reference=await import(pathToFileURL(baselineModel))
const baselineRevision=execFileSync("git",["rev-parse","HEAD"],{cwd:baselineRoot,encoding:"utf8"}).trim()
for (const [model,event] of nativeCases) {
  assert.deepEqual(candidate.reduceLogin(model,event),frozen.reduceLogin(model,event))
  assert.deepEqual(candidate.loginCommand(model),frozen.loginCommand(model))
  assert.deepEqual(reference.reduceLogin(model,event),frozen.reduceLogin(model,event))
  assert.deepEqual(reference.loginCommand(model),frozen.loginCommand(model))
}
import * as candidate from "../../../dist/credentials/direct-login-model.js"
const runReference = () => {
  const lane = reference
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<8;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceLogin(model,event), command=lane.loginCommand(result)
    checksum+=(result.revision|0)+result.phase.length+result.inputKind.length+(result.availability?.length??0)+(result.storage?.status.length??0)+((result.storage?.generation??0)|0)+(result.storage?.stateLock.length??0)+(result.storage?.savedUse.length??0)+(command?.kind.length??0)+((command?.id??0)|0)
  }
  return {milliseconds:performance.now()-start,checksum}
}
const runCandidate = () => {
  const lane = candidate
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<8;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceLogin(model,event), command=lane.loginCommand(result)
    checksum+=(result.revision|0)+result.phase.length+result.inputKind.length+(result.availability?.length??0)+(result.storage?.status.length??0)+((result.storage?.generation??0)|0)+(result.storage?.stateLock.length??0)+(result.storage?.savedUse.length??0)+(command?.kind.length??0)+((command?.id??0)|0)
  }
  return {milliseconds:performance.now()-start,checksum}
}
const warmupRounds=Number(process.env.HAPSLAND_DIRECT_LOGIN_WARMUP_ROUNDS??20), samplePairs=Number(process.env.HAPSLAND_DIRECT_LOGIN_SAMPLE_PAIRS??31)
assert.ok(Number.isInteger(warmupRounds)&&warmupRounds>=3&&warmupRounds<=30)
assert.ok(Number.isInteger(samplePairs)&&samplePairs>=9&&samplePairs<=41&&samplePairs%2===1)
for(let round=0;round<warmupRounds;round++){ if(process.env.HAPSLAND_DIRECT_LOGIN_TIMING_ORDER === "candidate-first") {runCandidate();runReference()} else {runReference();runCandidate()} }
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<samplePairs;round++) {
  const lanes=[["typescript",runReference],["integratedBend",runCandidate]]
  if(round%2)lanes.reverse()
  for(const [name,lane] of lanes)samples[name].push(lane())
}
assert.equal(new Set(Object.values(samples).flat().map(sample=>sample.checksum)).size,1)
const median=values=>values.map(value=>value.milliseconds).sort((a,b)=>a-b)[Math.floor(values.length/2)]
const ratio=median(samples.integratedBend)/median(samples.typescript)
const paths=[baselineModel,"packages/administration/src/credentials/checks/direct-login-reference.ts","packages/administration/src/credentials/checks/direct-login-parity.mjs","packages/administration/src/credentials/checks/direct-login-performance.mjs","packages/agent-flow-bend/direct-login-policy/core.bend","packages/agent-flow-bend/direct-login-policy/LAWS.bend","packages/agent-flow-bend/direct-login-policy/PROOF.bend","packages/agent-flow-bend/scripts/build-direct-login-policy.mjs","packages/canonical-policy/src/canonical/direct-login-adapter.ts","packages/administration/src/credentials/direct-login-model.ts","packages/agent-flow-bend/dist/direct-login-policy.generated.js","packages/canonical-policy/dist/canonical/direct-login-adapter.js","packages/administration/dist/credentials/direct-login-model.js"]
const sha256=Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))
const record={at:new Date().toISOString(),runtime:{kind:globalThis.Bun===undefined?"Node":"Bun",versions:process.versions,executable:process.execPath},baselineRevision,warmupRounds,samplePairs,warmupOrder:process.env.HAPSLAND_DIRECT_LOGIN_TIMING_ORDER??"reference-first",timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:"emitted direct stdin login reducer/commands from both master and candidate; independent identical harness functions per lane; native finite-token cases with exact output field consumption; finite status/storage/correlation fixtures; no acquisition, owner IO, startup or platform claim"}
writeFileSync("evidence/bend-strangler/e31-host-repaired-direct-login-performance.json",JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
