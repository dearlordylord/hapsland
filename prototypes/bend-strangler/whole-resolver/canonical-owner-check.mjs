import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
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
 console.log(JSON.stringify({passed:true,assertions,scope:'actual Canonical admission/work invalidation plus source-free child generations, unique terminal and separate late-provider cleanup; opaque controlled handles only; actual split-child resident consumer, provisional rejected-handle disposal, retention/revision and universal proofs remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
