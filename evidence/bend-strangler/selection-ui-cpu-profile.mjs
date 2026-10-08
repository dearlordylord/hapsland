// Diagnostic CPU profiling of one actual compiled reducer per process; no parity verdict.
import assert from "node:assert/strict"
import {performance} from "node:perf_hooks"
import {writeFileSync} from "node:fs"
import {pathToFileURL} from "node:url"
import {nativeCases} from "./selection-ui-parity.mjs"
assert.equal(globalThis.Bun?.version,"1.3.14")
const lane=process.env.HAPSLAND_PROFILE_LANE
assert.ok(lane==="typescript"||lane==="candidate")
const root=lane==="typescript"?process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT:new URL("../../",import.meta.url).pathname
const {selectionUpdate}=await import(pathToFileURL(root+"/packages/administration/dist/interaction/selection.js"))
const runReference=()=>{
 const start=performance.now();let checksum=0
 for(let round=0;round<8;round++)for(const [model,key,options]of nativeCases){
  const result=selectionUpdate(model,key,options);let ids
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
for(let i=0;i<12;i++)runReference()
const samples=[]
for(let i=0;i<12;i++)samples.push(runReference())
assert.ok(samples.every(s=>s.checksum===samples[0].checksum))
const result={at:new Date().toISOString(),diagnosticOnly:true,lane,iterationsPerSample:8,samples,scope:"CPU profile of actual compiled reducer through identical consumer body; separate processes, not paired acceptance timing"}
writeFileSync(new URL("selection-ui-cpu-profile-"+lane+".json",import.meta.url),JSON.stringify(result,null,2)+"\n")
console.log(JSON.stringify({lane,samples:samples.length,checksum:samples[0].checksum}))
