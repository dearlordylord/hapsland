import {createLocalGraphPlanner,commitLocalGraphPlan} from './local-graph-representation-prototypes/list-state/adapter.mjs'
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
 let lastMaterialized
 const planner=createLocalGraphPlanner(models.direct)
 function directCandidate(file,name,expected,visited,budget,depth){
  const result=planner(file,invocationPath,name,expected,visited,budget,depth)
  return normalize(commitLocalGraphPlan(result,visited,budget),visited,budget)
 }

 const inspect=index=>producer.functionFacts(invocationPath,sources[index])
 const {GRAPH_LIMIT_CEILINGS}=await import(pathToFileURL(root+'/packages/canonical-policy/dist/canonical/graph-limits.js'))
 const budget=()=>({limits:GRAPH_LIMIT_CEILINGS,targetsByPath:new Map(),maxTargetsInFile:0,work:0,graphWork:0,maxDepth:0})
 const run=index=>{
  const facts=inspect(index);assert.notEqual(facts,undefined)
  const declaration=[...facts.declarations.values()].reverse().find(d=>d.artifact.kind==='function');const rootName=declaration?.artifact.name??'f'
  const visited=new Set(),b=budget()
  return lane==='bend'?directCandidate(facts,rootName,undefined,visited,b,0):normalize(native.buildLocal(facts,invocationPath,rootName,visited,b,0),visited,b)
 }
 const actual=sources.map((_,i)=>run(i));assert.ok(actual.some(v=>v.missing!==true))
 if(mode==='prepare'){writeFileSync(goldenPath,JSON.stringify(actual));process.exitCode=0}
 else{
  const expected=JSON.parse(readFileSync(goldenPath,'utf8'));assert.deepEqual(actual,expected)
  const batch=()=>{let checksum=0;for(let round=0;round<20;round++)for(let i=0;i<sources.length;i++){const value=run(i);assert.deepEqual(value,expected[i]);checksum+=JSON.stringify(value).length}return checksum}
  let checksum;for(let warm=0;warm<5;warm++){const value=batch();checksum??=value;assert.equal(value,checksum)}
  const start=performance.now();assert.equal(batch(),checksum);const seconds=(performance.now()-start)/1000
  console.log(JSON.stringify({seconds,checksum,fixtures:sources.length,rounds:20,warmups:5,fullEqual:true,missingRoots:actual.filter(v=>v.missing===true).length,lane}))
 }
}finally{rmSync(temporary,{recursive:true,force:true})}
