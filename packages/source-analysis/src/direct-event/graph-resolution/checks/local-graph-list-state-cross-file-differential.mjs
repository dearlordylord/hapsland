import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join,dirname,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import * as Effect from 'effect/Effect'
import {adaptCodexDirectEvent} from '@hapsland/native-observation/direct-event/adapter'
import {captureStable} from '@hapsland/native-observation/direct-event/capture'
import {DEFAULT_DIRECT_FILE_POLICY,eligibleNamedPath} from '@hapsland/native-observation/direct-event/selection'
import {GRAPH_LIMIT_CEILINGS} from '@hapsland/canonical-policy/canonical/graph-limits'
const root=resolve(import.meta.dirname,'../../../../../..'),temporary=mkdtempSync(join(tmpdir(),'hapsland-graph-cross-file-')),requireRoot=createRequire(root+'/package.json')
try{
 const emitted=join(temporary,'core.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/core.bend'),'-o',emitted],{timeout:5000})
 const originalPath=join(root,'packages/source-analysis/dist/direct-event/graph-resolver.js')
 let original=readFileSync(originalPath,'utf8').replace(/from "([^"\n]+)"/g,(_,specifier)=>'from '+JSON.stringify(specifier.startsWith('.')?resolve(dirname(originalPath),specifier):requireRoot.resolve(specifier)))
 assert.equal(original.split('    return frame;').length,2)
 original=original.replace('    return frame;','    graphFrames.push(frame); return frame;')
 const start=original.indexOf('const buildLocal = ('),end=original.indexOf('\nconst graphClock = ',start)
 assert.ok(start>=0&&end>start)
 const observation=`
 export const localTraces=[],graphFrames=[];
 const snapshot=(visited,budget)=>({visited:[...visited].sort(),targets:[...budget.targetsByPath].map(([path,targets])=>[path,[...targets].sort()]).sort(),work:budget.work,graphWork:budget.graphWork,maxDepth:budget.maxDepth,maxTargets:budget.maxTargetsInFile});
 let localDepth=0;
 const buildLocal=(file,path,name,visited,budget,depth,expectedKind=undefined)=>{
  const outer=localDepth++===0;
  const before=outer?snapshot(visited,budget):undefined;
  try{
   const built=runLocal(file,path,name,visited,budget,depth,expectedKind);
   if(outer)localTraces.push({path,name,depth,expectedKind,before,after:snapshot(visited,budget),missing:built===undefined});
   return built;
  }finally{localDepth--}
 };
 `
 const native=original.slice(0,start)+original.slice(start,end).replace('const buildLocal = (','const runLocal = (')+observation+original.slice(end)
 const adapterPath=pathToFileURL(resolve(import.meta.dirname,'local-graph-representation-prototypes/list-state/adapter.mjs')).href
 const candidate=original.slice(0,start)+`import {createLocalGraphPlanner,commitLocalGraphPlan} from ${JSON.stringify(adapterPath)};
 import core from ${JSON.stringify(pathToFileURL(emitted).href)};
 const planner=createLocalGraphPlanner(core);
 const runLocal=(file,path,name,visited,budget,depth,expectedKind)=>commitLocalGraphPlan(planner(file,path,name,expectedKind,visited,budget,depth),visited,budget);
 `+observation+original.slice(end)
 writeFileSync(join(temporary,'native.mjs'),native);writeFileSync(join(temporary,'candidate.mjs'),candidate)
 const nativeModule=await import(pathToFileURL(join(temporary,'native.mjs'))),candidateModule=await import(pathToFileURL(join(temporary,'candidate.mjs')))
 const fixtures=[
  {name:'local-kinds',branch:'function',symbol:'run',files:{'a.ts':"type Foo = string; function Foo(): Foo { return 'x' } export function run(): Foo { return Foo() }"}},
  {name:'function-import',branch:'function',symbol:'run',files:{'a.ts':"import { helper } from './b'; export function run(): number { return helper() }",'b.ts':'export function helper(): number { return 1 }'}},
  {name:'type-only-function',branch:'function',symbol:'run',files:{'a.ts':"import type { helper } from './b'; export function run(): number { return helper() }",'b.ts':'export function helper(): number { return 1 }'}},
  {name:'type-chain',symbol:'A',files:{'a.ts':"import type { B } from './b'; interface A { b: B }",'b.ts':"import type { C } from './c'; export interface B { c: C }",'c.ts':'export interface C { value: string }'}},
  {name:'retained-work',symbol:'A',files:{'a.ts':"import type { B } from './b'; interface A { b: B }",'b.ts':"import type { D } from './d'; interface C { value: string } export interface B { c: C; d: D }",'d.ts':"import type { E } from './e'; export interface D { e: E }",'e.ts':'export interface E { value: string }'}},
  {name:'shared-cycle',symbol:'A',files:{'a.ts':"import type { B } from './b'; import type { C } from './c'; export interface A { b: B; c: C }",'b.ts':"import type { A } from './a'; export interface B { a: A }",'c.ts':"import type { B } from './b'; export interface C { b: B }"}},
  {name:'missing-import',symbol:'A',files:{'a.ts':"import type { B } from './absent'; export interface A { b: B }"}},
  {name:'multiple-supporting-targets',symbol:'A',files:{'a.ts':"import type { B } from './b'; interface A { b: B }",'b.ts':"import type { C } from './c'; import type { D } from './d'; export interface B { c: C; d: D }",'c.ts':'export interface C { x: string }','d.ts':'export interface D { y: string }'}},
 ]
 fixtures.push(
  {name:'bend-bundled-base',path:'model.bend',symbol:'Root',files:{'model.bend':'import Base\ntype Root is Data:\n  Root{values: List<&2,U32>}'}},
  {name:'bend-bundled-and-import',path:'model.bend',symbol:'Root',files:{'model.bend':'import Base\nimport ./receipt.bend as R\ntype Root is Data:\n  Root{values: List<&2,R.Receipt>}','receipt.bend':'import Base\ntype Receipt is Data:\n  Receipt{id: U32}'}},
  {name:'bend-import-cycle',path:'model.bend',symbol:'Root',files:{'model.bend':'import ./child.bend as C\ntype Root is Data:\n  Root{child: C.Child}','child.bend':'import ./model.bend as R\ntype Child is Data:\n  Child{root: R.Root}'}},
  {name:'rust-local',path:'model.rs',symbol:'A',files:{'model.rs':'struct B { value: u8 } struct A { b: B }'}},
  {name:'rust-module',path:'src/lib.rs',symbol:'A',files:{'Cargo.toml':'[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n','src/lib.rs':'mod b; use crate::b::B; pub struct A { b: B }','src/b.rs':'pub struct B { value: u8 }'}}
 )
 const profiles=[{}, {work:1},{work:2},{work:3},{work:4},{outgoingEdges:1},{depth:1},{treeBytes:80}]
 let cases=0,localCalls=0,readEvents=0,captureRejectedWithRetainedBudget=0
 for(const fixture of fixtures){
  const rootPath=fixture.path??'a.ts'
  const directory=join(temporary,fixture.name);execFileSync('git',['init','-q',directory],{timeout:5000})
  for(const [path,source] of Object.entries(fixture.files)){mkdirSync(dirname(join(directory,path)),{recursive:true});writeFileSync(join(directory,path),source)}
  const event={hook_event_name:'PostToolUse',tool_name:'apply_patch',session_id:'session',turn_id:'turn',tool_use_id:'tool-use',cwd:directory,tool_input:{command:'*** Begin Patch\n*** Add File: '+rootPath+'\n+type A = string\n*** End Patch'},tool_response:{}}
  const observed=await Effect.runPromise(adaptCodexDirectEvent(event));assert.ok(observed)
  const selected=await Effect.runPromise(eligibleNamedPath(directory,rootPath,DEFAULT_DIRECT_FILE_POLICY,observed.rootIdentity));assert.ok(selected)
  const captured=await Effect.runPromise(captureStable(directory,selected,{},observed.rootIdentity));assert.equal(captured.status,'captured')
  for(const profile of profiles){
   const run=async module=>{
    module.localTraces.length=0;module.graphFrames.length=0;const reads=[],diagnostics=[]
    const unit=await Effect.runPromise(module.resolveGraphUnit(rootPath,captured.capture,fixture.symbol,{root:directory,rootIdentity:observed.rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:fixture.branch,limits:{...GRAPH_LIMIT_CEILINGS,...profile},captureHooks:{sourceRead:path=>reads.push(path)},observeCaptureDiagnostic:(path,diagnostic)=>diagnostics.push({path,diagnostic})}))
    const frame=module.graphFrames.at(-1)
    const finalState=frame===undefined?undefined:{visited:[...frame.visited].sort(),targets:[...frame.budget.targetsByPath].map(([path,targets])=>[path,[...targets].sort()]).sort(),work:frame.budget.work,graphWork:frame.budget.graphWork,maxDepth:frame.budget.maxDepth,maxTargets:frame.budget.maxTargetsInFile,captured:[...frame.captured.keys()],artifacts:[...frame.artifactsByTarget],state:frame.state,command:frame.command}
    return {unit,reads,diagnostics,localTraces:structuredClone(module.localTraces),finalState:structuredClone(finalState)}
   }
   const baseline=await run(nativeModule),actual=await run(candidateModule)
   assert.deepEqual(actual,baseline,fixture.name+' '+JSON.stringify(profile));
   if(Object.keys(profile).length===0){
    assert.ok(actual.unit,fixture.name+' default profile produced no review')
    if(fixture.name==='rust-module')assert.ok(actual.reads.includes('src/b.rs'),'Rust fixture did not exercise cross-file continuation')
    if(fixture.name.startsWith('bend-bundled')){
     const stack=[actual.unit.root];let bundled=false
     while(stack.length){const node=stack.pop();if(node.artifact.origin?.kind==='bundled')bundled=true;for(const reference of node.references)if(reference.kind==='expanded')stack.push(reference.node)}
     assert.ok(bundled,'Bend fixture did not exercise bundled payload expansion')
    }
   }
   cases++;localCalls+=actual.localTraces.length;readEvents+=actual.reads.length
   for(const trace of actual.localTraces){if(actual.finalState!==undefined&&trace.after.visited.some(id=>!actual.finalState.visited.includes(id))){assert.ok(actual.finalState.work>=trace.after.work);captureRejectedWithRetainedBudget++}}
   console.log(JSON.stringify({fixture:fixture.name,profile,localCalls:actual.localTraces.length,reads:actual.reads.length,equal:true}))
  }
 }
 assert.ok(localCalls>cases);assert.ok(readEvents>0);assert.ok(captureRejectedWithRetainedBudget>0)
 const record={passed:true,cases,localCalls,readEvents,captureRejectedWithRetainedBudget,scope:'actual compiled resolveGraphUnit, parser, stable filesystem captures, import graph scheduling and capture acceptance; temporary module replaces complete buildLocal with emitted full Bend planner and state adapter; exact review unit, ordered source-read observations, diagnostics and per-local-call before/after state traces plus final published visited/budget/import graph state; rejected tentative identities absent while budgets retained;13 TypeScript/Bend/Rust fixtures x8 bounded profiles including bundled Base continuation; no production integration, universal proof, performance or arbitrary-language claim'}
 writeFileSync(resolve(import.meta.dirname,'local-graph-list-state-cross-file-differential.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
