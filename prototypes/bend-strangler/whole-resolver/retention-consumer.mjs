import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import * as Latch from 'effect/Latch'
import {initialRuntimeRecords} from '../../../packages/resident-runtime/src/resident/state/runtime-records.ts'
import {initialRevision} from '../../../packages/resident-runtime/src/resident/state/revision.ts'
import {initialEvaluationReuse} from '../../../packages/resident-runtime/src/resident/state/evaluation-reuse.ts'
import {initialJoinedReviews} from '../../../packages/resident-runtime/src/resident/state/joined-reviews.ts'
import {initialRoundRecords} from '../../../packages/resident-runtime/src/resident/state/round-records.ts'
import {initialAdviceRecords} from '../../../packages/resident-runtime/src/resident/state/advice-records.ts'
import {initialDelivery} from '../../../packages/resident-runtime/src/resident/state/delivery/operations.ts'
import {initialDispatchRegistry,makeDispatcher} from '../../../packages/resident-runtime/src/resident/state/dispatch.ts'
import {residentCapacity} from '../../../packages/resident-runtime/src/resident/state/resident/capacity.ts'
import {residentRevision} from '../../../packages/resident-runtime/src/resident/state/resident/revision.ts'
import {residentReuse} from '../../../packages/resident-runtime/src/resident/state/resident/reuse.ts'
import {residentJoinedReviews} from '../../../packages/resident-runtime/src/resident/state/resident/joined-reviews.ts'
import {residentRounds} from '../../../packages/resident-runtime/src/resident/state/resident/rounds.ts'
import {residentRuntime} from '../../../packages/resident-runtime/src/resident/state/resident/runtime.ts'
import {residentAdvice} from '../../../packages/resident-runtime/src/resident/state/resident/advice.ts'
import {residentDelivery} from '../../../packages/resident-runtime/src/resident/state/resident/delivery.ts'
import {residentDispatch} from '../../../packages/resident-runtime/src/resident/state/resident/dispatch.ts'
import {makeResidentWorkLifecycle} from '../../../packages/resident-runtime/src/resident/work-ownership/lifecycle.ts'
import {residentRetainAdvice} from '../../../packages/resident-runtime/src/resident/review-work/evaluation/retention.ts'
import {completeSourcePreparation} from '../../../packages/resident-runtime/src/resident/review-work/preparation/retention.ts'
import {defaultPreparationControls} from '../../../packages/resident-runtime/src/resident/execution-controls/preparation-controls.ts'
import {logicalBytes} from '../../../packages/resident-runtime/src/resident/state/encoded-size.ts'
import {advicee} from '@hapsland/build-tooling/test-support/test-fixtures'
import {sourcePartition} from '../../../packages/resident-runtime/src/resident/recipient/identity.ts'
import {evaluationSourcePartition} from '../../../packages/resident-runtime/src/resident/work-ownership/identity.ts'
import {unlist} from './service-session.mjs'
import {decodePreparationResult} from './preparation-result-codec.mjs'
import {bendPostPreparation,createPostPreparationProvider} from './post-preparation-host.mjs'
import {providerTransaction,dispatchExecutionBoundary,ResidentProviderPermit,ResidentResourceReceipt} from './resident-provider-permit.mjs'
import {nativePostPreparation} from './native-post-preparation-child.mjs'

// Actual semantic owners and one bridged resident transaction. Recording sinks
// are limited to analytics/inspection; revision, reuse, round and dispatch are real.
export async function consumeRetainedPreparation(connection,result,root,rootIdentity,mode) {
 const originalCase=mode
 const cachedFault=mode.includes('-standalone-')?mode.slice(mode.indexOf('-standalone-')+12):undefined
 if(cachedFault)mode=mode.slice(0,mode.indexOf('-standalone-')+11)
 const cachedStandalone=mode.endsWith('cached-finding-standalone')
 if(cachedStandalone)mode=mode.replace('-standalone','')
 const caseName=mode
 const cleanupReceiptFault=mode==='retention-owned-fault-clear-cleanup-receipt'
 const sharedRelease=mode==='retention-owned-fault-clear-shared-release'||cleanupReceiptFault
 const reuseFaults={'retention-owned-fault-reuse-claim':['LookupReuse','retention-success'],'retention-owned-fault-clear-register':['RegisterClear','retention-cached-clear'],'retention-owned-fault-clear-release':['ReleaseClear','retention-cached-clear'],'retention-owned-fault-joined-append':['AppendJoined','retention-joined-claimed'],'retention-owned-fault-clear-shared-release':['ReleaseClear','retention-cached-clear'],'retention-owned-fault-clear-cleanup-receipt':['Cleanup','retention-cached-clear']}
 const reuseFault=reuseFaults[mode]
 const faultJoinRestore=mode==='retention-owned-joined-pending-restore-fault'
 const useOwned=mode.startsWith('retention-owned-'),useBend=mode.startsWith('retention-bend-');mode=mode.replace('retention-bend-','retention-').replace('retention-owned-','retention-');if(mode==='retention-duplicate-active')mode='retention-success';if(faultJoinRestore)mode='retention-joined-pending';if(reuseFault)mode=reuseFault[1]
 const postFlow=(...args)=>useBend?bendPostPreparation(connection.postCore,...args):nativePostPreparation(...args)
 const run=Effect.runSync,identity=advicee(),accepted=[]
 run(connection.bridge.native((draft,records)=>[undefined,{...records,
  runtime:{...initialRuntimeRecords(),...records.runtime},revision:initialRevision(),reuse:initialEvaluationReuse(),joined:initialJoinedReviews(),rounds:initialRoundRecords(),advice:initialAdviceRecords(),delivery:initialDelivery(),dispatch:initialDispatchRegistry()}]))
 const transaction=providerTransaction(connection.transaction,connection.bridge)
 const ledger={...residentCapacity(transaction),runtime:residentRuntime(transaction),revision:residentRevision(transaction),rounds:residentRounds(transaction),dispatch:residentDispatch(transaction)}
 const reuse=residentReuse(transaction)(logicalBytes),joined=residentJoinedReviews(transaction)(logicalBytes),advice=residentAdvice(transaction),delivery=residentDelivery(transaction)()
 ledger.advice=advice
 const admission=run(delivery.admitEdit('agent','retention-edit',0));assert.ok(admission)
 const round=run(ledger.rounds.bind('agent',admission.generation,{root,rootIdentity,advicee:identity,activityPath:undefined},'cohort'))
 assert.equal(round.canonicalRound,connection.round)
 const work=run(ledger.rounds.snapshot(round)).work
 const scope=run(Scope.make()),hold=run(Latch.make(false))
 const dispatcher=await Effect.runPromise(makeDispatcher(ledger,unit=>({operation:unit.canonicalOperationId,round:unit.canonicalRound}),entry=>Effect.gen(function*(){assert.equal(yield* ResidentProviderPermit,undefined);assert.equal(yield* ResidentResourceReceipt,undefined);accepted.push(entry.value);yield* hold.await}),dispatchExecutionBoundary).pipe(Effect.provideService(Scope.Scope,scope)))
 const observation={root,rootIdentity,advicee:identity,candidates:[{operation:'add',path:'root.py'}]}
 const receipt={scope:{root},correlation:{fixture:'postflow'}}
 const job={kind:'ingress',inspectionReceipt:receipt,observation,partition:'agent',canonicalRound:connection.round,canonicalObservationId:1,...(cachedStandalone?{}:{round,workObservationId:1}),work,settings:{configuration:{policy:{digest:'f'.repeat(64)}}},dispatch:{activityPath:undefined,credential:null,controlled:null}}
 const fateEvents=[]
 const inspection={observePreparation(){},observePreparedUnit(){},observeAdviceFate(capability,findings,fate,reason){fateEvents.push({id:capability.id,count:findings.length,fate,reason})},evaluationId(key){return 'physical:'+key},observeDiagnostic(){},forgetOrigin(){},registerOrigin(){}}
 const deps={residentNow:()=>0,residentAdviceExpired:()=>Effect.succeed(false),residentReviewControls:{afterAdvicePending:()=>cachedFault==='barrier'?Effect.fail(new Error('injected cached advice barrier failure')):Effect.void},lifetime:'physical',residentLedger:ledger,residentReuse:reuse,residentJoined:joined,residentAdvice:()=>advice.values(),residentComposedDelivery:delivery,residentDispatcher:dispatcher,residentLifetimeController:new AbortController(),residentInspection:inspection,residentRoundSnapshot:capability=>ledger.rounds.snapshot(capability).pipe(Effect.map(snapshot=>{if(!snapshot)throw new Error('Missing native round');return snapshot})),residentRecordAnalytics:()=>Effect.void}
 const lifecycle=makeResidentWorkLifecycle(deps)
 const retire=()=>Effect.gen(function*(){assert.equal(yield* ledger.rounds.retire(round),true);round.controller.abort()})
 const prepared=decodePreparationResult(result,identity)
 const context={deps:{...deps,...lifecycle,inspection:{isEnabled:()=>cachedFault==='inspection'&&run(advice.values()).length>0,offer:()=>{throw new Error('injected retained inspection failure')}},residentRecordOperationalFailure:()=>Effect.void,residentRecordJoinedOutcomes:()=>Effect.void,residentRetainAdvice:()=>{throw new Error('Unexpected cached path')},residentPreparationControls:{...defaultPreparationControls,afterReuseBoundary:phase=>phase==='ownerClaimed'?(mode==='retention-owner-claimed'?retire():mode==='retention-fault-owner-claimed'?Effect.die(new Error('injected after owner claim')):Effect.void):Effect.void}},job,sequence:1,expectedActivityUnits:[],unassignedClaims:new Set(),activeWorkspaces:new Set([connection.preparation.reservation]),preparationSignal:work.controller.signal}
 context.deps.residentRetainAdvice=(unit,evaluation,sequence)=>residentRetainAdvice(context.deps,unit,evaluation,sequence)
 if(useOwned)context.ownedAdvice={bridge:connection.bridge,driver:connection.owned.driver,core:connection.postCore}
 const seededKeys=[],existingRevisions=[]
 if(sharedRelease)for(const outcome of prepared.outcomes.filter(outcome=>outcome.status==='ready'))existingRevisions.push({prepared:outcome.prepared,revision:run(lifecycle.residentRegisterCurrentWork(sourcePartition(observation.root,observation.advicee),outcome.prepared))})
 if(mode==='retention-cached-clear'||mode==='retention-cached-finding'||mode==='retention-joined-claimed') {
  const partition=evaluationSourcePartition(observation,work.id,'controlled',job.settings.configuration.policy.digest)
  for(const outcome of prepared.outcomes.filter(outcome=>outcome.status==='ready')) {
   const key=reuse.key(partition,outcome.prepared);seededKeys.push(key)
   if(mode==='retention-cached-clear'||mode==='retention-cached-finding')assert.equal(run(reuse.put('agent',key,{prepared:outcome.prepared,findings:mode==='retention-cached-clear'?[]:[{path:outcome.path,declaration:outcome.prepared.input.declaration.name,ruleId:'fixture',probability:1,message:'physical cached finding',semanticIdentity:outcome.prepared.identity}]})),true)
   else assert.equal(run(reuse.claim(key)),true)
  }
 }
 const originalPolicyWork=ledger.rounds.policyWork
 if(mode==='retention-fault-after-revision')ledger.rounds.policyWork=capability=>originalPolicyWork(capability).pipe(Effect.map(policy=>({...policy,spawn:()=>{throw new Error('injected before spawn state change')}})))
 let registrations=0
 context.deps.residentRegisterCurrentWork=(partition,input)=>lifecycle.residentRegisterCurrentWork(partition,input).pipe(Effect.tap(()=>Effect.gen(function*(){registrations++;if(mode==='retention-after-revision'&&registrations===1)yield* retire()})))
 let postSession
 if(useOwned){
  postSession=createPostPreparationProvider(connection.owned.receipt.handoff,context,prepared,connection.preparation,observation,false)
  connection.owned.postSessions.set(postSession.invocation,postSession)
  if(['retention-before-enqueue','retention-after-queue-commit','retention-fault-after-queue-commit'].includes(mode)){
   const modify=ledger.dispatch.modify;let injected=false
   ledger.dispatch.modify=(...args)=>{
    const cancel=Effect.sync(()=>{if(injected)return;injected=true;if(mode!=='retention-fault-after-queue-commit')connection.owned.driver.cancel(postSession.invocation)})
    return mode==='retention-before-enqueue'?cancel.pipe(Effect.andThen(modify(...args))):modify(...args).pipe(Effect.tap(()=>injected?Effect.void:cancel.pipe(Effect.andThen(Effect.die(new Error('injected queue commit acknowledgement loss'))))))
   }
  }else if(['retention-after-enqueue-ack','retention-fault-after-enqueue-ack'].includes(mode)){
   const enqueue=dispatcher.enqueue
   context.deps.residentDispatcher={...dispatcher,enqueue:(...args)=>enqueue(...args).pipe(Effect.tap(accepted=>Effect.sync(()=>{assert.equal(accepted,true);if(mode!=='retention-fault-after-enqueue-ack')connection.owned.driver.cancel(postSession.invocation);throw new Error('injected committed enqueue acknowledgement loss')})))}
  }
 }
 try {
  if(mode==='retention-before-flow')await Effect.runPromise(retire())
  let continued
  try {
   const flow=async()=>{
    if(!useOwned)return Effect.runPromise(postFlow(context,prepared,connection.preparation,observation,false))
    const accepted=await connection.owned.driver.driveHandoff(connection.owned.receipt,postSession,projection=>{assert.equal(projection.preparation,result);return postSession.input})
    if(accepted.reason?.$==='TechnicalFailure')throw postSession.error(accepted.reason.token)??new Error('Postflow technical failure')
    return accepted.continued===true
   }
   if(useOwned&&mode==='retention-before-flow')await assert.rejects(flow,/Unknown or consumed/ )
   else if(mode==='retention-preinstall-cancel')await assert.rejects(flow,/WrongGeneration/)
   else if(mode==='retention-constructor-fault')await assert.rejects(flow,/injected post machine construction failure/)
   else if(['retention-fault-after-enqueue-ack','retention-fault-after-queue-commit'].includes(mode))await assert.rejects(flow,/acknowledgement loss/)
   else if(reuseFault)await assert.rejects(flow,cleanupReceiptFault?/injected original clear release failure/:/injected reuse commit acknowledgement loss/)
   else if(cachedFault==='insert-ack')await assert.rejects(flow,/injected cached insert acknowledgement loss/)
   else if(cachedFault==='inspection')await assert.rejects(flow,/injected retained inspection failure/)
   else if(cachedFault==='barrier')await assert.rejects(flow,error=>error?._tag==='ResidentAdapterError'&&error.operation==='pending advice barrier')
   else if(mode==='retention-fault-owner-claimed')await assert.rejects(flow,/injected after owner claim/)
   else if(mode==='retention-fault-after-revision')await assert.rejects(flow,/injected before spawn state change/)
   else continued=await flow()
   if(continued&&!cachedFault&&['retention-success','retention-cached-clear','retention-cached-finding','retention-joined-claimed','retention-joined-pending'].includes(mode))await Effect.runPromise(completeSourcePreparation(context))
   if(mode==='retention-joined-pending') {
    const ownerUnits=[...run(transaction.read).records.reuse.pending.values()].filter(Boolean)
    assert.equal(ownerUnits.length,prepared.outcomes.filter(outcome=>outcome.status==='ready').length)
    const secondObservation=run(ledger.admitObservation('agent',connection.round))
    assert.equal(run(ledger.observation('agent',secondObservation,'startObservation',connection.round)),true)
    const secondPreparation=run(ledger.beginObservedPreparation('agent',secondObservation,1000,connection.round));assert.equal(secondPreparation.status,'admitted')
    job.canonicalObservationId=secondObservation;job.workObservationId=secondObservation;job.completed=false
    context.activeWorkspaces.add(secondPreparation.reservation)
    context.expectedActivityUnits.length=0
    if(useOwned){
     const sourceResult=await connection.owned.startPreparation(secondPreparation)
     const secondPrepared=decodePreparationResult(sourceResult,identity)
     assert.deepEqual(secondPrepared,prepared)
     const secondSession=createPostPreparationProvider(connection.owned.receipt.handoff,context,secondPrepared,secondPreparation,observation,false)
     connection.owned.postSessions.set(secondSession.invocation,secondSession)
     const accepted=await connection.owned.driver.driveHandoff(connection.owned.receipt,secondSession,projection=>{assert.equal(projection.preparation,sourceResult);return secondSession.input})
     if(faultJoinRestore){assert.equal(accepted.reason?.$,'TechnicalFailure');assert.match(String(secondSession.error(accepted.reason.token)),/injected pending restore acknowledgement loss/);continued=undefined}
     else {if(accepted.reason?.$==='TechnicalFailure')throw secondSession.error(accepted.reason.token)??new Error('Joined postflow failed');continued=accepted.continued===true}
    }else continued=await Effect.runPromise(postFlow(context,prepared,secondPreparation,observation,false))
    if(!faultJoinRestore){assert.equal(continued,true);await Effect.runPromise(completeSourcePreparation(context))}
    const snapshot=run(transaction.read)
    assert.equal(snapshot.records.dispatch.entries.size,ownerUnits.length);assert.equal(registrations,ownerUnits.length)
    for(const unit of ownerUnits){if(faultJoinRestore){assert.equal(run(ledger.revision.current(unit.revision,unit.prepared)),true);continue}const entries=snapshot.records.joined.entries.get(unit.evaluationKey);assert.equal(entries.length,1);assert.equal(entries[0].admission,secondObservation);assert.equal(entries[0].revision,unit.revision);assert.equal(run(reuse.pending(unit.evaluationKey)),unit)}
   }
  } finally {
   // Workflow resource custody survives child failure as well as cancellation.
   for(const workspace of context.activeWorkspaces)await Effect.runPromise(ledger.release(workspace))
   for(const key of context.unassignedClaims)await Effect.runPromise(lifecycle.residentReleaseReuseClaim(key))
   if(!job.completed)await Effect.runPromise(ledger.observation('agent',job.canonicalObservationId,'interruptObservation',connection.round))
  }
  if(reuseFault){
   const snapshot=run(transaction.read)
   assert.equal(continued,undefined);assert.equal(snapshot.records.dispatch.entries.size,0);assert.equal(snapshot.records.revision.current.size,existingRevisions.length)
   for(const existing of existingRevisions)assert.equal(run(ledger.revision.current(existing.revision,existing.prepared)),true,'lost release ack removed pre-existing revision owner')
   assert.deepEqual(context.expectedActivityUnits,[])
   if(reuseFault[0]==='AppendJoined'){assert.equal([...snapshot.records.joined.entries.values()].flat().length,1);assert.equal(run(joined.hasAdmission(1)),true)}
   else assert.equal(snapshot.records.reuse.pending.size,0)
  }else if(mode==='retention-success'||mode==='retention-joined-pending'||mode==='retention-after-enqueue-ack'||mode==='retention-after-queue-commit'||mode==='retention-fault-after-queue-commit'||mode==='retention-fault-after-enqueue-ack') {
   assert.equal(continued,faultJoinRestore||mode.startsWith('retention-fault-')?undefined:!['retention-after-enqueue-ack','retention-after-queue-commit'].includes(mode));assert.equal(registrations,['retention-after-enqueue-ack','retention-after-queue-commit','retention-fault-after-enqueue-ack','retention-fault-after-queue-commit'].includes(mode)?1:prepared.outcomes.filter(outcome=>outcome.status==='ready').length)
   const snapshot=run(transaction.read),pending=[...snapshot.records.reuse.pending.values()].filter(Boolean)
   assert.equal(pending.length,registrations);assert.equal(snapshot.records.revision.current.size,registrations)
   const units=[...snapshot.records.dispatch.entries.values()].map(entry=>entry.value)
   assert.equal(units.length,registrations)
   for(const unit of units){assert.equal(unit.inspectionReceipt,receipt);assert.equal(unit.inspectionEvaluationId,'physical:'+unit.evaluationKey);assert.equal(unit.prepared.identity,prepared.outcomes.find(outcome=>outcome.status==='ready'&&outcome.prepared.input.declaration.name===unit.prepared.input.declaration.name).prepared.identity);assert.equal(unit.sourceHash,prepared.observation.outcomes[0].snapshot.sourceHash);assert.equal(run(ledger.revision.current(unit.revision,unit.prepared)),true);assert.equal(unit.workUnitId,unit.canonicalOperationId)}
  } else if(cachedFault){
   const snapshot=run(transaction.read),retained=run(advice.snapshots())
   const issuedTails=unlist(snapshot.resolverCustody.children).filter(child=>child.scope.$==='AdviceTailScope')
   assert.equal(issuedTails.length,1,'one insertion transfers exactly one independent tail');assert.equal(issuedTails[0].phase.$,'ChildAccepted')
   assert.equal(registrations,1);assert.equal(snapshot.records.dispatch.entries.size,0);assert.equal(snapshot.records.reuse.pending.size,0)
   assert.equal(retained.length,['cutoff','insert-ack'].includes(cachedFault)?1:0)
   assert.equal(snapshot.records.revision.current.size,retained.length)
   if(retained.length){assert.equal(run(ledger.revision.current(retained[0].capability.revision,retained[0].capability.prepared)),true);assert.equal(retained[0].content.findings.length,1);assert.deepEqual(fateEvents,[])}
   else {assert.equal(fateEvents.length,1);assert.equal(fateEvents[0].fate,'discarded');assert.equal(fateEvents[0].reason,'retention-failed')}
  } else if(mode==='retention-cached-finding'){
   assert.equal(continued,true);assert.equal(registrations,seededKeys.length);assert.deepEqual(context.expectedActivityUnits,cachedStandalone?seededKeys:[])
   const snapshot=run(transaction.read);assert.equal(snapshot.records.dispatch.entries.size,0);assert.equal(snapshot.records.reuse.pending.size,0)
   const findingsAdvice=run(advice.snapshots());assert.equal(findingsAdvice.length,cachedStandalone?seededKeys.length:0)
   for(const retained of findingsAdvice){assert.equal(retained.content.findings.length,1);assert.equal(run(ledger.revision.current(retained.capability.revision,retained.capability.prepared)),true);assert.equal(retained.capability.workUnitId,undefined)}
  } else if(mode==='retention-cached-clear'||mode==='retention-joined-claimed') {
   assert.equal(continued,true)
   assert.deepEqual(context.expectedActivityUnits,seededKeys)
   const snapshot=run(transaction.read)
   assert.equal(snapshot.records.dispatch.entries.size,0);assert.equal(snapshot.records.revision.current.size,0)
   if(mode==='retention-cached-clear') {assert.equal(registrations,seededKeys.length);for(const key of seededKeys)assert.deepEqual(run(reuse.cached(key)).evaluation.findings,[])}
   else {assert.equal(registrations,0);assert.equal(run(joined.hasAdmission(1)),true);for(const key of seededKeys){const entries=snapshot.records.joined.entries.get(key);assert.equal(entries.length,1);assert.equal(entries[0].evaluationKey,key);assert.equal(entries[0].revision,undefined)}}
  } else if(mode==='retention-fault-after-revision') {
   const snapshot=run(transaction.read)
   assert.equal(registrations,1);assert.equal(snapshot.records.revision.current.size,0)
   assert.equal(snapshot.reservations.size,0);assert.equal(snapshot.records.reuse.pending.size,0);assert.equal(snapshot.records.dispatch.entries.size,0)
  } else {
   const snapshot=run(transaction.read)
   assert.equal(snapshot.records.dispatch.entries.size,0);assert.equal(snapshot.records.revision.current.size,0);assert.equal(snapshot.records.reuse.pending.size,0)
   assert.equal(registrations,['retention-after-revision','retention-before-enqueue'].includes(mode)?1:0)
  }
  return {registrations,ready:prepared.outcomes.filter(outcome=>outcome.status==='ready').length}
 }catch(error){console.error(JSON.stringify({mode,caseName,originalCase,cachedFault,useOwned,cachedStandalone,originalFailure:String(error)}));throw error}
 finally {
  run(hold.open)
  await Effect.runPromise(Scope.close(scope,Exit.void))
  const pending=[...run(transaction.read).records.reuse.pending.values()].filter(Boolean)
  for(const unit of pending){await Effect.runPromise(lifecycle.residentReleaseUnit(unit));await Effect.runPromise(lifecycle.residentReleaseReuseClaim(unit.evaluationKey))}
  for(const key of seededKeys)if(mode==='retention-joined-claimed')await Effect.runPromise(lifecycle.residentReleaseReuseClaim(key))
  for(const capability of run(advice.values()))await Effect.runPromise(advice.remove(capability,'stale'))
  if(mode==='retention-cached-clear'||mode==='retention-cached-finding')await Effect.runPromise(reuse.clear())
  for(const existing of existingRevisions)await Effect.runPromise(lifecycle.residentReleaseCurrentWork(existing.revision))
  const terminal=run(transaction.read)
  assert.equal(terminal.reservations.size,0,mode+' reservations after cleanup '+JSON.stringify([...terminal.reservations].map(([id,entry])=>({id,kind:entry.kind,operation:entry.operation}))))
  assert.equal(terminal.records.revision.current.size,0,mode+' revisions after cleanup')
  assert.equal(terminal.records.reuse.pending.size,0,mode+' claims after cleanup')
  assert.equal(terminal.records.dispatch.entries.size,0,mode+' dispatcher handles after cleanup')
 }
}
