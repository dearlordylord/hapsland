import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs'
import {join,dirname,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {performance} from 'node:perf_hooks'
const [root,lane,mode,goldenPath,corePath]=process.argv.slice(2)
const temporary=mkdtempSync(join(tmpdir(),'hapsland-real-graph-worker-'))
const invocationPath='src/example.ts'
const sources=JSON.parse(readFileSync(new URL('./reference-analyzer-node-execution.json',import.meta.url),'utf8')).sources
const requireRoot=createRequire(root+'/package.json')
async function expose(relative,suffix){
 const original=join(root,relative),target=join(temporary,relative.split('/').at(-1)+'.mjs')
 const code=readFileSync(original,'utf8').replace(/from "([^"\n]+)"/g,(_,specifier)=>'from '+JSON.stringify(specifier.startsWith('.')?resolve(dirname(original),specifier):requireRoot.resolve(specifier)))
 writeFileSync(target,code+'\n'+suffix+'\n')
 return await import(pathToFileURL(target))
}
try{
 const producer=await expose('packages/source-analysis/dist/direct-event/languages/typescript.js','export {functionFacts}')
 const native=await expose('packages/source-analysis/dist/direct-event/graph-resolver.js','export {buildLocal}')
 const models={direct:(await import(pathToFileURL(corePath))).default}
const empty=()=>({$:'MTip'}),list=xs=>xs.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
const unlist=xs=>{const result=[];while(xs.$==='Con'){result.push(xs.head);xs=xs.tail}return result}
const entries=m=>{const result=[],stack=[m];while(stack.length){const node=stack.pop();if(node.$==='Own.DNil'||node.$==='MTip')continue;if(node.$==='Own.DLeaf')result.push([node.key,node.value]);else if(node.$==='MLeaf')result.push([node.key,node.val]);else if(node.$==='Own.DCon'){result.push([node.key,node.value]);stack.push(node.rest)}else if(node.$==='Own.DBranch')stack.push(node.one,node.zero);else if(node.$==='MNode')stack.push(node.hi,node.lo);else throw new TypeError('invalid emitted dictionary')}return result}
const expectation=value=>({$:value===undefined?'AnyKind':value==='type'?'TypeKind':'FunctionKind'})
const stateSummary=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([p,s])=>[p,[...s].sort()]).sort(),work:budget.work,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile,graphWork:budget.graphWork})
const normalize=(built,visited,budget)=>{
 if(built===undefined)return {missing:true,state:stateSummary(visited,budget)}
 const addresses=new Map();let next=0
 const visit=node=>{addresses.set(node,next++);for(const r of node.references)if(r.kind==='expanded')visit(r.node)};visit(built.node)
 return {node:built.node,pending:built.pending.map(p=>({owner:addresses.get(p.owner),index:p.index,from:p.from,symbol:p.symbol,name:p.name,depth:p.depth,...(p.expectedKind===undefined?{}:{expectedKind:p.expectedKind}),...(p.bundled?{bundled:p.bundled.declaration.artifact.id}:{importPath:p.importPath})})),state:stateSummary(visited,budget)}
}
 const phaseTotals={producer:0,encoding:0,bend:0,materialization:0,nativePlanner:0};let recording=false
 let lastMaterialized
 function directCandidate(file,name,expected,visited,budget,depth){
  const phaseStart=performance.now()
  const ids=new Map(),strings=[],labels=new Map()
  const intern=s=>{if(typeof s!=='string')throw new TypeError('registry key must be String');const old=ids.get(s);if(old!==undefined)return old;const id=ids.size+1;if(!Number.isSafeInteger(id)||id>0xffffffff)throw new RangeError('registry ID outside uint32');ids.set(s,id);strings[id]=s;return id}
  const label=s=>{const old=labels.get(s);if(old!==undefined)return old;const value={$:'Label',key:intern(s),type_key:intern('type:'+s),function_key:intern('function:'+s)};labels.set(s,value);return value}
  const decodedEntries=m=>entries(m).map(([key,value])=>[text(key),value])
  const text=v=>{const s=strings[Number(v)];if(typeof s!=='string')throw new TypeError('missing decoded String');return s}
  const declarationsByHandle=new Map();let next=1
  const encodeDeclaration=d=>{const handle=next++;declarationsByHandle.set(handle,{declaration:d,file});return {$:'Declaration',handle,identity:intern(d.artifact.id),function:d.artifact.kind==='function',bundled:d.artifact.origin?.kind==='bundled',references:list(d.references.map(r=>({$:'Reference',kind:{$:r.kind==='unsupported'?'Unsupported':'Named'},name:label(r.name),expected:expectation(r.expectedKind),target:r.targetId===undefined?{$:'None'}:{$:'Some',value:intern(r.targetId)}})))}}
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
  const imports=dictionary([...file.imports].map(([key,b])=>[key,{$:'Some',value:{$:'ImportBinding',path:intern(b.path),name:intern(b.name),type_only:b.typeOnly===true,composite:intern(invocationPath+'\0'+b.path+'\0'+b.name)}}]))
  const seen=dictionary([...visited].map(key=>[key,true]))
  const targets=dictionary([...budget.targetsByPath].map(([key,t])=>[key,dictionary([...t].map(id=>[id,true]))]))
  const rawBudget={$:'Budget',limits:{$:'LocalLimits',work:budget.limits.work,depth:budget.limits.depth,targets:budget.limits.outgoingEdges},targets_by_path:targets,max_targets:budget.maxTargetsInFile,work:budget.work,graph_work:budget.graphWork,max_depth:budget.maxDepth}
  const facts={$:'Facts',kind_aware:!!file.kindAware,declarations,imports,supporting},pathId=intern(invocationPath),rootLabel=label(name),kind=expectation(expected)
  const encodedAt=performance.now()
  const result=models.direct.plan(facts,pathId,rootLabel,kind,seen,rawBudget,depth)
  const executedAt=performance.now()
  const finishPhase=value=>{if(recording){phaseTotals.encoding+=encodedAt-phaseStart;phaseTotals.bend+=executedAt-encodedAt;phaseTotals.materialization+=performance.now()-executedAt}return value}
  if(result.$!=='CompletePlan'&&result.$!=='MissingRoot')throw new TypeError('unexpected checked planner result variant')
  const raw=result.$==='MissingRoot'?result:result.plan
  const updatedVisited=new Set(decodedEntries(raw.visited).map(([key])=>key)),updatedBudget={...budget,targetsByPath:new Map(decodedEntries(raw.budget.targets_by_path).map(([path,t])=>[path,new Set(decodedEntries(t).map(([key])=>key))])),work:Number(raw.budget.work),maxDepth:Number(raw.budget.max_depth),maxTargetsInFile:Number(raw.budget.max_targets),graphWork:Number(raw.budget.graph_work)}
  if(result.$==='MissingRoot'){lastMaterialized=undefined;return finishPhase(normalize(undefined,updatedVisited,updatedBudget))}
  const nodes=new Map(unlist(raw.nodes).map(n=>[Number(n.node),{artifact:declarationsByHandle.get(Number(n.artifact)).declaration.artifact,references:[]}]))
  const reasons={Unresolved:'unresolved',UnsupportedTarget:'unsupported',ReferenceLimit:'reference-limit',Unavailable:'unavailable'}
  for(const slot of unlist(raw.references)){
   const r=slot.reference,site={symbol:text(slot.symbol)}
   nodes.get(Number(slot.owner)).references[Number(slot.index)]=r.$==='Included'?{kind:'included',site,target:text(r.identity)}:r.$==='Expanded'?{kind:'expanded',site,node:nodes.get(Number(r.node))}:{kind:'omitted',site,target:{kind:'unresolved',symbol:text(r.target_name)},reason:reasons[r.reason.$]}
  }
  const bundledFor=handle=>{const payload=declarationsByHandle.get(Number(handle));if(payload===undefined||payload.file!==file)throw new TypeError('missing complete bundled payload');return payload}
  const pending=unlist(raw.pending).map(p=>({owner:nodes.get(Number(p.owner)),index:Number(p.index),from:text(p.from),symbol:text(p.symbol),name:text(p.name),depth:Number(p.depth),...(p.expected.$==='AnyKind'?{}:{expectedKind:p.expected.$==='TypeKind'?'type':'function'}),...(p.target.$==='Imported'?{importPath:text(p.target.path)}:{importPath:'',bundled:bundledFor(p.target.declaration)})}))
  lastMaterialized={node:nodes.get(Number(raw.root)),pending}
  return finishPhase(normalize(lastMaterialized,updatedVisited,updatedBudget))
 }
 const inspect=index=>producer.functionFacts(invocationPath,sources[index])
 const {GRAPH_LIMIT_CEILINGS}=await import(pathToFileURL(root+'/packages/canonical-policy/dist/canonical/graph-limits.js'))
 const budget=()=>({limits:GRAPH_LIMIT_CEILINGS,targetsByPath:new Map(),maxTargetsInFile:0,work:0,graphWork:0,maxDepth:0})
 const run=index=>{
  const producerStart=performance.now();const facts=inspect(index);if(recording)phaseTotals.producer+=performance.now()-producerStart;assert.notEqual(facts,undefined)
  const declaration=[...facts.declarations.values()].reverse().find(d=>d.artifact.kind==='function');const rootName=declaration?.artifact.name??'f'
  const visited=new Set(),b=budget()
  if(lane==='bend')return directCandidate(facts,rootName,undefined,visited,b,0)
  const plannerStart=performance.now(),value=normalize(native.buildLocal(facts,invocationPath,rootName,visited,b,0),visited,b);if(recording)phaseTotals.nativePlanner+=performance.now()-plannerStart;return value
 }
 const actual=sources.map((_,i)=>run(i));assert.ok(actual.some(v=>v.missing!==true))
 if(mode==='prepare'){writeFileSync(goldenPath,JSON.stringify(actual));process.exitCode=0}
 else{
  const expected=JSON.parse(readFileSync(goldenPath,'utf8'));assert.deepEqual(actual,expected)
  const batch=()=>{let checksum=0;for(let round=0;round<20;round++)for(let i=0;i<sources.length;i++){const value=run(i);assert.deepEqual(value,expected[i]);checksum+=JSON.stringify(value).length}return checksum}
  let checksum;for(let warm=0;warm<5;warm++){const value=batch();checksum??=value;assert.equal(value,checksum)}
  recording=true;const measuredStart=performance.now();for(let round=0;round<17;round++)assert.equal(batch(),checksum)
  const record={scope:'actual compiled functionFacts + full split-symbol planner, one handle table, validating complete Pending materializer;7fixtures incl1missingroot,20rounds each batch;17measured batches after5warmups; CPU11nonexclusive diagnostic, not paired qualification',seconds:(performance.now()-measuredStart)/1000/17,checksum,fullEqual:true,fixtures:sources.length,lane,meanBatchMilliseconds:Object.fromEntries(Object.entries(phaseTotals).map(([k,v])=>[k,v/17])),wholeResultsEqual:true}
  writeFileSync(resolve(import.meta.dirname,'local-graph-real-producer-'+lane+'-phases.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))

 }
}finally{rmSync(temporary,{recursive:true,force:true})}
