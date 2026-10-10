import * as Effect from 'effect/Effect'
import {MAX_IPC_FRAME_BYTES} from '@hapsland/resident-transport/resident/protocol'
import {logicalBytes} from '../../../packages/resident-runtime/src/resident/state/encoded-size.ts'
import {sourcePartition} from '../../../packages/resident-runtime/src/resident/recipient/identity.ts'
import {planPreparedUnits} from '../../../packages/resident-runtime/src/resident/review-work/preparation/planning.ts'
import {observePlannedEvaluation,recordReuseObservation} from '../../../packages/resident-runtime/src/resident/review-work/preparation/retention.ts'
import {residentUnitWorstOutcomeBytes,residentUnitReservationBytes} from '../../../packages/resident-runtime/src/resident/work-ownership/reservation.ts'
// Prototype effect dispatcher for the whole Bend postflow. RouteReuse and
// ObserveReuse still invoke explicitly temporary native policy children.
// This direct consumer does not yet establish Canonical invocation ownership.
const list=values=>values.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const array=value=>{const result=[];while(value.$==='Con'){result.push(value.head);value=value.tail}if(value.$!=='Nil')throw new Error('Invalid postflow list');return result}
const some=value=>({$:'Some',value}),none={$:'None'}
export function bendPostPreparation(core,context,prepared,preparation,pathObservation,analyticsEnabled) {
 return Effect.tryPromise({try:async()=>{
  const run=Effect.runPromise,ledger=context.deps.residentLedger,plans=new Map(),reservations=new Map(),revisions=new Map(),units=new Map(),errors=new Map()
  const outcomes=new Map(prepared.outcomes.map((outcome,index)=>[BigInt(index+1),outcome]))
  const facts=[...outcomes].map(([handle,outcome])=>({$:'Outcome',handle,ready:outcome.status==='ready',fits:outcome.status==='ready'&&residentUnitWorstOutcomeBytes(outcome.prepared)<=MAX_IPC_FRAME_BYTES-1024,reservation_bytes:outcome.status==='ready'?BigInt(residentUnitReservationBytes(pathObservation,context.job.dispatch,outcome.prepared)):0n}))
  const item=fact=>{const value=plans.get(fact.key);if(!value)throw new Error('Unknown native plan');return value}
  const reservation=slot=>{const value=reservations.get(slot.reservation);if(!value)throw new Error('Unknown native reservation');return value}
  const revision=token=>{const value=revisions.get(token);if(!value)throw new Error('Unknown native revision');return value}
  const unit=(slot,revisionToken,work)=>{
   const existing=units.get(slot.reservation);if(existing)return existing
   const planned=item(slot.item),job=context.job,sourceHash=prepared.observation.outcomes.find(outcome=>outcome.status==='observed'&&outcome.path===planned.outcome.path)?.snapshot.sourceHash
   const inspectionEvaluationId=context.deps.residentInspection.evaluationId(planned.evaluationKey)
   const value={kind:'unit',...(inspectionEvaluationId===undefined?{}:{inspectionEvaluationId}),...(job.inspectionReceipt===undefined?{}:{inspectionReceipt:job.inspectionReceipt}),settings:job.settings,canonicalRound:job.canonicalRound,...(job.round===undefined?{}:{round:job.round,work:job.work}),...(work.$==='None'?{}:{workUnitId:Number(work.value)}),admissionId:job.canonicalObservationId,canonicalOperationId:Number(slot.operation),observation:pathObservation,partition:job.partition,reservation:reservation(slot),dispatch:job.dispatch,analyticsEnabled,prepared:planned.outcome.prepared,...(sourceHash===undefined?{}:{sourceHash}),revision:revision(revisionToken),evaluationKey:planned.evaluationKey}
   units.set(slot.reservation,value);return value
  }
  let step=core.initial(1n,context.job.round!==undefined,list(facts))
  for(let fuel=0;fuel<10000;fuel++) {
   if(step.$==='Internal'){step=core.advance(step.state);continue}
   if(step.$==='Finished')return true
   if(step.$==='Stopped'){if(step.reason.$==='TechnicalFailure')throw errors.get(step.reason.token)??new Error('Postflow refused native attachment');return false}
   if(step.$!=='Await')throw new Error('Postflow rejected response')
   const request=step.request,command=request.command;let response={$:'Ack'}
   try {
    switch(command.$) {
     case 'CheckActive':response={$:'Active',value:await run(context.deps.residentJobActive(context.job))};break
     case 'Offer':response={$:'Offered',accepted:(await run(ledger.preparedOffer(command.outcome.ready,!command.deliverability||command.outcome.fits)))==='preparedAdmitted'};break
     case 'ObserveReady':await run(ledger.runtime.observePreparedUnits(array(command.ready).length));break
     case 'RouteReuse': {
      const [planned]=await run(planPreparedUnits(context,[outcomes.get(command.outcome.handle)]));const key=command.outcome.handle;plans.set(key,planned)
      const kind=planned.kind==='owner'?'Owner':planned.kind==='cached'?(planned.cached.evaluation.findings.length===0?'CachedClear':'CachedFinding'):planned.join==='advice'?'JoinedAdvice':planned.join==='pending'?'JoinedPending':'JoinedClaimed'
      response={$:'Routed',key,route:{$:kind,...(kind==='CachedFinding'?{evaluation:key}:{})}};break
     }
     case 'ObservePlans':for(const fact of array(command.planned))observePlannedEvaluation(context,item(fact));break
     case 'OwnerBarrier':await run(context.deps.residentPreparationControls.afterReuseBoundary('ownerClaimed'));break
     case 'JoinedBarrier':await run(context.deps.residentPreparationControls.afterReuseBoundary('claimJoined'));break
     case 'CompletePreparation': {
      const retained=array(command.retained),allocations=await run(ledger.completePreparation(context.job.partition,preparation.operation,preparation.reservation,retained.map(fact=>Number(fact.outcome.reservation_bytes)),context.job.canonicalRound));context.activeWorkspaces.delete(preparation.reservation)
      response={$:'Reserved',allocations:list(allocations.map(allocation=>{if(allocation===undefined)return none;const handle=BigInt(allocation.reservation.id);reservations.set(handle,allocation.reservation);return some({$:'Allocation',operation:BigInt(allocation.operation),reservation:handle})}))};break
     }
     case 'ObserveReuse':for(const fact of array(command.planned))await run(recordReuseObservation(context,pathObservation,item(fact)));break
     case 'RegisterRevision': {
      const token=await run(context.deps.residentRegisterCurrentWork(sourcePartition(context.job.observation.root,context.job.observation.advicee),item(command.slot.item).outcome.prepared));const handle=BigInt(revisions.size+1);revisions.set(handle,token);response={$:'Revision',token:handle};break
     }
     case 'RegisterWork': {
      const policy=context.job.round===undefined||context.job.workObservationId===undefined?undefined:await run(ledger.rounds.policyWork(context.job.round)),planned=item(command.slot.item),operation=Number(command.slot.operation)
      const work=policy===undefined?undefined:planned.kind==='cached'?policy.cachedFinding(context.job.workObservationId,planned.cached.evaluation.findings.length,logicalBytes(planned.cached.evaluation.findings),operation):policy.spawn(context.job.workObservationId,operation)
      response={$:'Work',token:work===undefined?none:some(BigInt(work))};break
     }
     case 'ObserveUnit':context.expectedActivityUnits.push(item(command.slot.item).evaluationKey);context.deps.residentInspection.observePreparedUnit(unit(command.slot,command.revision,command.work));break
     case 'AttachOwner': {
      const value=unit(command.slot,command.revision,command.work),accepted=await run(context.deps.residentJoined.attachOwner(value.evaluationKey,value,value.revision));if(accepted)context.unassignedClaims.delete(value.evaluationKey);response={$:'Attached',accepted};break
     }
     case 'Enqueue':response={$:'Queued',accepted:await run(context.deps.residentDispatcher.enqueue(context.job.partition,unit(command.slot,command.revision,command.work)))};break
     case 'ReleaseUnspawned':if(command.slot.item.route.$==='Owner')await run(context.deps.residentReleaseReuseClaim(item(command.slot.item).evaluationKey));await run(ledger.release(reservation(command.slot)));await run(context.deps.residentReleaseCurrentWork(revision(command.revision)));break
     case 'ReleaseAttached': {const value=unit(command.slot,command.revision,command.work);await run(context.deps.residentReleaseReuseClaim(value.evaluationKey,'capacity'));await run(context.deps.residentReleaseUnit(value));break}
     case 'ReportCapacity':await run(ledger.runtime.rejectCapacity());await run(context.deps.residentRecordAnalytics(context.job,'capacity-rejected'));await run(context.deps.residentRecordOperationalFailure(context.job.observation,'capacity'));break
     case 'SettleCached':throw new Error('Cached finding child not yet connected')
     case 'Cleanup': {
      for(const slot of array(command.remaining))await run(ledger.release(reservation(slot)))
      if(command.revision.$==='Some')await run(context.deps.residentReleaseCurrentWork(revision(command.revision.value)))
      for(const planned of array(command.planned))await run(context.deps.residentReleaseReuseClaim(item(planned).evaluationKey))
      break
     }
     default:throw new Error('Unknown postflow command '+command.$)
    }
   } catch(error){const token=BigInt(errors.size+1);errors.set(token,error);response={$:'Failed',token}}
   step=core.resume(step,{$:'Reply',invocation:request.invocation,id:request.id,response})
  }
  throw new Error('Postflow did not settle')
 },catch:error=>error})
}
