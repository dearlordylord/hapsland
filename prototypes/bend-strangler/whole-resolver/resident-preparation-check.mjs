import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,lstat,rm,readdir,readlink} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {resolveGraphUnit} from '../../../packages/source-analysis/dist/direct-event/graph-resolver.js'
import {eligibleNamedPath,DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {captureStable} from '../../../packages/native-observation/dist/direct-event/capture.js'
import {createServiceRegistry,productValue,fromProductValue,list,unlist} from './service-session.mjs'
import {createBendResolver,pureReply} from './consumer.mjs'
import {createOwnedArtifactDriver} from './owned-artifact-driver.mjs'
import * as Ref from 'effect/Ref'
import {initialCanonical,projectCanonical} from '@hapsland/canonical-policy/canonical/adapter'
import {residentTransaction} from '../../../packages/resident-runtime/src/resident/state/resident/transaction.ts'
import {residentCapacity} from '../../../packages/resident-runtime/src/resident/state/resident/capacity.ts'
import {retireRound} from '../../../packages/resident-runtime/src/resident/state/capacity/rounds.ts'
import {completePreparation} from '../../../packages/resident-runtime/src/resident/state/capacity/preparation.ts'
import {createResidentOwnerTransaction} from './resident-owner-transaction.mjs'
import {createPreparationMachine} from './preparation-dispatcher.mjs'
import {inspectGraphFile,combinedAnalyzerMaterializationPreflight,analyzeTypeFile} from '../../../packages/source-analysis/dist/direct-event/analyzer.js'
import {resize} from '../../../packages/resident-runtime/src/resident/state/capacity/reservations.ts'
import {analyzeFunctionFile} from '@hapsland/source-analysis/direct-event/function-analyzer'
import {analysisWorkspaceBytes} from '../../../packages/resident-runtime/src/resident/work-ownership/workspace.ts'
import {configuredRules} from '@hapsland/build-tooling/test-support/default-rules'
import {nativePrepareReadyUnits} from './native-preparation-children.mjs'
import {consumeRetainedPreparation} from './retention-consumer.mjs'
import {decodePreparationResult} from './preparation-result-codec.mjs'
import {prepareObservation} from '@hapsland/review-execution/direct-event/pipeline'
import {advicee} from '@hapsland/build-tooling/test-support/test-fixtures'
import {TYPE_INPUT_CONTRACT,FUNCTION_INPUT_CONTRACT} from '@hapsland/review-definition/rules/targets'
const temp=await mkdtemp('/tmp/hapsland-owned-root-')
try{
 const artifacts={};let owner
 for(const [key,name] of [['composition','ArtifactComposition'],['parent','GenericArtifact'],['python','PythonArtifact'],['owner','CanonicalResolverOwner']]){
  const emitted=join(temp,name+'.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,name+'.bend'),'-o',emitted],{timeout:5000});const loaded=(await import(pathToFileURL(emitted))).default;if(key==='owner')owner=loaded;else artifacts[key]=loaded
 }
 const root=join(temp,'fixture');await mkdir(root);execFileSync('git',['init','-q',root],{timeout:5000})
 await writeFile(join(root,'root.py'),'from leaf import Foo\nclass Root:\n first: Foo\nclass Second:\n second: Foo\n');await writeFile(join(root,'leaf.py'),'class Foo:\n value: str\n')
 const a=await lstat(root),b=await lstat(join(root,'.git'));const rootIdentity={rootDevice:String(a.dev),rootInode:String(a.ino),gitDirectory:join(root,'.git'),gitDevice:String(b.dev),gitInode:String(b.ino)}
 const selection=await Effect.runPromise(eligibleNamedPath(root,'root.py',DEFAULT_DIRECT_FILE_POLICY,rootIdentity)),captured=await Effect.runPromise(captureStable(root,selection,{},rootIdentity));assert.equal(captured.status,'captured')
 const c=(name,fields={})=>({$:'../../../packages/agent-flow-bend/Canonical.'+name,...fields}),scope={$:'Scope',partition:1n,lifetime:1n,round:1n,preparation:2n}
 const initial=()=>{
  const run=Effect.runSync,limits={globalItems:100,globalBytes:100000000,partitionItems:16,partitionBytes:100000000}
  const ref=run(Ref.make({residentLifetime:'physical',limits,canonical:initialCanonical(limits),resolverCustody:owner.initial_custody(),reservations:new Map(),partitionIds:new Map(),partitionIdentityBytes:0,roundIds:new Map(),requestRounds:new Map(),collectionTokens:new Map(),nextCollectionToken:1,nextPartitionId:1,minimumFreshStart:0,records:{runtime:{peakLedgerBytes:0},marker:0}}))
  const transaction=residentTransaction(ref,'physical'),capacity=residentCapacity(transaction)
  const partition=run(capacity.partitionId('agent')),round=run(capacity.roundId('agent'))
  const observation=run(capacity.admitObservation('agent',round));assert.equal(run(capacity.observation('agent',observation,'startObservation',round)),true)
  const preparation=run(capacity.beginObservedPreparation('agent',observation,1000,round));assert.equal(preparation.status,'admitted');assert.equal(preparation.operation,2)
  let attachedDriver
  const bridge=createResidentOwnerTransaction({owner,transaction,onActions:actions=>Effect.sync(()=>{if(actions.length&&!attachedDriver)throw new Error('Unbound resident action consumer');attachedDriver?.acceptActions(actions)})})
  return {control:bridge.control,bridge,transaction,preparation,round,partition,attachDriver:driver=>{attachedDriver=driver}}
 }
 const preparationEmission=join(temp,'Preparation.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'Preparation.bend'),'-o',preparationEmission],{timeout:5000})
 const core=(await import(pathToFileURL(preparationEmission))).default,preparationMachine=createPreparationMachine(core)
 const none={$:'None'},some=value=>({$:'Some',value})
 const location=value=>({$:'RootAttribution.Location',start:{$:'RootAttribution.Position',line:BigInt(value.start.line),column:BigInt(value.start.column)},end:{$:'RootAttribution.Position',line:BigInt(value.end.line),column:BigInt(value.end.column)}})
 let cases=0,requests=0
 for(const mode of ['two-roots','first-refused','parent-cancel-late-success','parent-cancel-late-rejection','resize-refused','mixed-contracts','retention-success','retention-before-flow','retention-owner-claimed','retention-after-revision']) {
  const currentPath=mode==='mixed-contracts'?'mixed.ts':'root.py'
  if(mode==='mixed-contracts')await writeFile(join(root,currentPath),'export interface Foo { value: string }\nexport function run(value: Foo): Foo { return value }\n')
  const connection=initial(),registry=createServiceRegistry(),cache=new Map(),rootCaptures=new Map(),selections=new Map();let parentInvocation,cancelled=false,roots=0,physicalLateSuccess=0
  const context={root,rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:'type',limits:GRAPH_LIMIT_CEILINGS,now:()=>0,captureCache:cache,captureSource:(...args)=>captureStable(...args).pipe(Effect.tap(result=>Effect.sync(()=>{if(cancelled&&result.status==='captured')physicalLateSuccess++})),Effect.flatMap(result=>mode==='parent-cancel-late-rejection'&&cancelled?Effect.fail(new Error('injected native late capture failure')):Effect.succeed(result)))}
  const snapshotCaptures=()=>list([...cache].map(([path,capture],index)=>({$:'Capture',path,handle:BigInt(index+1),text:capture.text,content_hash:capture.contentHash,bytes:BigInt(capture.byteLength)})))
  const driver=createOwnedArtifactDriver({owner,control:connection.control,scope,artifacts,registry,selectMachine:input=>input.preparation?preparationMachine:undefined,foreign:async([request],options)=>{
   requests++
   if(request.operation) {
    const session=registry.get(Number(request.invocation))
    if(mode.startsWith('parent-cancel')&&!cancelled&&request.operation.$==='Types.CaptureSource') {
     const pending=session.perform(request,{...options,signal:undefined});cancelled=true;driver.cancel(parentInvocation)
     const reply=await pending
     if(mode==='parent-cancel-late-rejection')throw new Error('late capture provider fault')
     return pureReply(reply)
    }
    return pureReply(await session.perform(request,options))
   }
   const command=request.command;let response
   switch(command.$) {
    case 'InspectPath': {
     const selected=await Effect.runPromise(eligibleNamedPath(root,command.candidate.path,DEFAULT_DIRECT_FILE_POLICY,rootIdentity));assert.ok(selected);selections.set(1n,selected)
     response={$:'PathAllowed',path:command.candidate.path,selection:1n};break
    }
    case 'CaptureSource': {
     const capture=await Effect.runPromise(captureStable(root,selections.get(command.selection),{},rootIdentity));assert.equal(capture.status,'captured')
     rootCaptures.set(1n,capture.capture);cache.set(command.path,capture.capture)
     response={$:'SourceCaptured',capture:{$:'Capture',path:command.path,handle:1n,text:capture.capture.text,content_hash:capture.capture.contentHash,bytes:BigInt(capture.capture.byteLength)}};break
    }
    case 'Preflight':response={$:'PreflightDone',value:productValue(combinedAnalyzerMaterializationPreflight(command.capture.path,command.capture.text)??null)};break
    case 'AdmitMaterialization': {
     const bytes=mode==='resize-refused'?200000000:analysisWorkspaceBytes(command.capture.path,Number(command.capture.bytes),fromProductValue(command.preflight)??undefined,configuredRules)
     const result=Effect.runSync(connection.bridge.native((draft,records)=>[resize(draft,connection.preparation.reservation,bytes),records])).value
     response={$:'MaterializationDone',requested:BigInt(bytes),result:result.status==='resized'?{$:'Resized'}:{$:'CapacityRefused',constraint:result.constraint}};break
    }
    case 'ExtractSource': {
     const facts=inspectGraphFile(command.capture.path,command.capture.text);assert.ok(facts)
     const functions=analyzeFunctionFile(command.capture.path,command.capture.text),typeFile=analyzeTypeFile(command.capture.path,command.capture.text,true)
     const rootFact=({artifact,location:span})=>({$:'PreparationSelection.Root',id:artifact.id,declaration:{$:'RootAttribution.Declaration',path:command.capture.path,kind:artifact.kind,name:artifact.name,location:location(span),selection_locations:none}})
     response={$:'SourceExtracted',extraction:{$:'Extraction',graph:some(list([...facts.declarations.values()].map(rootFact))),functions:functions===undefined?none:some({$:'FunctionFile',failure:functions.failure===undefined?none:some(functions.failure),functions:list([...functions.functions.values()].map(rootFact)),exclusions:list([...functions.excludedFunctions].map(([name,value])=>({$:'Exclusion',name,reason:value.reason,location:location(value.location)})))}),type_file:typeFile.status==='unsupported'?{$:'TypeUnavailable',reason:typeFile.reason}:{$:'TypeAnalyzed',analyses:list(typeFile.units.map(unit=>unit.status==='ready'?{$:'NativeReady',name:unit.unit.root.artifact.name}:{$:'NativeUnsupported',name:unit.root.name,reason:unit.reason}))}}};break
    }
    case 'ResolveRoot': {
     roots++
     if(mode==='first-refused'&&roots===1){response={$:'RootResolved',unit:none,references:list([]),captures:snapshotCaptures()};break}
     let terminal
     const parent=owner.find(request.invocation,driver.state.children).value
     const resolver=createBendResolver({registry,allocateInvocation:()=>driver.allocateInvocation({$:'Parent',invocation:request.invocation,generation:parent.generation,request:request.id}),onConstructionFailure:driver.constructionFailed,drive:async(...args)=>{terminal=await driver.drive(...args);return terminal}})
     const unit=await resolver(command.capture.path,rootCaptures.get(command.capture.handle),command.root.name,{...context,branch:command.contract.$==='PreparationSelection.FunctionContract'?'function':'type'},options)
     const expected=await Effect.runPromise(resolveGraphUnit(command.capture.path,rootCaptures.get(command.capture.handle),command.root.name,{...context,branch:command.contract.$==='PreparationSelection.FunctionContract'?'function':'type',captureCache:new Map()}));assert.deepEqual(unit,expected)
     response={$:'RootResolved',unit:unit===undefined?none:some(productValue(unit)),references:terminal.finalFrame?.$==='Some'?terminal.finalFrame.value.references:list([]),captures:snapshotCaptures()};break
    }
    case 'RenderUnits': {
     const contract=command.contract.$==='PreparationSelection.FunctionContract'?FUNCTION_INPUT_CONTRACT:TYPE_INPUT_CONTRACT
     const declarations=unlist(command.declarations).map(({id,declaration})=>({artifact:{id,kind:declaration.kind,name:declaration.name},location:{start:{line:Number(declaration.location.start.line),column:Number(declaration.location.start.column)},end:{line:Number(declaration.location.end.line),column:Number(declaration.location.end.column)}}}))
     const outcomes=nativePrepareReadyUnits(unlist(command.units).map(fromProductValue),declarations,command.context.capture.path,{contract,graphLimits:GRAPH_LIMIT_CEILINGS,supportingCaptures:cache,observation:{root},context:{settings:{rules:configuredRules}}})
     response={$:'UnitsRendered',outcomes:list(outcomes.map(outcome=>({$:'OutcomeReady',path:outcome.path,prepared:productValue(outcome.prepared)})))};break
    }
    default:throw new Error('Unexpected preparation provider '+command.$)
   }
   return {$:'Reply',invocation:request.invocation,id:request.id,response}
  }})
  // One action sink and one resource dispatcher for both parent and resolver.
  connection.attachDriver(driver);parentInvocation=driver.allocateInvocation()
  const session={invocation:parentInvocation,revoke(){},close(){}}
  const limits={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,...Object.fromEntries(Object.entries(GRAPH_LIMIT_CEILINGS).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
  const outcome=await driver.drive(session,{invocation:BigInt(parentInvocation),preparation:{$:'Input',candidates:list([{$:'Candidate',path:currentPath,operation:{$:'CandidateAdd'},added_lines:list([])}]),contracts:list(mode==='mixed-contracts'?[{$:'PreparationSelection.TypeContract'},{$:'PreparationSelection.FunctionContract'}]:[{$:'PreparationSelection.TypeContract'}]),limits,frozen:none,line:none,verified:none,native_patch:none,advicee_host:'codex',before_analyze:true}})
  if(mode.startsWith('parent-cancel')) {
   assert.ok(outcome.failure);assert.equal(roots,1);assert.equal(physicalLateSuccess,1)
   assert.equal(driver.stats.accepted,0)
  } else {
   assert.ok(outcome.preparation);assert.equal(outcome.preparation.selected,mode==='resize-refused'?0n:2n)
   assert.equal(unlist(outcome.preparation.units).length,mode==='resize-refused'?0:mode==='first-refused'?1:2)
   if(mode==='two-roots'||mode==='mixed-contracts') {
    const expected=await Effect.runPromise(prepareObservation({root,rootIdentity,advicee:advicee(),candidates:[{operation:'add',path:currentPath}]},{settings:{rules:configuredRules},policy:DEFAULT_DIRECT_FILE_POLICY,...(mode==='mixed-contracts'?{}:{inputContract:TYPE_INPUT_CONTRACT})}))
    assert.equal(expected.observation.status,'complete')
    assert.deepEqual(decodePreparationResult(outcome.preparation,advicee()),expected)
    assert.deepEqual(unlist(outcome.preparation.units).map(fromProductValue),expected.observation.changeSet.units)
    const actualReady=unlist(outcome.preparation.outcomes).filter(value=>value.$==='OutcomeReady').map(value=>fromProductValue(value.prepared))
    assert.ok(actualReady.length>0,'actual prepared input is produced')
    assert.deepEqual(actualReady,expected.outcomes.filter(value=>value.status==='ready').map(({prepared})=>{const {advicee:ignored,...source}=prepared;return source}))
   }
   if(mode.startsWith('retention-')) {
    await consumeRetainedPreparation(connection,outcome.preparation,root,rootIdentity,mode)
   } else {
   // Only complete preparation terminal converts capacity; child terminal does not.
   const completed=Effect.runSync(connection.bridge.native((draft,records)=>[completePreparation(draft,'agent',connection.preparation.operation,connection.preparation.reservation,unlist(outcome.preparation.units).map(()=>100),connection.round),records])).value
   assert.equal(completed.length,unlist(outcome.preparation.units).length)
   }
  }
  assert.equal(driver.stats.providerStarts,driver.stats.providerCleanups)
  assert.deepEqual(driver.resources,{payloads:0,leases:0,sessions:0,artifactStates:0,launches:0});assert.equal(registry.size,0)
  const rootFds=await Promise.all((await readdir('/proc/self/fd')).map(fd=>readlink('/proc/self/fd/'+fd).catch(()=>'')));assert.equal(rootFds.filter(path=>path===root||path.startsWith(root+'/')).length,0)
  cases++
 }
 console.log(JSON.stringify({passed:true,cases,requests,scope:'actual resident transaction, capacity resize/completion, emitted preparation progression and nested split resolver with native Python/TypeScript IO and full native preparation differential for successful branches; parent cancellation/late success/rejection and first semantic refusal; actual native preflight/workspace sizing/prepared input policy children; actual post-preparation admission/planning, revision/claims/spawn/enqueue and three post-acceptance cancellation barriers; native policy deletion, source-free Canonical progression and production adoption remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
