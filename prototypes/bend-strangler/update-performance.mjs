import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {nativeCases} from "./update-parity.mjs"
import * as reference from "./update-reference.ts"
import * as candidate from "../../packages/administration/dist/onboarding/update-model.js"
const run = lane => {
  const start = performance.now()
  let checksum = 0
  for (let round=0;round<4;round++) for(const [model,event] of nativeCases) {
    const result=lane.reduceUpdate(model,event), command=lane.updateCommand(result)
    checksum+=result.revision+result.cursor+result.phase.length+result.agents.length+result.discoveryFailures.length+(result.activationReturn?.length??0)+(command?.kind.length??0)+(command?.id??0)+(command?.host?.length??0)+(command?.digest?.length??0)
    for(const agent of result.agents)checksum+=agent.host.length+(agent.digest?.length??0)+(agent.outcome?.length??0)+(agent.activation?.length??0)
  }
  return {milliseconds:performance.now()-start,checksum}
}
for(let round=0;round<3;round++){run(reference);run(candidate)}
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<9;round++) {
  const lanes=[["typescript",reference],["integratedBend",candidate]]
  if(round%2)lanes.reverse()
  for(const [name,lane] of lanes)samples[name].push(run(lane))
}
assert.equal(new Set(Object.values(samples).flat().map(sample=>sample.checksum)).size,1)
const median=values=>values.map(value=>value.milliseconds).sort((a,b)=>a-b)[4]
const ratio=median(samples.integratedBend)/median(samples.typescript)
const paths=["evidence/bend-strangler/update-reference.ts","packages/agent-flow-bend/update-policy/core.bend","packages/agent-flow-bend/update-policy/LAWS.bend","packages/agent-flow-bend/update-policy/PROOF.bend","packages/agent-flow-bend/scripts/build-update-policy.mjs","packages/canonical-policy/src/canonical/update-adapter.ts","packages/administration/src/onboarding/update-model.ts","packages/agent-flow-bend/dist/update-policy.generated.js","packages/canonical-policy/dist/canonical/update-adapter.js","packages/administration/dist/onboarding/update-model.js"]
const sha256=Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))
const record={at:new Date().toISOString(),baselineRevision:"a071b9b58",timedCases:nativeCases.length,samples,medianRatio:ratio,executionParity:ratio<=1,sha256,scope:"warm compiled update reducer/commands versus frozen master; native current-cursor cases with exact output field consumption; finite array and correlation fixtures; no acquisition, owner IO, startup or platform claim"}
writeFileSync("evidence/bend-strangler/update-performance.json",JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio:ratio,executionParity:record.executionParity}))
