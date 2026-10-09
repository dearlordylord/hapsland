import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const [profilePath,resultPath]=process.argv.slice(2)
const raw=readFileSync(profilePath),profile=JSON.parse(raw),result=JSON.parse(readFileSync(resultPath,'utf8').split('\n')[0]),window=result.profileMeasurementWindow
assert.ok(window&&profile.startTime<=window.startTime&&window.endTime<=profile.endTime)
const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map()
for(const node of profile.nodes)for(const child of node.children??[])parents.set(child,node.id)
function phase(name){
 if(name.includes('$045graph$045draft$047core$058'))return 'local-traversal'
 if(name.startsWith('$Facts$058'))return 'facts-preparation'
 if(name.startsWith('$Core$058')||name.startsWith('$Root$058unit'))return 'materialization'
 if(/^\$(Rust|Cargo|ImportedRust)/.test(name))return 'rust-preparation'
 if(/^\$(Resolve|Check|Read|Attach|Composition)\$058/.test(name))return 'cross-file-transitions'
 if(name.includes('ImportGraph$058'))return 'graph-transitions'
 if(name.startsWith('$Root$058'))return 'root-entry'
 return undefined
}
const groups={},functions={};let time=profile.startTime,total=0,runtimeSelf=0
for(let index=0;index<profile.samples.length;index++){
 const previous=time;time+=profile.timeDeltas[index]
 const duration=Math.max(0,Math.min(time,window.endTime)-Math.max(previous,window.startTime))
 if(!duration)continue
 total+=duration
 const node=nodes.get(profile.samples[index]),frame=node.callFrame
 if(!frame.url.endsWith('/runtime.mjs'))continue
 runtimeSelf+=duration
 let selected=phase(frame.functionName),parent=node.id
 // Assign generic library/state helpers to the nearest application caller.
 // Root IO/ABI/control costs remain separate rather than inventing a phase.
 const boundary=/^\$0m\d+$/.test(frame.functionName)||frame.functionName==='perform'||frame.functionName==='nat_host'
 while(!selected&&!boundary&&parents.has(parent)){
  parent=parents.get(parent);const caller=nodes.get(parent).callFrame
  if(!caller.url.endsWith('/runtime.mjs'))break
  selected=phase(caller.functionName)
 }
 selected=boundary?'runtime-abi':selected??'runtime-control-or-unassigned'
 const group=groups[selected]??={microseconds:0,samples:0};group.microseconds+=duration;group.samples++
 const key=selected+'|'+frame.functionName;functions[key]=(functions[key]??0)+duration
}
assert.ok(total>0&&runtimeSelf>0)
const record={at:new Date().toISOString(),purpose:'Aggregate existing full-consumer sampling by whole subsystem phase before choosing a substantial correction',authority:'Diagnostic sampling evidence, not proof or performance acceptance',profileSha256:createHash('sha256').update(raw).digest('hex'),result,windowMicroseconds:total,runtimeSelfMicroseconds:runtimeSelf,groups,topPhaseFunctions:Object.entries(functions).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([key,microseconds])=>({phase:key.split('|')[0],function:key.split('|')[1],microseconds})),scope:'Existing Bun100us sampling in the explicit12-sweep measured window. Every sample counted once; only emitted-runtime self samples assigned to phases, generic helpers attributed by nearest application caller. VM allocation/GC and provider waits are not assigned to phases. Single diagnostic worker and profiler overhead cannot establish stable phase proportions or parity.'}
writeFileSync(new URL('pure-phase-cost-diagnostic.json',import.meta.url),JSON.stringify(record,null,2)+'\n')
console.log(JSON.stringify({runtimeSelfMilliseconds:runtimeSelf/1000,groups:Object.fromEntries(Object.entries(groups).map(([name,value])=>[name,value.microseconds/1000]))}))
