import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {readFileSync,writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {execFileSync} from "node:child_process"
import {pathToFileURL} from "node:url"
import {nativeCases} from "./selection-ui-parity.mjs"
assert.equal(globalThis.Bun?.version,"1.3.14")
const baselineRoot=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT??"/workspace/typescript/hapsland-bend-baseline-master-current"
const reference=await import(pathToFileURL(baselineRoot+"/packages/administration/dist/interaction/selection.js"))
const control=process.env.HAPSLAND_PERFORMANCE_CONTROL==="reference"
const candidate=control?reference:await import(new URL("../../packages/administration/dist/interaction/selection.js",import.meta.url))
const runReference=()=>{
 const start=performance.now();let checksum=0
 for(let round=0;round<8;round++)for(const [model,key,options]of nativeCases){
  const result=reference.selectionUpdate(model,key,options);let ids
  if(result._tag==="NextFrame"){
   checksum=(checksum+1+(Number.isFinite(result.state.focus)?result.state.focus|0:19)+Number(result.state.warning)+result.state.opaque.marker.length+Number(result.state.opaque===model.opaque))|0
   ids=result.state.selected
  }else{
   checksum=(checksum+result.value.kind.length)|0
   if(result.value.kind==="select")ids=result.value.ids
  }
  if(ids){checksum=(checksum+ids.length)|0;for(const id of ids){checksum=(checksum*33+id.length)|0;for(let i=0;i<id.length;i++)checksum=(checksum*33+id.charCodeAt(i))|0}}
 }
 return {milliseconds:performance.now()-start,checksum}
}
const runCandidate=()=>{
 const start=performance.now();let checksum=0
 for(let round=0;round<8;round++)for(const [model,key,options]of nativeCases){
  const result=candidate.selectionUpdate(model,key,options);let ids
  if(result._tag==="NextFrame"){
   checksum=(checksum+1+(Number.isFinite(result.state.focus)?result.state.focus|0:19)+Number(result.state.warning)+result.state.opaque.marker.length+Number(result.state.opaque===model.opaque))|0
   ids=result.state.selected
  }else{
   checksum=(checksum+result.value.kind.length)|0
   if(result.value.kind==="select")ids=result.value.ids
  }
  if(ids){checksum=(checksum+ids.length)|0;for(const id of ids){checksum=(checksum*33+id.length)|0;for(let i=0;i<id.length;i++)checksum=(checksum*33+id.charCodeAt(i))|0}}
 }
 return {milliseconds:performance.now()-start,checksum}
}
for(let i=0;i<20;i++){const pair=i%2?[runCandidate(),runReference()]:[runReference(),runCandidate()];assert.equal(pair[0].checksum,pair[1].checksum)}
const samples=[]
for(let i=0;i<31;i++){
 const pair=i%2?[runCandidate(),runReference()]:[runReference(),runCandidate()]
 const [typescript,integratedBend]=i%2?pair.toReversed():pair
 assert.equal(typescript.checksum,integratedBend.checksum)
 samples.push({typescriptMilliseconds:typescript.milliseconds,integratedBendMilliseconds:integratedBend.milliseconds,ratio:integratedBend.milliseconds/typescript.milliseconds,checksum:typescript.checksum})
}
const medianRatio=samples.map(s=>s.ratio).toSorted((a,b)=>a-b)[15]
const sha256=Object.fromEntries(["selection-ui-performance.mjs","selection-ui-parity.mjs"].map(name=>[name,createHash("sha256").update(readFileSync(new URL(name,import.meta.url))).digest("hex")]))
const record={at:new Date().toISOString(),runtime:"Bun 1.3.14",baselineRevision:execFileSync("git",["rev-parse","HEAD"],{cwd:baselineRoot,encoding:"utf8"}).trim(),timedCases:nativeCases.length,roundsPerSample:8,warmupRounds:20,samplePairs:31,medianRatio,diagnosticControl:control,productionCompared:!control,executionParity:control?null:medianRatio<=1,sha256,samples,scope:"actual compiled keyboard reducer; independent identical consumers of all fixture result fields, identity, IDs and order; alternating paired samples, CPU11 nonexclusive; no cold terminal/IO/platform claim"}
writeFileSync(new URL(control?"selection-ui-execution-same-binary-control.json":"selection-ui-performance.json",import.meta.url),JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify({timedCases:nativeCases.length,medianRatio,executionParity:record.executionParity,diagnosticControl:control}))
