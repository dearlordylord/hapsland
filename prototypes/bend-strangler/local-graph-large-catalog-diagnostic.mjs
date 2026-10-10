import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {buildLocal} from './local-graph-native-oracle.mjs'
import {createLocalGraphPlanner as triePlanner,commitLocalGraphPlan as trieCommit} from './local-graph-planner-adapter.mjs'
import {createLocalGraphPlanner as listPlanner,commitLocalGraphPlan as listCommit} from './local-graph-representation-prototypes/list-state/adapter.mjs'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-graph-large-catalog-'))
const stateSummary=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([p,s])=>[p,[...s].sort()]).sort(),work:budget.work,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile,graphWork:budget.graphWork})
const normalize=(built,visited,budget)=>{
 if(built===undefined)return {missing:true,state:stateSummary(visited,budget)}
 const addresses=new Map();let next=0
 const visit=node=>{addresses.set(node,next++);for(const r of node.references)if(r.kind==='expanded')visit(r.node)};visit(built.node)
 return {node:built.node,pending:built.pending.map(p=>({owner:addresses.get(p.owner),index:p.index,from:p.from,symbol:p.symbol,name:p.name,depth:p.depth,...(p.expectedKind===undefined?{}:{expectedKind:p.expectedKind}),...(p.bundled?{bundled:p.bundled.declaration.artifact.id}:{importPath:p.importPath})})),state:stateSummary(visited,budget)}
}

try{
 const planners={}
 for(const [lane,input,factory,commit] of [['trie','word-route',triePlanner,trieCommit],['list','list-state',listPlanner,listCommit]]){
  const output=join(temporary,lane+'.mjs')
  execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes',input,'core.bend'),'-o',output],{timeout:5000})
  planners[lane]={plan:factory((await import(pathToFileURL(output))).default),commit}
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

 const run=(lane,fixture)=>{
  const visited=new Set(fixture.prior),b=budget()
  const built=lane==='native'?buildLocal(fixture.file,'a.ts','N0',visited,b,0):planners[lane].commit(planners[lane].plan(fixture.file,'a.ts','N0',undefined,visited,b,0),visited,b)
  return normalize(built,visited,b)
 }
 const goldens=fixtures.map(fixture=>run('native',fixture))
 for(let warm=0;warm<2;warm++)for(const lane of ['native','trie','list'])for(let i=0;i<fixtures.length;i++)assert.deepEqual(run(lane,fixtures[i]),goldens[i])
 const samples=[]
 for(let round=0;round<4;round++){
  const lanes=round%2?['list','trie','native']:['native','trie','list']
  for(const lane of lanes)for(let i=0;i<fixtures.length;i++){
   const start=performance.now(),actual=run(lane,fixtures[i]);assert.deepEqual(actual,goldens[i])
   samples.push({round,lane,n:fixtures[i].n,priorCount:fixtures[i].priorCount,milliseconds:performance.now()-start})
  }
 }
 const means=fixtures.map(f=>({n:f.n,priorCount:f.priorCount,...Object.fromEntries(['native','trie','list'].map(lane=>{const selected=samples.filter(s=>s.lane===lane&&s.n===f.n&&s.priorCount===f.priorCount);return [lane,selected.reduce((total,s)=>total+s.milliseconds,0)/selected.length]}))}))
 const record={passed:true,diagnostic:true,samples,means,cases:fixtures.length,rounds:4,scope:'synthetic full planner growth diagnostic, catalogs4/16/64/256/1024 and prior visited0/128/1024; exact complete adapter with state commit and structural validation; frozen native oracle excludes canonical helper overhead, no real producer/IO; all full trees/queues/extensional states equal before and during every timed sample;4rounds after2warmups on CPU11 nonexclusive; no performance qualification'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-large-catalog-diagnostic.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({...record,samples:undefined}))
}finally{rmSync(temporary,{recursive:true,force:true})}
