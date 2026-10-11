import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {languageForPath} from '../../../dist/direct-event/languages/registry.js'
import {DEFAULT_DIRECT_FILE_POLICY} from '../../../../native-observation/dist/direct-event/selection.js'
import {GRAPH_LIMIT_CEILINGS} from '../../../../canonical-policy/dist/canonical/graph-limits.js'
import {createGraphFixtures} from './fixtures.mjs'
import {sourceFacts} from './frontend-codec.mjs'
import {list,unlist,binary64,fromProductValue} from './service-session.mjs'

const folder=import.meta.dirname,root=join(folder,'../../../../..'),scratch=join(root,'node_modules/.cache')
mkdirSync(scratch,{recursive:true})
const temporary=mkdtempSync(join(scratch,'whole-specification-'))
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
const inputs=['./ForestSpecification.bend','./SPEC.bend','./GraphSpecification.bend','./Environment.bend','./WholeObservation.bend','./Types.bend','./specification-check.mjs',
 './traversal/SPEC.bend','./traversal/core.bend','./traversal/Traversal.bend','./fixtures.mjs','./frontend-codec.mjs',
 '../../../dist/direct-event/graph-resolver.js',
 '../../../dist/direct-event/languages/rust-module-context.js']
const sources=Object.fromEntries(inputs.map(path=>[path,hash(join(folder,path))]))
const tag=(module,name,fields={})=>({$:module==='Environment'||module==='WholeObservation'?name:`${module}.${name}`,...fields})
const label=value=>value.$.slice(value.$.lastIndexOf('.')+1)
const maybe=value=>value===undefined?{$:'None'}:{$:'Some',value}
const omissions={Unresolved:'unresolved',Unavailable:'unavailable',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit'}
try{
 assert.equal(execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim(),'bend 2.0.36')
 async function compile(name){const path=join(temporary,name+'.mjs');execFileSync('bend',[join(folder,name+'.bend'),'-o',path],{timeout:5000});return (await import(pathToFileURL(path))).default}
 const spec=await compile('SPEC'),environment=await compile('Environment'),observation=await compile('WholeObservation'),forest=await compile('ForestSpecification')
 const nativePath=join(folder,'../../../dist/direct-event/graph-resolver.js')
 const nativeSource=readFileSync(nativePath,'utf8').replaceAll(/from "(\.\/[^\"]+)"/g,(_all,path)=>`from "${pathToFileURL(join(dirname(nativePath),path))}"`)
 const nativeCopy=join(temporary,'native-root.mjs')
 writeFileSync(nativeCopy,nativeSource+'\nexport {prepareGraphFrame};\n')
 const {prepareGraphFrame}=await import(pathToFileURL(nativeCopy))
 const cases=[];let forestGuardCases=0
 for(const fixture of createGraphFixtures()){
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
  if(!forestGuardCases&&unlist(unlist(semantic.nodes)[0].references).length){
   const rootNode=unlist(semantic.nodes)[0],symbol={$:'ReferenceSymbol',text:'\0\ud800'},identity={$:'ArtifactIdentity',text:rootNode.artifact.id}
   const included={$:'Included',symbol,identity}
   const typedReplacement=forest.replace(semantic,rootNode.address,0n,included);assert.equal(label(typedReplacement),'Replaced');forestGuardCases++
   const typedProduct=fromProductValue(forest.unit(10000n,typedReplacement.forest,list(binding.dependencies)).product);assert.equal(typedProduct.root.references[0].site.symbol,'\0\ud800');assert.equal(typedProduct.root.references[0].target,rootNode.artifact.id);forestGuardCases++
   const empty=forest.replace(semantic,rootNode.address,0n,{$:'Omitted',symbol:{$:'ReferenceSymbol',text:''},target:{$:'ReferenceSymbol',text:''},reason:{$:'../local-graph-draft/core.Unavailable'}});assert.equal(label(empty),'Replaced');assert.equal(fromProductValue(forest.unit(10000n,empty.forest,list(binding.dependencies)).product).root.references[0].target.symbol,'');forestGuardCases++
   const missing={$:'WholeObservation.NodeAddress',episode:999999n,route:list([])}
   assert.equal(label(forest.replace(semantic,rootNode.address,0n,{$:'Expanded',symbol,child:missing})),'ReplacementInvalid');forestGuardCases++
   assert.equal(label(forest.replace(semantic,rootNode.address,0n,{$:'Expanded',symbol,child:rootNode.address})),'ReplacementInvalid');forestGuardCases++
   const duplicate={$:'Forest',root:semantic.root,nodes:list([...unlist(semantic.nodes),{...rootNode,references:list([])}])}
   assert.equal(label(forest.replace(duplicate,rootNode.address,0n,included)),'ReplacementInvalid');forestGuardCases++
   const later=forest.construct(10000n,result.tree,2n,list([]),result.source.artifacts);assert.equal(label(later),'Constructed')
   const retained=forest.append(semantic,later.created)
   const attached=forest.replace(retained,rootNode.address,0n,{$:'Expanded',symbol,child:later.created.root});assert.equal(label(attached),'Replaced');forestGuardCases++
   assert.equal(label(forest.replace(retained,later.created.root,0n,{$:'Expanded',symbol,child:rootNode.address})),'ReplacementInvalid');forestGuardCases++
   const rolledBack=forest.replace(attached.forest,rootNode.address,0n,included);assert.equal(label(rolledBack),'Replaced')
   assert.deepEqual(rolledBack.forest.nodes.tail,retained.nodes.tail,'rollback retains all child nodes and their birth addresses');forestGuardCases++
   const duplicateChild={$:'Forest',root:retained.root,nodes:list([...unlist(retained.nodes),unlist(later.created.nodes)[0]])}
   assert.equal(label(forest.replace(duplicateChild,rootNode.address,0n,{$:'Expanded',symbol,child:later.created.root})),'ReplacementInvalid');forestGuardCases++
   assert.equal(label(forest.construct(0n,result.tree,1n,list([]),result.source.artifacts)),'ConstructionExhausted')
   assert.equal(label(forest.unit(0n,semantic,list(binding.dependencies))),'MaterializationExhausted');forestGuardCases++
  }

  let address=0
  function visit(node){pendingOwners.set(node,address++);for(const ref of node.references)if(ref.kind==='expanded')visit(ref.node)}
  visit(frame.unit.root)
  const expectedPending=[...frame.pending.values()].map(item=>({owner:pendingOwners.get(item.owner),index:item.index,from:item.from,symbol:item.symbol,name:item.name,depth:item.depth,
   expected:item.expectedKind??'any',kind:item.bundled?'bundled':'file',payload:item.bundled?item.bundled.declaration.artifact.id:item.importPath}))
  const actualPending=unlist(result.state.pending_rev).reverse().map(item=>({owner:Number(item.owner),index:Number(item.index),from:item.from,symbol:item.symbol,name:item.name,depth:Number(item.depth),
   expected:label(item.expected)==='AnyKind'?'any':label(item.expected)==='FunctionKind'?'function':'type',kind:label(item.target)==='BundledTarget'?'bundled':'file',
   payload:label(item.target)==='BundledTarget'?artifacts[Number(item.target.declaration)].id:item.target.path}))
  assert.deepEqual(actualPending,expectedPending,fixture.name+' pending owner/index and payload order')
  const budget=result.state.budget
  assert.deepEqual([budget.max_targets,budget.work,budget.graph_work,budget.max_depth].map(Number),
   [frame.budget.maxTargetsInFile,frame.budget.work,frame.budget.graphWork,frame.budget.maxDepth],fixture.name+' budget scalars')
  cases.push({name:fixture.name,status:'root-local-exact',localComparison:true,pending:actualPending.length,nodes:addresses.size})
 }
 // Arbitrary independent operation order changes the world through a responder;
 // no expected request script is supplied to Environment.step.
 const initial=()=>tag('Environment','WorldState',{world:0n,effects:list([])})
 const respond=operation=>world=>tag('Environment','Returned',{world:world+1n,outcome:tag('Types','ClockRead',{bits:binary64(Number(world)+(label(operation)==='ReadClock'?100:200))}),effects:list([])})
 const request=(id,operation)=>tag('Types','Request',{invocation:7n,id:BigInt(id),operation})
 const first=environment.step(respond,request(1,tag('Types','ReadClock',{clock:tag('Types','ClockToken',{invocation:7n,id:9n})})),initial())
 const reordered=environment.step(respond,request(1,tag('Types','StartClock')),initial())
 assert.equal(first.state.world,1n);assert.notDeepEqual(first.reply.outcome,reordered.reply.outcome)
 const second=environment.step(respond,request(2,tag('Types','StartClock')),first.state)
 assert.equal(second.state.world,2n);assert.equal(unlist(second.state.effects).length,4)
 const lease=(id,invocation=7n)=>({$:'WholeObservation.ProviderLease',invocation,id})
 const nested={$:'WholeObservation.ProviderEffect',value:{$:'WholeObservation.Null'}}
 const suspended=environment.step(_operation=>world=>tag('Environment','Suspended',{world:world+1n,lease:lease(42n),effects:list([nested])}),request(3,tag('Types','StartClock')),initial())
 assert.equal(label(suspended),'Waiting');assert.equal(unlist(suspended.state.effects).length,2)
 const providerOutcome=tag('Types','ClockStarted',{clock:tag('Types','ClockToken',{invocation:999n,id:1n})})
 for(const foreignLease of [lease(999n),lease(42n,999n)])assert.deepEqual(environment.complete(suspended,tag('Environment','Completion',{lease:foreignLease,world:8n,outcome:providerOutcome,effects:list([nested])})),suspended,'foreign lease cannot complete this wait')
 const completed=environment.complete(suspended,tag('Environment','Completion',{lease:lease(42n),world:8n,outcome:providerOutcome,effects:list([nested])}))
 assert.equal(completed.state.world,8n);assert.deepEqual(unlist(completed.state.effects).map(label),['Invoked','ProviderEffect','ProviderEffect','Responded'])
 assert.equal(completed.reply.outcome.clock.invocation,999n,'ownership is not assumed by environment stamping')
 assert.deepEqual(environment.complete(completed,tag('Environment','Completion',{lease:lease(42n),world:99n,outcome:tag('Types','ProductEncoded',{bytes:0n}),effects:list([])})),completed,'completed provider is not reinvoked')
 assert.equal(observation.valid_text(tag('WholeObservation','Text',{units:list([0,0xd800,0xdc00,0xffff])})),true)
 assert.equal(observation.valid_text(tag('WholeObservation','Text',{units:list([0x10000])})),false)
 const inspection=tag('WholeObservation','ExceptionalUnpublishedState')
 for(const origin of ['InternalEvaluationBound','InternalSettleBound','InternalInvariant','InternalRuntimeShape','OriginalProvider','OriginalBoundary','ExternalProtocol']){
  const error=tag('WholeObservation','Error',{identity:maybe(1n),name:tag('WholeObservation','Text',{units:list([])}),message:tag('WholeObservation','Text',{units:list([])}),cause:maybe(),detail:maybe()})
  const progress=tag('WholeObservation','Finished',{terminal:tag('WholeObservation','TechnicalError',{origin:tag('WholeObservation',origin),error}),inspection})
  assert.equal(observation.completes(progress),!origin.startsWith('Internal'),origin)
 }
 assert.equal(observation.completes(tag('WholeObservation','EvaluationExhausted',{inspection})),false)
 assert.equal(observation.completes(tag('WholeObservation','Waiting',{request:request(1,tag('Types','StartClock')),lease:tag('WholeObservation','ProviderLease',{invocation:7n,id:1n}),inspection})),false)
 assert.deepEqual(Object.fromEntries(inputs.map(path=>[path,hash(join(folder,path))])),sources,'sources frozen during checks')
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,cases,rootComparisons:cases.filter(item=>item.localComparison).length,
  semanticForestProductAndPendingBirthExact:true,forestGuardCases,nominalReferenceDomainsPreserveEmptyNulAndLoneSurrogates:true,independentRootValueAndPendingExact:true,statefulOperationSelectedEnvironment:true,waitingSeparateAndCompletionDoesNotReinvoke:true,wrongTokenOwnershipNotAssumed:true,nestedProviderEffectsOrdered:true,foreignInvocationLeaseIgnored:true,
  textCodeUnitDomainChecked:true,implementationBoundFailuresCannotCountAsCompletion:true,
  scope:'Independent semantic forest root products/pending birth addresses plus slot-validity/retention checks; root/local portion of independent whole SPEC on actual frontend facts, exact root value/property order and pending owner/index/payload, budget scalars. Pre-frame outcomes recorded, not independently compared. No whole Rust/expansion/forest projection proof, full-state equivalence, termination, cancellation or performance qualification.'}
 writeFileSync(join(folder,'specification-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
