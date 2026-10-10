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
import {completeSourcePreparation} from '../../../packages/resident-runtime/src/resident/review-work/preparation/retention.ts'
import {defaultPreparationControls} from '../../../packages/resident-runtime/src/resident/execution-controls/preparation-controls.ts'
import {logicalBytes} from '../../../packages/resident-runtime/src/resident/state/encoded-size.ts'
import {advicee} from '@hapsland/build-tooling/test-support/test-fixtures'
import {evaluationSourcePartition} from '../../../packages/resident-runtime/src/resident/work-ownership/identity.ts'
import {decodePreparationResult} from './preparation-result-codec.mjs'
import {bendPostPreparation} from './post-preparation-host.mjs'
import {nativePostPreparation} from './native-post-preparation-child.mjs'

// Actual semantic owners and one bridged resident transaction. Recording sinks
// are limited to analytics/inspection; revision, reuse, round and dispatch are real.
export async function consumeRetainedPreparation(connection,result,root,rootIdentity,mode) {
 const useBend=mode.startsWith('retention-bend-');mode=mode.replace('retention-bend-','retention-')
 const postFlow=(...args)=>useBend?bendPostPreparation(connection.postCore,...args):nativePostPreparation(...args)
 const run=Effect.runSync,identity=advicee(),accepted=[]
 run(connection.bridge.native((draft,records)=>[undefined,{...records,
  runtime:{...initialRuntimeRecords(),...records.runtime},revision:initialRevision(),reuse:initialEvaluationReuse(),joined:initialJoinedReviews(),rounds:initialRoundRecords(),advice:initialAdviceRecords(),delivery:initialDelivery(),dispatch:initialDispatchRegistry()}]))
 const transaction={...connection.transaction,commitAllEffect:operation=>connection.bridge.native(operation).pipe(Effect.map(publication=>publication.value))}
 const ledger={...residentCapacity(transaction),runtime:residentRuntime(transaction),revision:residentRevision(transaction),rounds:residentRounds(transaction),dispatch:residentDispatch(transaction)}
 const reuse=residentReuse(transaction)(logicalBytes),joined=residentJoinedReviews(transaction)(logicalBytes),advice=residentAdvice(transaction),delivery=residentDelivery(transaction)()
 const admission=run(delivery.admitEdit('agent','retention-edit',0));assert.ok(admission)
 const round=run(ledger.rounds.bind('agent',admission.generation,{root,rootIdentity,advicee:identity,activityPath:undefined},'cohort'))
 assert.equal(round.canonicalRound,connection.round)
 const work=run(ledger.rounds.snapshot(round)).work
 const scope=run(Scope.make()),hold=run(Latch.make(false))
 const dispatcher=await Effect.runPromise(makeDispatcher(ledger,unit=>({operation:unit.canonicalOperationId,round:unit.canonicalRound}),entry=>Effect.sync(()=>accepted.push(entry.value)).pipe(Effect.andThen(hold.await))).pipe(Effect.provideService(Scope.Scope,scope)))
 const observation={root,rootIdentity,advicee:identity,candidates:[{operation:'add',path:'root.py'}]}
 const receipt={scope:{root},correlation:{fixture:'postflow'}}
 const job={kind:'ingress',inspectionReceipt:receipt,observation,partition:'agent',canonicalRound:connection.round,canonicalObservationId:1,round,work,workObservationId:1,settings:{configuration:{policy:{digest:'f'.repeat(64)}}},dispatch:{activityPath:undefined,credential:null,controlled:null}}
 const inspection={observePreparation(){},observePreparedUnit(){},evaluationId(key){return 'physical:'+key},observeDiagnostic(){},forgetOrigin(){},registerOrigin(){}}
 const deps={lifetime:'physical',residentLedger:ledger,residentReuse:reuse,residentJoined:joined,residentAdvice:()=>advice.values(),residentComposedDelivery:delivery,residentDispatcher:dispatcher,residentLifetimeController:new AbortController(),residentInspection:inspection,residentRoundSnapshot:capability=>ledger.rounds.snapshot(capability).pipe(Effect.map(snapshot=>{if(!snapshot)throw new Error('Missing native round');return snapshot})),residentRecordAnalytics:()=>Effect.void}
 const lifecycle=makeResidentWorkLifecycle(deps)
 const retire=()=>Effect.gen(function*(){assert.equal(yield* ledger.rounds.retire(round),true);round.controller.abort()})
 const prepared=decodePreparationResult(result,identity)
 const context={deps:{...deps,...lifecycle,inspection:{isEnabled:()=>false},residentRecordOperationalFailure:()=>Effect.void,residentRecordJoinedOutcomes:()=>Effect.void,residentRetainAdvice:()=>{throw new Error('Unexpected cached path')},residentPreparationControls:{...defaultPreparationControls,afterReuseBoundary:phase=>phase==='ownerClaimed'?(mode==='retention-owner-claimed'?retire():mode==='retention-fault-owner-claimed'?Effect.die(new Error('injected after owner claim')):Effect.void):Effect.void}},job,sequence:1,expectedActivityUnits:[],unassignedClaims:new Set(),activeWorkspaces:new Set([connection.preparation.reservation]),preparationSignal:work.controller.signal}
 const seededKeys=[]
 if(mode==='retention-cached-clear'||mode==='retention-joined-claimed') {
  const partition=evaluationSourcePartition(observation,work.id,'controlled',job.settings.configuration.policy.digest)
  for(const outcome of prepared.outcomes.filter(outcome=>outcome.status==='ready')) {
   const key=reuse.key(partition,outcome.prepared);seededKeys.push(key)
   if(mode==='retention-cached-clear')assert.equal(run(reuse.put('agent',key,{prepared:outcome.prepared,findings:[]})),true)
   else assert.equal(run(reuse.claim(key)),true)
  }
 }
 const originalPolicyWork=ledger.rounds.policyWork
 if(mode==='retention-fault-after-revision')ledger.rounds.policyWork=capability=>originalPolicyWork(capability).pipe(Effect.map(policy=>({...policy,spawn:()=>{throw new Error('injected before spawn state change')}})))
 let registrations=0
 context.deps.residentRegisterCurrentWork=(partition,input)=>lifecycle.residentRegisterCurrentWork(partition,input).pipe(Effect.tap(()=>Effect.gen(function*(){registrations++;if(mode==='retention-after-revision'&&registrations===1)yield* retire()})))
 try {
  if(mode==='retention-before-flow')await Effect.runPromise(retire())
  let continued
  try {
   const flow=()=>Effect.runPromise(postFlow(context,prepared,connection.preparation,observation,false))
   if(mode==='retention-fault-owner-claimed')await assert.rejects(flow,/injected after owner claim/)
   else if(mode==='retention-fault-after-revision')await assert.rejects(flow,/injected before spawn state change/)
   else continued=await flow()
   if(continued&&['retention-success','retention-cached-clear','retention-joined-claimed','retention-joined-pending'].includes(mode))await Effect.runPromise(completeSourcePreparation(context))
   if(mode==='retention-joined-pending') {
    const ownerUnits=[...run(transaction.read).records.reuse.pending.values()].filter(Boolean)
    assert.equal(ownerUnits.length,prepared.outcomes.filter(outcome=>outcome.status==='ready').length)
    const secondObservation=run(ledger.admitObservation('agent',connection.round))
    assert.equal(run(ledger.observation('agent',secondObservation,'startObservation',connection.round)),true)
    const secondPreparation=run(ledger.beginObservedPreparation('agent',secondObservation,1000,connection.round));assert.equal(secondPreparation.status,'admitted')
    job.canonicalObservationId=secondObservation;job.workObservationId=secondObservation;job.completed=false
    context.activeWorkspaces.add(secondPreparation.reservation)
    context.expectedActivityUnits.length=0
    continued=await Effect.runPromise(postFlow(context,prepared,secondPreparation,observation,false))
    assert.equal(continued,true);await Effect.runPromise(completeSourcePreparation(context))
    const snapshot=run(transaction.read)
    assert.equal(snapshot.records.dispatch.entries.size,ownerUnits.length);assert.equal(registrations,ownerUnits.length)
    for(const unit of ownerUnits){const entries=snapshot.records.joined.entries.get(unit.evaluationKey);assert.equal(entries.length,1);assert.equal(entries[0].admission,secondObservation);assert.equal(entries[0].revision,unit.revision);assert.equal(run(reuse.pending(unit.evaluationKey)),unit)}
   }
  } finally {
   // Workflow resource custody survives child failure as well as cancellation.
   for(const workspace of context.activeWorkspaces)await Effect.runPromise(ledger.release(workspace))
   for(const key of context.unassignedClaims)await Effect.runPromise(lifecycle.residentReleaseReuseClaim(key))
   if(!job.completed)await Effect.runPromise(ledger.observation('agent',job.canonicalObservationId,'interruptObservation',connection.round))
  }
  if(mode==='retention-success'||mode==='retention-joined-pending') {
   assert.equal(continued,true);assert.equal(registrations,prepared.outcomes.filter(outcome=>outcome.status==='ready').length)
   const snapshot=run(transaction.read),pending=[...snapshot.records.reuse.pending.values()].filter(Boolean)
   assert.equal(pending.length,registrations);assert.equal(snapshot.records.revision.current.size,registrations)
   const units=[...snapshot.records.dispatch.entries.values()].map(entry=>entry.value)
   assert.equal(units.length,registrations)
   for(const unit of units){assert.equal(unit.inspectionReceipt,receipt);assert.equal(unit.inspectionEvaluationId,'physical:'+unit.evaluationKey);assert.equal(unit.prepared.identity,prepared.outcomes.find(outcome=>outcome.status==='ready'&&outcome.prepared.input.declaration.name===unit.prepared.input.declaration.name).prepared.identity);assert.equal(unit.sourceHash,prepared.observation.outcomes[0].snapshot.sourceHash);assert.equal(run(ledger.revision.current(unit.revision,unit.prepared)),true);assert.equal(unit.workUnitId,unit.canonicalOperationId)}
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
   assert.equal(registrations,mode==='retention-after-revision'?1:0)
  }
  return {registrations,ready:prepared.outcomes.filter(outcome=>outcome.status==='ready').length}
 } finally {
  run(hold.open)
  await Effect.runPromise(Scope.close(scope,Exit.void))
  const pending=[...run(transaction.read).records.reuse.pending.values()].filter(Boolean)
  for(const unit of pending){await Effect.runPromise(lifecycle.residentReleaseUnit(unit));await Effect.runPromise(lifecycle.residentReleaseReuseClaim(unit.evaluationKey))}
  for(const key of seededKeys)if(mode==='retention-joined-claimed')await Effect.runPromise(lifecycle.residentReleaseReuseClaim(key))
  if(mode==='retention-cached-clear')await Effect.runPromise(reuse.clear())
  const terminal=run(transaction.read)
  assert.equal(terminal.reservations.size,0,mode+' reservations after cleanup')
  assert.equal(terminal.records.revision.current.size,0,mode+' revisions after cleanup')
  assert.equal(terminal.records.reuse.pending.size,0,mode+' claims after cleanup')
  assert.equal(terminal.records.dispatch.entries.size,0,mode+' dispatcher handles after cleanup')
 }
}
