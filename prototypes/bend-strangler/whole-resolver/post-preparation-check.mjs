import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const temporary=await mkdtemp('/tmp/hapsland-postflow-')
const list=values=>values.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const array=value=>{const values=[];while(value.$==='Con'){values.push(value.head);value=value.tail}assert.equal(value.$,'Nil');return values}
const some=value=>({$:'Some',value}),none={$:'None'}
try {
 const output=join(temporary,'postflow.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PostPreparation.bend'),'-o',output],{timeout:5000})
 const core=(await import(pathToFileURL(output))).default
 const routes=['Owner','CachedClear','CachedFinding','JoinedAdvice','JoinedPending','JoinedClaimed']
 const outcomes=routes.map((route,index)=>({$:'Outcome',handle:BigInt(index+1),ready:true,fits:true,reservation_bytes:100n}))
 let cases=0,requests=0
 function run(options={}) {
  let step=core.initial(1n,options.bound??true,list(outcomes)),ordinal=0;const commands=[],cleanup=[],enqueued=[],settled=[]
  for(let fuel=0;fuel<1000;fuel++) {
   if(step.$==='Internal'){step=core.advance(step.state);continue}
   if(step.$!=='Await')return {step,commands,cleanup,enqueued,settled}
   const request=step.request,command=request.command;commands.push(command);requests++;ordinal++
   assert.equal(core.resume(step,{$:'Reply',invocation:2n,id:request.id,response:{$:'Ack'}}).$,'Rejected')
   let response={$:'Ack'}
   switch(command.$) {
    case 'CheckActive':response={$:'Active',value:options.inactiveAt!==ordinal};break
    case 'Offer':response={$:'Offered',accepted:command.outcome.ready&&(!command.deliverability||command.outcome.fits)};break
    case 'RouteReuse': {const index=Number(command.outcome.handle)-1;response={$:'Routed',key:command.outcome.handle,route:{$:routes[index],...(routes[index]==='CachedFinding'?{evaluation:999n}:{})}};break}
    case 'CompletePreparation':response={$:'Reserved',allocations:list(array(command.retained).map(item=>options.capacityRefused?none:some({$:'Allocation',operation:100n+item.key,reservation:200n+item.key})))};break
    case 'RegisterRevision':response={$:'Revision',token:300n+command.slot.item.key};break
    case 'RegisterWork':response={$:'Work',token:options.noWork?none:some(400n+command.slot.item.key)};break
    case 'AttachOwner':response={$:'Attached',accepted:!options.attachRefused};break
    case 'Enqueue':response={$:'Queued',accepted:!options.enqueueRefused};break
    case 'SettleCached':break
    case 'Cleanup':cleanup.push(command);break
   }
   if(options.failAt===ordinal&&command.$!=='Cleanup')response={$:'Failed',token:77n}
   if(options.cancelAt===ordinal&&command.$!=='Cleanup')response={$:'Cancelled',token:88n}
   if(options.cleanupFailOnce&&command.$==='Cleanup'&&cleanup.length===1)response={$:'Failed',token:99n}
   if(command.$==='Enqueue'&&response.$==='Queued'&&response.accepted)enqueued.push(command.slot.item.key)
   if(command.$==='SettleCached'&&response.$==='Ack')settled.push(command.slot.item.key)
   step=core.resume(step,{$:'Reply',invocation:1n,id:request.id,response})
  }
  throw new Error('Postflow did not terminate')
 }
 const success=run();assert.equal(success.step.$,'Finished');assert.deepEqual(success.enqueued,[1n]);assert.deepEqual(success.settled,[3n]);assert.deepEqual(success.commands.filter(command=>command.$==='RouteReuse').map(command=>command.outcome.handle),[1n,2n,3n,4n,5n,6n]);assert.equal(success.commands.filter(command=>command.$==='OwnerBarrier').length,1);assert.equal(success.commands.filter(command=>command.$==='JoinedBarrier').length,1);cases++
 for(const [options,check] of [
  [{capacityRefused:true},result=>assert.equal(result.commands.filter(command=>command.$==='ReportCapacity').length,2)],
  [{noWork:true},result=>assert.equal(result.commands.filter(command=>command.$==='ReleaseUnspawned').length,2)],
  [{noWork:true,bound:false},result=>assert.deepEqual(result.enqueued,[1n])],
  [{enqueueRefused:true},result=>assert.equal(result.commands.filter(command=>command.$==='ReleaseAttached').length,1)],
  [{attachRefused:true},result=>{assert.equal(result.step.$,'Stopped');assert.equal(result.step.reason.$,'TechnicalFailure');assert.equal(result.cleanup.length,1);assert.ok(array(result.cleanup[0].remaining).some(slot=>slot.item.key===1n))}]
 ]){const result=run(options);check(result);cases++}
 for(let ordinal=1;ordinal<=success.commands.length;ordinal++)for(const kind of ['failAt','cancelAt']) {
  const result=run({[kind]:ordinal,cleanupFailOnce:true});assert.equal(result.step.$,'Stopped');assert.equal(result.step.reason.$,kind==='failAt'?'TechnicalFailure':'CancelledReason');assert.equal(result.step.reason.token,kind==='failAt'?77n:88n);assert.equal(result.cleanup.length,2);assert.deepEqual(result.cleanup[0],result.cleanup[1])
  for(const command of result.cleanup)for(const slot of array(command.remaining))assert.ok(!result.enqueued.includes(slot.item.key),'cleanup touched transferred dispatcher owner')
  cases++
 }
 console.log(JSON.stringify({passed:true,cases,requests,scope:'finite source-free whole postflow draft, six reuse routes, round-bound/standalone, capacity and enqueue refusal, failures/cancellation at every Await, persistent cleanup obligation and transferred-owner exclusion; simulated semantic owner replies, not physical integration or universal correspondence'}))
} finally {await rm(temporary,{recursive:true,force:true})}
