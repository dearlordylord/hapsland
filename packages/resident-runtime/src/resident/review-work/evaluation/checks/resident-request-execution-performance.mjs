import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {resolve} from 'node:path'
const candidateRoot=resolve(import.meta.dirname,'../../../../../../..')
const policy=await import(candidateRoot+'/packages/canonical-policy/dist/canonical/resident-request-adapter.js')
const roots={typescript:'/workspace/typescript/hapsland-bend-baseline-master-5726758e',integratedBend:candidateRoot}
const lanes={}
for(const [name,root] of Object.entries(roots)){
 const source=readFileSync(root+'/packages/resident-runtime/dist/resident/server.js','utf8'),start=source.indexOf('const residentRequestNeedsSweep ='),end=source.indexOf(name==='integratedBend'?'const residentRequestLifetimeMaterialize =':'const residentRequestLifetime =',start)
 assert.ok(start>=0&&end>start,'compiled entry helpers available')
 lanes[name]=new Function(...Object.keys(policy),source.slice(start,end)+';return {sweep:residentRequestNeedsSweep,unsupported:residentRequestUnsupported}')(...Object.values(policy))
}
const fixtures=[]
for(const operation of ['hello','register-edit','admit','admit-and-collect','begin-stop','collect'])for(const direct of [false,true])for(const observed of [false,true])fixtures.push({operation,...(direct?{advicee:{host:'opencode'}}:{}),observation:{advicee:{host:observed?'opencode':'codex-cli'}}})
for(const request of fixtures){assert.equal(lanes.integratedBend.sweep(request),lanes.typescript.sweep(request));assert.equal(lanes.integratedBend.unsupported(request),lanes.typescript.unsupported(request))}
const caller = lane => () => {let checksum=0;for(let round=0;round<100000;round++)for(const request of fixtures){checksum+=Number(lane.sweep(request));checksum+=Number(lane.unsupported(request))}return checksum}
const callers=Object.fromEntries(Object.entries(lanes).map(([name,lane])=>[name,[caller(lane),caller(lane)]])),samples={typescript:[],integratedBend:[]},startedAt=new Date().toISOString()
let checksum
for(let pair=0;pair<12;pair++){
 const order=Object.entries(callers);if(pair%2)order.reverse()
 for(const [name,directions] of order){let elapsed=0;for(const run of directions){const start=performance.now(),actual=run();elapsed+=(performance.now()-start)/1000;checksum??=actual;assert.equal(actual,checksum)}if(pair>=3)samples[name].push(elapsed)}
}
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript)
const result={startedAt,at:new Date().toISOString(),baseline:'5726758e',fixtures:fixtures.length,roundsPerCaller:100000,warmupPairs:3,measuredPairs:9,callers:2,samples,checksum,meanRatio:ratio,executionParity:ratio<=1,scope:'actual compiled sweep/unsupported entry helpers, identical synthetic accessed fields and dual callers; alternating pairs, pinned Bun CPU11 nonexclusive; excludes lifetime Effect/snapshot and physical IPC'}
writeFileSync(resolve(import.meta.dirname,'resident-request-execution-latest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));assert.ok(result.executionParity)
