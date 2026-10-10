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
 console.log(JSON.stringify({passed:true,assertions,scope:'actual Canonical admission/work invalidation plus source-free child generations, unique terminal and separate late-provider cleanup; opaque controlled handles only; actual split-child resident consumer, provisional rejected-handle disposal, retention/revision and universal proofs remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
