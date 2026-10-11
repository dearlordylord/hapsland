import assert from 'node:assert/strict'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {initialCanonical,projectCanonical} from '@hapsland/canonical-policy/canonical/adapter'
import {residentTransaction} from '../resident/transaction.ts'
import {residentCapacity} from '../resident/capacity.ts'
import {retireRound} from '../capacity/rounds.ts'
import {completePreparation} from '../capacity/preparation.ts'
import {residentAdvice} from '../resident/advice.ts'
import {residentRevision} from '../resident/revision.ts'
import {initialRevision} from '../revision.ts'
import {initialAdviceRecords} from '../advice-records.ts'
import {initialJoinedReviews} from '../joined-reviews.ts'
import {initialDelivery} from '../delivery/operations.ts'
import {createOwnedArtifactDriver} from '../../review-work/composition/owned-artifact-driver.mjs'
import {createAdviceTailMachine} from '../../review-work/preparation/post-preparation-dispatcher.mjs'
import {createAdviceTailProvider} from '../../review-work/evaluation/advice-tail-provider.mjs'
import {createServiceRegistry} from '../../../../../source-analysis/src/direct-event/graph-resolution/service-session.mjs'
import {createResidentOwnerTransaction} from './resident-owner-transaction.mjs'
const temp=await mkdtemp('/tmp/hapsland-resident-owner-')
try{
 const emitted=join(temp,'owner.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'../../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend'),'-o',emitted],{timeout:5000})
 const owner=(await import(pathToFileURL(emitted))).default
 const postEmission=join(temp,'post.mjs')
 execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'../../review-work/preparation/PostPreparation.bend'),'-o',postEmission],{timeout:5000})
 const postCore=(await import(pathToFileURL(postEmission))).default,tailMachine=createAdviceTailMachine(postCore)
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
 // Actual advice/capacity/revision owners qualify the closed tail API. Source
 // values are controlled handles here; full preparation IO has its own consumer.
 for(const releaseMode of ['normal','ack-loss','replacement']){
  const limits={globalItems:100,globalBytes:10000,partitionItems:16,partitionBytes:10000}
  const initial={residentLifetime:'source-completion',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0}}}
  const ref=run(Ref.make(initial)),transaction=residentTransaction(ref,'source-completion'),capacity=residentCapacity(transaction)
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observation=run(capacity.admitObservation('agent',round))
  assert.equal(run(capacity.observation('agent',observation,'startObservation',round)),true)
  const bridge=createResidentOwnerTransaction({owner,transaction})
  const original=run(capacity.reserve('agent',32,'observationDispatch'));assert.ok(original)
  bridge.bindSourceReservation(1n,original)
  const event=input=>{const result=run(bridge.event(input));assert.equal(result.refusal,undefined);return result}
  event({$:'LaunchSourceEvent',scope:{$:'SourceScope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),observation:BigInt(observation),permission:{$:'SourceNew'}},input_handle:1n})
  event({$:'InstallSourceEvent',invocation:1n,generation:0n,handle:2n,request:0n,permission:{$:'SourceActivity'}})
  event({$:'ProviderStartEvent',invocation:1n})
  event({$:'ProviderCompletedEvent',invocation:1n,lease:1n,request:0n,reply_handle:3n})
  event({$:'InstallSourceEvent',invocation:1n,generation:1n,handle:4n,request:1n,permission:{$:'SourceObservation'}})
  event({$:'ProviderStartEvent',invocation:1n})
  const credential={invocation:1n,generation:1n,lease:2n,request:1n}
  assert.throws(()=>run(bridge.nativeScoped(credential,()=>{throw new Error('must never enter callback')})),/requires its closed operation/)
  let committed
  assert.throws(()=>run(bridge.completeSourceObservation(credential,result=>{committed=result;throw new Error('injected source completion ack loss')})),/source completion ack loss/)
  assert.equal(owner.find(1n,run(transaction.read).resolverCustody.children).value.scope.$,'AfterSourceScope')
  assert.equal(committed.outputs.filter(output=>output.$==='Canonical.EventEstablished'&&output.event.$==='Canonical.ObservationCompleted').length,1)
  assert.equal(committed.actions.some(action=>action.$==='CancelChild'&&action.invocation===1n),false)
  const completed=run(transaction.read)
  assert.throws(()=>run(bridge.completeSourceObservation(credential)),/completion refused/);assert.strictEqual(run(transaction.read),completed)
  assert.throws(()=>run(bridge.nativeScoped(credential,()=>{throw new Error('must never enter callback')})),/forbids native mutations/)
  event({$:'ProviderCompletedEvent',invocation:1n,lease:2n,request:1n,reply_handle:5n})
  event({$:'InstallAfterSourceEvent',invocation:1n,generation:2n,handle:6n,request:2n,permission:{$:'AfterBarrier'}})
  event({$:'ProviderStartEvent',invocation:1n});event({$:'ProviderCompletedEvent',invocation:1n,lease:3n,request:2n,reply_handle:7n})
  event({$:'InstallAfterSourceEvent',invocation:1n,generation:3n,handle:8n,request:3n,permission:{$:'AfterRecoveryAnalytics'}})
  event({$:'ProviderStartEvent',invocation:1n});event({$:'ProviderCompletedEvent',invocation:1n,lease:4n,request:3n,reply_handle:9n})
  event({$:'InstallAfterSourceEvent',invocation:1n,generation:4n,handle:10n,request:4n,permission:{$:'AfterRecoveryRelease'}})
  event({$:'ProviderStartEvent',invocation:1n})
  const releaseCredential={invocation:1n,generation:4n,lease:5n,request:4n}
  assert.throws(()=>bridge.forgetSourceReservation(1n),/Source authority remains active/)
  assert.throws(()=>bridge.bindSourceReservation(1n,original),/before invocation launch/)
  assert.throws(()=>run(bridge.releaseSourceReservation({...releaseCredential,request:3n})),/Revoked resident provider permit/)
  let replacement
  if(releaseMode==='replacement'){
   replacement=Object.freeze({...original})
   run(transaction.commitAllEffect((draft,records)=>{const retained=draft.reservations.get(original.id);draft.reservations.set(original.id,{...retained,capability:replacement});return [undefined,records]}))
  }
  let released
  if(releaseMode==='ack-loss')assert.throws(()=>run(bridge.releaseSourceReservation(releaseCredential,result=>{released=result;throw new Error('source release ack loss')})),/source release ack loss/)
  else released=run(bridge.releaseSourceReservation(releaseCredential))
  assert.equal(released.value,releaseMode!=='replacement')
  if(replacement)assert.strictEqual(run(transaction.read).reservations.get(original.id).capability,replacement)
  else assert.equal(run(transaction.read).reservations.has(original.id),false)
  assert.equal(run(bridge.releaseSourceReservation(releaseCredential)).value,false)
  event({$:'ProviderCompletedEvent',invocation:1n,lease:5n,request:4n,reply_handle:11n})
  assert.throws(()=>run(bridge.releaseSourceReservation(releaseCredential)),/Revoked resident provider permit/)
  event({$:'TerminalEvent',invocation:1n,generation:5n,result_handle:12n})
  bridge.forgetSourceReservation(1n)
  assert.throws(()=>bridge.bindSourceReservation(1n,original),/before invocation launch/)
  if(replacement)run(capacity.release(replacement))
  assert.equal(owner.find(1n,run(transaction.read).resolverCustody.children).value.phase.$,'ChildAccepted')
  cases++
 }
 // Exact source interruption is atomic with custody, including a leased child.
 for(const variant of ['failed','cancel-leased','absent']){
  const initial={residentLifetime:'source-interruption',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0}}}
  const ref=run(Ref.make(initial)),transaction=residentTransaction(ref,'source-interruption'),capacity=residentCapacity(transaction)
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observation=run(capacity.admitObservation('agent',round))
  run(capacity.observation('agent',observation,'startObservation',round))
  const bridge=createResidentOwnerTransaction({owner,transaction}),event=input=>run(bridge.event(input))
  const sourceScope={$:'SourceScope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),observation:BigInt(observation),permission:{$:'SourceNew'}}
  event({$:'LaunchSourceEvent',scope:sourceScope,input_handle:1n})
  const beforeGeneric=run(transaction.read)
  assert.equal(event({$:'TerminalEvent',invocation:1n,generation:0n,result_handle:9n}).refusal.$,'WrongPhase');assert.deepEqual(run(transaction.read),beforeGeneric)
  let preparation
  if(variant==='cancel-leased'){
   preparation=run(capacity.beginObservedPreparation('agent',observation,100,round))
   event({$:'InstallSourceEvent',invocation:1n,generation:0n,handle:2n,request:0n,permission:{$:'SourceCandidate'}})
   event({$:'ProviderStartEvent',invocation:1n})
   event({$:'LaunchSourcePreparationEvent',parent:{$:'Parent',invocation:1n,generation:0n,request:0n},scope:{$:'PreparationScope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),preparation:BigInt(preparation.operation)},input_handle:3n})
   event({$:'InstallEvent',invocation:2n,generation:0n,handle:4n,request:0n});event({$:'ProviderStartEvent',invocation:2n})
  }
  if(variant==='absent')assert.equal(run(capacity.observation('agent',observation,'completeObservation',round)),true)
  const before=run(transaction.read)
  const result=event(variant==='cancel-leased'?{$:'CancelEvent',invocation:1n}:{$:'TerminalSourceFailedEvent',invocation:1n,generation:0n,result_handle:9n})
  if(variant==='wrong-stage'){
   assert.equal(result.refusal.$,'CanonicalRejected');assert.equal(result.refusal.reason.$,'../../../packages/agent-flow-bend/Canonical.WrongStage');assert.deepEqual(run(transaction.read),before);cases++;continue
  }
  assert.equal(result.refusal,undefined)
  assert.equal(result.outputs.filter(output=>output.$==='Canonical.EventEstablished'&&output.event.$==='Canonical.ObservationInterrupted').length,variant==='absent'?0:1)
  const snapshot=run(transaction.read),child=owner.find(1n,snapshot.resolverCustody.children).value
  assert.equal(child.phase.$,variant==='cancel-leased'?'ChildCancelled':'ChildAccepted')
  assert.equal(result.actions.some(action=>action.$==='AcceptResult'&&action.result_handle===9n),variant!=='cancel-leased')
  if(variant==='cancel-leased'){
   assert.equal(child.lease.$,'Some');assert.equal(owner.find(2n,snapshot.resolverCustody.children).value.phase.$,'ChildCancelled')
   for(const [invocation,lease] of [[1n,1n],[2n,2n]]){
    const late=event({$:'ProviderCompletedEvent',invocation,lease,request:0n,reply_handle:8n})
    assert.equal(late.actions.some(action=>action.$==='Resume'),false);assert.equal(late.actions.filter(action=>action.$==='CleanupProvider').length,1)
   }
   run(capacity.release(preparation.reservation))
  }
  cases++
 }
 for(const tailVariant of ['normal','missing-publish','driver-active-false','driver-cleanup-pending','driver-barrier-failure','driver-expired-failure','driver-fate-ack-failure','driver-observer-pending','driver-construction-failure']){
  const limits={globalItems:100,globalBytes:100000,partitionItems:16,partitionBytes:100000}
  const initial={residentLifetime:'advice-tail',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0},revision:initialRevision(),advice:initialAdviceRecords(),joined:initialJoinedReviews(),delivery:initialDelivery(),adviceCaptures:new Map()}}
  const ref=run(Ref.make(initial)),transaction=residentTransaction(ref,'advice-tail'),capacity=residentCapacity(transaction),revision=residentRevision(transaction),advice=residentAdvice(transaction)
  let adviceDriver,deliverTail=false
  const adviceInputs=new Map([[4n,2n],[5n,2n]])
  const bridge=createResidentOwnerTransaction({owner,transaction,validateAdviceInput:(origin,handle)=>adviceDriver?adviceDriver.validateAdviceInput(origin,handle):adviceInputs.get(handle)===origin,onActions:actions=>Effect.sync(()=>{if(deliverTail)adviceDriver.acceptActions(actions)})}),event=input=>run(bridge.event(input))
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observation=run(capacity.admitObservation('agent',round));run(capacity.observation('agent',observation,'startObservation',round))
  const preparation=run(capacity.beginObservedPreparation('agent',observation,100,round)),scope={$:'Scope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),preparation:BigInt(preparation.operation)}
  event({$:'LaunchPreparationEvent',scope,input_handle:1n});event({$:'TerminalPreparationEvent',invocation:1n,generation:0n,result_handle:2n})
  const allocations=run(bridge.native((draft,records)=>[completePreparation(draft,'agent',preparation.operation,preparation.reservation,[100,100],round),records])).value
  assert.equal(allocations.length,2)
  const prepared={root:'/controlled',advicee:{host:'codex',session:'controlled'},identity:'controlled-advice',input:{path:'root.py',declaration:{name:'Root'}}}
  const findings=[{path:'root.py',declaration:'Root',ruleId:'fixture',probability:1,message:'controlled',semanticIdentity:prepared.identity}]
  const revisions=allocations.map(()=>run(revision.register('controlled',prepared,true,'shared-advice')).revision)
  for(const allocation of allocations){assert.equal(run(capacity.startReview('agent',allocation.operation,round)),true);assert.equal(run(capacity.completeReview('agent',allocation.operation,allocation.reservation,'finding',round)),true)}
  const initialAdvice=index=>({settings:{},id:'same-native-id',analyticsPath:undefined,analyticsEnabled:false,analyticsControlled:false,canonicalRound:round,admissionId:observation,canonicalOperationId:allocations[index].operation,observation:{root:'/controlled',advicee:prepared.advicee},partition:'agent',reservation:allocations[index].reservation,prepared,revision:revisions[index],evaluationKey:'controlled:'+index,sequence:index+1,credentialGeneration:null,credentialStatePath:null,credentialRequired:false,credentialEnvironmentOnly:false,pendingAt:0,evaluations:[{prepared,findings}],findings})
  event({$:'InstallEvent',invocation:2n,generation:0n,handle:3n,request:0n});event({$:'ProviderStartEvent',invocation:2n})
  const birthCredential={invocation:2n,generation:0n,lease:1n,request:0n}
  const beforeBirth=run(transaction.read)
  assert.throws(()=>run(bridge.adviceInsertAndHandoff({...birthCredential,lease:99n},initialAdvice(0),4n)),/Revoked/);assert.strictEqual(run(transaction.read),beforeBirth)
  // An otherwise valid insertion with a foreign canonical operation must roll back.
  assert.throws(()=>run(bridge.adviceInsertAndHandoff(birthCredential,{...initialAdvice(0),canonicalOperationId:999},4n)));assert.strictEqual(run(transaction.read),beforeBirth)
  let birthReceipt
  const registry=createServiceRegistry()
  if(tailVariant.startsWith('driver-')){
   adviceDriver=createOwnedArtifactDriver({owner,control:bridge.control,registry,machine:tailMachine,selectMachine:()=>{if(tailVariant==='driver-construction-failure')throw new Error('injected tail constructor failure');return tailMachine},foreign:async([request],options)=>await registry.get(Number(request.invocation)).perform(request,options)})
   const input=adviceDriver.prepareAdviceInput(2n,{})
   assert.equal(input,1n);assert.equal(adviceDriver.validateAdviceInput(99n,input),false);deliverTail=true
  }
  const birthInput=tailVariant.startsWith('driver-')?1n:4n
  assert.throws(()=>run(bridge.adviceInsertAndHandoff(birthCredential,initialAdvice(0),birthInput,publication=>{birthReceipt=publication.adviceReceipt;throw new Error('injected advice insertion acknowledgement loss')})),/acknowledgement loss/)
  const capability=birthReceipt.capability
  assert.strictEqual(run(advice.values())[0],capability);assert.strictEqual(bridge.adviceReceipts[0],birthReceipt);assert.equal(birthReceipt.invocation,3n);assert.equal(birthReceipt.scope.lifetime,1n)
  assert.equal(owner.find(3n,run(transaction.read).resolverCustody.children).value.phase.$,'ChildInstalling')
  const afterBirth=run(transaction.read)
  assert.throws(()=>run(bridge.adviceInsertAndHandoff(birthCredential,initialAdvice(0),5n)));assert.strictEqual(run(transaction.read),afterBirth,'duplicate birth does not publish native replacement')
  if(tailVariant.startsWith('driver-')){
   deliverTail=false
   event({$:'CancelEvent',invocation:2n})
   const lifetimeController=new AbortController()
   let cleanupFails=tailVariant==='driver-cleanup-pending',observerFails=tailVariant==='driver-observer-pending',ackFails=tailVariant==='driver-fate-ack-failure'
   const fates=[]
   const tailOptions={signal:lifetimeController.signal,afterCommit:command=>{if(command.$==='AdviceRemove'&&ackFails){ackFails=false;throw new Error('injected removal acknowledgement failure')}}}
   const observeAdviceFate=(actual,actualFindings,fate,reason)=>{if(observerFails)throw new Error('injected observer failure before offer');assert.strictEqual(actual,capability);assert.deepEqual(actualFindings,findings);fates.push({fate,reason})}
   const tailBridge={...bridge,adviceTailRemove:(...args)=>cleanupFails?Effect.fail(new Error('injected pending removal failure')):bridge.adviceTailRemove(...args),adviceCleanup:(...args)=>cleanupFails?Effect.fail(new Error('injected registry cleanup failure')):bridge.adviceCleanup(...args)}
   const provider=createAdviceTailProvider(3n,tailBridge,capability,{},{retirementForExpired:postCore.advice_retirement,deps:{residentReviewControls:{afterAdvicePending:()=>tailVariant!=='driver-active-false'?Effect.fail(new Error('injected pending advice barrier failure')):Effect.void},residentLifetimeController:lifetimeController,residentNow:()=>0,residentAdviceExpired:()=>Effect.succeed(tailVariant==='driver-expired-failure'),residentInspection:{observeAdviceFate},residentJobActive:()=>Effect.succeed(false)}})
   if(tailVariant==='driver-construction-failure'){
    await assert.rejects(adviceDriver.driveAdvice(adviceDriver.adviceHandoff(3n),provider,tailOptions),/injected tail constructor failure/)
    assert.equal(owner.find(3n,run(transaction.read).resolverCustody.children).value.phase.$,'ChildAccepted')
    assert.equal(run(advice.values()).length,0);assert.equal(registry.pendingCleanup,0)
    assert.deepEqual(adviceDriver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0})
    assert.deepEqual(fates,[{fate:'discarded',reason:'retention-failed'}])
    run(capacity.release(allocations[1].reservation));run(revision.release(revisions[1]));assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
    cases++;continue
   }
   if(tailVariant==='driver-cleanup-pending'||tailVariant==='driver-observer-pending'){
    await assert.rejects(adviceDriver.driveAdvice(adviceDriver.adviceHandoff(3n),provider,tailOptions),/cleanup remains incomplete/)
    assert.equal(registry.size,0);assert.equal(registry.pendingCleanup,1);if(tailVariant==='driver-cleanup-pending')assert.strictEqual(run(advice.values())[0],capability);else assert.equal(run(advice.values()).length,0)
    await assert.rejects(registry.retryCleanup(),/obligations remain pending/);assert.equal(registry.pendingCleanup,1)
    cleanupFails=false;observerFails=false;await registry.retryCleanup();assert.equal(registry.pendingCleanup,0);assert.equal(run(advice.values()).length,0)
    assert.equal(run(revision.current(revisions[1],prepared)),true);run(capacity.release(allocations[1].reservation));run(revision.release(revisions[1]));assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
    assert.deepEqual(fates,[{fate:'discarded',reason:'retention-failed'}]);cases++;continue
   }
   if(tailVariant!=='driver-active-false'){
    const outcome=await adviceDriver.driveAdvice(adviceDriver.adviceHandoff(3n),provider,tailOptions)
    assert.equal(outcome.adviceRetained,false);assert.equal(outcome.reason.$,'TechnicalFailure');assert.equal(outcome.reason.token,1n)
    assert.equal(run(advice.values()).length,0);assert.equal(registry.pendingCleanup,0)
    assert.deepEqual(fates,[tailVariant==='driver-expired-failure'?{fate:'expired',reason:'retention-expired'}:{fate:'discarded',reason:'retention-failed'}])
    assert.equal(run(revision.current(revisions[1],prepared)),true);run(capacity.release(allocations[1].reservation));run(revision.release(revisions[1]));assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
    assert.deepEqual(adviceDriver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});assert.equal(registry.size,0);cases++;continue
   }
   assert.deepEqual(await adviceDriver.driveAdvice(adviceDriver.adviceHandoff(3n),provider,{signal:lifetimeController.signal}),{adviceRetained:true})
   assert.strictEqual(run(advice.values())[0],capability,'completed advice survives parent cancellation and inactive work')
   assert.equal(owner.find(3n,run(transaction.read).resolverCustody.children).value.phase.$,'ChildAccepted')
   assert.deepEqual(adviceDriver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});assert.equal(registry.size,0)
   assert.equal(run(bridge.adviceCleanup(capability)),true);run(capacity.release(allocations[1].reservation));run(revision.release(revisions[1]));assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
   cases++;continue
  }
  const install=(generation,request,permission)=>event({$:'InstallAdviceEvent',invocation:3n,generation,handle:10n+request,request,permission:{$:permission}})
  const begin=()=>event({$:'ProviderStartEvent',invocation:3n}),complete=(lease,request)=>event({$:'ProviderCompletedEvent',invocation:3n,lease,request,reply_handle:20n+request})
  install(0n,0n,'TailBarrier');begin();complete(2n,0n);install(1n,1n,'TailActive');begin();complete(3n,1n);install(2n,2n,'TailPublish');begin()
  const credential={invocation:3n,generation:2n,lease:4n,request:2n};let attempted=false
  const before=run(transaction.read)
  assert.throws(()=>run(bridge.nativeScoped(credential,(draft,records)=>{attempted=true;return [undefined,records]})),/closed capability operation/);assert.equal(attempted,false);assert.strictEqual(run(transaction.read),before)
  assert.throws(()=>run(bridge.adviceTailPublish(credential,{...capability})),/issued tail receipt/);assert.strictEqual(run(transaction.read),before)
  if(tailVariant==='missing-publish')assert.equal(run(bridge.adviceCleanup(capability)),true)
  assert.deepEqual(run(bridge.adviceTailPublish(credential,capability)),[])
  complete(4n,2n);install(3n,3n,'TailRemove');begin()
  const cleanupCredential={invocation:3n,generation:3n,lease:5n,request:3n};let committedRemoval
  assert.throws(()=>run(bridge.adviceTailRemove(cleanupCredential,capability,publication=>{committedRemoval=publication.adviceOwnership;throw new Error('injected exact advice removal acknowledgement loss')})),/acknowledgement loss/)
  assert.equal(committedRemoval.presentBefore,tailVariant==='normal');assert.equal(committedRemoval.presentAfter,false);assert.equal(run(advice.values()).length,0);assert.equal(run(revision.current(revisions[1],prepared)),true)
  const replacement=run(advice.insert(initialAdvice(1)));assert.notStrictEqual(replacement,capability)
  const absent=run(bridge.adviceTailRemove(cleanupCredential,capability));assert.deepEqual(absent,{removed:false,absent:true});assert.strictEqual(run(advice.values())[0],replacement);assert.equal(run(revision.current(revisions[1],prepared)),true)
  assert.equal(run(bridge.adviceCleanup(capability)),false);assert.strictEqual(run(advice.values())[0],replacement)
  assert.equal(run(bridge.adviceCleanup(replacement)),true);assert.equal(run(revision.count()),0)
  complete(5n,3n);event({$:'TerminalEvent',invocation:3n,generation:4n,result_handle:40n});assert.equal(owner.find(3n,run(transaction.read).resolverCustody.children).value.phase.$,'ChildAccepted')
  assert.equal(projectCanonical(run(transaction.read).canonical).global.bytes,0)
  cases++
 }
 console.log(JSON.stringify({passed:true,cases,scope:'actual resident Ref/capacity/revision/advice owners; atomic insertion and independent Canonical advice-tail driver; revoked and duplicate birth rollback, insertion/removal ack loss, parent cancellation, expiry fate, absent publication and replacement identity, persistent resource/observer cleanup obligations; controlled source handles, full cached settlement and production adoption remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
