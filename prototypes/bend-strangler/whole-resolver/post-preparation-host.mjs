import {withinWork} from '../../../packages/resident-runtime/src/resident/work-ownership/cancellation.ts'
import {ResidentAdapterError} from '../../../packages/resident-runtime/src/resident/adapter-error.ts'
import {randomUUID} from 'node:crypto'
import {createAdviceTailProvider} from './advice-tail-provider.mjs'
import {residentSettingsEnvironmentOnly} from '../../../packages/resident-runtime/src/resident/authorization/credentials.ts'
import {captureInspectionFate} from '@hapsland/review-execution/inspection/capture'
import * as Effect from 'effect/Effect'
import * as Cause from 'effect/Cause'
import * as Exit from 'effect/Exit'
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
export function createPostPreparationProvider(invocation,context,prepared,preparation,pathObservation,analyticsEnabled,sourceWorkspace) {
  const ledger=context.deps.residentLedger,plans=new Map(),reservations=new Map(),revisions=new Map(),units=new Map(),errors=new Map(),errorCauses=new Map(),pendingOwners=new Map(),adviceOwners=new Map(),publications=new Map(),tails=new Map()
  let revoked=false,closed=false,finished=false,primaryFailure,sourceDefect=false
  if(sourceWorkspace){
   const {owner,driver,sourceInvocation,operation,capability,handoff,parent}=sourceWorkspace
   driver.handoffResult(handoff)
   const child=owner.find(invocation,driver.state.children),origin=owner.find(handoff.scope.origin,driver.state.children),source=owner.find(sourceInvocation,driver.state.children)
   if(handoff.handoff!==invocation||child.$!=='Some'||child.value.scope.$!=='RetainingScope'||child.value.scope.origin!==handoff.scope.origin||origin.$!=='Some'||origin.value.scope.$!=='PreparationScope'||origin.value.scope.preparation!==operation||source.$!=='Some'||source.value.scope.$!=='SourceScope'||child.value.parent.$!=='Some'||child.value.parent.value.invocation!==sourceInvocation||child.value.parent.value.generation!==parent.generation||child.value.parent.value.request!==parent.request||source.value.generation!==parent.generation||source.value.request.$!=='Some'||source.value.request.value!==parent.request||capability!==preparation.reservation||!context.activeWorkspaces.has(capability))throw new Error('Source workspace lifetime lacks its Canonical handoff')
  }
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
   input:{invocation,postPreparation:{roundBound:context.job.round!==undefined,incomplete:prepared.observation.status==='incomplete',outcomes:list(facts)}},
   error:token=>errors.get(token),cause:token=>errorCauses.get(token),
   invocation:Number(invocation),
   revoke(){revoked=true},
   close(){closed=true},
   get transferredUnits(){return transferred.size},
   async finish(){
    if(finished)return
    const failures=[],attempt=async (effect,receipt)=>{try{await rawRun(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentResourceReceipt,receipt)))}catch(error){failures.push(error)}}
    for(const tail of tails.values())if(!tail.started){tail.started=true;if(tail.failure!==undefined)tail.provider.forceCleanup(tail.failure);try{await context.ownedAdvice.driver.driveAdvice(context.ownedAdvice.driver.adviceHandoff(tail.receipt.invocation),tail.provider,{signal:context.deps.residentLifetimeController.signal})}catch(error){failures.push(error)}}
    for(const value of units.values())if([...plans.values()].some(plan=>plan.evaluationKey===value.evaluationKey&&plan.kind==='cached')&&!value.completed&&value.round!==undefined&&value.workUnitId!==undefined)await attempt(ledger.rounds.policyWork(value.round).pipe(Effect.map(policy=>policy.retire(value.workUnitId))))
    const transferredReservations=new Set([...transferred].map(value=>BigInt(value.reservation.id)))
    const transferredKeys=new Set([...transferred].map(value=>value.evaluationKey))
    for(const [handle,value] of reservations)if(!transferredReservations.has(handle))await attempt(ledger.release(value))
    for(const [handle,value] of acquiredRevisions)if(!transferredAcquisition(handle))await attempt(context.deps.residentReleaseCurrentWork(value),()=>acquiredRevisions.delete(handle))
    for(const key of ownedClaims)if(!transferredKeys.has(key)){await attempt(context.deps.residentReleaseReuseClaim(key));context.unassignedClaims.delete(key)}
    if(!(sourceWorkspace&&sourceDefect)&&context.activeWorkspaces.has(preparation.reservation)){await attempt(ledger.release(preparation.reservation));context.activeWorkspaces.delete(preparation.reservation)}
    if(failures.length)throw new AggregateError(primaryFailure===undefined?failures:[primaryFailure,...failures],'Post-preparation resource finalization failed',{cause:primaryFailure??failures[0]})
    finished=true
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
    let failureKind='Failed',failureCause
    const run=async(effect,releasedAcquisition,releasedClaim)=>{
     const receipt=publication=>{if(releasedAcquisition!==undefined)acquiredRevisions.delete(releasedAcquisition);if(releasedClaim!==undefined){ownedClaims.delete(releasedClaim);context.unassignedClaims.delete(releasedClaim)}committed({...publication,releasedAcquisition})}
     const exit=await Effect.runPromiseExit(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentResourceReceipt,receipt),Effect.provideService(ResidentProviderPermit,cleanup||!options.ownerLease?undefined:{credential:options.ownerLease,committed:receipt})))
     if(Exit.isFailure(exit)){failureCause=exit.cause;failureKind=Cause.hasDies(exit.cause)?'Defect':Cause.hasInterrupts(exit.cause)?'Cancelled':'Failed';return rawRun(Effect.failCause(exit.cause))}
     return exit.value
    }
    const releaseAcquisition=async handle=>{if(!acquiredRevisions.has(handle)||transferredAcquisition(handle))return;await run(context.deps.residentReleaseCurrentWork(revision(handle)),handle);acquiredRevisions.delete(handle)}
   try {
    options.beforeCommand?.(command)
    failureKind='Defect'
    switch(command.$) {
     case 'CheckActive':response={$:'Active',value:await run(context.deps.residentJobActive(context.job))};break
     case 'Offer':response={$:'Offered',accepted:(await run(ledger.preparedOffer(command.outcome.ready,!command.deliverability||command.outcome.fits)))==='preparedAdmitted'};break
     case 'ObservePreparation':context.deps.residentInspection.observePreparation(context.job,prepared);break
     case 'ReportEmptyAnalytics':await run(context.deps.residentRecordAnalytics(context.job,command.incomplete?'incomplete-candidate':'skipped-candidate'));break
     case 'ReportEmptyActivity':recordActivity({statePath:context.job.dispatch.activityPath,root:context.job.observation.root,advicee:context.job.observation.advicee,lifetime:context.deps.lifetime,stage:command.incomplete?'incomplete':'skipped'});break
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
     case 'OwnerBarrier':await run(withinWork(context.deps.residentPreparationControls.afterReuseBoundary('ownerClaimed').pipe(Effect.mapError(()=>new ResidentAdapterError({operation:'owner claim barrier'}))),context.preparationSignal));break
     case 'RecordReuseAnalytics': {
      const planned=item(command.item)
      if(planned.kind==='cached')await run(context.deps.residentRecordAnalytics(context.job,'cache-hit',planned.cached.evaluation.findings))
      else if(planned.kind==='joined')await run(context.deps.residentRecordAnalytics(context.job,'joined-review'))
      else throw new Error('Reuse analytics requires a cached or joined plan')
      break
     }
     case 'JoinedBarrier':await run(withinWork(context.deps.residentPreparationControls.afterReuseBoundary('claimJoined').pipe(Effect.mapError(()=>new ResidentAdapterError({operation:'joined claim barrier'}))),context.preparationSignal));break
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
     case 'StartCachedReview':response={$:'ReviewAccepted',value:await run(ledger.startReview(context.job.partition,Number(command.slot.operation),context.job.canonicalRound))};break
     case 'CompleteCachedReview':response={$:'ReviewAccepted',value:await run(ledger.completeReview(context.job.partition,Number(command.slot.operation),reservation(command.slot),'finding',context.job.canonicalRound))};break
     case 'RecordCachedActivity':{const planned=item(command.slot.item);recordActivity({statePath:context.job.dispatch.activityPath,root:context.job.observation.root,advicee:context.job.observation.advicee,lifetime:context.deps.lifetime,stage:'findings',findings:planned.cached.evaluation.findings.length,unitIdentity:planned.evaluationKey});break}
     case 'CheckCachedActive':response={$:'Active',value:await run(context.deps.residentJobActive(unit(command.slot,command.revision,command.work)))};break
     case 'ReadCachedAdvice':{const existing=(await run(context.deps.residentAdvice())).find(value=>value.evaluationKey===item(command.slot.item).evaluationKey);const handle=BigInt(adviceOwners.size+1);if(existing)adviceOwners.set(handle,existing);response={$:'AdviceOwner',owner:existing===undefined?none:some(handle)};break}
     case 'RetireCachedWork':{const value=unit(command.slot,command.revision,command.work);if(value.round!==undefined&&value.workUnitId!==undefined)await run(ledger.rounds.policyWork(value.round).pipe(Effect.map(policy=>policy.retire(value.workUnitId))));break}
     case 'ReleaseCachedUnit':{await run(ledger.release(reservation(command.slot)));await releaseAcquisition(command.revision);const value=unit(command.slot,command.revision,command.work);value.released=true;reservations.delete(command.slot.reservation);break}
     case 'InsertCachedAdvice':{
      if(!context.ownedAdvice||!options.ownerLease)throw new Error('Cached advice requires Canonical composition')
      const value=unit(command.slot,command.revision,command.work),planned=item(command.slot.item),credential=value.dispatch.credential,required=value.dispatch.controlled===null||value.dispatch.controlled.requireCredential===true
      const evaluation={prepared:value.prepared,findings:planned.cached.evaluation.findings}
      const initial={analyticsPath:value.dispatch.activityPath,analyticsEnabled:value.analyticsEnabled??value.dispatch.sessionAnalytics===true,analyticsControlled:value.dispatch.controlled!==null,id:randomUUID(),...(value.round===undefined?{}:{round:value.round}),...(value.workUnitId===undefined?{}:{workUnitId:value.workUnitId}),admissionId:value.admissionId,canonicalOperationId:value.canonicalOperationId,canonicalRound:value.canonicalRound,observation:value.observation,settings:value.settings,partition:value.partition,reservation:value.reservation,prepared:value.prepared,...(value.sourceHash===undefined?{}:{sourceHash:value.sourceHash}),revision:value.revision,evaluationKey:value.evaluationKey,evaluations:[evaluation],findings:evaluation.findings,sequence:context.sequence,credentialGeneration:credential?.generation??null,credentialStatePath:credential?.statePath??null,credentialRequired:required,credentialEnvironmentOnly:credential===null?false:residentSettingsEnvironmentOnly(value.settings),pendingAt:context.deps.residentNow()}
      const binding=context.ownedAdvice,handle=binding.driver.prepareAdviceInput(invocation,{unit:value,evaluation})
      try{await rawRun(binding.bridge.adviceInsertAndHandoff(options.ownerLease,initial,handle,publication=>{
       value.completed=true;transferred.add(value)
       const receipt=publication.adviceReceipt
       const provider=createAdviceTailProvider(receipt.invocation,binding.bridge,receipt.capability,value,{deps:context.deps,retirementForExpired:binding.core.advice_retirement})
       tails.set(receipt.invocation,{receipt,provider,unit:value,evaluation,started:false});committed(publication)
      }))}finally{binding.driver.releaseAdviceInput(handle)}
      const tail=[...tails.values()].find(tail=>tail.unit===value);if(!tail)throw new Error('Advice insert did not establish resource receipt')
      response={$:'AdviceInserted',tail:tail.receipt.invocation};break
     }
     case 'ObserveRetainedAdvice':{const tail=tails.get(command.tail);if(!tail)throw new Error('Unknown advice transfer');const value=tail.unit;if(value.inspectionReceipt!==undefined&&context.deps.inspection.isEnabled(value.inspectionReceipt.scope.root))context.deps.inspection.offer(value.inspectionReceipt.scope,{...value.inspectionReceipt.correlation,...(value.inspectionEvaluationId===undefined?{}:{evaluationId:value.inspectionEvaluationId})},captureInspectionFate(tail.evaluation.findings,'retained','pending-advice',tail.receipt.capability.id));break}
     case 'AwaitAdviceTail':{const tail=tails.get(command.tail);if(!tail||tail.started)throw new Error('Unknown or consumed advice transfer');tail.started=true;const accepted=await context.ownedAdvice.driver.driveAdvice(context.ownedAdvice.driver.adviceHandoff(command.tail),tail.provider,{signal:context.deps.residentLifetimeController.signal});if(!accepted.adviceRetained)throw tail.provider.error(accepted.reason?.token)??new Error('Advice tail failed');break}
     case 'FinalizeCachedUnit':{const value=unit(command.slot,command.revision,command.work);if(!value.completed&&value.round!==undefined&&value.workUnitId!==undefined){await run(ledger.rounds.policyWork(value.round).pipe(Effect.map(policy=>policy.retire(value.workUnitId))));if(!value.released){await run(ledger.release(value.reservation));await releaseAcquisition(command.revision);value.released=true}}break}
     case 'Cleanup': {
      for(const slot of array(command.remaining))if(!transferredReservation(slot.reservation)){await run(ledger.release(reservation(slot)));reservations.delete(slot.reservation)}
      if(command.revision.$==='Some')await releaseAcquisition(command.revision.value)
      for(const planned of array(command.planned)){const key=item(planned).evaluationKey;if(ownedClaims.has(key)&&!transferredClaim(key)){if(ownedClaims.has(key))await run(context.deps.residentReleaseReuseClaim(key),undefined,key);ownedClaims.delete(key);context.unassignedClaims.delete(key)}}
      break
     }
     default:throw new Error('Unknown postflow command '+command.$)
    }
   } catch(error){if(command.$==='ObserveRetainedAdvice'&&tails.has(command.tail))tails.get(command.tail).failure=error;if(primaryFailure===undefined)sourceDefect=failureKind==='Defect';primaryFailure??=error;const token=BigInt(errors.size+1);errors.set(token,error);errorCauses.set(token,failureCause??(failureKind==='Defect'?Cause.die(error):Cause.fail(error)));response={$:failureKind,token}}
    return {$:'Reply',invocation:request.invocation,id:request.id,response}
   }
  }
}
// Intermediate direct runner retained until the owned physical handoff qualifies.
export function bendPostPreparation(core,context,prepared,preparation,pathObservation,analyticsEnabled) {
 const provider=createPostPreparationProvider(1n,context,prepared,preparation,pathObservation,analyticsEnabled)
 let terminalCause
 return Effect.tryPromise({try:async()=>{
  let step=core.initial(provider.input.invocation,provider.input.postPreparation.roundBound,provider.input.postPreparation.outcomes,provider.input.postPreparation.incomplete)
  for(let fuel=0;fuel<10000;fuel++) {
   if(step.$==='Internal'){step=core.advance(step.state);continue}
   if(step.$==='Finished')return true
   if(step.$==='Stopped'){if(['TechnicalFailure','DefectFailure'].includes(step.reason.$)){terminalCause=provider.cause(step.reason.token);throw provider.error(step.reason.token)??new Error('Postflow refused native attachment')}return false}
   if(step.$!=='Await')throw new Error('Postflow rejected response')
   step=core.resume(step,await provider.perform(step.request))
  }
  throw new Error('Postflow did not settle')
 },catch:error=>error}).pipe(Effect.catch(error=>terminalCause===undefined?Effect.fail(error):Effect.failCause(terminalCause)))
}
