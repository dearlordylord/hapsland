import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {lstat} from 'node:fs/promises'
import {dirname,join,relative,isAbsolute} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {DEFAULT_DIRECT_FILE_POLICY,eligibleNamedPath,contextDirectFilePolicy} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {observationCaptureBudgetRefusal} from '../../../packages/source-analysis/dist/direct-event/capture-budget.js'
import {list,unlist} from './service-session.mjs'
const folder=import.meta.dirname,root=join(folder,'../../..'),cache=join(root,'node_modules/.cache')
mkdirSync(cache,{recursive:true});const temporary=mkdtempSync(join(cache,'rust-specification-'))
const native=join(root,'packages/source-analysis/dist/direct-event/languages/rust-module-context.js')
const inputs=['RustSpecification.bend','GraphSpecification.bend','Types.bend','rust-specification-check.mjs',native,join(root,'packages/source-analysis/dist/direct-event/capture-budget.js')]
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
const sources=Object.fromEntries(inputs.map(path=>[path,hash(isAbsolute(path)?path:join(folder,path))]))
const tag=(name,fields={})=>({$:'Types.'+name,...fields}),label=value=>value.$.split('.').at(-1),maybe=value=>value===undefined?{$:'None'}:{$:'Some',value}
const normalize=value=>typeof value==='bigint'?Number(value):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='$'?label(value):normalize(item)])):value
try{
 const emitted=join(temporary,'spec.mjs');execFileSync('bend',[join(folder,'RustSpecification.bend'),'-o',emitted],{timeout:5000})
 const spec=(await import(pathToFileURL(emitted))).default
 let source=readFileSync(native,'utf8').replaceAll(/from "(\.{1,2}\/[^\"]+)"/g,(_all,path)=>`from "${pathToFileURL(join(dirname(native),path))}"`)
 source=source.replace('import { lstat }','import { lstat as originalLstat }').replace('contextDirectFilePolicy, eligibleNamedPath','contextDirectFilePolicy, eligibleNamedPath as originalEligible')
 const marker='return { options: uniqueModuleRole(invalid, command.kind, roles), dependencies: [...dependencies].sort(), remaining };'
 assert.ok(source.includes(marker))
 source=source.replace(marker,'return { options: uniqueModuleRole(invalid, command.kind, roles), dependencies: [...dependencies].sort(), remaining, observation: {state, command, tasks: [...tasks], targets: [...targets], nextEdge, nextTarget, active, invalid, accumulatedDependencies: [...dependencies], roles} };')
 source+='\nexport let trace=[]; export function resetTrace(){trace=[]}; const lstat=async(path)=>{trace.push({operation:"ReadFileStatus",path});return originalLstat(path)}; const eligibleNamedPath=(...args)=>{trace.push({operation:"AccessPath",path:args[1]});return originalEligible(...args)};\n'
 const copy=join(temporary,'native.mjs');writeFileSync(copy,source)
 const original=await import(pathToFileURL(copy)),cases=[]
 for(const profile of [
  {name:'no-cargo',path:'src/root.rs'},
  {name:'no-cargo-expired',path:'src/root.rs',expire:0},
  {name:'ancestor-cargo-directory',path:'src/deep/root.rs',cargo:'Cargo.toml',expire:0},
  {name:'nearest-cargo-directory',path:'src/deep/root.rs',cargo:'src/deep/Cargo.toml'},
  {name:'cargo-at-depth-sixteen',path:Array(16).fill('d').join('/')+'/root.rs',cargo:'d/Cargo.toml',expire:0},
  {name:'cargo-beyond-depth-sixteen',path:Array(17).fill('d').join('/')+'/root.rs',cargo:'Cargo.toml'},
 ]){
  const directory=join(temporary,profile.name);mkdirSync(directory);execFileSync('git',['init','-q',directory]);mkdirSync(dirname(join(directory,profile.path)),{recursive:true});writeFileSync(join(directory,profile.path),'pub struct Root;')
  if(profile.cargo)mkdirSync(join(directory,profile.cargo),{recursive:true})
  const capture={text:'pub struct Root;',byteLength:16},limits={...GRAPH_LIMIT_CEILINGS},host={root:directory,policy:DEFAULT_DIRECT_FILE_POLICY}
  original.resetTrace();let nativeTicks=0
  class Captures extends Map{set(path,value){original.trace.push({operation:'InsertRootCaptureCache',path});return super.set(path,value)}}
  host.captureCache=new Captures()
  const expected=await Effect.runPromise(original.resolveRustModuleContext(profile.path,capture,host,limits,()=>{
   original.trace.push({operation:'ReadDeadline'});return nativeTicks++>=(profile.expire??Infinity)
  }))
  const expectedTrace=original.trace.map(item=>({...item,...(item.operation==='ReadFileStatus'?{path:relative(directory,item.path)}:{})}))
  const limitTag={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',...Object.fromEntries(Object.entries(limits).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
  const token=tag('CaptureToken',{invocation:1n,id:1n}),cacheToken=tag('CacheToken',{invocation:1n,id:2n})
  const input=tag('ResolverInput',{invocation:1n,root_path:profile.path,root_capture:token,root_bytes:16n,root_name:'Root',root_source:capture.text,branch:tag('TypeBranch'),caller_cache:maybe(cacheToken),limits:limitTag})
  const actualTrace=[];let search=spec.begin(input)
  while(label(search)==='SearchRequest'){
   const operation=search.operation,name=label(operation);let outcome
   if(name==='InsertRootCaptureCache'){actualTrace.push({operation:name,path:operation.path});outcome=tag('RootCacheInserted')}
   else if(name==='PathDirname')outcome=tag('DirnameResult',{path:dirname(operation.path)})
   else if(name==='PathJoin')outcome=tag('JoinedResult',{path:join(...unlist(operation.parts))})
   else if(name==='ReadFileStatus'){
    actualTrace.push({operation:name,path:operation.path});const status=await lstat(join(directory,operation.path)).catch(()=>undefined)
    outcome=tag('StatusResult',{status:tag(status===undefined?'FileAbsent':status.isFile()?'ExistingFile':'ExistingOther')})
   }else throw new Error(name)
   search=spec.search_reply(search.state,outcome)
  }
  assert.equal(label(search),'SearchFinished');let action=spec.next_iteration(search.preparation),ticks=0
  while(label(action)!=='PreparationFinished'){
   const name=label(action)
   if(name==='ReadDeadline'){actualTrace.push({operation:name});action=spec.deadline(ticks++>=(profile.expire??Infinity),action.state)}
   else if(name==='ResolvePath')action=spec.resolved_path(!isAbsolute(action.path)&&action.path!=='..'&&!action.path.startsWith('../'),action.state,action.path)
   else if(name==='CheckAccess'){
    actualTrace.push({operation:'AccessPath',path:action.path});const selected=await Effect.runPromise(eligibleNamedPath(directory,action.path,contextDirectFilePolicy(host.policy)))
    action=spec.checked_path(action.state,selected!==undefined)
   }else throw new Error('unqualified capture continuation '+name)
  }
  const state=action.state,observation=expected.observation
  assert.deepEqual(actualTrace,expectedTrace,profile.name+' ordered cache/status/clock/access')
  assert.deepEqual(normalize(state.graph),normalize(observation.state),profile.name+' exact bounded graph and event allowance')
  const commands={NoCommand:'none',ResolveEdge:'resolveEdge',CheckPath:'checkPath',ReadSource:'readSource',UnitComplete:'unitComplete',UnitIncomplete:'unitIncomplete',SkipImport:'skipImport'}
  assert.equal(commands[label(state.command)],observation.command.kind)
  for(const key of ['edge','target'])if(key in observation.command)assert.equal(Number(state.command[key]),observation.command[key])
  if(observation.command.reason)assert.equal(label(state.command.reason),observation.command.reason)
  assert.deepEqual(label(state.active)==='None'?undefined:{path:state.active.value.path},observation.active)
  assert.equal(state.invalid,observation.invalid);assert.equal(Number(state.next_edge),observation.nextEdge);assert.equal(Number(state.next_target),observation.nextTarget)
  assert.deepEqual(unlist(state.tasks).map(item=>[Number(item.id),{path:item.task.path}]),observation.tasks)
  assert.deepEqual(unlist(state.targets).map(item=>[item.path,Number(item.id)]),observation.targets)
  assert.deepEqual(unlist(state.dependencies),observation.accumulatedDependencies);assert.deepEqual(unlist(state.roles),observation.roles)
  assert.equal(label(spec.role(state)),'None');assert.equal(expected.options,undefined)
  const remaining=spec.remaining(limitTag,state,16n)
  for(const [key,value]of Object.entries(expected.remaining))assert.equal(Number(remaining[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key]),value)
  cases.push({name:profile.name,orderedEffects:actualTrace.length,statusReads:actualTrace.filter(item=>item.operation==='ReadFileStatus').length,invalid:state.invalid})
 }
 const limitTag={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',...Object.fromEntries(Object.entries(GRAPH_LIMIT_CEILINGS).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
 const cacheToken=tag('CacheToken',{invocation:1n,id:2n}),selection=tag('SelectionToken',{invocation:1n,id:3n}),token=tag('CaptureToken',{invocation:1n,id:4n})
 let captureComparisons=0
 for(const count of [0,1,63,64,65])for(const present of [false,true])for(const totalBytes of [0,16777216,16777217]){
  const entries=Array.from({length:count},(_,index)=>({path:present&&index===0?'module.rs':'cached-'+index,bytes:index===0?totalBytes:0}))
  const nativeCache=new Map(entries.map(item=>[item.path,{byteLength:item.bytes}]))
  const expected=observationCaptureBudgetRefusal(nativeCache,'module.rs',GRAPH_LIMIT_CEILINGS.sourceBytes)
  const prep=spec.initialize(limitTag,'root.rs',16n,maybe())
  const start=spec.capture_start(prep,cacheToken,selection,'module.rs')
  const step=spec.capture_reply(start.state,tag('CacheSnapshot',{entries:list(entries.map(item=>tag('CaptureBytes',{path:item.path,bytes:BigInt(item.bytes)})))}))
  if(expected){
   assert.equal(label(step.operation),'ObserveDiagnostic')
   assert.deepEqual(normalize(step.operation.diagnostic),{$:'CaptureBudgetDiagnostic',...expected.args})
  }else assert.equal(label(step.operation),'LookupCaptureCache')
  captureComparisons++
 }
 for(const bytes of [16,GRAPH_LIMIT_CEILINGS.sourceBytes+1]){
  let action=spec.deadline(false,spec.next_iteration(spec.initialize(limitTag,'root.rs',16n,maybe('module.rs'))).state)
  action=spec.deadline(false,action.state)
  action=spec.resolved_path(true,action.state,'module.rs')
  action=spec.deadline(false,action.state)
  action=spec.checked_path(action.state,true)
  action=spec.deadline(false,action.state)
  const prep=action.state
  let step=spec.capture_start(prep,cacheToken,selection,'module.rs')
  step=spec.capture_reply(step.state,tag('CacheSnapshot',{entries:list([])}))
  step=spec.capture_reply(step.state,tag('CacheResult',{outcome:tag('CacheAbsent')}))
  assert.equal(label(step.operation),'CaptureSource')
  step=spec.capture_reply(step.state,tag('CaptureResult',{outcome:tag('SourceCaptured',{capture:token,relative_path:'module.rs',bytes:BigInt(bytes)})}))
  assert.equal(label(step.operation),'StoreCaptureCache','store precedes source-size refusal')
  step=spec.capture_reply(step.state,tag('CacheStored'))
  assert.equal(label(step.action),bytes>GRAPH_LIMIT_CEILINGS.sourceBytes?'PreparationFinished':'InspectTask')
  if(bytes>GRAPH_LIMIT_CEILINGS.sourceBytes)assert.equal(step.action.state.invalid,true)
  captureComparisons++
 }
 assert.deepEqual(Object.fromEntries(inputs.map(path=>[path,hash(isAbsolute(path)?path:join(folder,path))])),sources)
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,cases,captureComparisons,
  scope:'Independent Rust root-cache/ancestor-search/command/deadline preparation prefixes and terminal outcomes on six physical repository cases against instrumented actual native resolveRustModuleContext. Includes 32 aggregate-cache admission and capture/store-size cases, with aggregate refusals checked against actual native capture-budget owner. No successful Cargo syntax/module continuation, full whole resolver proof, cancellation or performance qualification.'}
 writeFileSync(join(folder,'rust-specification-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
