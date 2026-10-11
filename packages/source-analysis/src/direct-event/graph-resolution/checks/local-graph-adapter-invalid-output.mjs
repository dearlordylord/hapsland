import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createLocalGraphPlanner} from './local-graph-planner-adapter.mjs'
const temporary=mkdtempSync(join(tmpdir(),'hapsland-graph-invalid-output-'))
try{
 const emitted=join(temporary,'core.mjs')
 execFileSync('bend',[new URL('../representations/word-route/core.bend',import.meta.url).pathname,'-o',emitted],{timeout:5000})
 const core=(await import(pathToFileURL(emitted))).default
 const declaration=(id,references)=>({artifact:{id,name:id,kind:'function'},references})
 const file={declarations:new Map([['A',declaration('A',[{kind:'named',name:'B'},{kind:'named',name:'I'}])],['B',declaration('B',[])]]),imports:new Map([['I',{path:'./i',name:'Remote'}]])}
 const mutations={
  missingPending:p=>{p.pending={$:'Nil'}},
  invalidListTail:p=>{p.nodes.tail.tail={$:'Unknown'}},
  root:p=>{p.root=999},
  duplicateNode:p=>{p.nodes.tail.head.node=0},
  missingArtifact:p=>{p.nodes.head.artifact=999},
  missingOwner:p=>{p.references.head.owner=999},
  slotGap:p=>{p.references.head.index=1},
  referenceVariant:p=>{p.references.head.reference.$='Unknown'},
  expansionCycle:p=>{p.references.head.reference.node=0},
  omissionReason:p=>{p.references.tail.head.reference.reason.$='Unknown'},
  pendingOwner:p=>{p.pending.head.owner=999},
  pendingVariant:p=>{p.pending.head.target.$='Unknown'},
  expectedKind:p=>{p.pending.head.expected.$='Unknown'},
  importName:p=>{p.pending.head.target.name=p.pending.head.symbol},
  duplicatePending:p=>{p.pending.tail=structuredClone(p.pending)},
 }
 let cases=0
 for(const [name,mutate] of Object.entries(mutations)){
  const visited=new Set(['prior']),targetSet=new Set(['existing']),targetsByPath=new Map([['other.ts',targetSet]])
  const budget={limits:{work:128,depth:32,outgoingEdges:16},targetsByPath,maxTargetsInFile:1,work:0,graphWork:0,maxDepth:0}
  const planner=createLocalGraphPlanner({plan(...args){const result=core.plan(...args);assert.equal(result.$,'CompletePlan');mutate(result.plan);return result}})
  assert.throws(()=>planner(file,'a.ts','A',undefined,visited,budget,0),TypeError,name)
  assert.deepEqual([...visited],['prior']);assert.deepEqual([...targetSet],['existing']);assert.equal(targetsByPath.size,1);assert.equal(budget.work,0)
  cases++
 }
 const record={passed:true,cases,scope:'malformed complete emitted planner outputs fail before any caller-owned visited/budget commit; exact reference/node/pending variants, addresses, payload handles, slot order and import name; does not establish universal lawful-output shape or compiler bridge'}
 writeFileSync(new URL('./local-graph-adapter-invalid-output.json',import.meta.url),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
