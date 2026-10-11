import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {resolve} from 'node:path'
const candidateRoot=resolve(import.meta.dirname,'../../../../../../..')
const Effect=await import(candidateRoot+'/node_modules/effect/dist/Effect.js')
const policy=await import(candidateRoot+'/packages/canonical-policy/dist/canonical/resident-request-adapter.js')
const roots={typescript:'/workspace/typescript/hapsland-bend-baseline-master-5726758e',integratedBend:candidateRoot}
const lanes={}
for(const [name,root] of Object.entries(roots)){
 const source=readFileSync(root+'/packages/resident-runtime/dist/resident/server.js','utf8'),start=source.indexOf(name==='integratedBend'?'const residentRequestLifetimeMaterialize =':'const residentRequestLifetime ='),end=source.indexOf('const residentHandleEditPolicy =',start)
 assert.ok(start>=0&&end>start)
 const state={active:true,reads:0},ledger={runtime:{snapshot:()=>{state.reads++;return Effect.succeed({lifecycle:state.active?'active':'retired'})}}}
 const fn=new Function('Effect','residentLedger','runtime','residentResponse','packageBuildIdentity',...Object.keys(policy),source.slice(start,end)+';return residentRequestLifetime')(Effect,ledger,{lifetime:'owner'},x=>x,{fixture:true},...Object.values(policy))
 lanes[name]={state,fn}
}
const fixtures=[]
for(const operation of ['hello','register-edit','admit','admit-and-collect','begin-stop','collect'])for(const matched of [false,true])for(const active of [false,true])for(const edit of [false,true])fixtures.push({active,request:{operation,...(operation==='hello'?{}:{lifetime:matched?'owner':'foreign'}),requestRoute:edit?'edit':'ordinary'}})
const checksum=value=>value===undefined?1:value.status==='ready'?2:value.status==='obsolete-lifetime'?3:4
for(const fixture of fixtures){const results=[];for(const lane of Object.values(lanes)){lane.state.active=fixture.active;lane.state.reads=0;results.push({value:Effect.runSync(lane.fn(fixture.request)),reads:lane.state.reads})}assert.deepEqual(results[0],results[1])}
const sites=[0,1].map(()=>new Function('Effect','fixtures','checksum','return (lane)=>{let sum=0;for(let round=0;round<10000;round++)for(const fixture of fixtures){lane.state.active=fixture.active;sum+=checksum(Effect.runSync(lane.fn(fixture.request)))}return sum}')(Effect,fixtures,checksum))
const callers=Object.fromEntries(Object.entries(lanes).map(([name,lane])=>[name,sites.map(site=>()=>site(lane))])),samples={typescript:[],integratedBend:[]},startedAt=new Date().toISOString();let expected
const cpuSamples={typescript:[],integratedBend:[]}
for(let pair=0;pair<12;pair++){const order=Object.entries(callers);if(pair%2)order.reverse();for(const [name,runs] of order){let seconds=0,cpuSeconds=0;for(const run of runs){const cpuStart=process.cpuUsage(),start=performance.now(),actual=run(),cpu=process.cpuUsage(cpuStart);seconds+=(performance.now()-start)/1000;cpuSeconds+=(cpu.user+cpu.system)/1000000;expected??=actual;assert.equal(actual,expected)}if(pair>=3){samples[name].push(seconds);cpuSamples[name].push(cpuSeconds)}}}

const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,ratio=mean(samples.integratedBend)/mean(samples.typescript),result={startedAt,at:new Date().toISOString(),fixtures:fixtures.length,rounds:10000,warmupPairs:3,measuredPairs:9,samples,cpuSamples,cpuRatio:mean(cpuSamples.integratedBend)/mean(cpuSamples.typescript),callers:2,checksum:expected,meanRatio:ratio,executionParity:ratio<=1,method:'two independent identical shared caller sites; each actual implementation through each site per pair',scope:'actual compiled lifetime Effect function, actual Effect.runSync, simulated snapshot and response ports; all response payloads and snapshot read counts agree; excludes physical IPC'}
writeFileSync(resolve(import.meta.dirname,'resident-request-lifetime-latest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));assert.ok(result.executionParity)
