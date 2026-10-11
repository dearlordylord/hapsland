import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,lstat,rm,readdir,readlink} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {GRAPH_LIMIT_CEILINGS} from '../../../../canonical-policy/dist/canonical/graph-limits.js'
import {resolveGraphUnit} from '../../../dist/direct-event/graph-resolver.js'
import {eligibleNamedPath,DEFAULT_DIRECT_FILE_POLICY} from '../../../../native-observation/dist/direct-event/selection.js'
import {captureStable} from '../../../../native-observation/dist/direct-event/capture.js'
import {createServiceRegistry} from './service-session.mjs'
import {createBendResolver,pureReply} from './consumer.mjs'
import {createOwnedArtifactDriver} from '../../../../resident-runtime/src/resident/review-work/composition/owned-artifact-driver.mjs'
const temp=await mkdtemp('/tmp/hapsland-owned-root-')
try{
 const artifacts={};let owner
 for(const [key,name] of [['composition','ArtifactComposition'],['parent','GenericArtifact'],['python','PythonArtifact'],['owner','CanonicalResolverOwner']]){
  const emitted=join(temp,name+'.mjs');execFileSync('taskset',['-c','10','bend',new URL({".runtime-cancellation-closure-diagnostic":".runtime-cancellation-closure-diagnostic.bend",".runtime-correspondence-closure-diagnostic":".runtime-correspondence-closure-diagnostic.bend",".runtime-resumed-proof-control":".runtime-resumed-proof-control.bend","ArtifactComposition":"../../../../resident-runtime/src/resident/review-work/composition/ArtifactComposition.bend","ArtifactIndexSkipMutantCore":"./ArtifactIndexSkipMutantCore.bend","ArtifactProtocol":"../../../../resident-runtime/src/resident/review-work/composition/ArtifactProtocol.bend","Attach":"./Attach.bend","AttachPlanning":"./AttachPlanning.bend","BoundaryLiteralCheck":"./BoundaryLiteralCheck.bend","BoundaryValidationSpecification":"./BoundaryValidationSpecification.bend","CanonicalResolverOwner":"../../../../agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend","CaptureAdmission":"./CaptureAdmission.bend","Cargo":"./Cargo.bend","CargoSpecification":"./CargoSpecification.bend","CargoSpecificationCheck":"./CargoSpecificationCheck.bend","Check":"./Check.bend","Clock":"./Clock.bend","ComposedBudget":"./ComposedBudget.bend","ComposedMachine":"./ComposedMachine.bend","Composition":"./Composition.bend","Core":"./Core.bend","DeadlineLiteralCheck":"./DeadlineLiteralCheck.bend","DeadlineSpecification":"./DeadlineSpecification.bend","EntrySpecification":"./EntrySpecification.bend","Environment":"./Environment.bend","ExpansionDriverSpecification":"./ExpansionDriverSpecification.bend","ExpansionSpecification":"./ExpansionSpecification.bend","ExpansionSpecificationCheck":"./ExpansionSpecificationCheck.bend","Facts":"./Facts.bend","Failure":"./Failure.bend","ForestAllowance":"./ForestAllowance.bend","ForestSpecification":"./ForestSpecification.bend","GenericArtifact":"../../../../resident-runtime/src/resident/review-work/composition/GenericArtifact.bend","GraphSpecification":"./GraphSpecification.bend","ImportedRust":"./ImportedRust.bend","Loop":"./Loop.bend","LoopPolicy":"./LoopPolicy.bend","Machine":"./Machine.bend","MechanicalPathAlgebra":"./MechanicalPathAlgebra.bend","ModuleSpecification":"./ModuleSpecification.bend","PostPreparation":"../../../../resident-runtime/src/resident/review-work/preparation/PostPreparation.bend","Preparation":"../../../../review-execution/src/direct-event/preparation/Preparation.bend","PreparationSelection":"../../../../review-execution/src/direct-event/preparation/PreparationSelection.bend","PreparationSpecification":"../../../../review-execution/src/direct-event/preparation/PreparationSpecification.bend","Protocol":"./Protocol.bend","PythonArtifact":"../../../../resident-runtime/src/resident/review-work/composition/PythonArtifact.bend","PythonModule":"./PythonModule.bend","RUNTIME_INVARIANT_LAWS":"./RUNTIME_INVARIANT_LAWS.bend","RUNTIME_INVARIANT_PROOF":"./RUNTIME_INVARIANT_PROOF.bend","RUNTIME_LAWS":"./RUNTIME_LAWS.bend","RUNTIME_PROOF":"./RUNTIME_PROOF.bend","Read":"./Read.bend","ReferenceGroupMutantCore":"./ReferenceGroupMutantCore.bend","Resolve":"./Resolve.bend","Root":"./Root.bend","RootAttribution":"../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.bend","RootPlanning":"./RootPlanning.bend","Runtime":"./Runtime.bend","RuntimeCancellationPhaseProof":"./RuntimeCancellationPhaseProof.bend","RuntimeCorrespondenceProof":"./RuntimeCorrespondenceProof.bend","RuntimeFrozenRowsProof":"./RuntimeFrozenRowsProof.bend","RuntimeHistoryProof":"./RuntimeHistoryProof.bend","RuntimeInvariant":"./RuntimeInvariant.bend","RuntimeInvocationProof":"./RuntimeInvocationProof.bend","RuntimeLawObservation":"./RuntimeLawObservation.bend","RuntimeLeaseProof":"./RuntimeLeaseProof.bend","RuntimeMachineFenceProof":"./RuntimeMachineFenceProof.bend","RuntimeModel":"./RuntimeModel.bend","RuntimeNatProof":"./RuntimeNatProof.bend","RuntimeSpecification":"./RuntimeSpecification.bend","RuntimeTraceProof":"./RuntimeTraceProof.bend","RuntimeValidityProof":"./RuntimeValidityProof.bend","RustCargo":"./RustCargo.bend","RustFollow":"./RustFollow.bend","RustMachine":"./RustMachine.bend","RustSpecification":"./RustSpecification.bend","RustStorage":"./RustStorage.bend","RustTaskSpecification":"./RustTaskSpecification.bend","SPEC":"./SPEC.bend","SignedLocalSpecification":"./SignedLocalSpecification.bend","SignedLocalSpecificationCheck":"./SignedLocalSpecificationCheck.bend","SourcePreparation":"../../../../resident-runtime/src/resident/review-work/preparation/SourcePreparation.bend","SourcePreparationProbe":"../../../../resident-runtime/src/resident/review-work/preparation/SourcePreparationProbe.bend","SourceValidationSpecification":"./SourceValidationSpecification.bend","SpecificationCheck":"./SpecificationCheck.bend","State":"./State.bend","TerminalMachine":"./TerminalMachine.bend","Types":"./Types.bend","WholeObservation":"./WholeObservation.bend"}[name],import.meta.url).pathname,'-o',emitted],{timeout:5000});const loaded=(await import(pathToFileURL(emitted))).default;if(key==='owner')owner=loaded;else artifacts[key]=loaded
 }
 const root=join(temp,'fixture');await mkdir(root);execFileSync('git',['init','-q',root],{timeout:5000})
 await writeFile(join(root,'root.py'),'from leaf import Foo\nclass Root:\n first: Foo\nclass Second:\n second: Foo\n');await writeFile(join(root,'leaf.py'),'class Foo:\n value: str\n')
 const a=await lstat(root),b=await lstat(join(root,'.git'));const rootIdentity={rootDevice:String(a.dev),rootInode:String(a.ino),gitDirectory:join(root,'.git'),gitDevice:String(b.dev),gitInode:String(b.ino)}
 const selection=await Effect.runPromise(eligibleNamedPath(root,'root.py',DEFAULT_DIRECT_FILE_POLICY,rootIdentity)),captured=await Effect.runPromise(captureStable(root,selection,{},rootIdentity));assert.equal(captured.status,'captured')
 const c=(name,fields={})=>({$:'../../../packages/agent-flow-bend/Canonical.'+name,...fields}),scope={$:'Scope',partition:1n,lifetime:1n,round:1n,preparation:2n}
 const initial=()=>{let state=owner.initial_limits(100n,100000000n,100n,100000000n);for(const event of [c('OpenRound',{partition:1n,lifetime:1n}),c('AdmitObservation',{partition:1n,lifetime:1n,round:1n}),c('StartObservation',{partition:1n,lifetime:1n,round:1n,observation:1n}),c('BeginObservedPreparation',{partition:1n,lifetime:1n,round:1n,observation:1n,bytes:1000n})]){const step=owner.canonical_event(state,event);assert.equal(step.$,'Advanced');state=step.state}return state}
 let cases=0,totalRequests=0
 const abandoned=createOwnedArtifactDriver({owner,initialState:initial(),scope,artifacts,registry:createServiceRegistry(),foreign:()=>{throw new Error('unexpected provider')}})
 const allocated=abandoned.allocateInvocation();abandoned.cancel(allocated);assert.deepEqual(abandoned.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});cases++
 const overflow=createOwnedArtifactDriver({owner,initialState:{...initial(),next_invocation:2n**53n},scope,artifacts,registry:createServiceRegistry(),foreign:()=>{throw new Error('unexpected provider')}})
 assert.throws(()=>overflow.allocateInvocation(),RangeError);assert.deepEqual(overflow.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});cases++
 for(const mode of ['two-roots','cancel-provider','cancel-inflight','cancel-inflight-success','retire-provider','late-rejection','cancel-before-install','cancel-before-terminal','resume-throws','completion-hook-throws','construction-throws','external-abort','between-roots']){
  const registry=createServiceRegistry();let triggered=false,requests=0,beforeCancelResumes,captureSuccesses=0
  const hooks={},controller=new AbortController()
  if(['cancel-provider','retire-provider','late-rejection'].includes(mode))hooks.beforeProvider=({invocation,driver})=>{if(triggered)return;triggered=true;if(mode==='retire-provider')driver.canonicalEvent(c('RetirePartition',{partition:1n,lifetime:1n,round:1n}));else driver.cancel(invocation)}
  if(mode==='completion-hook-throws')hooks.beforeCompletion=()=>{throw new Error('injected completion fault')}
  if(mode==='external-abort')hooks.beforeProvider=()=>controller.abort()
  if(mode==='cancel-before-install')hooks.beforeInstall=({invocation,generation,driver})=>{if(generation===0n||triggered)return;triggered=true;driver.cancel(invocation)}
  if(mode==='cancel-before-terminal')hooks.beforeTerminal=({invocation,driver})=>{if(triggered)return;triggered=true;driver.cancel(invocation)}
  const wrapped=mode==='resume-throws'?{...artifacts,composition:{...artifacts.composition,resume(){throw new Error('injected artifact fault')}}}:artifacts
  const driver=createOwnedArtifactDriver({owner,initialState:initial(),scope,artifacts:wrapped,registry,hooks,foreign:async([request],options)=>{
   requests++;if(['cancel-inflight','cancel-inflight-success'].includes(mode)&&!triggered&&request.operation.$==='Types.CaptureSource'){
    const pending=registry.get(Number(request.invocation)).perform(request,mode==='cancel-inflight-success'?{...options,signal:undefined}:options);triggered=true;beforeCancelResumes=driver.stats.resumes;driver.cancel(request.invocation);return pureReply(await pending)
   }
   if(mode==='late-rejection')throw new Error('injected late provider rejection')
   return pureReply(await registry.get(Number(request.invocation)).perform(request,options))
  }})
  const resolver=createBendResolver({registry,drive:driver.drive,allocateInvocation:driver.allocateInvocation,onConstructionFailure:driver.constructionFailed})
  const context={root,rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:'type',limits:GRAPH_LIMIT_CEILINGS,now:()=>0,captureCache:new Map(),captureSource:(...args)=>captureStable(...args).pipe(Effect.tap(result=>Effect.sync(()=>{if(result.status==='captured')captureSuccesses++})))}
  if(mode==='construction-throws'){
   await assert.rejects(resolver('root.py',{...captured.capture,byteLength:undefined},'Root',context),TypeError)
  }else if(mode==='two-roots'||mode==='between-roots'){
   const expected=await Effect.runPromise(resolveGraphUnit('root.py',captured.capture,'Root',{...context,captureCache:new Map()}));assert.deepEqual(await resolver('root.py',captured.capture,'Root',context),expected)
   if(mode==='between-roots'){
    driver.canonicalEvent(c('InterruptPreparation',{partition:1n,lifetime:1n,round:1n,operation:2n}))
    await assert.rejects(resolver('root.py',captured.capture,'Second',context),/NotPreparing/)
   }else{
    const second=await Effect.runPromise(resolveGraphUnit('root.py',captured.capture,'Second',{...context,captureCache:new Map()}));assert.deepEqual(await resolver('root.py',captured.capture,'Second',context),second)
    driver.canonicalEvent(c('PreparationCompleted',{partition:1n,lifetime:1n,round:1n,operation:2n,unit_bytes:{$:'Con',head:100n,tail:{$:'Con',head:100n,tail:{$:'Nil'}}}}))
    assert.equal(driver.stats.accepted,2);assert.equal(driver.stats.launches,2);assert.equal(owner.live(driver.state.canonical,scope),false)
   }
  }else{
   await assert.rejects(resolver('root.py',captured.capture,'Root',context,{signal:controller.signal}),mode==='completion-hook-throws'?/injected completion fault/:mode==='resume-throws'?/injected artifact fault/:mode==='cancel-before-install'?/WrongGeneration/:mode==='cancel-before-terminal'?/WrongPhase/:/InvocationCancelled/)
   assert.equal(driver.stats.accepted,0)
   if(['cancel-provider','retire-provider','late-rejection'].includes(mode))assert.equal(driver.stats.resumes,0)
   if(['cancel-inflight','cancel-inflight-success'].includes(mode)){assert.equal(triggered,true);assert.equal(driver.stats.resumes,beforeCancelResumes)}
   if(mode==='cancel-inflight-success')assert.ok(captureSuccesses>0,'physical late capture succeeds while session registration is revoked')
  }
  assert.deepEqual(driver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0},mode+' cleanup');assert.equal(registry.size,0);
  const rootFds=await Promise.all((await readdir('/proc/self/fd')).map(fd=>readlink('/proc/self/fd/'+fd).catch(()=>'')));assert.equal(rootFds.filter(path=>path===root||path.startsWith(root+'/')).length,0,mode+' physical root-owned descriptors');
  assert.equal(driver.stats.providerStarts,driver.stats.providerCleanups,mode+' provider lease cleanup')
  totalRequests+=requests;cases++
 }
 console.log(JSON.stringify({passed:true,cases,requests:totalRequests,scope:'actual Canonical admission/Prepare + split resolver children with physical native service/session, two roots under one preparation, cancellation/retirement/late rejection/provisional refusal/throw cleanup; real resident preparation root progression/retention/revision and universal proofs remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
