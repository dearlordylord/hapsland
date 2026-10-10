import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {initialCanonical,projectCanonical} from '@hapsland/canonical-policy/canonical/adapter'
import {residentTransaction} from '../../../packages/resident-runtime/src/resident/state/resident/transaction.ts'
import {residentCapacity} from '../../../packages/resident-runtime/src/resident/state/resident/capacity.ts'
import {retireRound} from '../../../packages/resident-runtime/src/resident/state/capacity/rounds.ts'
import {completePreparation} from '../../../packages/resident-runtime/src/resident/state/capacity/preparation.ts'
import {createResidentOwnerTransaction} from './resident-owner-transaction.mjs'
const temp=await mkdtemp('/tmp/hapsland-resident-owner-')
try{
 const emitted=join(temp,'owner.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'CanonicalResolverOwner.bend'),'-o',emitted],{timeout:5000})
 const owner=(await import(pathToFileURL(emitted))).default
 const run=Effect.runSync,limits={globalItems:100,globalBytes:10000,partitionItems:16,partitionBytes:10000}
 let cases=0
 for(const variant of ['completed','interrupted','replaced','reset-recreated','rollback','single-action-consumer']){
  const records={runtime:{peakLedgerBytes:0},marker:0}
  const initial={residentLifetime:'fixture',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records}
  const ref=run(Ref.make(initial)),transaction=residentTransaction(ref,'fixture'),capacity=residentCapacity(transaction)
  const published=[]
  const bridge=createResidentOwnerTransaction({owner,transaction,onActions:actions=>Effect.sync(()=>{
   const snapshot=run(transaction.read)
   // Every effect sees already-published metadata, never an uncommitted draft.
   assert.ok(Object.isFrozen(snapshot.resolverCustody));published.push(...actions)
  })})
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent'))
  const observation=run(capacity.admitObservation('agent',round))
  assert.equal(run(capacity.observation('agent',observation,'startObservation',round)),true)
  const preparation=run(capacity.beginObservedPreparation('agent',observation,100,round))
  assert.equal(preparation.status,'admitted')
  const scope={$:'Scope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),preparation:BigInt(preparation.operation)}
  const event=(name,fields={})=>run(bridge.event({$:name,...fields}))
  for(const input_handle of [50n,51n])assert.equal(event('LaunchEvent',{scope,input_handle}).refusal,undefined)
  assert.deepEqual(published.map(x=>x.invocation),[1n,2n])
  assert.equal('canonical' in run(transaction.read).resolverCustody,false)
  event('InstallEvent',{invocation:1n,generation:0n,handle:11n,request:0n})
  event('ProviderStartEvent',{invocation:1n})
  const credential={invocation:1n,generation:0n,lease:1n,request:0n}
  for(const key of ['invocation','generation','lease','request']){
   const before=run(transaction.read)
   assert.throws(()=>run(bridge.nativeScoped({...credential,[key]:credential[key]+1n},(draft,nativeRecords)=>[undefined,{...nativeRecords,marker:999}])),/Revoked resident provider permit/)
   assert.strictEqual(run(transaction.read),before)
  }
  assert.equal(run(bridge.nativeScoped(credential,(draft,nativeRecords)=>['permitted',nativeRecords])).value,'permitted')
  // Opaque owner identity changes between the helper lookup and its commit.
  const originalPending={revision:undefined},replacementPending={revision:undefined}
  run(bridge.native((draft,nativeRecords)=>[undefined,{...nativeRecords,reuse:{pending:new Map([['opaque-pending',originalPending]])}}]))
  const lookedUp=run(transaction.read).records.reuse.pending.get('opaque-pending')
  run(bridge.native((draft,nativeRecords)=>[undefined,{...nativeRecords,reuse:{pending:new Map([['opaque-pending',replacementPending]])}}]))
  const beforeRestore=run(transaction.read);let attemptedRestore=false
  assert.throws(()=>run(bridge.nativeRestorePending(credential,{key:'opaque-pending',owner:lookedUp},(draft,nativeRecords)=>{attemptedRestore=true;return [undefined,nativeRecords]})),/Pending revision owner changed/)
  assert.equal(attemptedRestore,false);assert.strictEqual(run(transaction.read),beforeRestore)

  if(variant==='single-action-consumer'){
   const before=published.length
   const step=bridge.control.invoke('cancel',[1n])
   assert.equal(step.$,'Advanced');assert.equal(step.actions.head.$,'CancelChild')
   assert.equal(published.length,before,'driver control does not also deliver actions to external sink')
   cases++;continue
  }
  if(variant==='rollback'){
   const before=run(transaction.read)
   assert.throws(()=>run(bridge.native((draft,nativeRecords)=>{
    draft.resolverCustody=owner.initial_custody();draft.roundIds.clear();throw new Error('fixture rollback')
   })),/fixture rollback/)
   assert.strictEqual(run(transaction.read),before)
   assert.equal(published.length,3);cases++;continue
  }
  if(variant==='completed'){
   event('ProviderCompletedEvent',{invocation:1n,lease:1n,request:0n,reply_handle:60n})
   assert.equal(event('TerminalEvent',{invocation:1n,generation:0n,result_handle:70n}).refusal.$,'WrongPhase')
   event('TerminalEvent',{invocation:1n,generation:1n,result_handle:70n})
   assert.equal(event('TerminalEvent',{invocation:1n,generation:1n,result_handle:70n}).refusal.$,'WrongPhase')
   event('TerminalEvent',{invocation:2n,generation:0n,result_handle:71n})
   const completed=run(bridge.native((draft,nativeRecords)=>[
    completePreparation(draft,'agent',preparation.operation,preparation.reservation,[10,20],round),{...nativeRecords,marker:1}
   ]))
   assert.equal(completed.value.length,2)
   const snapshot=run(transaction.read),projection=projectCanonical(snapshot.canonical)
   assert.equal(snapshot.records.marker,1);assert.equal(projection.global.bytes,30)
   assert.equal(snapshot.reservations.size,2)
   assert.equal(snapshot.records.runtime.peakLedgerBytes,100)
   assert.equal(published.filter(x=>x.$==='AcceptResult').length,2)
  }else{
   if(variant==='interrupted')run(bridge.canonical({kind:'interruptPreparation',partition,lifetime:1,round,operation:preparation.operation}))
   else if(variant==='reset-recreated')run(bridge.native((draft,nativeRecords)=>{
    const original=draft.canonical
    draft.canonical=initialCanonical(limits)
    draft.canonical=original
    return [undefined,nativeRecords]
   }))
   else run(bridge.native((draft,nativeRecords)=>{retireRound(draft,'agent',round);return [undefined,{...nativeRecords,marker:1}]}))
   const beforeDenied=run(transaction.read)
   assert.throws(()=>run(bridge.nativeScoped(credential,(draft,nativeRecords)=>[undefined,{...nativeRecords,marker:999}])),/Revoked resident provider permit/)
   assert.strictEqual(run(transaction.read),beforeDenied)
   const late=event('ProviderCompletedEvent',{invocation:1n,lease:1n,request:0n,reply_handle:60n})
   assert.deepEqual(late.actions.map(x=>x.$),['CleanupProvider'])
   assert.equal(event('ProviderCompletedEvent',{invocation:1n,lease:1n,request:0n,reply_handle:60n}).refusal.$,'WrongLease')
   assert.equal(event('TerminalEvent',{invocation:1n,generation:1n,result_handle:70n}).refusal.$,'WrongPhase')
   assert.equal(published.filter(x=>x.$==='Resume'||x.$==='AcceptResult').length,0)
   assert.equal(published.filter(x=>x.$==='CancelChild').length,2)
   assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,variant==='reset-recreated'?100:0)
   if(variant==='replaced')assert.equal(run(transaction.read).reservations.size,0)
  }
  cases++
 }
 // Interrupt during the post-commit sink. Cleanup delivery is masked through
 // every action; this checks the actual Effect runtime rather than only syntax.
 {
  const limits={globalItems:100,globalBytes:10000,partitionItems:16,partitionBytes:10000}
  const initial={residentLifetime:'delivery',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0}}}
  const ref=run(Ref.make(initial)),transaction=residentTransaction(ref,'delivery'),capacity=residentCapacity(transaction)
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observation=run(capacity.admitObservation('agent',round))
  run(capacity.observation('agent',observation,'startObservation',round))
  const preparation=run(capacity.beginObservedPreparation('agent',observation,100,round))
  let interrupt=false
  const controller=new AbortController(),delivered=[]
  const bridge=createResidentOwnerTransaction({owner,transaction,onActions:actions=>Effect.gen(function*(){
   if(interrupt)yield* Effect.sync(()=>controller.abort())
   if(interrupt)yield* Effect.sleep('1 millis')
   yield* Effect.sync(()=>delivered.push(...actions))
  })})
  const scope={$:'Scope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),preparation:BigInt(preparation.operation)}
  run(bridge.event({$:'LaunchEvent',scope,input_handle:50n}))
  run(bridge.event({$:'InstallEvent',invocation:1n,generation:0n,handle:11n,request:0n}))
  run(bridge.event({$:'ProviderStartEvent',invocation:1n}))
  interrupt=true
  await Effect.runPromise(bridge.canonical({kind:'interruptPreparation',partition,lifetime:1,round,operation:preparation.operation}),{signal:controller.signal}).catch(()=>undefined)
  assert.equal(controller.signal.aborted,true)
  assert.deepEqual(delivered.slice(-2).map(x=>x.$),['CancelChild','RetireHandle'])
  assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
  cases++
 }
 console.log(JSON.stringify({passed:true,cases,scope:'actual resident transaction/capacity admission and completion, one canonical state plus custody, after-commit actions, native retirement reconciliation, late cleanup and rollback; physical driver and full preparation progression remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
