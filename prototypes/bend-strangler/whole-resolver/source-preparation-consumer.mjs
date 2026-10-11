import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,lstat,rm,readdir,readlink} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import * as Scope from 'effect/Scope'
import * as Exit from 'effect/Exit'
import {initialCanonical,projectCanonical} from '@hapsland/canonical-policy/canonical/adapter'
import {residentTransaction} from '../../../packages/resident-runtime/src/resident/state/resident/transaction.ts'
import {residentCapacity} from '../../../packages/resident-runtime/src/resident/state/resident/capacity.ts'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {captureStable} from '../../../packages/native-observation/dist/direct-event/capture.js'
import {prepareObservation} from '@hapsland/review-execution/direct-event/pipeline'
import {TYPE_INPUT_CONTRACT} from '@hapsland/review-definition/rules/targets'
import {configuredRules} from '@hapsland/build-tooling/test-support/default-rules'
import {createServiceRegistry,list,unlist} from './service-session.mjs'
import {pureReply} from './consumer.mjs'
import {createResidentOwnerTransaction} from './resident-owner-transaction.mjs'
import {createOwnedArtifactDriver} from './owned-artifact-driver.mjs'
import {createPreparationMachine} from './preparation-dispatcher.mjs'
import {createSourcePreparationMachine} from './source-preparation-dispatcher.mjs'
import {createPostPreparationMachine,createAdviceTailMachine} from './post-preparation-dispatcher.mjs'
import {createResidentRetentionContext} from './resident-retention-context.mjs'
import {createPreparationForeign} from './preparation-foreign.mjs'
import {createSourcePreparationProvider} from './source-preparation-provider.mjs'

const run=Effect.runSync,temp=await mkdtemp('/tmp/hapsland-source-composition-')
try{
 const modules={}
 for(const name of ['ArtifactComposition','GenericArtifact','PythonArtifact','CanonicalResolverOwner','Preparation','PostPreparation','SourcePreparation']){
  const emitted=join(temp,name+'.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,name+'.bend'),'-o',emitted],{timeout:5000});modules[name]=(await import(pathToFileURL(emitted))).default
 }
 const owner=modules.CanonicalResolverOwner,artifacts={composition:modules.ArtifactComposition,parent:modules.GenericArtifact,python:modules.PythonArtifact}
 const machines={source:createSourcePreparationMachine(modules.SourcePreparation),preparation:createPreparationMachine(modules.Preparation),post:createPostPreparationMachine(modules.PostPreparation),tail:createAdviceTailMachine(modules.PostPreparation)}
 const root=join(temp,'fixture');await mkdir(root);execFileSync('git',['init','-q',root],{timeout:5000})
 await writeFile(join(root,'first.py'),'from leaf import Foo\nclass First:\n field: Foo\n');await writeFile(join(root,'second.py'),'from leaf import Foo\nclass Second:\n field: Foo\n');await writeFile(join(root,'leaf.py'),'class Foo:\n value: str\n')
 const a=await lstat(root),b=await lstat(join(root,'.git')),rootIdentity={rootDevice:String(a.dev),rootInode:String(a.ino),gitDirectory:join(root,'.git'),gitDevice:String(b.dev),gitInode:String(b.ino)}
 let cases=0,totalRequests=0
 const modes=['two-candidates','repeat-candidate','refused-second','admission-ack-loss','completion-ack-loss','after-prepare-failure','cancel-between-candidates','first-preparation-failure','second-preparation-failure','source-cleanup-pending','full-workflow','gates-controlled','gates-shape','gates-root','gates-generation','gates-backend-failure','gates-runtime-first','gates-runtime-second','gates-job-inactive','gates-start-policy','gates-start-observation','gates-start-ack']
 for(const mode of modes.filter(mode=>!process.env.HAPSLAND_SOURCE_CASE||mode===process.env.HAPSLAND_SOURCE_CASE)){
  const fullEntry=mode==='full-workflow'||mode.startsWith('gates-'),gateRefusal=mode.startsWith('gates-')
  const limits={globalItems:100,globalBytes:100000000,partitionItems:16,partitionBytes:100000000}
  const initial={residentLifetime:'physical',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0}}}
  const transaction=residentTransaction(run(Ref.make(initial)),'physical'),capacity=residentCapacity(transaction)
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent')),observationId=run(capacity.admitObservation('agent',round));if(!fullEntry)assert.equal(run(capacity.observation('agent',observationId,'startObservation',round)),true)
  let driver
  const injectedPreparationError=new Error('injected original preparation failure'),injectedAdmissionError=new Error('injected source admission acknowledgement loss')
  const outputs=[],commands=[],caches=[],preparationIds=[]
  const bridge=createResidentOwnerTransaction({owner,transaction,validateAdviceInput:(origin,handle)=>driver?.validateAdviceInput(origin,handle)===true,onActions:actions=>Effect.sync(()=>driver.acceptActions(actions))})
  const connection={transaction,bridge,control:bridge.control,partition,round,postCore:modules.PostPreparation}
  const registry=createServiceRegistry()
  driver=createOwnedArtifactDriver({owner,control:bridge.control,artifacts,registry,hooks:{canonicalOutputs:items=>outputs.push(...items)},selectMachine:input=>input.sourcePreparation?machines.source:input.preparation?machines.preparation:input.postPreparation?machines.post:input.adviceTail?machines.tail:undefined,foreign:async([request],options)=>{
   totalRequests++
   const session=registry.get(Number(request.invocation))
   if(request.operation)return pureReply(await session.perform(request,options))
   commands.push({invocation:request.invocation,command:request.command.$,candidate:request.command.candidate})
   if(session.input?.sourcePreparation){
    return session.perform(request,{...options,beforeCommand:command=>{if(mode==='gates-start-observation'&&command.$==='StartObservation')assert.equal(run(capacity.observation('agent',observationId,'startObservation',round)),true);if(mode==='cancel-between-candidates'&&command.$==='CheckCandidateActive'&&command.candidate===2n)driver.cancel(request.invocation)},afterCommit:(command,publication)=>{if(mode==='gates-start-ack'&&command.$==='StartObservation')throw injectedPreparationError;if(command.$==='CompleteObservation')outputs.push(...publication.outputs);if(['admission-ack-loss','source-cleanup-pending'].includes(mode)&&command.$==='AdmitCandidateWorkspace'&&command.candidate===2n)throw injectedAdmissionError;if(mode==='completion-ack-loss'&&command.$==='CompleteObservation')throw new Error('injected observation completion acknowledgement loss')}})
   }
   if((mode==='first-preparation-failure'&&caches.length===1||mode==='second-preparation-failure'&&caches.length===2)&&session.input?.preparation&&request.command.$==='CaptureSource')throw injectedPreparationError
   return session.perform(request,options)
  }})
  connection.owned={driver}
  const candidates=[{operation:'add',path:'first.py'},{operation:'add',path:mode==='repeat-candidate'?'first.py':'second.py'}]
  const shared=await createResidentRetentionContext(connection,root,rootIdentity,{useOwned:true,observation:{root,rootIdentity,advicee:undefined,candidates}})
  shared.observation.advicee=shared.identity
  if(fullEntry){
   const credentials=await import('../../../packages/resident-runtime/src/resident/authorization/credentials.ts')
   shared.context.job.dispatch.controlled={}
   if(mode==='gates-controlled')shared.context.job.dispatch.controlled={unknownProperty:true}
   if(mode==='gates-shape')shared.context.job.dispatch.controlled=null
   if(mode==='gates-root')shared.observation.rootIdentity={...rootIdentity,rootInode:'0'}
   if(mode==='gates-generation'){
    shared.context.job.dispatch.controlled={requireCredential:true}
    shared.context.job.settings.credentialEnvVar='HAPSLAND_FIXTURE'
    shared.context.job.dispatch.credential={name:'HAPSLAND_FIXTURE',statePath:join(temp,'absent-credential-state'),generation:999}
   }
   if(mode==='gates-start-policy')shared.context.job.workObservationId=999
   shared.context.job.settings.configuration.policy.layers=[]
   Object.assign(shared.context.deps,{residentCredentialRequired:credentials.residentCredentialRequired,residentCredentialShapeMatches:credentials.residentCredentialShapeMatches,residentCredentialGenerationCurrent:credentials.residentCredentialGenerationCurrent,residentAwaitBackendGate:()=>mode==='gates-backend-failure'?Effect.fail(injectedPreparationError):mode==='gates-runtime-first'?shared.ledger.runtime.close():Effect.void})
  }
  const {context,ledger,lifecycle,scope,hold}=shared
  if(mode==='gates-runtime-second'){
   const generation=context.deps.residentCredentialGenerationCurrent;context.deps.residentCredentialGenerationCurrent=(...args)=>{const current=generation(...args);run(ledger.runtime.close());return current}
  }
  if(mode==='gates-job-inactive')context.deps.residentJobActive=()=>Effect.succeed(false)
  let admissionCalls=0,cleanupFails=mode==='source-cleanup-pending',claimReleased=false
  if(mode==='source-cleanup-pending'){
   const release=ledger.release;ledger.release=reservation=>cleanupFails&&context.activeWorkspaces.has(reservation)?Effect.fail(new Error('injected workspace release failure')):release(reservation)
   assert.equal(run(context.deps.residentReuse.claim('cleanup-extra-claim')),true);context.unassignedClaims.add('cleanup-extra-claim')
   const releaseClaim=context.deps.residentReleaseReuseClaim;context.deps.residentReleaseReuseClaim=key=>releaseClaim(key).pipe(Effect.tap(()=>Effect.sync(()=>{if(key==='cleanup-extra-claim')claimReleased=true})))
  }
  if(mode==='refused-second'){
   const begin=ledger.beginObservedPreparation;ledger.beginObservedPreparation=(partition,observation,bytes,round)=>begin(partition,observation,++admissionCalls===2?200000000:bytes,round)
  }
  if(mode==='after-prepare-failure')context.deps.residentPreparationControls={...context.deps.residentPreparationControls,afterPrepare:Effect.fail(new Error('injected preparation barrier failure'))}
  const bendLimits={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,...Object.fromEntries(Object.entries(GRAPH_LIMIT_CEILINGS).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
  const invocation=driver.allocateSourceInvocation({$:'SourceScope',partition:BigInt(partition),lifetime:1n,round:BigInt(round),observation:BigInt(observationId),permission:{$:'SourceNew'}})
  const source=createSourcePreparationProvider(BigInt(invocation),context,{owner,bridge,driver,candidates,entry:fullEntry?'full':'after-gates',buildPreparationSession:async(invocation,candidate,preparation)=>{
   preparationIds.push(preparation.operation)
   const cache=new Map();caches.push(cache)
   const preparationContext={root,rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:'type',limits:GRAPH_LIMIT_CEILINGS,now:()=>0,captureCache:cache,captureSource:captureStable}
   const foreign=createPreparationForeign({connection:{...connection,preparation},owner,driver,registry,root,rootIdentity,context:preparationContext,cache})
   return {invocation,revoke(){},close(){},perform:foreign,input:{invocation:BigInt(invocation),preparation:{$:'Input',candidates:list([{$:'Candidate',path:candidate.path,operation:{$:'CandidateAdd'},added_lines:list([])}]),contracts:list([{$:'PreparationSelection.TypeContract'}]),limits:bendLimits,frozen:{$:'None'},line:{$:'None'},verified:{$:'None'},native_patch:{$:'None'},advicee_host:'codex',before_analyze:true}}}
  }})
  try{
   let result
   try{result=await driver.drive(source,source.input,{signal:context.preparationSignal})}
   catch(error){
    if(mode!=='source-cleanup-pending')throw error
    assert.ok(error instanceof AggregateError);assert.strictEqual(error.cause,injectedAdmissionError)
    assert.equal(claimReleased,true,'other exact obligations attempted despite failed workspace release')
    assert.equal(context.unassignedClaims.size,0);assert.equal(context.activeWorkspaces.size,1);assert.equal(registry.pendingCleanup,1)
    await assert.rejects(registry.retryCleanup(),/cleanup obligations remain pending/);assert.equal(registry.pendingCleanup,1)
    cleanupFails=false;await registry.retryCleanup();assert.equal(registry.pendingCleanup,0);assert.equal(context.activeWorkspaces.size,0)
    result={completed:false,reason:{$:'TechnicalFailure',token:1n}}
   }
   const snapshot=run(transaction.read),units=[...snapshot.records.dispatch.entries.values()].map(entry=>entry.value)
   const interrupted=outputs.filter(output=>output.$==='../../../packages/agent-flow-bend/Canonical.EventEstablished'&&output.event.$==='../../../packages/agent-flow-bend/Canonical.ObservationInterrupted')
   const completed=outputs.filter(output=>output.$==='Canonical.EventEstablished'&&output.event.$==='Canonical.ObservationCompleted')
   const expectedCount=gateRefusal||mode==='first-preparation-failure'?0:['refused-second','admission-ack-loss','cancel-between-candidates','repeat-candidate','second-preparation-failure','source-cleanup-pending'].includes(mode)?1:2
   assert.equal(units.length,expectedCount,mode+' retains transferred units')
   assert.equal(snapshot.records.revision.current.size,expectedCount)
   assert.equal(snapshot.records.reuse.pending.size,expectedCount)
   assert.equal(snapshot.reservations.size,expectedCount,'source workspaces released, independent unit reservations retained')
   assert.equal(context.activeWorkspaces.size,0)
   assert.equal(context.unassignedClaims.size,0)
   assert.equal(driver.stats.providerStarts,driver.stats.providerCleanups)
   assert.deepEqual(driver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});assert.equal(registry.size,0);assert.equal(registry.pendingCleanup,0)
   assert.equal(caches.length,gateRefusal?0:mode==='refused-second'||mode==='admission-ack-loss'||mode==='source-cleanup-pending'||mode==='cancel-between-candidates'||mode==='first-preparation-failure'?1:2)
   if(caches.length===2){assert.notStrictEqual(caches[0],caches[1]);assert.notEqual(preparationIds[0],preparationIds[1])}
   if(gateRefusal){
    assert.equal(result.completed,false);assert.equal(result.continued,false);assert.equal(interrupted.length,1);assert.equal(completed.length,0)
    if(mode==='gates-backend-failure'||mode==='gates-start-ack'){assert.equal(result.reason.$,'TechnicalFailure');assert.strictEqual(source.error(result.reason.token),injectedPreparationError)}else assert.equal(result.reason.$,mode==='gates-start-policy'||mode==='gates-start-observation'?'StartRefused':mode==='gates-runtime-first'||mode==='gates-runtime-second'||mode==='gates-job-inactive'?'SourceInactive':'SettingsRefused')
    const gates=commands.filter(item=>item.invocation===BigInt(invocation)).map(item=>item.command)
    const prefix=['StartPolicySource','StartObservation','AwaitBackendGate']
    const common=['ReadRuntimeActive','DecodeControlled']
    const checks={'gates-controlled':[],'gates-shape':['ReadCredentialRequired','CheckCredentialShape'],'gates-root':['ReadCredentialRequired','CheckCredentialShape','VerifyObservationRoot'],'gates-generation':['ReadCredentialRequired','CheckCredentialShape','VerifyObservationRoot','CheckCredentialGeneration']}
    if(mode==='gates-start-ack')assert.deepEqual(gates,['StartPolicySource','StartObservation','RecordPreparationFailureAnalytics','ReleaseJobReservation','ReadRuntimeActive','RecordUnavailableActivity'])
    else if(mode==='gates-start-observation')assert.deepEqual(gates,['StartPolicySource','StartObservation','ReleaseJobReservation'])
    else if(mode==='gates-start-policy')assert.deepEqual(gates,['StartPolicySource','ReleaseJobReservation'])
    else if(mode==='gates-runtime-first')assert.deepEqual(gates,[...prefix,'ReadRuntimeActive','ReleaseJobReservation'])
    else if(mode==='gates-runtime-second'||mode==='gates-job-inactive')assert.deepEqual(gates,[...prefix,...common,'ReadCredentialRequired','CheckCredentialShape','VerifyObservationRoot','CheckCredentialGeneration','ReleaseJobReservation','ReadRuntimeActive',...(mode==='gates-job-inactive'?['CheckJobActive']:[]),'RecordPreparationFailureAnalytics','RecordUnavailableActivity'])
    else assert.deepEqual(gates,mode==='gates-backend-failure'?[...prefix,'RecordPreparationFailureAnalytics','ReleaseJobReservation','ReadRuntimeActive','RecordUnavailableActivity']:[...prefix,...common,...checks[mode],'ReleaseJobReservation','RecordPreparationFailureAnalytics','RecordUnavailableActivity'])
   }else if(mode.endsWith('preparation-failure')){
    assert.equal(result.completed,false);assert.equal(result.reason.$,'TechnicalFailure');assert.strictEqual(source.error(result.reason.token),injectedPreparationError);assert.equal(interrupted.length,1);assert.equal(completed.length,0)
   }else if(mode==='admission-ack-loss'||mode==='source-cleanup-pending'){
    assert.equal(result.completed,false);assert.equal(result.reason.$,'TechnicalFailure');assert.match(String(source.error(result.reason.token)),/admission acknowledgement loss/);assert.equal(interrupted.length,1);assert.equal(completed.length,0)
   }else if(mode==='cancel-between-candidates'){
    assert.ok(result.failure);assert.equal(context.job.completed,undefined);assert.equal(interrupted.length,1);assert.equal(completed.length,0)
   }else{
    assert.equal(context.job.completed,true);assert.equal(result.completed,true);assert.equal(completed.length,1);assert.equal(interrupted.length,0)
    assert.equal(result.continued,!['completion-ack-loss','after-prepare-failure'].includes(mode))
    if(mode==='completion-ack-loss')assert.match(String(source.error(result.reason.token)),/completion acknowledgement loss/)
    if(mode==='after-prepare-failure')assert.equal(source.error(result.reason.token).operation,'preparation barrier')
   }
   for(const unit of units){
    const expected=await Effect.runPromise(prepareObservation(unit.observation,{settings:{rules:configuredRules},policy:DEFAULT_DIRECT_FILE_POLICY,inputContract:TYPE_INPUT_CONTRACT}))
    assert.equal(expected.observation.status,'complete');assert.deepEqual(unit.prepared,expected.outcomes.find(outcome=>outcome.status==='ready').prepared);assert.equal(run(ledger.revision.current(unit.revision,unit.prepared)),true)
   }
   if(mode==='refused-second')assert.ok(commands.some(item=>item.command==='ObserveCandidateDiagnostic'))
   cases++
  }finally{
   run(hold.open);await Effect.runPromise(Scope.close(scope,Exit.void))
   for(const unit of [...run(transaction.read).records.reuse.pending.values()].filter(Boolean)){await Effect.runPromise(lifecycle.residentReleaseUnit(unit));await Effect.runPromise(lifecycle.residentReleaseReuseClaim(unit.evaluationKey))}
   const terminal=run(transaction.read);assert.equal(terminal.reservations.size,0);assert.equal(terminal.records.revision.current.size,0);assert.equal(terminal.records.reuse.pending.size,0);assert.equal(terminal.records.dispatch.entries.size,0);assert.equal(projectCanonical(terminal.canonical).global.bytes,0)
  }
  const rootFds=await Promise.all((await readdir('/proc/self/fd')).map(fd=>readlink('/proc/self/fd/'+fd).catch(()=>'')));assert.equal(rootFds.filter(path=>path===root||path.startsWith(root+'/')).length,0)
 }
 console.log(JSON.stringify({passed:true,cases,requests:totalRequests,scope:'whole source workflow including pre-loop gates and post-gates cursor over actual physical candidates, fresh Preparation/cache and shared resident context, Canonical Source -> Preparation -> split resolvers -> Retaining -> dispatcher, atomic source completion/interruption and workspace receipt cleanup; finite consumer, universal proofs and production adoption remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
