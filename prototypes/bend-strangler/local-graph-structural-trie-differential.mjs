import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {buildLocal} from './local-graph-native-oracle.mjs'
const root=resolve(import.meta.dirname,'../..'),temporary=mkdtempSync(join(tmpdir(),'hapsland-local-graph-diff-'))
const empty=()=>({$:'MTip'}),list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}return result}
const entries=m=>m.$==='Own.DNil'?[]:m.$==='Own.DLeaf'?[[m.key,m.value]]:m.$==='Own.DBranch'?[...entries(m.zero),...entries(m.one)]:m.$==='MTip'?[]:m.$==='MLeaf'?[[m.key,m.val]]:[...entries(m.lo),...entries(m.hi)]
const expectation=value=>({$:value===undefined?'AnyKind':value==='type'?'TypeKind':'FunctionKind'})
const stateSummary=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([p,s])=>[p,[...s].sort()]).sort(),work:budget.work,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile,graphWork:budget.graphWork})
const normalize=(built,visited,budget)=>{
 if(built===undefined)return {missing:true,state:stateSummary(visited,budget)}
 const addresses=new Map();let next=0
 const visit=node=>{addresses.set(node,next++);for(const r of node.references)if(r.kind==='expanded')visit(r.node)};visit(built.node)
 return {node:built.node,pending:built.pending.map(p=>({owner:addresses.get(p.owner),index:p.index,from:p.from,symbol:p.symbol,name:p.name,depth:p.depth,...(p.expectedKind===undefined?{}:{expectedKind:p.expectedKind}),...(p.bundled?{bundled:p.bundled.declaration.artifact.id}:{importPath:p.importPath})})),state:stateSummary(visited,budget)}
}
let invocationPath
try{
 const emitted=join(temporary,'core.mjs');execFileSync('bend',[resolve(import.meta.dirname,'local-graph-draft/core.bend'),'-o',emitted],{timeout:5000});const core=(await import(pathToFileURL(emitted))).default
 const coreTags=new Set(['PlannedNode','ReferenceSlot','Facts','Declaration','ImportBinding','Reference','AnyKind','TypeKind','FunctionKind','Named','Unsupported','Budget','LocalLimits','Pending','Imported','BundledTarget','Unresolved','UnsupportedTarget','ReferenceLimit','Unavailable'])
 const moduleTags=(value,prefix)=>{
  if(value===null||typeof value!=='object')return value
  if(Array.isArray(value))return value.map(v=>moduleTags(v,prefix))
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='$'?(prefix&&coreTags.has(v)?'core.'+v:!prefix&&typeof v==='string'&&v.startsWith('core.')?v.slice(5):v):moduleTags(v,prefix)]))
 }
 const specEmitted=join(temporary,'spec.mjs');execFileSync('bend',[resolve(import.meta.dirname,'local-graph-draft/SPEC.bend'),'-o',specEmitted],{timeout:5000});const spec=(await import(pathToFileURL(specEmitted))).default
 const relationEmitted=join(temporary,'relation.mjs');execFileSync('bend',[resolve(import.meta.dirname,'local-graph-draft/RELATION.bend'),'-o',relationEmitted],{timeout:5000});const relation=(await import(pathToFileURL(relationEmitted))).default
 const directEmitted=join(temporary,'interned.mjs');execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/structural-insertion/core.bend'),'-o',directEmitted],{timeout:5000});const models={direct:(await import(pathToFileURL(directEmitted))).default}
 function directCandidate(file,name,expected,visited,budget,depth){
  const ids=new Map(),strings=[]
  const intern=s=>{assert.equal(typeof s,'string');if(ids.has(s))return ids.get(s);const id=ids.size+1;assert.ok(Number.isSafeInteger(id)&&id<=0xffffffff);ids.set(s,id);strings[id]=s;return id}
  const label=s=>({$:'Label',key:intern(s),text:s,type_key:intern('type:'+s),function_key:intern('function:'+s)})
  const decodedEntries=m=>entries(m).map(([key,value])=>[strings[Number(key)],value])
  const text=v=>v.text
  const artifacts=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;artifacts.set(handle,d.artifact);return {$:'Declaration',handle,identity:label(d.artifact.id),function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:label(r.name),expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:label(r.targetId)}})))}}
  const dictionary=xs=>{
   const build=records=>{
    if(records.length===0)return {$:'Own.DNil'}
    if(records.length===1)return {$:'Own.DLeaf',key:records[0][0],value:records[0][1]}
    let difference=0;for(const [key]of records)difference|=records[0][0]^key
    const divisor=(difference&-difference)>>>0;assert.ok(divisor>0)
    const zero=[],one=[];for(const record of records)(Math.floor(record[0]/divisor)%2===0?zero:one).push(record)
    return {$:'Own.DBranch',divisor,zero:build(zero),one:build(one),count:records.length}
   }
   return build(xs.map(([name,value])=>[intern(name),value]))
  }
  const declarations=dictionary([...file.declarations].map(([key,d])=>[key,{$:'Some',value:encodeDeclaration(d)}]))
  const supporting=dictionary([...file.supportingDeclarations??[]].map(([key,d])=>[key,{$:'Some',value:encodeDeclaration(d)}]))
  const imports=dictionary([...file.imports].map(([key,b])=>[key,{$:'Some',value:{$:'ImportBinding',path:label(b.path),name:label(b.name),type_only:b.typeOnly===true,composite:label(invocationPath+'\0'+b.path+'\0'+b.name)}}]))
  const seen=dictionary([...visited].map(key=>[key,true]))
  const targets=dictionary([...budget.targetsByPath].map(([key,t])=>[key,dictionary([...t].map(id=>[id,true]))]))
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const result=models.direct.plan({$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting},label(invocationPath),label(name),expectation(expected),seen,rawBudget,depth)
  assert.notEqual(result.$,'InvariantFailure')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(decodedEntries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(decodedEntries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(decodedEntries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return normalize(undefined,updatedVisited,updatedBudget)
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:text(slot.symbol)}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:text(r.identity)}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:text(r.target_name)},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:text(p.from),symbol:text(p.symbol),name:text(p.name),depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:text(p.target.path)}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  return normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget)
 }
 function candidate(file,name,expected,visited,budget,depth){
  const internedResult=directCandidate(file,name,expected,visited,budget,depth)
  const artifacts=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;artifacts.set(handle,d.artifact);return {$:'Declaration',handle,identity:d.artifact.id,function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:r.name,expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:r.targetId}})))}}
  let declarations=empty(),imports=empty(),supporting=empty(),seen=empty(),targets=empty()
  const declarationRecords=[],supportingRecords=[]
  for(const [k,d] of file.declarations){const encoded=encodeDeclaration(d);declarations=core.declaration_entry(declarations,k,encoded);declarationRecords.push({$:'BOUNDARY.DeclarationEntry',key:k,declaration:encoded})}
  for(const [k,d] of file.supportingDeclarations??[]){const encoded=encodeDeclaration(d);supporting=core.declaration_entry(supporting,k,encoded);supportingRecords.push({$:'BOUNDARY.DeclarationEntry',key:k,declaration:encoded})}
  for(const [k,b] of file.imports)imports=core.import_entry(imports,k,{$:'ImportBinding',path:b.path,name:b.name,type_only:b.typeOnly===true})
  for(const id of visited)seen=core.identity_entry(seen,id)
  for(const [path,set] of budget.targetsByPath){let t=empty();for(const id of set)t=core.identity_entry(t,id);targets=core.path_targets_entry(targets,path,t)}
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const boundaryFacts=moduleTags({$:'BOUNDARY.BoundaryFacts',kind_aware:!!file.kindAware,declarations:list(declarationRecords),imports:list([...file.imports].map(([key,b])=>({$:'BOUNDARY.ImportEntry',key,binding:{$:'ImportBinding',path:b.path,name:b.name,type_only:b.typeOnly===true}}))),supporting:list(supportingRecords)},true)
  const boundaryState=moduleTags({$:'BOUNDARY.BoundaryState',visited:list([...visited]),targets:list([...budget.targetsByPath].map(([path,t])=>({$:'BOUNDARY.PathTargetsEntry',path,targets:list([...t])}))),limits:rawBudget.limits,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth},true)
  const exactCore=relation.core_observation(boundaryFacts,boundaryState,invocationPath,name,moduleTags(expectation(expected),true),depth)
  const exactSpec=relation.recursive_observation(boundaryFacts,boundaryState,invocationPath,name,moduleTags(expectation(expected),true),depth)
  assert.notEqual(exactCore.$,'Failed','proposed production completion law falsified')
  assert.notEqual(exactSpec.$,'Failed','proposed recursive completion law falsified')
  assert.deepEqual(exactCore,exactSpec,'proposed whole-algorithm equality law falsified')
  const facts={$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting}
  // Independent recursive tree specification has its own generous test bound.
  // This finite test bound is not the production termination theorem.
  const specification=moduleTags(spec.interpret(10000,moduleTags({$:'Request',facts,path:invocationPath,name,expected:expectation(expected),depth,state:{$:'State',visited:seen,budget:rawBudget,next_address:0,pending_rev:list([])}},true)),false)
  assert.equal(specification.$,'BuildResult');assert.notEqual(specification.build.$,'InsufficientBound')
  const specificationBuild=specification.build, specificationState=specificationBuild.state
  const specVisited=new Set(entries(specificationState.visited).map(([key])=>key))
  const specBudget={...budget,targetsByPath:new Map(entries(specificationState.budget.targets_by_path).map(([path,t])=>[path,new Set(entries(t).map(([key])=>key))])),work:Number(specificationState.budget.work),maxDepth:Number(specificationState.budget.max_depth),maxTargetsInFile:Number(specificationState.budget.max_targets),graphWork:Number(specificationState.budget.graph_work)}
  const specNodes=new Map(),reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  const decodeTree=tree=>{
   const node={artifact:artifacts.get(Number(tree.artifact)),references:[]};specNodes.set(Number(tree.address),node)
   node.references=unlist(tree.references).map(r=>{const o=r.outcome,site={symbol:r.symbol};return o.$==='Included'?{kind:'included',site,target:o.identity}:o.$==='Expanded'?{kind:'expanded',site,node:decodeTree(o.tree)}:{kind:'omitted',site,target:{kind:'unresolved',symbol:o.target},reason:reasons[o.reason.$]}});return node
  }
  const specTree=specificationBuild.$==='Built'?decodeTree(specificationBuild.tree):undefined
  const specPending=unlist(specificationState.pending_rev).reverse().map(p=>({owner:specNodes.get(Number(p.owner)),index:Number(p.index),from:p.from,symbol:p.symbol,name:p.name,depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:p.target.path}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  const specNormalized=normalize(specTree===undefined?undefined:{node:specTree,pending:specPending},specVisited,specBudget)
  const verifySpecification=actual=>{assert.deepEqual(actual,specNormalized,'independent recursive specification differs');assert.deepEqual(internedResult,actual,'numeric representation differs from unchanged String SPEC');return actual}
  const result=core.plan(facts,invocationPath,name,expectation(expected),seen,rawBudget,depth)
  assert.notEqual(result.$,'InvariantFailure','derived traversal bound exhausted')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(entries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(entries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(entries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return verifySpecification(normalize(undefined,updatedVisited,updatedBudget))
  const flat=moduleTags(spec.flatten(10000,{$:'FlattenTree',tree:moduleTags(specificationBuild.tree,true)}),false)
  assert.equal(flat.$,'Flat','independent tree projection exhausted')
  assert.deepEqual(flat.nodes,raw.nodes,'artifact handles/node addresses differ')
  assert.deepEqual(flat.slots,raw.references,'ordered reference slots differ')
  assert.deepEqual(unlist(specificationState.pending_rev).reverse(),unlist(raw.pending),'exact ordered pending handles differ')
  assert.deepEqual(specificationState.visited,raw.visited,'exact visited representation differs')
  assert.deepEqual(specificationState.budget,raw.budget,'exact budget representation differs')
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:slot.symbol}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:r.identity}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:r.target_name},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:p.from,symbol:p.symbol,name:p.name,depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:p.target.path}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  return verifySpecification(normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget))
 }
 let cases=0
 for(invocationPath of ['a.ts','nested/other.rs','path\0part']){
 for(let seed=0;seed<240;seed++){
  const aware=seed%2===0,artifact=(name,kind='function',origin)=>({id:name,name,kind,source:name,sourceHash:name,...(origin?{origin:{kind:'bundled'}}:{})})
  const ref=(name,extra={})=>({kind:'named',name,...extra})
  const declarations=new Map(),key=name=>aware?'function:'+name:name
  declarations.set(key('A'),{artifact:artifact('A'),references:[ref('B',{expectedKind:seed%2===0?'function':undefined}),ref('C'),ref('B'),{kind:'unsupported',name:'U'},ref('I',{expectedKind:seed%3===0?'function':undefined}),ref('T',{targetId:'T'}),ref('missing')]})
  declarations.set(key('B'),{artifact:artifact('B',seed%7===0?'interface':'function'),references:[ref('A'),ref('I')]})
  declarations.set(key('C'),{artifact:artifact('C'),references:[ref('B'),ref('T',{targetId:'T'})]})
  const imports=new Map([['I',{path:'./i',name:'Imported',typeOnly:seed%3===0}]])
  if(seed%5===0)imports.set('B',{path:'./b',name:'B'})
  const supportingDeclarations=new Map(seed%4===0?[]:[['T',{artifact:artifact(seed%11===0?'wrong':'T','datatype',seed%9!==0),references:[]}]])
  const file={kindAware:aware,declarations,imports,supportingDeclarations}
  const makeBudget=()=>({limits:{work:1+seed%12,depth:1+seed%4,outgoingEdges:1+seed%8},targetsByPath:new Map(seed%6===0?[[invocationPath,new Set(['prior'])]]:[]),maxTargetsInFile:seed%6===0?1:0,work:seed%3,graphWork:seed%2,maxDepth:seed%2})
  const name=seed%17===0?'absent':'A',depth=seed%3,visited=new Set(seed%8===0?['B','T']:[]),nativeBudget=makeBudget(),candidateBudget=makeBudget()
  // The oracle mutates its visited set; retain that exact state for comparison.
  const nativeVisited=new Set(visited),b=makeBudget(),built=buildLocal(file,invocationPath,name,nativeVisited,b,depth)
  assert.deepEqual(candidate(file,name,undefined,visited,candidateBudget,depth),normalize(built,nativeVisited,b),`seed ${seed}`);cases++
 }
 // Exact native NUL strings can collide across local identities and import keys.
 // Preserve these collisions instead of imposing disjoint key namespaces.
 for(let variant=0;variant<12;variant++){
  const id=variant%3===0?'a.ts\0./i\0Remote':variant%3===1?'missing':'shared'
  const declaration=(name,identity,refs,kind='function')=>({artifact:{id:identity,name,kind,source:name,sourceHash:name},references:refs})
  const ref=name=>({kind:'named',name})
  const aware=variant%2===0
  const file={kindAware:aware,declarations:new Map([[aware?'function:A':'A',declaration('A','root',[ref('B'),ref('I'),ref('missing'),ref('C')])],[aware?'function:B':'B',declaration('B',id,[])],[aware?'function:C':'C',declaration('C',id,[ref('A')])]]),imports:new Map([['I',{path:'./i',name:'Remote'}]])}
  if(variant>=8)file.declarations.set('type:A',declaration('A','type-root',[], 'interface'))
  const limits={work:128,depth:32,outgoingEdges:variant%4===0?2:16}
  const budget={limits,targetsByPath:new Map([['other.ts',new Set(['prior\0id'])]]),maxTargetsInFile:1,work:0,graphWork:0,maxDepth:0}
  const prior=new Set(variant%4===1?[id]:[]),nativeVisited=new Set(prior)
  const nativeBudget={...budget,targetsByPath:new Map([...budget.targetsByPath].map(([p,t])=>[p,new Set(t)]))}
  const expected=variant>=8?'type':undefined
  const built=buildLocal(file,invocationPath,'A',nativeVisited,nativeBudget,0,expected)
  assert.deepEqual(candidate(file,'A',expected,prior,budget,0),normalize(built,nativeVisited,nativeBudget),`collision/type-root ${variant}`);cases++
 }
 let random=918273
 const draw=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n}
 for(let trial=0;trial<200;trial++){
  const aware=draw(2)===0,decls=new Map(),names=Array.from({length:3+draw(6)},(_,i)=>'N'+i)
  for(const name of names){
   const kind=draw(3)===0?'interface':'function',refs=[]
   for(let i=0,n=draw(7);i<n;i++)refs.push({kind:draw(6)===0?'unsupported':'named',name:draw(4)===0?'I':names[draw(names.length)],...(draw(3)===0?{expectedKind:draw(2)===0?'type':'function'}:{})})
   const id=draw(5)===0?'shared':name
   decls.set(aware?(kind==='function'?'function:':'type:')+name:name,{artifact:{id,name,kind,source:name,sourceHash:name},references:refs})
  }
  const file={kindAware:aware,declarations:decls,imports:new Map([['I',{path:'./i',name:'I',typeOnly:draw(2)===0}]])}
  if(draw(3)===0)file.imports.set(names[1],{path:'./ambiguous',name:names[1]})
  const limits={work:1+draw(128),depth:1+draw(4),outgoingEdges:1+draw(16)}
  let nativeVisited=new Set(),candidateVisited=new Set(),nativeBudget={limits,targetsByPath:new Map(),maxTargetsInFile:0,work:0,graphWork:draw(5),maxDepth:0},candidateBudget={...nativeBudget,targetsByPath:new Map()}
  for(let invocation=0;invocation<2;invocation++){
   const beforeNative=new Set(nativeVisited),beforeCandidate=new Set(candidateVisited),name=names[draw(names.length)],expected=draw(2)===0?undefined:'type',depth=draw(3)
   const actual=candidate(file,name,expected,candidateVisited,candidateBudget,depth)
   // Both planners must receive the same explicit root lookup kind.
   const rootFile=file
   const rootVisited=new Set(beforeNative),rootBudget={...candidateBudget,targetsByPath:new Map([...candidateBudget.targetsByPath].map(([p,t])=>[p,new Set(t)]))}
   const rootBuilt=buildLocal(rootFile,invocationPath,name,rootVisited,rootBudget,depth,expected)
   assert.deepEqual(actual,normalize(rootBuilt,rootVisited,rootBudget),`random ${trial} invocation ${invocation}`);cases++
   nativeVisited=rootVisited;nativeBudget=rootBudget
   candidateVisited=new Set(actual.state.visited)
   candidateBudget={limits,targetsByPath:new Map(actual.state.targets.map(([p,t])=>[p,new Set(t)])),maxTargetsInFile:actual.state.maxTargets,work:actual.state.work,graphWork:actual.state.graphWork,maxDepth:actual.state.maxDepth}
   if(draw(3)===0){nativeVisited=beforeNative;candidateVisited=beforeCandidate}
  }
 }
 }
 const record={passed:true,cases,finiteFalsificationCoveredLaws:['whole_local_graph_exact','production_traversal_completes','recursive_specification_completes'],proofStatus:'unproved draft laws; finite emitted execution is not universal proof',scope:'compressed numeric trie full planner plus exact String driver over three invocation paths (including NUL); 1956 cases; Set/Map order normalized, ordered nodes/pending strict; complete emitted Bend driver versus independent recursive Bend specification and frozen native algorithm: full tree, ordered pending addresses, visited and targets/work/depth;240 structured cases+12 NUL-collision/type-root cases+200 deterministic random graphs with two stateful invocations each, optional tentative visited discard; finite stable catalogs; universal laws/production integration pending'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-structural-trie-differential.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
