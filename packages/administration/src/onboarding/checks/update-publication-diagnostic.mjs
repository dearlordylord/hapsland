import {nativeCases} from "./update-parity.mjs"
import * as reference from "./update-reference.ts"
import * as candidate from "../../../dist/onboarding/update-model.js"
import {writeFileSync} from "node:fs"
const sink = Array.from({length:nativeCases.length},()=>({model:undefined,command:undefined}))
function run(lane) {
 const start=performance.now()
 for(let round=0;round<4;round++)for(let index=0;index<nativeCases.length;index++) {
  const [model,event]=nativeCases[index], result=lane.reduceUpdate(model,event)
  sink[index].model=result;sink[index].command=lane.updateCommand(result)
 }
 const milliseconds=performance.now()-start
 let checksum=0
 for(const {model:result,command} of sink) {
  checksum+=result.revision+result.cursor+result.phase.length+result.agents.length+result.discoveryFailures.length+(result.activationReturn?.length??0)+(command?.kind.length??0)+(command?.id??0)+(command?.host?.length??0)+(command?.digest?.length??0)
  for(const agent of result.agents)checksum+=agent.host.length+(agent.digest?.length??0)+(agent.outcome?.length??0)+(agent.activation?.length??0)
 }
 return {milliseconds,checksum}
}
for(let round=0;round<3;round++){run(reference);run(candidate)}
const samples={typescript:[],integratedBend:[]}
for(let round=0;round<9;round++) {
 const lanes=[["typescript",reference],["integratedBend",candidate]]
 if(round%2)lanes.reverse()
 for(const [name,lane] of lanes)samples[name].push(run(lane))
}
const median=values=>values.map(value=>value.milliseconds).sort((a,b)=>a-b)[4]
const record={at:new Date().toISOString(),samples,medianRatio:median(samples.integratedBend)/median(samples.typescript),scope:"diagnostic for native model/command publication; preallocated escaped sink; full field consumption outside timed region; prior immediate-consumption workload remains separately recorded"}
writeFileSync("evidence/bend-strangler/update-publication-diagnostic.json",JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({medianRatio:record.medianRatio}))
