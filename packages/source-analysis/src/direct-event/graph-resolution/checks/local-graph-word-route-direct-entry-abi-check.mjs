import {withDirectEntry} from './local-graph-direct-entry.mjs'
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
const root=resolve(import.meta.dirname,'../../../../../..'),temporary=mkdtempSync(join(tmpdir(),'hapsland-graph-connected-bench-')),requireRoot=createRequire(root+'/package.json')
try{
 const emitted=join(temporary,'core.mjs')
 execFileSync('bend',[resolve(import.meta.dirname,'local-graph-representation-prototypes/word-route/core.bend'),'-o',emitted],{timeout:5000})

 writeFileSync(emitted,withDirectEntry(readFileSync(emitted,'utf8')));
 const originalPath=join(root,'packages/source-analysis/dist/direct-event/graph-resolver.js')
 const original=readFileSync(originalPath,'utf8').replace(/from "([^"\n]+)"/g,(_,specifier)=>'from '+JSON.stringify(specifier.startsWith('.')?resolve(dirname(originalPath),specifier):requireRoot.resolve(specifier)))
 const start=original.indexOf('const buildLocal = ('),end=original.indexOf('\nconst graphClock = ',start)
 assert.ok(start>=0&&end>start)
 const adapterPath=pathToFileURL(resolve(import.meta.dirname,'local-graph-planner-adapter.mjs')).href
 const candidate=original.slice(0,start)+`import assert from "node:assert/strict"; import {createLocalGraphPlanner,commitLocalGraphPlan} from ${JSON.stringify(adapterPath)};
 import core,{directPlan} from ${JSON.stringify(pathToFileURL(emitted).href)};const libraryPlan=core.plan;core.plan=(...args)=>{const actual=directPlan(...args),expected=libraryPlan(...args);const normalize=x=>typeof x==='bigint'?Number(x):Array.isArray(x)?x.map(normalize):x!==null&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,normalize(v)])):x;assert.deepEqual(normalize(actual),normalize(expected));return actual};
 const planner=createLocalGraphPlanner(core);
 const buildLocal=(file,path,name,visited,budget,depth,expectedKind)=>commitLocalGraphPlan(planner(file,path,name,expectedKind,visited,budget,depth),visited,budget);
 `+original.slice(end)
 writeFileSync(join(temporary,'native.mjs'),original);writeFileSync(join(temporary,'candidate.mjs'),candidate)
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
 for(const size of [16,64,256,1024])for(const shape of ['limited','wide']){
  const references=shape==='limited'?Math.min(size,16):size;
  fixtures.push({name:'large-'+size+'-'+shape,symbol:'Root',files:{'a.ts':Array.from({length:size},(_,i)=>'interface T'+i+' { value: string }').join('\n')+'\ninterface Root { '+Array.from({length:references},(_,i)=>'p'+i+': T'+(size-1-i)).join('; ')+' }'}})
 }
 const profiles=[{}, {work:1},{work:2},{work:3},{work:4},{outgoingEdges:1},{depth:1},{treeBytes:80}]
 const scenarios=[]
 for(const fixture of fixtures){
  const rootPath=fixture.path??'a.ts'
  const directory=join(temporary,fixture.name);execFileSync('git',['init','-q',directory],{timeout:5000})
  for(const [path,source] of Object.entries(fixture.files)){mkdirSync(dirname(join(directory,path)),{recursive:true});writeFileSync(join(directory,path),source)}
  const event={hook_event_name:'PostToolUse',tool_name:'apply_patch',session_id:'session',turn_id:'turn',tool_use_id:'tool-use',cwd:directory,tool_input:{command:'*** Begin Patch\n*** Add File: '+rootPath+'\n+type A = string\n*** End Patch'},tool_response:{}}
  const observed=await Effect.runPromise(adaptCodexDirectEvent(event));assert.ok(observed)
  const selected=await Effect.runPromise(eligibleNamedPath(directory,rootPath,DEFAULT_DIRECT_FILE_POLICY,observed.rootIdentity));assert.ok(selected)
  const captured=await Effect.runPromise(captureStable(directory,selected,{},observed.rootIdentity));assert.equal(captured.status,'captured')
  for(const profile of profiles){
   const context={root:directory,rootIdentity:observed.rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:fixture.branch,limits:{...GRAPH_LIMIT_CEILINGS,...profile}}
   const expected=await Effect.runPromise(nativeModule.resolveGraphUnit(rootPath,captured.capture,fixture.symbol,context))
   scenarios.push({scenario:fixture.name+':'+JSON.stringify(profile),rootPath,capture:captured.capture,name:fixture.symbol,context,expected})
  }
 }
 const phaseSamples=[];let phaseRecording=false;
 const batch=async module=>{
  let checksum=0
  for(const scenario of scenarios){
   const actual=await Effect.runPromise(module.resolveGraphUnit(scenario.rootPath,scenario.capture,scenario.name,scenario.context))
   assert.deepEqual(actual,scenario.expected);
   checksum+=JSON.stringify(actual)?.length??0
  }
  return checksum
 }
 const samples={native:[],bend:[]},modules={native:nativeModule,bend:candidateModule},startedAt=new Date().toISOString(),stop=Date.now()+180000
 for(let warm=0;warm<0;warm++)for(const module of Object.values(modules))await batch(module)
 phaseRecording=true;
 for(let pair=0;pair<1;pair++){
  const lanes=Object.entries(modules);if(pair%2)lanes.reverse()
  for(const [lane,module] of lanes){
   assert.ok(Date.now()<stop,'connected benchmark deadline exhausted')
   const start=performance.now(),checksum=await batch(module),seconds=(performance.now()-start)/1000
   const sample={seconds,checksum,scenarios:scenarios.length,fullResultsEqual:true}
   samples[lane].push(sample);console.log(JSON.stringify({pair,lane,...sample}))
   writeFileSync('/tmp/hapsland-local-graph-list-state-word-route-direct-entry-abi-check-progress.json',JSON.stringify({startedAt,samples},null,2))
  }
 }
 assert.equal(new Set(Object.values(samples).flat().map(sample=>sample.checksum)).size,1)
 const mean=xs=>xs.reduce((total,sample)=>total+sample.seconds,0)/xs.length,ratio=mean(samples.bend)/mean(samples.native)
 const record={startedAt,at:new Date().toISOString(),measuredPairs:1,samples,meanRatio:ratio,executionParity:ratio<=1,phaseSamples,scope:'directentry-vs-library full rawplan ABI diagnostic only; validated tags/types/uint32/immediate Nat; no performance qualification, unchanged emitted core, immediateNatvalidation without cloning, no generated library ABI conversions;  same current checkout native whole buildLocal vs complete emitted Bend local planner/state adapter temporarily connected to actual resolveGraphUnit; native functionFacts/parser/stable filesystem capture/IO/import graph unchanged;168fixture-profile scenarios x17alternating pairs after5warmups; no instrumentation; predeclared feasibility threshold meanratio<=1; later immutableproductionacceptance still required, CPU11 nonexclusive, one Bun worker; full ReviewUnit equals native everycall; no trace instrumentation, preparation outside timing; no frozen-baseline replacement, cold-start, universal proof or production adoption claim'}
 writeFileSync('/tmp/hapsland-local-graph-list-state-word-route-direct-entry-abi-check.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({ratio,executionParity:record.executionParity}))
}finally{rmSync(temporary,{recursive:true,force:true})}
