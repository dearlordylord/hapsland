import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createOwnedArtifactDriver} from './owned-artifact-driver.mjs'
import {createServiceRegistry} from './service-session.mjs'
const temp=await mkdtemp('/tmp/hapsland-canonical-owner-')
try {
 const emitted=join(temp,'owner.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'CanonicalResolverOwner.bend'),'-o',emitted],{timeout:5000});const m=(await import(pathToFileURL(emitted))).default
 const c=(name,fields={})=>({$:'../../../packages/agent-flow-bend/Canonical.'+name,...fields})
 const scope={$:'Scope',partition:1n,lifetime:1n,round:1n,preparation:2n}
 const list=value=>{const out=[];while(value.$==='Con'){out.push(value.head);value=value.tail}assert.equal(value.$,'Nil');return out}
 const advanced=value=>{assert.equal(value.$,'Advanced');return value.state}
 const reject=(value,reason)=>{assert.equal(value.$,'Rejected');assert.equal(value.refusal.$,reason)}
 const fresh=()=>{
  let s=m.initial_limits(100n,100000n,100n,100000n)
  for(const event of [c('OpenRound',{partition:1n,lifetime:1n}),c('AdmitObservation',{partition:1n,lifetime:1n,round:1n}),c('StartObservation',{partition:1n,lifetime:1n,round:1n,observation:1n}),c('BeginObservedPreparation',{partition:1n,lifetime:1n,round:1n,observation:1n,bytes:100n})])s=advanced(m.canonical_event(s,event))
  assert.equal(m.live(s.canonical,scope),true);return s
 }
 let assertions=0
 let invalidSource=fresh()
 const wrongScope={$:'SourceScope',partition:1n,lifetime:1n,round:1n,observation:2n,permission:{$:'SourceNew'}}
 invalidSource={...invalidSource,children:{$:'Con',head:{$:'Child',scope:wrongScope,invocation:1n,generation:0n,handle:0n,phase:{$:'ChildInstalling'},request:{$:'None'},lease:{$:'None'},parent:{$:'None'}},tail:{$:'Nil'}}}
 const refusedSource=m.terminal_source_failed(invalidSource,1n,0n,600n)
 reject(refusedSource,'CanonicalRejected');assert.equal(refusedSource.refusal.reason.$,'../../../packages/agent-flow-bend/Canonical.WrongStage');assert.deepEqual(refusedSource.state,invalidSource);assertions++
 let source=fresh()
 const sourceScope={$:'SourceScope',partition:1n,lifetime:1n,round:1n,observation:1n,permission:{$:'SourceNew'}}
 source=advanced(m.launch_source(source,sourceScope,400n))
 reject(m.launch_source(source,sourceScope,499n),'NotPreparing')
 reject(m.complete_source_observation(source,1n,0n,1n,0n),'WrongPhase')
 source=advanced(m.install_source(source,1n,0n,401n,0n,{$:'SourceCandidate'}))
 source=advanced(m.provider_start(source,1n))
 const sourceParent={$:'Parent',invocation:1n,generation:0n,request:0n}
 source=advanced(m.launch_source_preparation(source,sourceParent,{$:'PreparationScope',partition:1n,lifetime:1n,round:1n,preparation:2n},402n))
 assert.deepEqual(m.find(2n,source.children).value.parent.value,sourceParent)
 source=advanced(m.install(source,2n,0n,403n,0n));source=advanced(m.provider_start(source,2n))
 source=advanced(m.launch_nested(source,{$:'Parent',invocation:2n,generation:0n,request:0n},404n))
 assert.equal(m.find(3n,source.children).value.scope.$,'Scope')
 const sourceCancelled=advanced(m.cancel(source,1n))
 for(const invocation of [1n,2n,3n])assert.equal(m.find(invocation,sourceCancelled.children).value.phase.$,'ChildCancelled')
 reject(m.launch_nested(source,{$:'Parent',invocation:3n,generation:0n,request:0n},405n),'WrongPhase')
 source=advanced(m.terminal(source,3n,0n,406n));source=advanced(m.provider_completed(source,2n,2n,0n,407n))
 source=advanced(m.terminal_preparation(source,2n,1n,408n))
 assert.deepEqual(m.find(4n,source.children).value.parent.value,sourceParent)
 source=advanced(m.terminal(source,4n,0n,409n))
 source=advanced(m.provider_completed(source,1n,1n,0n,410n))
 source=advanced(m.install_source(source,1n,1n,411n,1n,{$:'SourceActivity'}));source=advanced(m.provider_start(source,1n))
 reject(m.complete_source_observation(source,1n,1n,3n,1n),'WrongPhase')
 source=advanced(m.provider_completed(source,1n,3n,1n,412n))
 source=advanced(m.install_source(source,1n,2n,413n,2n,{$:'SourceObservation'}));source=advanced(m.provider_start(source,1n))
 const sourceOut=m.complete_source_observation(source,1n,2n,4n,2n);source=advanced(sourceOut)
 assert.equal(m.find(1n,source.children).value.scope.$,'AfterSourceScope')
 assert.equal(list(sourceOut.actions).some(action=>action.$==='CancelChild'&&action.invocation===1n),false)
 reject(m.complete_source_observation(source,1n,2n,4n,2n),'WrongPhase')
 source=advanced(m.provider_completed(source,1n,4n,2n,414n))
 reject(m.install(source,1n,3n,415n,9n),'WrongGeneration')
 source=advanced(m.install(source,1n,3n,415n,3n));source=advanced(m.provider_start(source,1n))
 source=advanced(m.provider_completed(source,1n,5n,3n,416n))
 reject(m.install(source,1n,4n,418n,3n),'WrongGeneration')
 assert.equal(m.source_claimed(sourceScope,source.children),true)
 source=advanced(m.terminal(source,1n,4n,417n))
 assert.equal(m.find(1n,source.children).value.phase.$,'ChildAccepted')
 assertions+=12
 let s=fresh();reject(m.launch(s,{...scope,preparation:1n},50n),'NotPreparing');assertions++
 let out=m.launch(s,scope,50n);assert.deepEqual(list(out.actions),[{$:'Launch',invocation:1n,input_handle:50n}]);s=advanced(out)
 s=advanced(m.install(s,1n,0n,11n,0n));out=m.provider_start(s,1n);assert.deepEqual(list(out.actions),[{$:'ExecuteProvider',invocation:1n,lease:1n,request:0n,state_handle:11n}]);s=advanced(out);assertions+=2
 assert.equal(m.provider_live(s,1n,0n,1n,0n),true)
 for(const tuple of [[2n,0n,1n,0n],[1n,1n,1n,0n],[1n,0n,2n,0n],[1n,0n,1n,1n]])assert.equal(m.provider_live(s,...tuple),false)
 assert.equal(m.provider_live(advanced(m.cancel(s,1n)),1n,0n,1n,0n),false);assertions+=6
 reject(m.provider_completed(s,1n,2n,0n,60n),'WrongLease');reject(m.provider_completed(s,1n,1n,1n,60n),'WrongLease');assertions+=2
 out=m.provider_completed(s,1n,1n,0n,60n);assert.deepEqual(list(out.actions).map(x=>x.$),['Resume','RetireHandle','CleanupProvider']);s=advanced(out);assertions++
 reject(m.provider_completed(s,1n,1n,0n,60n),'WrongLease');reject(m.install(s,1n,0n,12n,1n),'WrongGeneration');assertions+=2
 out=m.terminal(s,1n,1n,70n);assert.deepEqual(list(out.actions),[{$:'AcceptResult',scope,invocation:1n,result_handle:70n}]);s=advanced(out)
 reject(m.terminal(s,1n,1n,70n),'WrongPhase');reject(m.cancel(s,1n),'WrongPhase');assertions+=3
 out=m.launch(s,scope,51n);assert.equal(list(out.actions)[0].invocation,2n);s=advanced(out);s=advanced(m.cancel(s,2n));reject(m.install(s,2n,0n,20n,0n),'WrongGeneration');assertions+=2
 for(const invalidate of ['cancel','round','observation','preparation']){
  let state=fresh();state=advanced(m.launch(state,scope,50n));state=advanced(m.install(state,1n,0n,11n,0n));state=advanced(m.provider_start(state,1n))
  let revoked
  if(invalidate==='cancel')revoked=m.cancel(state,1n)
  else revoked=m.canonical_event(state,invalidate==='round'?c('RetirePartition',{partition:1n,lifetime:1n,round:1n}):invalidate==='observation'?c('InterruptObservation',{partition:1n,lifetime:1n,round:1n,observation:1n}):c('InterruptPreparation',{partition:1n,lifetime:1n,round:1n,operation:2n}))
  assert.equal(revoked.$,'Advanced',invalidate+' '+JSON.stringify(revoked.refusal));
  assert.deepEqual(list(revoked.actions).map(x=>x.$),['CancelChild','RetireHandle']);state=advanced(revoked)
  if(invalidate==='round')state=advanced(m.canonical_event(state,c('OpenRound',{partition:1n,lifetime:2n})))
  const late=m.provider_completed(state,1n,1n,0n,99n);assert.deepEqual(list(late.actions).map(x=>x.$),['CleanupProvider']);state=advanced(late)
  reject(m.provider_completed(state,1n,1n,0n,99n),'WrongLease');reject(m.terminal(state,1n,0n,99n),'WrongPhase');assertions+=4
 }
 // Parent custody is tied to the exact outstanding generation/request.
 let nested=fresh();nested=advanced(m.launch(nested,scope,100n));nested=advanced(m.install(nested,1n,0n,101n,7n));nested=advanced(m.provider_start(nested,1n))
 const parent={$:'Parent',invocation:1n,generation:0n,request:7n}
 reject(m.launch_nested(nested,{...parent,generation:1n},200n),'WrongPhase')
 reject(m.launch_nested(nested,{...parent,request:8n},200n),'WrongPhase');assertions+=2
 out=m.launch_nested(nested,parent,200n);assert.deepEqual(list(out.actions),[{$:'Launch',invocation:2n,input_handle:200n}]);nested=advanced(out)
 reject(m.launch_nested(nested,parent,205n),'WrongPhase');assertions++
 assert.deepEqual(m.find(2n,nested.children).value.parent.value,parent)
 nested=advanced(m.install(nested,2n,0n,201n,0n));nested=advanced(m.provider_start(nested,2n));assertions++
 reject(m.launch_nested(nested,{$:'Parent',invocation:2n,generation:0n,request:0n},300n),'WrongPhase');assertions++
 out=m.cancel(nested,1n);assert.deepEqual(list(out.actions).filter(action=>action.$==='CancelChild').map(action=>action.invocation),[1n,2n]);nested=advanced(out)
 assert.equal(m.find(1n,nested.children).value.phase.$,'ChildCancelled');assert.equal(m.find(2n,nested.children).value.phase.$,'ChildCancelled');assertions++
 out=m.provider_completed(nested,2n,2n,0n,202n);assert.deepEqual(list(out.actions).map(action=>action.$),['CleanupProvider']);nested=advanced(out)
 out=m.provider_completed(nested,1n,1n,7n,102n);assert.deepEqual(list(out.actions).map(action=>action.$),['CleanupProvider']);nested=advanced(out);assertions+=2
 reject(m.terminal(nested,2n,0n,203n),'WrongPhase');reject(m.launch_nested(nested,parent,204n),'WrongPhase');assertions+=2
 let successful=fresh();successful=advanced(m.launch(successful,scope,100n));successful=advanced(m.install(successful,1n,0n,101n,7n));successful=advanced(m.provider_start(successful,1n));successful=advanced(m.launch_nested(successful,parent,200n))
 successful=advanced(m.terminal(successful,2n,0n,201n));successful=advanced(m.provider_completed(successful,1n,1n,7n,102n));successful=advanced(m.install(successful,1n,1n,103n,8n));successful=advanced(m.provider_start(successful,1n))
 reject(m.launch_nested(successful,parent,202n),'WrongPhase');successful=advanced(m.launch_nested(successful,{...parent,generation:1n,request:8n},203n));assertions+=2
 let premature=fresh();premature=advanced(m.launch(premature,scope,100n));premature=advanced(m.install(premature,1n,0n,101n,7n));premature=advanced(m.provider_start(premature,1n));premature=advanced(m.launch_nested(premature,parent,200n));premature=advanced(m.install(premature,2n,0n,201n,0n));premature=advanced(m.provider_start(premature,2n))
 out=m.provider_completed(premature,1n,1n,7n,102n);assert.equal(list(out.actions).some(action=>action.$==='CancelChild'&&action.invocation===2n),true);premature=advanced(out);assertions++
 reject(m.terminal(premature,2n,0n,203n),'WrongPhase');out=m.provider_completed(premature,2n,2n,0n,204n);assert.deepEqual(list(out.actions).map(action=>action.$),['CleanupProvider']);assertions+=2
 // Preparation acceptance produces a new retaining child; callers cannot launch it.
 let handoffState=fresh();handoffState=advanced(m.launch_preparation(handoffState,scope,300n))
 reject(m.launch_preparation(handoffState,scope,301n),'NotPreparing');assertions++
 reject(m.terminal(handoffState,1n,0n,302n),'WrongPhase');assertions++
 reject(m.terminal_preparation(handoffState,1n,1n,302n),'WrongPhase');assertions++
 out=m.terminal_preparation(handoffState,1n,0n,302n)
 const handoffAction=list(out.actions)[0],retaining={$:'RetainingScope',partition:1n,lifetime:1n,round:1n,observation:1n,origin:1n}
 assert.deepEqual(handoffAction,{$:'LaunchPostPreparation',invocation:2n,preparation_invocation:1n,result_handle:302n,scope:retaining});handoffState=advanced(out);assertions++
 assert.equal(m.find(1n,handoffState.children).value.phase.$,'ChildAccepted');assert.equal(m.find(2n,handoffState.children).value.parent.$,'None');assertions++
 reject(m.launch(handoffState,retaining,303n),'NotPreparing');reject(m.launch_preparation(handoffState,retaining,303n),'NotPreparing');assertions+=2
 reject(m.terminal_preparation(handoffState,1n,0n,304n),'WrongPhase');reject(m.terminal_preparation(handoffState,2n,0n,304n),'WrongPhase');assertions+=2
 out=m.canonical_event(handoffState,c('PreparationCompleted',{partition:1n,lifetime:1n,round:1n,operation:2n,unit_bytes:{$:'Nil'}}))
 handoffState=advanced(out);assert.equal(m.live(handoffState.canonical,retaining),true);assert.equal(m.find(2n,handoffState.children).value.phase.$,'ChildInstalling');assertions++
 handoffState=advanced(m.install(handoffState,2n,0n,305n,0n));handoffState=advanced(m.provider_start(handoffState,2n))
 out=m.canonical_event(handoffState,c('InterruptObservation',{partition:1n,lifetime:1n,round:1n,observation:1n}));assert.ok(list(out.actions).some(action=>action.$==='CancelChild'&&action.invocation===2n));handoffState=advanced(out);assertions++
 out=m.provider_completed(handoffState,2n,1n,0n,306n);assert.deepEqual(list(out.actions).map(action=>action.$),['CleanupProvider']);assertions++
 let beforeInstall=fresh();beforeInstall=advanced(m.launch_preparation(beforeInstall,scope,400n));beforeInstall=advanced(m.terminal_preparation(beforeInstall,1n,0n,401n));out=m.cancel(beforeInstall,2n);assert.deepEqual(list(out.actions).map(action=>action.$),['CancelChild']);assertions++
 let cancelledPreparation=fresh();cancelledPreparation=advanced(m.launch_preparation(cancelledPreparation,scope,600n));cancelledPreparation=advanced(m.cancel(cancelledPreparation,1n));reject(m.launch_preparation(cancelledPreparation,scope,601n),'NotPreparing');assertions++
 let failedPreparation=fresh();failedPreparation=advanced(m.launch_preparation(failedPreparation,scope,500n));out=m.terminal_preparation_failed(failedPreparation,1n,0n,501n);assert.deepEqual(list(out.actions).map(action=>action.$),['AcceptResult']);assertions++
 reject(m.terminal_preparation(fresh(),99n,0n,600n),'UnknownInvocation');assertions++
 // Advice custody is born at PendingFinding and survives source/round cutoff.
 let adviceState=fresh();adviceState=advanced(m.launch_preparation(adviceState,scope,700n));adviceState=advanced(m.terminal_preparation(adviceState,1n,0n,701n))
 adviceState=advanced(m.canonical_event(adviceState,c('PreparationCompleted',{partition:1n,lifetime:1n,round:1n,operation:2n,unit_bytes:{$:'Con',head:100n,tail:{$:'Nil'}}})))
 adviceState=advanced(m.install(adviceState,2n,0n,702n,0n));adviceState=advanced(m.provider_start(adviceState,2n))
 reject(m.handoff_advice(adviceState,2n,0n,1n,0n,3n,703n),'WrongPhase');assertions++
 adviceState=advanced(m.canonical_event(adviceState,c('StartReview',{partition:1n,lifetime:1n,round:1n,operation:3n})))
 adviceState=advanced(m.canonical_event(adviceState,c('ReviewCompleted',{partition:1n,lifetime:1n,round:1n,operation:3n,outcome:c('Finding')})))
 for(const tuple of [[2n,1n,1n,0n],[2n,0n,2n,0n],[2n,0n,1n,1n]]){reject(m.handoff_advice(adviceState,...tuple,3n,703n),'WrongLease');assertions++}
 out=m.handoff_advice(adviceState,2n,0n,1n,0n,3n,703n);assert.deepEqual(list(out.actions),[{$:'LaunchAdviceTail',invocation:3n,origin:2n,operation:3n,input_handle:703n}]);adviceState=advanced(out);assertions++
 reject(m.handoff_advice(adviceState,2n,0n,1n,0n,3n,704n),'WrongPhase');assertions++
 const tail=m.find(3n,adviceState.children).value;assert.equal(tail.parent.$,'None');reject(m.launch(adviceState,tail.scope,704n),'NotPreparing');reject(m.install(adviceState,3n,0n,705n,0n),'WrongGeneration');reject(m.install_advice(adviceState,3n,0n,705n,0n,{$:'TailPublish'}),'WrongGeneration');reject(m.terminal(adviceState,3n,0n,706n),'WrongPhase');assertions+=5
 adviceState=advanced(m.install_advice(adviceState,3n,0n,705n,0n,{$:'TailBarrier'}));adviceState=advanced(m.provider_start(adviceState,3n))
 adviceState=advanced(m.cancel(adviceState,2n));assert.equal(m.find(3n,adviceState.children).value.phase.$,'ChildAwaiting');assert.equal(m.provider_live(adviceState,3n,0n,2n,0n),true);assert.equal(m.advice_provider_allowed(adviceState,3n,0n,2n,0n,{$:'TailPublish'}),false);assertions+=3
 adviceState=advanced(m.canonical_event(adviceState,c('InterruptObservation',{partition:1n,lifetime:1n,round:1n,observation:1n})));assert.equal(m.provider_live(adviceState,3n,0n,2n,0n),true);assertions++
 adviceState=advanced(m.provider_completed(adviceState,3n,2n,0n,707n));adviceState=advanced(m.install_advice(adviceState,3n,1n,708n,1n,{$:'TailActive'}));adviceState=advanced(m.provider_start(adviceState,3n));adviceState=advanced(m.provider_completed(adviceState,3n,3n,1n,709n))
 adviceState=advanced(m.install_advice(adviceState,3n,2n,710n,2n,{$:'TailPublish'}));adviceState=advanced(m.provider_start(adviceState,3n));assert.equal(m.advice_provider_allowed(adviceState,3n,2n,4n,2n,{$:'TailPublish'}),true);assert.equal(m.advice_provider_allowed(adviceState,3n,2n,4n,2n,{$:'TailRemove'}),false);assertions+=2
 adviceState=advanced(m.cancel(adviceState,3n));assert.equal(m.advice_provider_allowed(adviceState,3n,2n,4n,2n,{$:'TailPublish'}),false);assert.equal(m.advice_provider_allowed(adviceState,3n,2n,4n,2n,{$:'TailRemove'}),true);assertions+=2
 adviceState=advanced(m.provider_completed(adviceState,3n,4n,2n,711n));reject(m.install_advice(adviceState,3n,3n,712n,3n,{$:'TailPublish'}),'WrongGeneration');assertions++
 adviceState=advanced(m.install_advice(adviceState,3n,3n,712n,3n,{$:'TailRemove'}));adviceState=advanced(m.provider_start(adviceState,3n));adviceState=advanced(m.provider_completed(adviceState,3n,5n,3n,713n));adviceState=advanced(m.terminal(adviceState,3n,4n,714n));assert.equal(m.find(3n,adviceState.children).value.phase.$,'ChildAccepted');assert.equal(m.provider_live(adviceState,3n,4n,5n,3n),false);reject(m.advice_cleanup_only(adviceState,3n),'WrongPhase');assertions+=3
 for(const failureAt of ['input','machine','register']) {
  const registry=createServiceRegistry(),machine={initial:()=>({$:'PreparationFinished',result:{}}),view:value=>value,disposeInvocation(){},get retainedHandles(){return 0}}
  const driver=createOwnedArtifactDriver({owner:m,initialState:fresh(),scope,registry,machine,selectMachine:input=>{if(input.postPreparation&&failureAt==='machine')throw new Error('machine construction');return machine},foreign:()=>{throw new Error('unexpected provider')}})
  const invocation=driver.allocatePreparationInvocation()
  const prepSession={invocation,close(){},revoke(){}}
  const receipt=await driver.drive(prepSession,{invocation:BigInt(invocation)})
  let finishes=0,closes=0
  const session={invocation:Number(receipt.handoff),finish(){finishes++},close(){closes++},revoke(){}}
  if(failureAt==='register')registry.register({invocation:session.invocation,close(){}})
  await assert.rejects(driver.driveHandoff(receipt,session,()=>{if(failureAt==='input')throw new Error('input construction');return {invocation:receipt.handoff,postPreparation:{}}}))
  assert.equal(finishes,1);assert.equal(closes,1)
  assert.deepEqual(driver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0})
  assertions+=3
 }
 // A rejected Source interrupt retains exact custody/resources for retry.
 {
  let controlled=fresh(),savedWork
  const control={readState:()=>controlled,invoke:(method,args)=>{const step=m[method](controlled,...args);if(step.$==='Advanced')controlled=step.state;return step}}
  const registry=createServiceRegistry(),machine={initial:()=>({$:'SourcePreparationStopped',completed:false,reason:{$:'TechnicalFailure',token:1n}}),view:value=>value,disposeInvocation(){},get retainedHandles(){return 0}}
  const driver=createOwnedArtifactDriver({owner:m,control,registry,machine,hooks:{beforeTerminal:()=>{
   savedWork=controlled.canonical.work
   const changed=list(savedWork).map(work=>work.operation===1n?{...work,kind:c('Preparing')}:work)
   controlled={...controlled,canonical:{...controlled.canonical,work:changed.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})}}
  }},foreign:()=>{throw new Error('unexpected Source provider')}})
  const invocation=driver.allocateSourceInvocation(sourceScope)
  const session={invocation,finish(){},close(){},revoke(){}}
  await assert.rejects(driver.drive(session,{invocation:BigInt(invocation)}),/Canonical resolver refused: CanonicalRejected/)
  assert.equal(registry.size,0);assert.equal(registry.pendingCleanup,1);assert.equal(driver.resources.sessions,1);assert.equal(driver.resources.payloads,0)
  assert.equal(m.find(1n,controlled.children).value.phase.$,'ChildInstalling')
  await assert.rejects(registry.retryCleanup(),/cleanup obligations remain pending/);assert.equal(registry.pendingCleanup,1)
  controlled={...controlled,canonical:{...controlled.canonical,work:savedWork}}
  await registry.retryCleanup();assert.equal(registry.pendingCleanup,0);assert.equal(m.find(1n,controlled.children).value.phase.$,'ChildCancelled')
  assert.deepEqual(driver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});assertions+=8
 }
 console.log(JSON.stringify({passed:true,assertions,scope:'actual Canonical admission/work invalidation plus source-free child generations, unique terminal and separate late-provider cleanup; opaque controlled handles only; actual split-child resident consumer, provisional rejected-handle disposal, retention/revision and universal proofs remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
