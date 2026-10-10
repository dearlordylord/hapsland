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
    case 'LookupReuse': {const index=Number(command.outcome.handle)-1;response={$:'Routed',key:command.outcome.handle,route:{$:routes[index].startsWith('Cached')?'CachedEntry':routes[index]}};break}
    case 'ReadCached':response={$:'CachedFacts',evaluation:999n,findings:command.item.key===2n?0n:1n};break
    case 'ReadPending':response={$:'PendingOwner',owner:700n};break
    case 'CompletePreparation':response={$:'Reserved',allocations:list(array(command.retained).map(item=>options.capacityRefused?none:some({$:'Allocation',operation:100n+item.key,reservation:200n+item.key})))};break
    case 'ReadLiveAdvice':response={$:'AdviceOwner',owner:command.item.key===4n?some(800n):none};break
    case 'PublishJoinedAdvice':response={$:'Published',publication:900n};break
    case 'ReadCurrentAdvice':response={$:'FindingCount',findings:2n};break
    case 'ReadJoinedPending':response={$:'JoinOwner',owner:command.item.key===5n?some(700n):none};break
    case 'RegisterClear':response={$:'Revision',token:302n};break
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
 const success=run();assert.equal(success.step.$,'Finished');assert.deepEqual(success.enqueued,[1n]);assert.deepEqual(success.settled,[3n]);assert.deepEqual(success.commands.filter(command=>command.$==='LookupReuse').map(command=>command.outcome.handle),[1n,2n,3n,4n,5n,6n]);assert.equal(success.commands.filter(command=>command.$==='OwnerBarrier').length,1);assert.equal(success.commands.filter(command=>command.$==='JoinedBarrier').length,1);cases++
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
 const runTail=options=>{
  let step=core.advice_initial(77n,900n),ordinal=0;const commands=[]
  for(let fuel=0;fuel<20;fuel++){
   if(step.$!=='AdviceAwait')return {step,commands}
   const request=step.request,command=request.command;commands.push(command);requests++;ordinal++
   assert.equal(command.advice,900n)
   assert.equal(core.advice_resume(step,{$:'Reply',invocation:78n,id:request.id,response:{$:'Ack'}}).$,'AdviceRejected')
   assert.equal(core.advice_resume(step,{$:'Reply',invocation:77n,id:request.id+1n,response:{$:'Ack'}}).$,'AdviceRejected')
   let response=command.$==='AdviceCheckActive'?{$:'Active',value:!options.inactive}:command.$==='AdvicePublish'?{$:'Published',publication:44n}:{$:'Ack'}
   if(ordinal===options.failAt)response={$:'Failed',token:71n}
   if(ordinal===options.cancelAt)response={$:'Cancelled',token:72n}
   if(command.$==='AdviceRemove'&&options.cleanupFailure&&(options.cleanupAlways||commands.filter(value=>value.$==='AdviceRemove').length===1))response={$:'Failed',token:73n}
   step=core.advice_resume(step,{$:'Reply',invocation:77n,id:request.id,response})
  }
  throw new Error('Advice tail did not terminate')
 }
 const permanentCleanupFailure=runTail({failAt:1,cleanupFailure:true,cleanupAlways:true});assert.equal(permanentCleanupFailure.step.$,'AdviceCleanupPending');assert.equal(permanentCleanupFailure.step.advice,900n);assert.equal(permanentCleanupFailure.step.reason.token,71n);assert.equal(permanentCleanupFailure.commands.filter(value=>value.$==='AdviceRemove').length,2);cases++
 const liveTail=runTail({});assert.equal(liveTail.step.$,'AdviceFinished');assert.deepEqual(liveTail.commands.map(value=>value.$),['AdvicePendingBarrier','AdviceCheckActive','AdvicePublish','AdviceRecordPublished']);cases++
 const cutoffTail=runTail({inactive:true});assert.equal(cutoffTail.step.$,'AdviceFinished');assert.deepEqual(cutoffTail.commands.map(value=>value.$),['AdvicePendingBarrier','AdviceCheckActive']);cases++
 for(let ordinal=1;ordinal<=liveTail.commands.length;ordinal++)for(const kind of ['failAt','cancelAt']){
  const result=runTail({[kind]:ordinal,cleanupFailure:true});assert.equal(result.step.$,'AdviceStopped');assert.equal(result.step.reason.$,kind==='failAt'?'TechnicalFailure':'CancelledReason');assert.equal(result.step.reason.token,kind==='failAt'?71n:72n);assert.equal(result.commands.filter(value=>value.$==='AdviceRemove').length,2);cases++
 }
 console.log(JSON.stringify({passed:true,cases,requests,scope:'finite source-free whole postflow draft, six reuse routes, round-bound/standalone, capacity and enqueue refusal, failures/cancellation at every Await, persistent cleanup obligation and transferred-owner exclusion; independent post-insert advice tail with cutoff retention, correlated replies and error-preserving cleanup retry; simulated semantic owner replies, not physical integration or universal correspondence'}))
} finally {await rm(temporary,{recursive:true,force:true})}
