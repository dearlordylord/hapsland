import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {languageForPath} from '../../../packages/source-analysis/dist/direct-event/languages/registry.js'
import {DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {createGraphFixtures} from './fixtures.mjs'
import {sourceFacts} from './frontend-codec.mjs'
import {list,unlist,binary64,fromProductValue} from './service-session.mjs'

const folder=import.meta.dirname,root=join(folder,'../../..'),scratch=join(root,'node_modules/.cache')
mkdirSync(scratch,{recursive:true})
const temporary=mkdtempSync(join(scratch,'whole-specification-'))
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
const inputs=['ExpansionSpecificationCheck.bend','ExpansionSpecification.bend','SignedLocalSpecification.bend','expansion-specification-check.mjs','ForestSpecification.bend','SPEC.bend','GraphSpecification.bend','Environment.bend','WholeObservation.bend','Types.bend','specification-check.mjs',
 '../local-graph-draft/SPEC.bend','../local-graph-draft/core.bend','../local-graph-draft/Traversal.bend','fixtures.mjs','frontend-codec.mjs',
 '../../../packages/source-analysis/dist/direct-event/graph-resolver.js',
 '../../../packages/source-analysis/dist/direct-event/languages/rust-module-context.js']
const sources=Object.fromEntries(inputs.map(path=>[path,hash(join(folder,path))]))
const tag=(module,name,fields={})=>({$:module==='Environment'||module==='WholeObservation'?name:`${module}.${name}`,...fields})
const label=value=>value.$.slice(value.$.lastIndexOf('.')+1)
const maybe=value=>value===undefined?{$:'None'}:{$:'Some',value}
const omissions={Unresolved:'unresolved',Unavailable:'unavailable',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit'}
try{
 assert.equal(execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim(),'bend 2.0.36')
 async function compile(name){const path=join(temporary,name+'.mjs');execFileSync('bend',[join(folder,name+'.bend'),'-o',path],{timeout:5000});return (await import(pathToFileURL(path))).default}
 const observations=await compile('ExpansionSpecificationCheck'),expansion=await compile('ExpansionSpecification'),policy=await compile('GraphSpecification'),spec=await compile('SPEC'),environment=await compile('Environment'),observation=await compile('WholeObservation'),forest=await compile('ForestSpecification')
 const nativePath=join(folder,'../../../packages/source-analysis/dist/direct-event/graph-resolver.js')
 const nativeSource=readFileSync(nativePath,'utf8').replaceAll(/from "(\.\/[^\"]+)"/g,(_all,path)=>`from "${pathToFileURL(join(dirname(nativePath),path))}"`)
 const nativeCopy=join(temporary,'native-root.mjs')
 writeFileSync(nativeCopy,nativeSource.replace('const transition = stepImportGraph(frame.state, event)', 'nativeEvents.push(event); const transition = stepImportGraph(frame.state, event)')+'\nconst nativeEvents=[]; export {prepareGraphFrame,executeGraphCommand,inspectCapturedSource,attachBundledSource,nativeEvents};\n')
 const {prepareGraphFrame,executeGraphCommand,inspectCapturedSource,attachBundledSource,nativeEvents}=await import(pathToFileURL(nativeCopy))
 const cases=[];let compared=0
 const fixtures=createGraphFixtures();fixtures.push({name:'post-build-negative-leaf',files:{'a.ts':'export interface A {}'},negativePostPermit:true},{name:'known-file-new-graph-work',files:{'a.ts':'export interface A {}'},knownChild:true},{name:'known-file-negative-post-permit',files:{'a.ts':'export interface A {}'},knownChild:true,negativePostPermit:true})
 for(const fixture of fixtures){
  const directory=join(temporary,fixture.name);mkdirSync(directory);execFileSync('git',['init','-q',directory])
  const path=fixture.path??'root.ts',text=fixture.source??`import type { A } from '${fixture.importPath??'./a'}'; export interface Root { a: A }`
  const files=new Map([[path,text],...Object.entries(fixture.files)])
  for(const [name,source] of files){mkdirSync(dirname(join(directory,name)),{recursive:true});writeFileSync(join(directory,name),source)}
  for(const name of fixture.directories??[])mkdirSync(join(directory,name),{recursive:true})
  const stable=name=>({text:files.get(name),byteLength:Buffer.byteLength(files.get(name))})
  const nativeLimits={...GRAPH_LIMIT_CEILINGS,...fixture.limits}
  const context=()=>{let ticks=0;return {root:directory,policy:fixture.policy??DEFAULT_DIRECT_FILE_POLICY,branch:fixture.branch??'type',limits:nativeLimits,
   captureCache:fixture.cache===undefined?undefined:new Map(fixture.cache),now:()=>ticks++>=(fixture.expireAt??Infinity)?5000:0,
   captureSource:(_root,selected)=>Effect.succeed(fixture.unavailable?{status:'unavailable',diagnostic:{stage:'capture',code:'fixture-unavailable',args:{}}}:{status:'captured',capture:stable(selected.relativePath)})}}
  nativeEvents.length=0
  const frame=await Effect.runPromise(prepareGraphFrame(path,stable(path),'Root',context()))
  if(!frame){cases.push({name:fixture.name,status:'native-pre-frame-return',localComparison:false});continue}
  const language=languageForPath(path),binding=await Effect.runPromise(language.prepareGraph(path,stable(path),context(),nativeLimits,()=>false))
  assert.ok(binding,fixture.name)
  const facts=binding.session.inspect(path,text,fixture.branch??'type');assert.ok(facts,fixture.name)
  const encoded=sourceFacts(facts),prepared=spec.source(encoded,0n)
  const limits=tag('../../../packages/agent-flow-bend/ImportGraph','Limits',{version:1n,...Object.fromEntries(Object.entries(binding.limits).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))})
  const result=spec.root(10000n,prepared,path,'Root',tag('Types',fixture.branch==='function'?'FunctionBranch':'TypeBranch'),limits)
  assert.equal(label(result),'RootBuilt',fixture.name)
  const artifacts=[...facts.declarations.values(),...(facts.supportingDeclarations?.values()??[])].map(item=>item.artifact)
  const addresses=new Map(),pendingOwners=new Map()
  function tree(node){addresses.set(String(node.address),node);return {artifact:artifacts[Number(node.artifact)],references:unlist(node.references).map(ref=>{
   const outcome=ref.outcome,site={symbol:ref.symbol}
   if(label(outcome)==='Included')return {kind:'included',site,target:outcome.identity}
   if(label(outcome)==='Expanded')return {kind:'expanded',site,node:tree(outcome.tree)}
   assert.equal(label(outcome),'Omitted');assert.ok(Object.hasOwn(omissions,label(outcome.reason)))
   return {kind:'omitted',site,target:{kind:'unresolved',symbol:outcome.target},reason:omissions[label(outcome.reason)]}
  })}}
  const actual={root:tree(result.tree),...(binding.dependencies.length?{sourceDependencies:binding.dependencies}:{})}
  assert.equal(JSON.stringify(actual),JSON.stringify(frame.unit),fixture.name+' exact root value/order')
  const created=forest.construct(10000n,result.tree,1n,list([]),result.source.artifacts)
  assert.equal(label(created),'Constructed',fixture.name+' semantic construction')
  const semantic={$:'Forest',root:maybe(created.created.root),nodes:created.created.nodes}
  const product=forest.unit(10000n,semantic,list(binding.dependencies));assert.equal(label(product),'Materialized')
  assert.equal(JSON.stringify(fromProductValue(product.product)),JSON.stringify(frame.unit),fixture.name+' forest ordered product')
  const birth=new Map()
  function visitBirth(node,route=[]){birth.set(node,route);for(const[index,reference]of node.references.entries())if(reference.kind==='expanded')visitBirth(reference.node,[...route,index])}
  visitBirth(frame.unit.root)
  const pending=forest.pending(list(unlist(result.state.pending_rev).reverse()),created.created.addresses);assert.equal(label(pending),'PendingBuilt')
  assert.deepEqual(unlist(pending.pending).map(item=>[Number(item.owner.episode),unlist(item.owner.route).map(Number)]),[...frame.pending.values()].map(item=>[1,birth.get(item.owner)]),fixture.name+' pending birth owner')
  // Reach the first real capture command without attaching a child yet.
  for(let i=0;i<20&&frame.command.kind!=='readSource';i++){
   if(['unitComplete','unitIncomplete'].includes(frame.command.kind))break
   const advanced=await Effect.runPromise(executeGraphCommand(frame));if(advanced==='invalid')break
  }
  if(frame.command.kind!=='readSource'){cases.push({name:fixture.name,status:'no-attachment-command'});continue}
  const targetId=frame.command.target,target=frame.pathForTarget.get(targetId);assert.ok(target)
  const isBundle=target.kind==='bundled',childPath=isBundle?target.edge.from:target.path
  const childCapture=isBundle?undefined:(fixture.cache?.get(childPath)??stable(childPath))
  const childFile=isBundle?{...target.file,declarations:new Map([[target.declaration.artifact.name,target.declaration]])}:frame.session.inspect(childPath,childCapture.text,frame.branch)
  if(!childFile){cases.push({name:fixture.name,status:'no-frontend-facts'});continue}
  const childEncoded=sourceFacts(childFile),catalog=spec.source(childEncoded,result.source.next_artifact)
  const expected=target.edge.expectedKind==='function'?'FunctionKind':target.edge.expectedKind==='type'?'TypeKind':'AnyKind'
  const name=isBundle?target.declaration.artifact.name:target.name
  // Native exported lookup precedes file buildLocal; bundle has no export gate.
  const key=childFile.kindAware?`${expected==='FunctionKind'?'function':'type'}:${name}`:name
  const declaration=childFile.declarations.get(key)
  if(!declaration||(!isBundle&&!declaration.exported)){cases.push({name:fixture.name,status:'pre-local-declaration-refusal'});continue}
  const entries=unlist(catalog.artifacts),artifact=entries.find(item=>item.value.id===declaration.artifact.id)??entries.find(item=>item.artifact?.id===declaration.artifact.id)
  assert.ok(artifact,fixture.name+' child catalog artifact')
  const handle=artifact.handle??artifact.id
  const local={$:'../local-graph-draft/core.Declaration',handle,identity:declaration.artifact.id,function:declaration.artifact.kind==='function',bundled:!!declaration.artifact.origin,references:list(declaration.references.map(ref=>({$:'../local-graph-draft/core.Reference',kind:{$:'../local-graph-draft/core.'+(ref.kind==='unsupported'?'Unsupported':'Named')},name:ref.name,expected:{$:'../local-graph-draft/core.'+(ref.expectedKind==='function'?'FunctionKind':ref.expectedKind==='type'?'TypeKind':'AnyKind')},target:maybe(ref.targetId)})))}
  function qualify(value,prefix,names){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return value.map(v=>qualify(v,prefix,names));return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='$'&&names.has(v)?prefix+'.'+v:qualify(v,prefix,names)]))}
  const forestNames=new Set(['Forest','Node','Created','AddressEntry','Pending','ReferenceSymbol','ArtifactIdentity','Included','Expanded','Omitted'])
  const fqual=value=>qualify(value,'ForestSpecification',forestNames)
  const edges=[...frame.pending.entries()].map(([id,item],index)=>({$:'Edge',id:BigInt(id),pending:fqual(unlist(pending.pending)[index]),source:encoded,catalog:{...result.source,$:'SPEC.Source'}}))
  const chosen=edges.find(item=>Number(item.id)===[...frame.pending.entries()].find(([,edge])=>edge===target.edge)[0]);assert.ok(chosen)
  const gtag=(name,fields={})=>tag('../../../packages/agent-flow-bend/ImportGraph',name,fields)
  function encodeEvent(e){switch(e.kind){case'root':return gtag('Root',{target:BigInt(e.target),source_bytes:BigInt(e.sourceBytes),tree_bytes:BigInt(e.treeBytes),local_work:BigInt(e.localWork??0),edges:list(e.edges.map(BigInt))});case'next':return gtag('Next');case'resolved':return gtag('Resolved',{target:BigInt(e.target),result:gtag({found:'Found',missing:'NotFound',ambiguous:'Many',unsupported:'Unhandled'}[e.result])});case'pathChecked':return gtag('PathChecked',{allowed:e.allowed});default:throw Error('unexpected pre-attachment '+e.kind)}}
  let graph=policy.bounded_initial(limits),command=gtag('NoCommand')
  for(const e of nativeEvents){const step=policy.bounded_transition(graph,encodeEvent(e));graph=step.state;command=step.command}
  if(fixture.knownChild){frame.visited.add(declaration.artifact.id);result.state=observations.mark_visited(result.state,declaration.artifact.id);frame.budget.graphWork=100;result.state.budget.graph_work=100n}
  if(fixture.negativePostPermit){frame.budget.work=100;result.state.budget.work=100n}
  const nativeBefore=frame.budget.work
  const independent={$:'Frame',graph,command,forest:fqual(semantic),local:{$:'SignedLocalSpecification.State',local:result.state,graph_work:{$:'WholeObservation.Nonnegative',value:0n}},pending:list(edges),captured:list([{ $:'Captured',path,source:encoded,bytes:BigInt(stable(path).byteLength)}]),identities:list([{$:'TargetArtifact',target:1n,identity:frame.unit.root.artifact.id}]),next_edge:BigInt(frame.nextId),next_episode:2n,next_artifact:result.source.next_artifact,dependencies:list(binding.dependencies)}
  const attempt={$:'Attempt',target:BigInt(targetId),edge:chosen,kind:isBundle?{$:'BundledChild'}:{$:'FileChild',path:childPath},source:childEncoded,bytes:BigInt(isBundle?Buffer.byteLength(declaration.artifact.source):childCapture.byteLength),name,expected:{$:'../local-graph-draft/core.'+(isBundle?'AnyKind':expected)},declaration:local,catalog:{...catalog,$:'SPEC.Source'},local_work_before:BigInt(nativeBefore)}
  let transaction=expansion.begin(independent,attempt),measurements=[]
  for(let steps=0;steps<10;steps++){
   if(label(transaction).startsWith('Transaction'))break
   const selected=expansion.choose(10000n,transaction)
   if(label(selected)==='Continue'){transaction=selected.transaction;continue}
   assert.equal(label(selected.operation),'EncodeProduct')
   const bytes=Buffer.byteLength(JSON.stringify(fromProductValue(selected.operation.value)));measurements.push(bytes)
   transaction=expansion.consume(selected.transaction,tag('Types','ProductEncoded',{bytes:BigInt(bytes)}))
  }
  if(fixture.negativePostPermit){assert.equal(label(transaction),'TransactionFailed');assert.equal(label(transaction.failure),'NegativeGraphWork');assert.throws(()=>inspectCapturedSource(frame,targetId,target,childPath,childCapture),error=>error instanceof TypeError);compared++;cases.push({name:fixture.name,status:'post-build-negative-permit-exact'});continue}
  assert.equal(label(transaction),'TransactionFinished',fixture.name+' transaction completes')
  const expectedEvents=nativeEvents.length
  if(isBundle)attachBundledSource(frame,targetId,target);else inspectCapturedSource(frame,targetId,target,childPath,childCapture)
  const final=transaction.frame
  const unqualified=qualify(final.forest,'unused',new Set())
  function unqual(value){if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='$'&&v.startsWith('ForestSpecification.')?v.slice('ForestSpecification.'.length):unqual(v)]))}
  const finalProduct=forest.unit(10000n,unqual(unqualified),list(binding.dependencies));assert.equal(label(finalProduct),'Materialized')
  assert.equal(JSON.stringify(fromProductValue(finalProduct.product)),JSON.stringify(frame.unit),fixture.name+' exact attached/rolled-back product')
  assert.equal(Number(observations.visited_count(final.local.local)),frame.visited.size,fixture.name+' visited cardinality')
  for(const id of new Set([...frame.visited,...entries.map(item=>(item.value??item.artifact).id)]))assert.equal(observations.seen(final.local.local,id),frame.visited.has(id),fixture.name+' tentative visited publication '+id)
  const expectedPending=[...frame.pending.entries()].map(([id,item])=>[id,item.index,item.from,item.symbol,item.name,item.depth,item.expectedKind??'any',item.bundled?'bundled':'file',item.bundled?item.bundled.declaration.artifact.id:item.importPath])
  const actualPending=unlist(final.pending).map(edge=>{const item=edge.pending.value;return [Number(edge.id),Number(item.index),item.from,item.symbol,item.name,Number(item.depth),label(item.expected)==='AnyKind'?'any':label(item.expected)==='FunctionKind'?'function':'type',label(item.target)==='BundledTarget'?'bundled':'file',item.target.path]})
  for(let i=0;i<expectedPending.length;i++)if(expectedPending[i][7]==='file')assert.deepEqual(actualPending[i],expectedPending[i],fixture.name+' full file pending payload')
  const budget=final.local.local.budget
  assert.deepEqual([budget.work,budget.max_targets,budget.max_depth].map(Number),[frame.budget.work,frame.budget.maxTargetsInFile,frame.budget.maxDepth],fixture.name+' retained budget')
  assert.equal(Number(final.next_edge),frame.nextId,fixture.name+' pending allocation')
  assert.equal(unlist(final.pending).length,frame.pending.size,fixture.name+' retained pending')
  assert.deepEqual(unlist(final.captured).map(item=>[item.path,Number(item.bytes)]),[...frame.captured].map(([path,item])=>[path,item.sourceBytes]),fixture.name+' capture publication')
  assert.deepEqual(unlist(final.identities).map(item=>[Number(item.target),item.identity]),[...frame.artifactsByTarget],fixture.name+' target identity publication')
  const admitted=nativeEvents.at(-1);assert.ok(['captured','captureFailed'].includes(admitted.kind));
  const expectedGraph=policy.bounded_transition(graph,admitted.kind==='captureFailed'?gtag('CaptureFailed'):gtag('Captured',{source_bytes:BigInt(admitted.sourceBytes),node_bytes:BigInt(admitted.treeBytes),local_work:BigInt(admitted.localWork??0),edges:list(admitted.edges.map(BigInt))}));assert.deepEqual(final.graph,expectedGraph.state,fixture.name+' exact bounded admission state');assert.deepEqual(final.command,expectedGraph.command,fixture.name+' graph command');
  assert.equal(nativeEvents.length,expectedEvents+1,fixture.name+' one graph admission')
  compared++;cases.push({name:fixture.name,status:'attachment-exact',bundle:isBundle,measurements,rollback:frame.command.kind==='skipImport'})
 }
 assert.ok(compared>0,'actual native attachment comparisons required')
 assert.deepEqual(Object.fromEntries(inputs.map(path=>[path,hash(join(folder,path))])),sources,'sources frozen')
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,compared,cases,scope:'Independent child transaction compared with actual native attachment on first reachable capture: exact unit/order, budget scalars, retained pending allocation/count and capture/target publication. Enclosing resolution/capture services, bundle pending payload/forest observation, signed failures, completion, interruption, universal proof and performance are not qualified.'}
 writeFileSync(join(folder,'expansion-specification-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({runtime:record.runtime,compared,cases:cases.length}))
}finally{rmSync(temporary,{recursive:true,force:true})}
