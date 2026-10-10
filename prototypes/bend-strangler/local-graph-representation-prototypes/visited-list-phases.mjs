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
const entries=m=>m.$==='MTip'?[]:m.$==='MLeaf'?[[m.key,m.val]]:[...entries(m.lo),...entries(m.hi)]
const expectation=value=>({$:value===undefined?'AnyKind':value==='type'?'TypeKind':'FunctionKind'})
const stateSummary=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([p,s])=>[p,[...s].sort()]).sort(),work:budget.work,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile,graphWork:budget.graphWork})
const normalize=(built,visited,budget)=>{
 if(built===undefined)return {missing:true,state:stateSummary(visited,budget)}
 const addresses=new Map();let next=0
 const visit=node=>{addresses.set(node,next++);for(const r of node.references)if(r.kind==='expanded')visit(r.node)};visit(built.node)
 return {node:built.node,pending:built.pending.map(p=>({owner:addresses.get(p.owner),index:p.index,from:p.from,symbol:p.symbol,name:p.name,depth:p.depth,...(p.expectedKind===undefined?{}:{expectedKind:p.expectedKind}),...(p.bundled?{bundled:p.bundled.declaration.artifact.id}:{importPath:p.importPath})})),state:stateSummary(visited,budget)}
}
try{
 const models={}
 for(const [lane,input] of [['patricia','/workspace/typescript/hapsland-bend-selection-ui'+'/evidence/bend-strangler/local-graph-draft/core.bend'],['list','/tmp/hapsland-local-graph-visited-list-prototype.bend']]){
  const out=join(temporary,lane+'.mjs');execFileSync('bend',[input,'-o',out],{timeout:5000});models[lane]=(await import(pathToFileURL(out))).default
 }
 const phaseSamples=[]
 let core=models.patricia,listVisited=false
 function candidate(file,name,expected,visited,budget,depth){
  const phaseStart=performance.now()
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
  const encodedAt=performance.now()
  const result=core.plan(facts,'a.ts',name,expectation(expected),seen,rawBudget,depth)
  const plannedAt=performance.now()
  const finish=actual=>{phaseSamples.push({lane:listVisited?'list':'patricia',encoding:encodedAt-phaseStart,plan:plannedAt-encodedAt,materialization:performance.now()-plannedAt});return actual}
  assert.notEqual(result.$,'InvariantFailure','derived traversal bound exhausted')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(listVisited?unlist(raw.visited).reverse():entries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(entries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(entries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot')return finish(normalize(undefined,updatedVisited,updatedBudget))
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:artifacts.get(Number(n.artifact)),references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:slot.symbol}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:r.identity}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:r.target_name},reason:reasons[r.reason.$]}
  }
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:p.from,symbol:p.symbol,name:p.name,depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:p.target.path}:{bundled:{declaration:{artifact:artifacts.get(Number(p.target.declaration))}}})}))
  return finish(normalize({node:nodes.get(Number(raw.root)),pending},updatedVisited,updatedBudget))
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
  core=models[lane];listVisited=lane==='list';return candidate(f.file,'N0',undefined,f.prior,budget(),0)
 }
 for(const f of fixtures){const expected=run('native',f);for(const lane of ['patricia','list'])assert.deepEqual(run(lane,f),expected)}
 for(let warm=0;warm<3;warm++)for(const lane of ['native','patricia','list'])for(const f of fixtures)run(lane,f)
 phaseSamples.length=0
 const samples=[]
 for(let round=0;round<7;round++)for(const lane of round%2===0?['native','patricia','list']:['list','patricia','native']){
  const start=performance.now();for(const f of fixtures)run(lane,f);samples.push({round,lane,milliseconds:performance.now()-start})
 }
 const mean=lane=>samples.filter(s=>s.lane===lane).reduce((sum,s)=>sum+s.milliseconds,0)/7
 const phaseMean=(lane,field)=>phaseSamples.filter(s=>s.lane===lane).reduce((sum,s)=>sum+s[field],0)/7
 const phaseMilliseconds=Object.fromEntries(['patricia','list'].map(lane=>[lane,Object.fromEntries(['encoding','plan','materialization'].map(field=>[field,phaseMean(lane,field)]))]))
 const record={phaseMilliseconds,phaseSamples,scope:'synthetic complete planner including catalog encoding, tree/queue/state materialization and equal validation projection; 15fixtures sizes4/16/64/256/1024 and prior visited0/128/1024; representation pilot, not production qualification',cases:fixtures.length,pairs:7,samples,meanMilliseconds:{native:mean('native'),patricia:mean('patricia'),list:mean('list')},listToPatricia:mean('list')/mean('patricia'),listToNative:mean('list')/mean('native'),allFullResultsEqual:true}
 writeFileSync('/tmp/hapsland-local-graph-visited-list-phases.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({...record,samples:undefined,phaseSamples:undefined}))
}finally{rmSync(temporary,{recursive:true,force:true})}
