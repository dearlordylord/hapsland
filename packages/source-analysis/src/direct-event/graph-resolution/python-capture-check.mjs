import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServiceSession,unlist} from './service-session.mjs'
const folder=import.meta.dirname,temp=await mkdtemp('/tmp/hapsland-python-capture-')
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields})
const rootCapture={text:'class Root: pass',byteLength:16},source={text:'class Child: pass',byteLength:17}
const failure={stage:'capture',code:'capture-unavailable',args:{reason:'missing'}}
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(folder,'./PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 await writeFile(join(temp,'child.py'),source.text)
 const cases=[
  {name:'fresh-and-known',paths:['child.py','child.py'],expiredRound:1},
  {name:'cached-noncanonical',cache:[['child.py',source]]},
  {name:'canonical',paths:['root.py']},
  {name:'canonical-expired',paths:['root.py'],expiredRound:0},
  {name:'expired',expiredRound:0},
  {name:'negative-bytes',remaining:{files:2,readBytes:-1,work:10}},
  {name:'files-reservation',remaining:{files:0,readBytes:100,work:10}},
  {name:'bytes-reservation',remaining:{files:2,readBytes:49,work:10}},
  {name:'failed-and-repeat',paths:['child.py','child.py'],unavailable:true},
  {name:'oversized-and-cached-repeat',paths:['child.py','child.py'],captureBytes:51,expireAfterCapture:true},
  {name:'postcapture-deadline',expireAfterCapture:true},
  {name:'access-denied',deny:true},
  {name:'aggregate-files',cache:Array.from({length:64},(_,i)=>['cached'+i,{text:'',byteLength:0}])},
  {name:'aggregate-bytes',cache:[['cached',{text:'',byteLength:16777216}]]},
  {name:'cached-oversized',cache:[['child.py',{text:'oversized',byteLength:51}]]},
  {name:'failed-diagnostic-observer',unavailable:true,observerThrows:true},
  {name:'short-reservation-actual-size',remaining:{files:2,readBytes:50,work:10}}
 ]
 let invocation=0,total=0
 for(const fixture of cases){
  const remaining={files:2,readBytes:100,work:10,...fixture.remaining},actualCache=new Map([['root.py',rootCapture],...fixture.cache??[]]),expectedCache=new Map(actualCache),expectedAuthority=new Map(),expectedFailed=new Set(),expectedCanonical=new Set(['root.py']),expectedDependencies=[]
  const expectedEvents=[],actualEvents=[];let actualExpired=false,expectedExpired=false
  const captured={...source,byteLength:fixture.captureBytes??source.byteLength}
  const io=createServiceSession({invocation:++invocation,root:temp,callerCache:actualCache,now:()=>{actualEvents.push('clock');return actualExpired?5000:0},access:async path=>{actualEvents.push('access:'+path);return fixture.deny?undefined:{relativePath:path}},capture:async selection=>{actualEvents.push('capture:'+selection.relativePath);if(fixture.expireAfterCapture)actualExpired=true;return fixture.unavailable?{status:'unavailable',diagnostic:failure}:{status:'available',capture:captured}},diagnostic:(path,diagnostic)=>{actualEvents.push(['diagnostic',path,diagnostic]);if(fixture.observerThrows)throw new Error('optional diagnosis')}})
  const clock=(await io.perform(t('Request',{invocation,id:0,operation:t('StartClock')}))).outcome.clock;actualEvents.length=0
  let state=child.initial_session('root.py',50n,4n,s('Remaining',{files:child.difference(Math.max(remaining.files,0),Math.max(-remaining.files,0)),read_bytes:child.difference(Math.max(remaining.readBytes,0),Math.max(-remaining.readBytes,0)),work:child.difference(Math.max(remaining.work,0),Math.max(-remaining.work,0))})),next=1n
  const usage=()=>({files:expectedAuthority.size+expectedFailed.size,readBytes:[...expectedAuthority.values()].reduce((n,c)=>n+c.byteLength,0)+expectedFailed.size*50,work:0})
  const permit=(files=0,bytes=0)=>{expectedEvents.push('clock');const used=usage();return !expectedExpired&&used.files+files<=remaining.files&&used.readBytes+bytes<=remaining.readBytes&&used.work<=remaining.work}
  async function nativeReadAuthority(path){
   if(expectedAuthority.has(path))return expectedAuthority.get(path)
   if(expectedFailed.has(path))return undefined
   let capture=expectedCache.get(path)
   if(expectedCanonical.has(path))return permit()?capture:undefined
   if(!permit(1,capture?.byteLength??50))return undefined
   expectedEvents.push('access:'+path);if(fixture.deny)return undefined
   let diagnostic
   if(!expectedCache.has(path)){
    if(expectedCache.size>=64)diagnostic={stage:'capture',code:'capture-budget-limit',args:{resource:'files',used:expectedCache.size,requested:1,limit:64}}
    else{const used=[...expectedCache.values()].reduce((n,c)=>n+c.byteLength,0);if(used+50>16777216)diagnostic={stage:'capture',code:'capture-budget-limit',args:{resource:'bytes',used,requested:50,limit:16777216}}}
   }
   if(diagnostic){expectedEvents.push(['diagnostic',path,diagnostic]);return undefined}
   if(capture===undefined){
    expectedFailed.add(path);expectedEvents.push('capture:'+path);if(fixture.expireAfterCapture)expectedExpired=true
    if(fixture.unavailable){expectedEvents.push(['diagnostic',path,failure]);return undefined}
    capture=captured;expectedFailed.delete(path);expectedCache.set(path,capture)
   }
   if(capture.byteLength>50||!permit(1,capture.byteLength))return undefined
   expectedAuthority.set(path,capture);if(!expectedDependencies.includes(path))expectedDependencies.push(path)
   return capture
  }
  try{
   const paths=fixture.paths??['child.py']
   for(let round=0;round<paths.length;round++){
    if(fixture.expiredRound===round)actualExpired=expectedExpired=true
    const path=paths[round],expected=await nativeReadAuthority(path)
    let step=child.read_authority(state,path,clock,io.callerCache.value,BigInt(invocation),next),requests=[]
    while(step.$==='python-module/CaptureMachine.Await'){requests.push(step.request.operation.$);step=child.resume_authority(step,await io.perform(step.request))}
    assert.equal(step.$,'python-module/CaptureMachine.Returned',fixture.name);state=step.session;next=step.next_request
    assert.equal(step.capture.$,expected===undefined?'None':'Some',fixture.name)
    assert.deepEqual(actualEvents,expectedEvents,fixture.name)
    assert.deepEqual(unlist(state.failed),[...expectedFailed],fixture.name);assert.deepEqual(unlist(state.dependencies),expectedDependencies,fixture.name)
    assert.deepEqual(unlist(state.authority).map(item=>[item.path,Number(item.bytes)]),[...expectedAuthority].map(([path,capture])=>[path,capture.byteLength]),fixture.name)
    const spent=child.usage(state),reference=usage();assert.deepEqual([Number(spent.files),Number(spent.read_bytes),Number(spent.work)],[reference.files,reference.readBytes,reference.work],fixture.name)
    assert.deepEqual([...actualCache], [...expectedCache],fixture.name)
    if(round===1&&fixture.name==='fresh-and-known')assert.deepEqual(requests,[])
    if(round===1&&fixture.name==='failed-and-repeat')assert.deepEqual(requests,[])
    total++
   }
  }finally{io.close()}
 }
 console.log(JSON.stringify({at:new Date().toISOString(),cases:cases.length,reads:total,orderedEffectsAndState:true,knownAndFailedNoNewEffects:true,canonicalReuse:true,failedReadCharge:true,cachedNoncanonicalAccess:true,aggregateRefusals:true,oversizedCacheRetainedWithoutPostClock:true,postcaptureDeadline:true,scope:'Complete readAuthority child against an independent original-algorithm interpreter; not complete Python GraphSession or resolver/Canonical acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
