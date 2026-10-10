import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const root='/workspace/typescript/hapsland-bend-selection-ui',source=execFileSync('git',['show','43d8575f:packages/resident-runtime/src/resident/server.ts'],{cwd:root,encoding:'utf8'})
const start=source.indexOf('  const residentRequestNeedsSweep ='),end=source.indexOf('  const residentHandleEditPolicy =',start)
assert.ok(start>=0&&end>start)
const js=new Bun.Transpiler({loader:'ts'}).transformSync(source.slice(start,end))
let reads=0,active=false
const native=new Function('Effect','residentLedger','runtime','residentResponse','packageBuildIdentity','process',js+';return {sweep:residentRequestNeedsSweep,unsupported:residentRequestUnsupported,lifetime:residentRequestLifetime}')({fn:()=>f=>f},{runtime:{snapshot:function*(){reads++;return {lifecycle:active?'active':'obsolete'}}}},{lifetime:'owner'},x=>x,{fixture:true},{pid:7})
const temp=mkdtempSync(join(tmpdir(),'hapsland-request-policy-'))
try{
 const out=join(temp,'core.mjs');execFileSync('bend',[root+'/packages/agent-flow-bend/resident-request-policy/core.bend','-o',out],{timeout:5000});const core=(await import(pathToFileURL(out))).default
 let cases=0
 const tags={hello:'Hello','register-edit':'RegisterEdit',admit:'Admit','admit-and-collect':'AdmitAndCollect','begin-stop':'BeginStop',collect:'Other'}
 for(const [operation,tag] of Object.entries(tags)){
  assert.equal(core.needs_sweep({$:tag}),native.sweep({operation}));cases++
  for(const direct of [false,true])for(const observed of [false,true]){
   const request={operation,...(direct?{advicee:{host:'opencode'}}:{}),observation:{advicee:{host:observed?'opencode':'codex-cli'}}}
   assert.equal(core.unsupported({$:tag},direct,observed),native.unsupported(request));cases++
  }
  for(const matched of [false,true])for(const isActive of [false,true])for(const edit of [false,true]){
   reads=0;active=isActive;const request={operation,lifetime:matched?'owner':'foreign',requestRoute:edit?'edit':'shared'}
   const iterator=native.lifetime(request);const result=iterator.next();assert.equal(result.done,true)
   const expected=result.value===undefined?'Continue':result.value.status==='ready'?'Ready':result.value.status==='unavailable'?'EditLost':'Obsolete'
   assert.equal(core.lifetime({$:tag},matched,isActive,edit).$,"Request"+expected)
   assert.equal(core.needs_snapshot({$:tag},matched),reads===1);assert.ok(reads<=1);cases++
  }
 }
 const result={cases,passed:true,scope:'compiled Bend versus transpiled actual current native entry helpers; snapshot/response ports simulated synchronously, complete finite decisions and snapshot read presence; not physical runtime/IO or universal proof'}
 writeFileSync(root+'/evidence/bend-strangler/resident-request-falsification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result))
}finally{rmSync(temp,{recursive:true,force:true})}
