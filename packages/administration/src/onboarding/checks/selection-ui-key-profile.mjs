import {nativeCases} from "./selection-ui-parity.mjs"
import {performance} from "node:perf_hooks"
import {writeFileSync} from "node:fs"
import {pathToFileURL} from "node:url"
import assert from "node:assert/strict"
const root=process.env.HAPSLAND_PERFORMANCE_BASELINE_ROOT
assert.ok(root)
const reference=await import(pathToFileURL(root+"/packages/administration/dist/interaction/selection.js"))
const candidate=await import(new URL("../../../dist/interaction/selection.js",import.meta.url))
const groups=Map.groupBy(nativeCases,item=>item[1])
const run=(update,cases)=>{const start=performance.now();let checksum=0
 for(let round=0;round<16;round++)for(const [model,key,options]of cases){const result=update(model,key,options);let ids
 if(result._tag==="NextFrame"){checksum=(checksum+1+(Number.isFinite(result.state.focus)?result.state.focus|0:19)+Number(result.state.warning)+result.state.opaque.marker.length+Number(result.state.opaque===model.opaque))|0;ids=result.state.selected}
 else{checksum=(checksum+result.value.kind.length)|0;if(result.value.kind==="select")ids=result.value.ids}
 if(ids){checksum=(checksum+ids.length)|0;for(const id of ids){checksum=(checksum*33+id.length)|0;for(let i=0;i<id.length;i++)checksum=(checksum*33+id.charCodeAt(i))|0}}
 }return {milliseconds:performance.now()-start,checksum}}
const results=[]
for(const [key,cases]of groups){for(let i=0;i<12;i++){run(reference.selectionUpdate,cases);run(candidate.selectionUpdate,cases)}const pairs=[]
 for(let i=0;i<15;i++){const first=run(i%2?candidate.selectionUpdate:reference.selectionUpdate,cases),second=run(i%2?reference.selectionUpdate:candidate.selectionUpdate,cases);assert.equal(first.checksum,second.checksum);const [baseline,bend]=i%2?[second,first]:[first,second];pairs.push({baseline:baseline.milliseconds,bend:bend.milliseconds,ratio:bend.milliseconds/baseline.milliseconds})}
 results.push({key,cases:cases.length,medianRatio:pairs.map(p=>p.ratio).toSorted((a,b)=>a-b)[7],pairs})}
const record={at:new Date().toISOString(),results,scope:"diagnostic per-key profile with one shared consumer; different instrumentation, not acceptance or parity waiver"}
writeFileSync(new URL("selection-ui-key-profile.json",import.meta.url),JSON.stringify(record,null,2)+"\n")
console.log(JSON.stringify(results.map(({key,medianRatio})=>({key,medianRatio}))))
