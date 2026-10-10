import * as Effect from 'effect/Effect'
import {recordActivity} from '@hapsland/activity-observation/activity/status'
import {ResidentProviderPermit,ResidentResourceReceipt} from './resident-provider-permit.mjs'
import {MAX_IPC_FRAME_BYTES} from '@hapsland/resident-transport/resident/protocol'
import {logicalBytes} from '../../../packages/resident-runtime/src/resident/state/encoded-size.ts'
import {sourcePartition} from '../../../packages/resident-runtime/src/resident/recipient/identity.ts'
import {evaluationSourcePartition} from '../../../packages/resident-runtime/src/resident/work-ownership/identity.ts'
import {observePlannedEvaluation} from '../../../packages/resident-runtime/src/resident/review-work/preparation/retention.ts'
import {residentUnitWorstOutcomeBytes,residentUnitReservationBytes} from '../../../packages/resident-runtime/src/resident/work-ownership/reservation.ts'
// Canonical-owned prototype effect dispatcher. Reuse progression belongs to Bend;
// Host handlers expose semantic owner effects and resource receipts.
const list=values=>values.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const array=value=>{const result=[];while(value.$==='Con'){result.push(value.head);value=value.tail}if(value.$!=='Nil')throw new Error('Invalid postflow list');return result}
const some=value=>({$:'Some',value}),none={$:'None'}
export function createPostPreparationProvider(invocation,context,prepared,preparation,pathObservation,analyticsEnabled) {
  const ledger=context.deps.residentLedger,plans=new Map(),reservations=new Map(),revisions=new Map(),units=new Map(),errors=new Map(),pendingOwners=new Map(),adviceOwners=new Map(),publications=new Map()
  let revoked=false,closed=false,finished=false
  const transferred=new Set(),ownedClaims=new Set(),acquiredRevisions=new Map(),revisionReservations=new Map()
  const transferredReservation=handle=>[...transferred].some(value=>BigInt(value.reservation.id)===handle)
  const transferredAcquisition=handle=>revisionReservations.has(handle)&&transferredReservation(revisionReservations.get(handle))
  const transferredClaim=key=>[...transferred].some(value=>value.evaluationKey===key)
  const rawRun=Effect.runPromise
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
  return {
   input:{invocation,postPreparation:{roundBound:context.job.round!==undefined,outcomes:list(facts)}},
   error:token=>errors.get(token),
   invocation:Number(invocation),
   revoke(){revoked=true},
   close(){closed=true},
   get transferredUnits(){return transferred.size},
   async finish(){
    if(finished)return
    finished=true
    const failures=[],attempt=async (effect,receipt)=>{try{await rawRun(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentResourceReceipt,receipt)))}catch(error){failures.push(error)}}
    const transferredReservations=new Set([...transferred].map(value=>BigInt(value.reservation.id)))
    const transferredKeys=new Set([...transferred].map(value=>value.evaluationKey))
    for(const [handle,value] of reservations)if(!transferredReservations.has(handle))await attempt(ledger.release(value))
    for(const [handle,value] of acquiredRevisions)if(!transferredAcquisition(handle))await attempt(context.deps.residentReleaseCurrentWork(value),()=>acquiredRevisions.delete(handle))
    for(const key of ownedClaims)if(!transferredKeys.has(key)){await attempt(context.deps.residentReleaseReuseClaim(key));context.unassignedClaims.delete(key)}
    if(context.activeWorkspaces.has(preparation.reservation)){await attempt(ledger.release(preparation.reservation));context.activeWorkspaces.delete(preparation.reservation)}
    if(failures.length)throw new AggregateError(failures,'Post-preparation resource finalization failed')
   },
   async perform(request,options={}){
    if(revoked||closed||options.signal?.aborted)throw new Error('Revoked post-preparation session')
    if(request.invocation!==invocation)throw new Error('Wrong postflow provider invocation')
    const command=request.command;let response={$:'Ack'}
    const acquisitionHandle=['RegisterClear','RegisterRevision'].includes(command.$)?BigInt(revisions.size+1):undefined
    const cleanup=['Cleanup','ReleaseUnspawned','ReleaseAttached'].includes(command.$)
    const committed=publication=>{
     if(publication.restoredPending){publication.restoredPending.pendingOwnerIdentity.revision=publication.restoredPending.revision;options.afterPendingRestore?.(publication.restoredPending)}
     if(command.$==='ReleaseClear')acquiredRevisions.delete(command.revision)
     for(const key of publication.claimedKeys)ownedClaims.add(key)
     for(const value of publication.transferredUnits)transferred.add(value)
     if(command.$==='CompletePreparation'&&Array.isArray(publication.value))for(const allocation of publication.value)if(allocation)reservations.set(BigInt(allocation.reservation.id),allocation.reservation)
     if(['RegisterRevision','RegisterClear'].includes(command.$)&&publication.value?.revision){const value=publication.value.revision;revisions.set(acquisitionHandle,value);acquiredRevisions.set(acquisitionHandle,value);if(command.slot)revisionReservations.set(acquisitionHandle,command.slot.reservation)}
     options.afterCommit?.(command,publication)
    }
    const run=(effect,releasedAcquisition,releasedClaim)=>{
     const receipt=publication=>{if(releasedAcquisition!==undefined)acquiredRevisions.delete(releasedAcquisition);if(releasedClaim!==undefined){ownedClaims.delete(releasedClaim);context.unassignedClaims.delete(releasedClaim)}committed({...publication,releasedAcquisition})}
     return rawRun(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentResourceReceipt,receipt),Effect.provideService(ResidentProviderPermit,cleanup||!options.ownerLease?undefined:{credential:options.ownerLease,committed:receipt})))
    }
    const releaseAcquisition=async handle=>{if(!acquiredRevisions.has(handle)||transferredAcquisition(handle))return;await run(context.deps.residentReleaseCurrentWork(revision(handle)),handle);acquiredRevisions.delete(handle)}
   try {
    options.beforeCommand?.(command)
    switch(command.$) {
     case 'CheckActive':response={$:'Active',value:await run(context.deps.residentJobActive(context.job))};break
     case 'Offer':response={$:'Offered',accepted:(await run(ledger.preparedOffer(command.outcome.ready,!command.deliverability||command.outcome.fits)))==='preparedAdmitted'};break
     case 'ObserveReady':await run(ledger.runtime.observePreparedUnits(array(command.ready).length));break
     case 'LookupReuse': {
      const outcome=outcomes.get(command.outcome.handle)
      const generationPartition=evaluationSourcePartition(context.job.observation,context.job.work?.id??'standalone',context.job.dispatch.credential?.generation??'controlled',context.job.settings.configuration.policy.digest)
      const evaluationKey=context.deps.residentReuse.key(generationPartition,outcome.prepared)
      const liveAdvice=(await run(context.deps.residentAdvice())).some(advice=>advice.evaluationKey===evaluationKey)
      const route=await run(context.deps.residentReuse.route(evaluationKey,liveAdvice))
      const key=command.outcome.handle
      const routeFacts={owner:'Owner',cached:'CachedEntry',joinedAdvice:'JoinedAdvice',joinedPending:'JoinedPending',joinedClaimed:'JoinedClaimed'}
      const kind=route==='owner'?'owner':route==='cached'?'cached':'joined'
      plans.set(key,{kind,outcome,evaluationKey,...(kind==='joined'?{join:route.slice('joined'.length).toLowerCase()}: {})})
      if(route==='owner'){ownedClaims.add(evaluationKey);context.unassignedClaims.add(evaluationKey)}
      response={$:'Routed',key,route:{$:routeFacts[route]}};break
     }
     case 'ReadCached': {
      const planned=item(command.item),cached=await run(context.deps.residentReuse.cached(planned.evaluationKey))
      planned.cached=cached;response={$:'CachedFacts',evaluation:command.item.key,findings:BigInt(cached.evaluation.findings.length)};break
     }
     case 'ReadPending': {
      const planned=item(command.item),owner=await run(context.deps.residentReuse.pending(planned.evaluationKey))
      if(owner===undefined)throw new Error('canonical reuse route lacks pending evaluation')
      const handle=BigInt(pendingOwners.size+1);pendingOwners.set(handle,{key:planned.evaluationKey,owner});response={$:'PendingOwner',owner:handle};break
     }
     case 'RestorePending': {
      const planned=item(command.item),record=pendingOwners.get(command.owner),owner=record?.owner
      if(record?.key!==planned.evaluationKey||!owner)throw new Error('Unknown pending owner handle')
      const effect=context.deps.residentRestoreCurrentWork(sourcePartition(context.job.observation.root,context.job.observation.advicee),planned.outcome.prepared)
      const restored=await run(Effect.gen(function*(){
       const permit=yield* ResidentProviderPermit
       return yield* effect.pipe(Effect.provideService(ResidentProviderPermit,permit?{...permit,pendingRestore:{key:planned.evaluationKey,owner}}:undefined))
      }))
      owner.revision=restored;break
     }
     case 'ObservePlans':for(const fact of array(command.planned))observePlannedEvaluation(context,item(fact));break
     case 'OwnerBarrier':await run(context.deps.residentPreparationControls.afterReuseBoundary('ownerClaimed'));break
     case 'JoinedBarrier':await run(context.deps.residentPreparationControls.afterReuseBoundary('claimJoined'));break
     case 'CompletePreparation': {
      const retained=array(command.retained),allocations=await run(ledger.completePreparation(context.job.partition,preparation.operation,preparation.reservation,retained.map(fact=>Number(fact.outcome.reservation_bytes)),context.job.canonicalRound));context.activeWorkspaces.delete(preparation.reservation)
      response={$:'Reserved',allocations:list(allocations.map(allocation=>{if(allocation===undefined)return none;const handle=BigInt(allocation.reservation.id);reservations.set(handle,allocation.reservation);return some({$:'Allocation',operation:BigInt(allocation.operation),reservation:handle})}))};break
     }
     case 'RegisterClear': {
      const value=await run(context.deps.residentRegisterCurrentWork(sourcePartition(context.job.observation.root,context.job.observation.advicee),item(command.item).outcome.prepared))
      const handle=acquisitionHandle;revisions.set(handle,value);acquiredRevisions.set(handle,value);response={$:'Revision',token:handle};break
     }
     case 'ReleaseClear':await releaseAcquisition(command.revision);break
     case 'ReadLiveAdvice': {
      const existing=(await run(context.deps.residentAdvice())).find(advice=>advice.evaluationKey===item(command.item).evaluationKey)
      const handle=BigInt(adviceOwners.size+1);if(existing!==undefined)adviceOwners.set(handle,existing)
      response={$:'AdviceOwner',owner:existing===undefined?none:some(handle)};break
     }
     case 'PublishJoinedAdvice': {
      const existing=adviceOwners.get(command.advice);if(!existing)throw new Error('Unknown advice owner')
      const publication=await run(ledger.advice.publish(existing)),handle=BigInt(publications.size+1);publications.set(handle,publication)
      response={$:'Published',publication:handle};break
     }
     case 'RecordJoinedOutcomes': {
      const existing=adviceOwners.get(command.advice);if(!existing||!publications.has(command.publication))throw new Error('Unknown joined publication')
      await run(context.deps.residentRecordJoinedOutcomes(publications.get(command.publication),existing.id));break
     }
     case 'ReadCurrentAdvice': {
      const existing=adviceOwners.get(command.advice);if(!existing)throw new Error('Unknown advice owner')
      response={$:'FindingCount',findings:BigInt((await run(ledger.advice.current(existing))).findings.length)};break
     }
     case 'ReadJoinedPending': {
      const planned=item(command.item),owner=await run(context.deps.residentReuse.pending(planned.evaluationKey)),handle=BigInt(pendingOwners.size+1)
      if(owner!==undefined)pendingOwners.set(handle,{key:planned.evaluationKey,owner});response={$:'JoinOwner',owner:owner===undefined?none:some(handle)};break
     }
     case 'AppendJoined': {
      const planned=item(command.item),record=command.owner.$==='None'?undefined:pendingOwners.get(command.owner.value),pending=record?.owner
      if(command.owner.$==='Some'&&(!pending||record.key!==planned.evaluationKey))throw new Error('Unknown joined pending owner')
      await run(context.deps.residentJoined.append({admission:context.job.canonicalObservationId,evaluationKey:planned.evaluationKey,observation:pathObservation,activityPath:context.job.dispatch.activityPath,...(pending===undefined?{}:{revision:pending.revision})}));break
     }
     case 'RememberExpected':context.expectedActivityUnits.push(item(command.item).evaluationKey);break
     case 'RecordReuseActivity': {
      const planned=item(command.item),activity=command.activity
      if(activity.$==='ClearActivity')context.expectedActivityUnits.push(planned.evaluationKey)
      recordActivity({statePath:context.job.dispatch.activityPath,root:context.job.observation.root,advicee:context.job.observation.advicee,lifetime:context.deps.lifetime,stage:activity.$==='ClearActivity'?'clear':activity.$==='FindingsActivity'?'findings':'unavailable',...(activity.$==='FindingsActivity'?{findings:Number(activity.findings)}:{}),unitIdentity:planned.evaluationKey});break
     }
     case 'RegisterRevision': {
      const token=await run(context.deps.residentRegisterCurrentWork(sourcePartition(context.job.observation.root,context.job.observation.advicee),item(command.slot.item).outcome.prepared));const handle=acquisitionHandle;revisions.set(handle,token);acquiredRevisions.set(handle,token);revisionReservations.set(handle,command.slot.reservation);response={$:'Revision',token:handle};break
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
     case 'ReleaseUnspawned':if(transferredReservation(command.slot.reservation))break;if(command.slot.item.route.$==='Owner'){const key=item(command.slot.item).evaluationKey;if(ownedClaims.has(key))await run(context.deps.residentReleaseReuseClaim(key),undefined,key);ownedClaims.delete(key);context.unassignedClaims.delete(key)}await run(ledger.release(reservation(command.slot)));reservations.delete(command.slot.reservation);await releaseAcquisition(command.revision);break
     case 'ReleaseAttached': {if(transferredReservation(command.slot.reservation))break;const value=unit(command.slot,command.revision,command.work);if(ownedClaims.has(value.evaluationKey))await run(context.deps.residentReleaseReuseClaim(value.evaluationKey,'capacity'),undefined,value.evaluationKey);await run(ledger.release(value.reservation));await releaseAcquisition(command.revision);value.released=true;ownedClaims.delete(value.evaluationKey);context.unassignedClaims.delete(value.evaluationKey);reservations.delete(command.slot.reservation);acquiredRevisions.delete(command.revision);break}
     case 'ReportCapacity':await run(ledger.runtime.rejectCapacity());await run(context.deps.residentRecordAnalytics(context.job,'capacity-rejected'));await run(context.deps.residentRecordOperationalFailure(context.job.observation,'capacity'));break
     case 'SettleCached':throw new Error('Cached finding child not yet connected')
     case 'Cleanup': {
      for(const slot of array(command.remaining))if(!transferredReservation(slot.reservation)){await run(ledger.release(reservation(slot)));reservations.delete(slot.reservation)}
      if(command.revision.$==='Some')await releaseAcquisition(command.revision.value)
      for(const planned of array(command.planned)){const key=item(planned).evaluationKey;if(ownedClaims.has(key)&&!transferredClaim(key)){if(ownedClaims.has(key))await run(context.deps.residentReleaseReuseClaim(key),undefined,key);ownedClaims.delete(key);context.unassignedClaims.delete(key)}}
      break
     }
     default:throw new Error('Unknown postflow command '+command.$)
    }
   } catch(error){const token=BigInt(errors.size+1);errors.set(token,error);response={$:'Failed',token}}
    return {$:'Reply',invocation:request.invocation,id:request.id,response}
   }
  }
}
// Intermediate direct runner retained until the owned physical handoff qualifies.
export function bendPostPreparation(core,context,prepared,preparation,pathObservation,analyticsEnabled) {
 return Effect.tryPromise({try:async()=>{
  const provider=createPostPreparationProvider(1n,context,prepared,preparation,pathObservation,analyticsEnabled)
  let step=core.initial(provider.input.invocation,provider.input.postPreparation.roundBound,provider.input.postPreparation.outcomes)
  for(let fuel=0;fuel<10000;fuel++) {
   if(step.$==='Internal'){step=core.advance(step.state);continue}
   if(step.$==='Finished')return true
   if(step.$==='Stopped'){if(step.reason.$==='TechnicalFailure')throw provider.error(step.reason.token)??new Error('Postflow refused native attachment');return false}
   if(step.$!=='Await')throw new Error('Postflow rejected response')
   step=core.resume(step,await provider.perform(step.request))
  }
  throw new Error('Postflow did not settle')
 },catch:error=>error})
}
