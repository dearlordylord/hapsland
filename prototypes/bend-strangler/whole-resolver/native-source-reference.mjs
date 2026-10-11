import fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
import {join} from 'node:path'
import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import {initialCanonical,projectCanonical} from '@hapsland/canonical-policy/canonical/adapter'
import {residentTransaction} from '../../../packages/resident-runtime/src/resident/state/resident/transaction.ts'
import {residentCapacity} from '../../../packages/resident-runtime/src/resident/state/resident/capacity.ts'
import {captureStable} from '../../../packages/native-observation/dist/direct-event/capture.js'
import {makeResidentPreparation} from '../../../packages/resident-runtime/src/resident/review-work/preparation/workflow.ts'
import * as credentials from '../../../packages/resident-runtime/src/resident/authorization/credentials.ts'
import {createResidentOwnerTransaction} from './resident-owner-transaction.mjs'
import {createResidentRetentionContext} from './resident-retention-context.mjs'

// Observe successful physical marker publication, without using a workflow
// selector. Both independent worlds receive the same wall-clock sample.
let activityCaptureActive=false
export function captureActivityPublications(statePath,trace,now=1000){
 assert.equal(activityCaptureActive,false,'activity worlds must run sequentially')
 activityCaptureActive=true
 const rename=fs.renameSync,clock=Date.now,errors=[]
 fs.renameSync=function(source,target,...args){
  const result=rename.call(this,source,target,...args)
  if(typeof target==='string'&&target.startsWith(statePath+'/')){
   try{trace.push({kind:'activity',marker:JSON.parse(fs.readFileSync(target,'utf8'))})}
   catch(error){errors.push(error)}
  }
  return result
 }
 Date.now=()=>now
 syncBuiltinESMExports()
 let closed=false
 return {close(){
  if(closed)return
  closed=true;fs.renameSync=rename;Date.now=clock;syncBuiltinESMExports();activityCaptureActive=false
  assert.deepEqual(errors,[],'physical activity observer must not lose publications')
 }}
}

export const snapshotReservationCustody=snapshot=>({reservations:[...snapshot.reservations].map(([id,value])=>({id,bytes:value.bytes,purpose:value.purpose})),bytes:projectCanonical(snapshot.canonical).global.bytes})

// Mechanical observation of real pointers, preserving dispatch order and IDs.
export function snapshotSourceOwnership(snapshot){
 const owners=[...snapshot.records.dispatch.entries.values()].map(entry=>{
  const unit=entry.value,reservation=snapshot.reservations.get(unit.reservation.id),revision=snapshot.records.revision.current.get(unit.revision.subject)
  assert.strictEqual(reservation?.capability,unit.reservation)
  assert.strictEqual(snapshot.records.reuse.pending.get(unit.evaluationKey),unit)
  assert.equal(revision?.token,unit.revision.token);assert.equal(revision.generation,unit.revision.generation)
  return {operation:unit.canonicalOperationId,round:unit.canonicalRound,reservation:unit.reservation.id,reservationBytes:reservation.bytes,purpose:reservation.purpose,evaluationKey:unit.evaluationKey,revisionSubject:unit.revision.subject,revisionGeneration:unit.revision.generation,inputIdentity:revision.inputIdentity}
 })
 return {owners,reservations:snapshot.reservations.size,revisions:snapshot.records.revision.current.size,pending:snapshot.records.reuse.pending.size,dispatch:snapshot.records.dispatch.entries.size,bytes:projectCanonical(snapshot.canonical).global.bytes}
}

// Independent actual production workflow oracle. No Source/Preparation/Post
// selector is used; the native entry owns all candidates and finalizers.
export async function nativeSourceReference({owner,root,rootIdentity,candidates,nativePatchCommand,settings,limits,refuseSecond=false,ownerBarrierFailure=false,captureFailure,inspectionFailure,diagnosticFailure,analyticsCause,activityRefused=false}){
 const run=Effect.runSync
 const initial={residentLifetime:'physical',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0}}}
 const transaction=residentTransaction(run(Ref.make(initial)),'physical'),capacity=residentCapacity(transaction)
 const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observationId=run(capacity.admitObservation('agent',round))
 const bridge=createResidentOwnerTransaction({owner,transaction})
 const shared=await createResidentRetentionContext({transaction,bridge,partition,round},root,rootIdentity,{observation:{root,rootIdentity,candidates,...(nativePatchCommand===undefined?{}:{nativePatchCommand})}})
 const {context,scope,hold,lifecycle}=shared,trace=[]
 context.job.observation.advicee=shared.identity
 context.job.canonicalObservationId=observationId
 context.job.settings=settings
 context.job.dispatch.controlled={}
 context.job.dispatch.activityPath=join(root,activityRefused?'.native-activity-refused':'.native-activity')
 if(activityRefused)fs.writeFileSync(context.job.dispatch.activityPath,'blocked directory')
 context.job.reservation=run(capacity.reserve('agent',32,'observationDispatch'));assert.ok(context.job.reservation)
 Object.assign(context.deps,{runtimeConfiguration:{debug:false},residentAwaitBackendGate:()=>Effect.void,residentCredentialRequired:credentials.residentCredentialRequired,residentCredentialShapeMatches:credentials.residentCredentialShapeMatches,residentCredentialGenerationCurrent:credentials.residentCredentialGenerationCurrent})
 if(ownerBarrierFailure)context.deps.residentPreparationControls={...context.deps.residentPreparationControls,afterReuseBoundary:phase=>phase==='ownerClaimed'?Effect.fail(new Error('injected owner barrier failure')):Effect.void}
 context.deps.residentInspection={...context.deps.residentInspection,preparationPorts:()=>({}),observePreparation:(_job,value)=>{trace.push({kind:'prepared',value});if(inspectionFailure)throw inspectionFailure},observeDiagnostic:(_receipt,path,_candidate,value)=>{trace.push({kind:'diagnostic',path,value,custody:snapshotReservationCustody(run(transaction.read))});if(diagnosticFailure)throw diagnosticFailure}}
  let admissionCalls=0
 const begin=context.deps.residentLedger.beginObservedPreparation,resize=context.deps.residentLedger.resize
 context.deps.residentLedger.beginObservedPreparation=(partition,observation,bytes,round)=>begin(partition,observation,refuseSecond&&++admissionCalls===2?200000000:bytes,round).pipe(Effect.tap(value=>Effect.sync(()=>trace.push({kind:'admission',bytes,status:value.status}))))
 context.deps.residentLedger.resize=(reservation,bytes)=>resize(reservation,bytes).pipe(Effect.tap(value=>Effect.sync(()=>trace.push({kind:'resize',bytes,status:value.status}))))
 context.deps.residentCaptureSource=(root,selected,...args)=>(captureFailure?Effect.sync(()=>trace.push({kind:'capture-failure',path:selected.relativePath})).pipe(Effect.andThen(Effect.fail(captureFailure))):captureStable(root,selected,...args)).pipe(Effect.tap(value=>Effect.sync(()=>trace.push({kind:'capture',path:selected.relativePath,status:value.status,...(value.status==='captured'?{contentHash:value.capture.contentHash,bytes:value.capture.byteLength}:{diagnostic:value.diagnostic})}))))
 context.deps.residentRecordAnalytics=(_job,event,findings)=>Effect.sync(()=>trace.push({kind:'analytics',event,...(findings===undefined?{}:{findings})})).pipe(Effect.andThen(analyticsCause&&event==='incomplete-candidate'?Effect.failCause(analyticsCause):Effect.void))
 try{
  const activity=captureActivityPublications(context.job.dispatch.activityPath,trace)
  let exit
  try{exit=await Effect.runPromiseExit(makeResidentPreparation(context.deps).residentPrepare(context.job,context.sequence))}finally{activity.close()}
  const snapshot=run(transaction.read),units=[...snapshot.records.dispatch.entries.values()].map(entry=>entry.value)
  return {exitCause:Exit.isFailure(exit)?exit.cause:undefined,completed:context.job.completed===true,canonical:projectCanonical(snapshot.canonical),units:units.map(unit=>({prepared:unit.prepared,evaluationKey:unit.evaluationKey,sourceHash:unit.sourceHash,path:unit.observation.candidates[0].path})),trace,ownership:snapshotSourceOwnership(snapshot)}
 }finally{
  run(hold.open);await Effect.runPromise(Scope.close(scope,Exit.void))
  for(const unit of [...run(transaction.read).records.reuse.pending.values()].filter(Boolean)){await Effect.runPromise(lifecycle.residentReleaseUnit(unit));await Effect.runPromise(lifecycle.residentReleaseReuseClaim(unit.evaluationKey))}
  const terminal=run(transaction.read);assert.equal(terminal.reservations.size,0);assert.equal(terminal.records.revision.current.size,0);assert.equal(terminal.records.reuse.pending.size,0);assert.equal(terminal.records.dispatch.entries.size,0)
 }
}
