import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
const temp=await mkdtemp('/tmp/hapsland-composed-budget-')
try{
 const output=join(temp,'budget.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'./ComposedBudget.bend'),'-o',output],{timeout:5000});const {default:core}=await import(pathToFileURL(output))
 let checks=0
 for(const cap of [0,8,40])for(const rootBytes of [0,10,50]){
  let census=core.initial('root.py',BigInt(rootBytes));const captures=new Map([['root.py',rootBytes]]),failed=new Set()
  const inspect=()=>{for(const graphFiles of [0,1,4])for(const graphBytes of [0,10,200]){
   const graph={$:'../../../packages/agent-flow-bend/ImportGraph.Graph',phase:{$:'../../../packages/agent-flow-bend/ImportGraph.Idle'},pending:{$:'Nil'},visited:{$:'Nil'},files:BigInt(graphFiles),read_bytes:BigInt(graphBytes),tree_bytes:0n,work:5n,skipped_tree:false,skipped_excluded:false,skipped_other:false,limits:{$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,source_bytes:BigInt(cap),tree_bytes:1000n,files:10n,read_bytes:1000n,outgoing_edges:10n,depth:4n,work:20n}}
   const actual=core.usage(census,graph,BigInt(cap))
   assert.equal(actual.files,BigInt(Math.max(graphFiles,captures.size+failed.size)))
   assert.equal(actual.read_bytes,BigInt(Math.max(graphBytes,[...captures.values()].reduce((a,b)=>a+b,0)+failed.size*cap)))
   assert.equal(actual.work,5n);checks++
  }}
  inspect()
  for(const [path,bytes]of [['failed.py',undefined],['leaf.py',20],['leaf.py',7],['oversized.py',80],['failed.py',3],['root.py',12]]){
   const already=captures.has(path);census=core.reserved(census,path,already);if(!already)failed.add(path)
   inspect()
   if(bytes!==undefined){census=core.succeeded(census,path,BigInt(bytes));failed.delete(path);captures.set(path,bytes);inspect()}
  }
 }
 console.log(JSON.stringify({passed:true,checks,scope:'finite source census against independent Map/Set accounting: failed reservations, success before semantic refusal, repeated/changed byte counts, root replacement and graph max; not universal proof'}))
}finally{await rm(temp,{recursive:true,force:true})}
