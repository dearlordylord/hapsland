import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {buildLocal} from '/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/local-graph-native-oracle.mjs'
const root=resolve(import.meta.dirname,'../..'),temporary=mkdtempSync(join(tmpdir(),'hapsland-local-graph-diff-'))
const empty=()=>({$:'MTip'}),list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}return result}
const entries=m=>m.$==='Own.DNil'?[]:m.$==='Own.DLeaf'?[[m.key,m.value]]:m.$==='Own.DBranch'?[...entries(m.zero),...entries(m.one)]:m.$==='Own.DCon'?[[m.key,m.value],...entries(m.rest)]:m.$==='MTip'?[]:m.$==='MLeaf'?[[m.key,m.val]]:[...entries(m.lo),...entries(m.hi)]
const expectation=value=>({$:value===undefined?'AnyKind':value==='type'?'TypeKind':'FunctionKind'})
const stateSummary=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([p,s])=>[p,[...s].sort()]).sort(),work:budget.work,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile,graphWork:budget.graphWork})
const normalize=(built,visited,budget)=>{
 if(built===undefined)return {missing:true,state:stateSummary(visited,budget)}
 const addresses=new Map();let next=0
 const visit=node=>{addresses.set(node,next++);for(const r of node.references)if(r.kind==='expanded')visit(r.node)};visit(built.node)
 return {node:built.node,pending:built.pending.map(p=>({owner:addresses.get(p.owner),index:p.index,from:p.from,symbol:p.symbol,name:p.name,depth:p.depth,...(p.expectedKind===undefined?{}:{expectedKind:p.expectedKind}),...(p.bundled?{bundled:p.bundled.declaration.artifact.id}:{importPath:p.importPath})})),state:stateSummary(visited,budget)}
}
try{
 const coreTags=new Set(['PlannedNode','ReferenceSlot','Facts','Declaration','ImportBinding','Reference','AnyKind','TypeKind','FunctionKind','Named','Unsupported','Budget','LocalLimits','Pending','Imported','BundledTarget','Unresolved','UnsupportedTarget','ReferenceLimit','Unavailable'])
 const moduleTags=(value,prefix)=>{
  if(value===null||typeof value!=='object')return value
  if(Array.isArray(value))return value.map(v=>moduleTags(v,prefix))
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='$'?(prefix&&coreTags.has(v)?'core.'+v:!prefix&&typeof v==='string'&&v.startsWith('core.')?v.slice(5):v):moduleTags(v,prefix)]))
 }
 const models={}
 for(const [lane,input] of [['patricia','/workspace/typescript/hapsland-bend-selection-ui'+'/evidence/bend-strangler/local-graph-draft/core.bend'],['list','/tmp/hapsland-local-graph-visited-list-prototype.bend'],['bulk','/workspace/typescript/hapsland-bend-selection-ui/evidence/bend-strangler/local-graph-draft/RELATION.bend'],['own','/tmp/hapsland-ownlist-prototype/BOUNDARY.bend'],['direct','/tmp/hapsland-compressed-trie-prototype/core.bend']]){
  const out=join(temporary,lane+'.mjs');execFileSync('bend',[input,'-o',out],{timeout:5000});models[lane]=(await import(pathToFileURL(out))).default
 }
 let core=models.patricia,listVisited=false
 function candidate(file,name,expected,visited,budget,depth){
  const artifacts=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;artifacts.set(handle,d.artifact);return {$:'Declaration',handle,identity:d.artifact.id,function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:r.name,expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:r.targetId}})))}}
  let declarations=empty(),imports=empty(),supporting=empty(),seen=empty(),targets=empty()
  const declarationRecords=[],supportingRecords=[]
  for(const [k,d] of file.declarations){const encoded=encodeDeclaration(d);declarations=core.declaration_entry(declarations,k,encoded);declarationRecords.push({$:'BOUNDARY.DeclarationEntry',key:k,declaration:encoded})}
  for(const [k,d] of file.supportingDeclarations??[]){const encoded=encodeDeclaration(d);supporting=core.declaration_entry(supporting,k,encoded);supportingRecords.push({$:'BOUNDARY.DeclarationEntry',key:k,declaration:encoded})}
  for(const [k,b] of file.imports)imports=core.import_entry(imports,k,{$:'ImportBinding',path:b.path,name:b.name,type_only:b.typeOnly===true})
  if(listVisited)seen=list([...visited].reverse());else for(const id of visited)seen=core.identity_entry(seen,id)
  for(const [path,set] of budget.targetsByPath){let t=empty();for(const id of set)t=core.identity_entry(t,id);targets=core.path_targets_entry(targets,path,t)}
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const facts={$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting}
  const result=core.plan(facts,'a.ts',name,expectation(expected),seen,rawBudget,depth)
  assert.notEqual(result.$,'InvariantFailure','derived traversal bound exhausted')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(listVisited?unlist(raw.visited).reverse():entries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(entries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(entries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return normalize(undefined,updatedVisited,updatedBudget)
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:slot.symbol}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:r.identity}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:r.target_name},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:p.from,symbol:p.symbol,name:p.name,depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:p.target.path}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  return normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget)
 }

 function bulkCandidate(file,name,expected,visited,budget,depth,lane){
  const artifacts=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;artifacts.set(handle,d.artifact);return {$:'Declaration',handle,identity:d.artifact.id,function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:r.name,expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:r.targetId}})))}}
  const boundaryFacts=moduleTags({$:'BOUNDARY.BoundaryFacts',kind_aware:!!file.kindAware,declarations:list([...file.declarations].map(([key,d])=>({$:"BOUNDARY.DeclarationEntry",key,declaration:encodeDeclaration(d)}))),imports:list([...file.imports].map(([key,b])=>({$:'BOUNDARY.ImportEntry',key,binding:{$:'ImportBinding',path:b.path,name:b.name,type_only:b.typeOnly===true}}))),supporting:list([...file.supportingDeclarations??[]].map(([key,d])=>({$:"BOUNDARY.DeclarationEntry",key,declaration:encodeDeclaration(d)})))},true)
  const boundaryState=moduleTags({$:'BOUNDARY.BoundaryState',visited:list([...visited]),targets:list([...budget.targetsByPath].map(([path,t])=>({$:'BOUNDARY.PathTargetsEntry',path,targets:list([...t])}))),limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth},true)
  const unqualifyBoundary=v=>v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(unqualifyBoundary):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k==='$'&&typeof x==='string'&&x.startsWith('BOUNDARY.')?x.slice(9):unqualifyBoundary(x)]))
  const exactCore=lane==='own'?models.own.bulk_plan(unqualifyBoundary(boundaryFacts),unqualifyBoundary(boundaryState),'a.ts',name,moduleTags(expectation(expected),true),depth):models.bulk.core_observation(boundaryFacts,boundaryState,'a.ts',name,moduleTags(expectation(expected),true),depth)
  const observation=moduleTags(exactCore,false)
  assert.notEqual(observation.$,'Failed')
  const result=lane==='own'?observation:observation.$==='Present'?{$:'CompletePlan',plan:observation.plan}:{$:'MissingRoot',visited:observation.visited,budget:observation.budget}
  assert.notEqual(result.$,'InvariantFailure')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(listVisited?unlist(raw.visited).reverse():entries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(entries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(entries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return normalize(undefined,updatedVisited,updatedBudget)
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:slot.symbol}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:r.identity}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:r.target_name},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:p.from,symbol:p.symbol,name:p.name,depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:p.target.path}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  return normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget)
 }
 const phases={encoding:0,execution:0,materialization:0};let measured=false
 function directCandidate(file,name,expected,visited,budget,depth){
  const phaseStart=performance.now()
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
  const imports=dictionary([...file.imports].map(([key,b])=>[key,{$:'Some',value:{$:'ImportBinding',path:label(b.path),name:label(b.name),type_only:b.typeOnly===true,composite:label('a.ts\0'+b.path+'\0'+b.name)}}]))
  const seen=dictionary([...visited].map(key=>[key,true]))
  const targets=dictionary([...budget.targetsByPath].map(([key,t])=>[key,dictionary([...t].map(id=>[id,true]))]))
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const facts={$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting},pathLabel=label('a.ts'),nameLabel=label(name),kind=expectation(expected)
  const encodedAt=performance.now()
  const result=models.direct.plan(facts,pathLabel,nameLabel,kind,seen,rawBudget,depth)
  const executedAt=performance.now()
  assert.notEqual(result.$,'InvariantFailure')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(listVisited?unlist(raw.visited).reverse():decodedEntries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(decodedEntries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(decodedEntries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return normalize(undefined,updatedVisited,updatedBudget)
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:text(slot.symbol)}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:text(r.identity)}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:text(r.target_name)},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:text(p.from),symbol:text(p.symbol),name:text(p.name),depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:text(p.target.path)}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  const normalized=normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget)
  if(measured){phases.encoding+=encodedAt-phaseStart;phases.execution+=executedAt-encodedAt;phases.materialization+=performance.now()-executedAt}
  return normalized
 }
 const fixtures=[]
 for(const n of [4,16,64,256,1024])for(const priorCount of [0,128,1024]){
  const declarations=new Map()
  for(let i=0;i<n;i++){
   const name='N'+i
   declarations.set(name,{artifact:{id:name,name,kind:'function',source:name,sourceHash:name},references:[{kind:'named',name:'N'+((i+1)%n)},{kind:'named',name:'N'+((i+3)%n)},{kind:'named',name:i%3===0?'I':'missing'}]})
  }
  fixtures.push({n,priorCount,file:{declarations,imports:new Map([['I',{path:'./i',name:'Remote'}]])},prior:new Set(Array.from({length:priorCount},(_,i)=>'prior'+i))})
 }
 const budget=()=>({limits:{work:4096,depth:64,outgoingEdges:2048},targetsByPath:new Map(),maxTargetsInFile:0,work:0,graphWork:0,maxDepth:0})
 const run=(lane,f)=>{
  if(lane==='native'){const visited=new Set(f.prior),b=budget();return normalize(buildLocal(f.file,'a.ts','N0',visited,b,0),visited,b)}
  if(lane==='direct'){listVisited=false;return directCandidate(f.file,'N0',undefined,f.prior,budget(),0)}
  if(lane==='bulk'||lane==='own'){listVisited=false;return bulkCandidate(f.file,'N0',undefined,f.prior,budget(),0,lane)}
  core=models[lane];listVisited=lane==='list';return candidate(f.file,'N0',undefined,f.prior,budget(),0)
 }
 for(const f of fixtures){const expected=run('native',f);for(const lane of ['direct'])assert.deepEqual(run(lane,f),expected)}
 for(let warm=0;warm<3;warm++)for(const lane of ['native','direct'])for(const f of fixtures)run(lane,f)
 measured=true
 for(let round=0;round<17;round++)for(const f of fixtures)run('direct',f)
 const record={scope:'diagnostic phase breakdown of same complete compressed trie planner; 15 full fixtures,17 rounds; each phase summed per fixture batch',phasesMeanMilliseconds:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,v/17]))}
 writeFileSync('/tmp/hapsland-local-graph-compressed-trie-phases.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
