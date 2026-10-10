import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import * as path from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {parse} from 'smol-toml'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {DEFAULT_DIRECT_FILE_POLICY,eligibleNamedPath,contextDirectFilePolicy} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {inspectRustModules} from '../../../packages/source-analysis/dist/direct-event/languages/rust.js'
import {createGraphFixtures} from './fixtures.mjs'
import {tomlValue} from './frontend-codec.mjs'
import {createServiceSession,list,unlist,productValue,fromProductValue,binary64} from './service-session.mjs'
const folder=import.meta.dirname,root=path.join(folder,'../../..'),cache=path.join(root,'node_modules/.cache');mkdirSync(cache,{recursive:true})
const environmentCheck=process.env.HAPSLAND_PREPARATION_ENVIRONMENT_CHECK==='1'
const temporary=mkdtempSync(path.join(cache,'rust-task-specification-')),generatedWrappers=[]
const native=path.join(root,'packages/source-analysis/dist/direct-event/languages/rust-module-context.js')
const inputs=['../../../bun.lock','../../../packages/source-analysis/dist/direct-event/languages/rust.js','../../../packages/source-analysis/dist/direct-event/capture-budget.js','RustTaskSpecification.bend','ModuleSpecification.bend','CargoSpecification.bend','RustSpecification.bend','GraphSpecification.bend','Types.bend','PreparationSpecification.bend','Environment.bend','WholeObservation.bend','rust-task-specification-check.mjs','fixtures.mjs','frontend-codec.mjs','service-session.mjs',native]
const hash=value=>createHash('sha256').update(value).digest('hex'),sources=Object.fromEntries(inputs.map(name=>[name,hash(readFileSync(path.isAbsolute(name)?name:path.join(folder,name)))]))
const tag=(name,fields={})=>({$:'Types.'+name,...fields}),label=value=>value.$.split('.').at(-1),maybe=value=>value===undefined?{$:'None'}:{$:'Some',value}
const normalize=value=>typeof value==='bigint'?Number(value):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='$'?label(value):normalize(item)])):value
const fields=value=>unlist(value).map(item=>[item.key,item.value])
const route=value=>label(value)==='None'?undefined:{path:value.value.path,cratePath:value.value.crate_path,...(label(value.value.modules)==='None'?{}:{crateModules:new Map(fields(value.value.modules.value))}),depth:Number(value.value.depth)}
const task=value=>({path:value.path,...(label(value.route)==='None'?{}:{route:route(value.route)})})
const role=value=>({...(label(value.crate_root)==='None'?{}:{rustCrateRoot:value.crate_root.value}),...(label(value.external_module)==='None'?{}:{rustExternalModule:value.external_module.value}),...(label(value.modules)==='None'?{}:{rustCrateModules:new Map(fields(value.modules.value))})})
function observationValue(value){
 const own=(name,fields={})=>({$:'WholeObservation.'+name,...fields})
 const text=value=>own('Text',{units:list(Array.from({length:value.length},(_,i)=>value.charCodeAt(i)))})
 if(value===null)return own('Null')
 if(typeof value==='boolean')return own('Boolean',{value})
 if(typeof value==='number')return own('Number',{bits:binary64(value)})
 if(typeof value==='string')return own('StringValue',{text:text(value)})
 if(Array.isArray(value))return own('ArrayValue',{items:list(value.map(observationValue))})
 assert.ok(value&&typeof value==='object')
 return own('ObjectValue',{fields:list(Object.entries(value).map(([key,value])=>own('Field',{key:text(key),value:observationValue(value)})))})
}
function facts(files,selected){
 const names=new Set(['a','b','sub']),raw=new Set(['src/lib.rs','src/main.rs'])
 for(const [name,text]of files){for(const match of text.matchAll(/\bmod\s+([A-Za-z_][A-Za-z0-9_]*)/g))names.add(match[1]);if(name.endsWith('Cargo.toml'))try{const syntax=parse(text);if(typeof syntax.lib?.path==='string')raw.add(syntax.lib.path);for(const bin of Array.isArray(syntax.bin)?syntax.bin:[])if(typeof bin.path==='string')raw.add(bin.path)}catch{}}
 const dirs=new Set(['.']),paths=new Set(files.keys());paths.add(selected)
 for(const name of paths){let dir=path.dirname(name);while(!dirs.has(dir)){dirs.add(dir);if(dir==='.')break;dir=path.dirname(dir)}if(name.endsWith('.rs'))dirs.add(path.join(path.dirname(name),path.basename(name,'.rs')))}
 for(const base of dirs){const first=path.relative(base,selected).split('/')[0];names.add(first.endsWith('.rs')?first.slice(0,-3):first)}
 const joins=new Map(),add=parts=>{const value=path.join(...parts);joins.set(JSON.stringify(parts),value);paths.add(value);return value}
 for(const base of dirs){
  for(const name of names){add([base,name]);add([base,name+'.rs']);add([base,name,'mod.rs'])}
  for(const target of raw)add([base,target]);add([base,'src/bin'])
  for(const name of files.keys())if(name.endsWith('.rs')){const first=path.relative(path.join(base,'src/bin'),name).split('/')[0];const main=add([first,'main.rs']);add([base,'src/bin',first]);add([base,'src/bin',main])}
 }
 for(const name of [...paths]){add([path.dirname(name),path.basename(name,'.rs')]);paths.add(path.normalize(name))}
 const tables={dirname:new Map([...paths].map(name=>[name,path.dirname(name)])),base:new Map([...paths].map(name=>[name,path.basename(name)])),stem:new Map([...paths].map(name=>[name,path.basename(name,'.rs')])),extension:new Map([...paths].map(name=>[name,path.extname(name)])),normalize:new Map([...paths].map(name=>[name,path.normalize(name)])),join:joins,relative:new Map()}
 const relativeFrom=new Set([...dirs,...[...dirs].map(base=>path.join(base,'src/bin'))]),relativeTo=new Set([...files.keys(),selected,...[...dirs].flatMap(base=>[...names].map(name=>path.join(base,name)))])
 for(const from of relativeFrom)for(const to of relativeTo)tables.relative.set(JSON.stringify([from,to]),path.relative(from,to))
 return tables
}
const preparationBridges=`
type CapturedWorld is Data:
  CapturedWorld{sequence: Nat, captures: T.ProductValue}
def expiry(bits: T.Binary64) -> Bool:
  match bits:
    case T.Binary64{high, _}: U32.is_eq(high, 1072693248)
def preparation_choose(state: Preparation.State) -> Preparation.Selection:
  Preparation.choose(~absolute, ~dirname, ~relative, "/", state)
def preparation_consume(state: Preparation.State, outcome: T.ServiceOutcome) -> Preparation.Selection:
  Preparation.consume(~absolute, ~dirname, ~basename, ~join, ~relative, ~extension, ~normalize, ~expiry, "/", state, outcome)
def suspend(operation: T.Operation, world: CapturedWorld) -> Environment.Response<CapturedWorld>:
  match world:
    case CapturedWorld{+sequence, captures}:
      Environment.Suspended{CapturedWorld{(sequence + 1n : Nat), captures},
        Observation.ProviderLease{1n, sequence}, []}
def preparation_begin(input: T.ResolverInput, clock: T.ClockToken, next: Nat, world: CapturedWorld) -> Preparation.Progress<CapturedWorld>:
  Preparation.begin(CapturedWorld, input, clock, next, Environment.WorldState{world, []})
def preparation_advance(progress: Preparation.Progress<CapturedWorld>) -> Preparation.Progress<CapturedWorld>:
  Preparation.advance(~preparation_choose, ~preparation_consume, CapturedWorld, suspend, progress)
def preparation_complete(progress: Preparation.Progress<CapturedWorld>, completion: Environment.Completion<CapturedWorld>) -> Preparation.Progress<CapturedWorld>:
  Preparation.complete(~preparation_consume, CapturedWorld, progress, completion)
def preparation_cancel(progress: Preparation.Progress<CapturedWorld>) -> Preparation.Progress<CapturedWorld>:
  Preparation.cancel(CapturedWorld, progress)
`
function wrapper(tables){
 const quote=JSON.stringify,defs=[]
 const header=`import Base\nimport ./Types.bend as T\nimport ./RustSpecification.bend as Rust\nimport ./CargoSpecification.bend as Cargo\nimport ./RustTaskSpecification.bend as Task\nimport ./PreparationSpecification.bend as Preparation\nimport ./Environment.bend as Environment\nimport ./WholeObservation.bend as Observation\nimport ../../../packages/agent-flow-bend/ImportGraph.bend as G\n`
 const primitive=`def read_result(result: Map<&2, String> & String) -> String:\n  match result:\n    case Tuple{_, value}: value\ndef read(table: Map<&2, String>, key: String) -> String:\n  read_result(Map.get(String, "__MISSING_PATH_FACT__", table, key))\ndef join_key(parts: List<&2, String>) -> String:\n  match parts:\n    case []: ""\n    case head <> tail: head ++ "|" ++ join_key(tail)\n`
 for(const kind of ['dirname','base','stem','extension','normalize','join','relative']){
  const entries=[...tables[kind]].map(([key,value])=>{
   const parts=['join','relative'].includes(kind)?JSON.parse(key):[key];assert.ok(parts.every(part=>!part.includes('|')))
   const encoded=kind==='join'?parts.map(part=>part+'|').join(''):kind==='relative'?parts.join('|'):key
   return `(${quote(encoded)}, ${quote(value)})`
  })
  const chunks=[]
  for(let offset=0;offset<entries.length;offset+=48){const name=kind+'_chunk_'+offset;chunks.push(name+'()');defs.push(`def ${name}() -> List<&2, Sigma<&2, &2, String, _ => String>>:\n  [${entries.slice(offset,offset+48).join(',')}]\n`)}
  const values=chunks.reduceRight((tail,chunk)=>`List.append(&2, Sigma<&2, &2, String, _ => String>, ${chunk}, ${tail})`,'[]')
  defs.push(`def ${kind}_table() -> Map<&2, String>:\n  Map.from_list(&2, String, ${values})\n`)
  defs.push(kind==='join'?`def join(parts: List<&2, String>) -> String:\n  read(join_table(), join_key(parts))\n`:kind==='relative'?`def relative(from: String, to: String) -> String:\n  read(relative_table(), from ++ "|" ++ to)\n`:`def ${kind}(value: String) -> String:\n  read(${kind}_table(), value)\n`)
 }
 const bridges=[
 ['begin','input: T.ResolverInput','input','Rust.SearchStep'],
 ['search_reply','state: Rust.Search, outcome: T.ServiceOutcome','state, outcome','Rust.SearchStep'],
 ['next_iteration','state: Rust.Preparation','state','Rust.Action'],
 ['deadline','expired: Bool, state: Rust.Preparation','expired, state','Rust.Action'],
 ['checked_path','state: Rust.Preparation, allowed: Bool','state, allowed','Rust.Action'],
 ['authorized','state: Rust.Preparation, outcome: T.AccessOutcome','state, outcome','Rust.Action'],
 ['capture_start','state: Rust.Preparation, cache: T.CacheToken, selection: T.SelectionToken, path: String','state, cache, selection, path','Rust.CaptureStep'],
 ['capture_reply','state: Rust.CaptureState, outcome: T.ServiceOutcome','state, outcome','Rust.CaptureStep'],
 ['sorted_paths','items: List<&2, String>','items','List<&2, String>'],
 ['sorted_dependencies','state: Rust.Preparation','state','List<&2, String>'],
 ['role','state: Rust.Preparation','state','Maybe<&2, T.RustContext>'],
 ['remaining','limits: G.Limits, state: Rust.Preparation, bytes: Nat','limits, state, bytes','G.Limits']
 ].map(([name,params,args,result])=>`def ${name}(${params}) -> ${result}:\n  Rust.${name}(${args})\n`).join('\n')
 return header+primitive+defs.join('\n')+bridges+`\ndef absolute(value: String) -> Bool:\n  String.starts_with(value, "/")\ndef basename(value: String, suffix: Maybe<&2, String>) -> String:\n  match suffix:\n    case None{}: base(value)\n    case Some{_}: stem(value)\ndef advance(state: Task.State) -> Task.Step:\n  Task.advance(~absolute, ~dirname, ~relative, state, "/")\ndef reply(state: Task.State, outcome: T.ServiceOutcome) -> Task.Step:\n  Task.reply(~absolute, ~dirname, ~basename, ~join, ~relative, ~extension, ~normalize, state, outcome, "/")\ndef resolved(state: Rust.Preparation, +path: String) -> Rust.Action:\n  Rust.resolved_path(Cargo.within(~absolute, path, "/"), state, path)\ndef begin_task(input: T.ResolverInput, preparation: Rust.Preparation, task: T.RustTask, capture: T.CaptureToken, bytes: Nat) -> Task.Step:\n  Task.begin(input, preparation, task, capture, bytes)${preparationBridges}\ndef main() -> Unit:\n  Unit{}\n`
}

try{
 let source=readFileSync(native,'utf8').replaceAll(/from "(\.{1,2}\/[^\"]+)"/g,(_all,name)=>`from "${pathToFileURL(path.join(path.dirname(native),name))}"`)
 source=source.replace('import { lstat }','import { lstat as originalLstat }').replace('contextDirectFilePolicy, eligibleNamedPath','contextDirectFilePolicy, eligibleNamedPath as originalEligible').replace('import { inspectRustModules }','import { inspectRustModules as originalModules }').replace('import { parse }','import { parse as originalParse }')
 const marker='return { options: uniqueModuleRole(invalid, command.kind, roles), dependencies: [...dependencies].sort(), remaining };';assert.ok(source.includes(marker))
 source=source.replace(marker,'return { options: uniqueModuleRole(invalid, command.kind, roles), dependencies: [...dependencies].sort(), remaining, observation: {state, command, tasks: [...tasks], targets: [...targets], nextEdge, nextTarget, active, invalid, accumulatedDependencies: [...dependencies], roles, captures: [...captures]} };')
 source+='\nexport let trace=[]; export function resetTrace(){trace=[]}; const lstat=async(path)=>{trace.push({kind:"status",path});return originalLstat(path)}; const eligibleNamedPath=(...args)=>{trace.push({kind:"access",path:args[1]});return originalEligible(...args)}; const parse=text=>{trace.push({kind:"cargo",text});return originalParse(text)}; const inspectRustModules=text=>{trace.push({kind:"modules",text});return originalModules(text)};\n'
 const copy=path.join(temporary,'native.mjs');writeFileSync(copy,source);const original=await import(pathToFileURL(copy)),cases=[]
 const fixtures=createGraphFixtures().filter(item=>item.path?.endsWith('.rs')&&/\b(?:use|mod)\b|::/u.test(item.source))
 if(environmentCheck){const base=fixtures.find(item=>item.name==='rust-context-read-policy');assert.ok(base);for(const extra of [{name:'rust-preparation-capture-unavailable',unavailable:true},{name:'rust-preparation-observer-throw',unavailable:true,observerThrow:true},{name:'rust-preparation-provider-defect',providerFault:true}])fixtures.push({...base,...extra})}
 for(const fixture of fixtures){
  const directory=path.join(temporary,fixture.name);mkdirSync(directory);execFileSync('git',['init','-q',directory])
  const files=new Map([[fixture.path,fixture.source],...Object.entries(fixture.files)]),stable=new Map([...files].map(([name,text])=>[name,Object.freeze({text,byteLength:Buffer.byteLength(text)})]))
  for(const [name,text]of files){mkdirSync(path.dirname(path.join(directory,name)),{recursive:true});writeFileSync(path.join(directory,name),text)}for(const name of fixture.directories??[])mkdirSync(path.join(directory,name),{recursive:true})
  const tables=facts(files,fixture.path),bendFile=path.join(folder,'.rust-task-check-'+path.basename(temporary)+'-'+fixture.name+'.bend'),moduleFile=path.join(temporary,fixture.name+'.mjs');generatedWrappers.push(bendFile);writeFileSync(bendFile,wrapper(tables));execFileSync('bend',[bendFile,'-o',moduleFile],{timeout:5000,maxBuffer:2**20})
  let js=readFileSync(moduleFile,'utf8');for(const kind of ['dirname','base','stem','extension','normalize','join','relative']){
   const pattern=new RegExp('function \\$'+kind+'\\$\\(([^)]*)\\) \\{');assert.ok(pattern.test(js),kind)
   js=js.replace(pattern,(all,args)=>all+`\n globalThis.__hapslandReferencePathQueries.push({kind:${JSON.stringify(kind)},args:[${args}]});`)
  }writeFileSync(moduleFile,js);const bound=(await import(pathToFileURL(moduleFile))).default,spec=bound;globalThis.__hapslandReferencePathQueries=[];const sortInput=['z','\u{10000}','\ue000','\ud800','\udfff','a','a\0b','a',''];assert.deepEqual(unlist(spec.sorted_paths(list(sortInput))),sortInput.toSorted())
  const limits={...GRAPH_LIMIT_CEILINGS,...fixture.limits},nativeCache=new Map(fixture.cache),actualCache=new Map(fixture.cache),host={root:directory,policy:fixture.policy??DEFAULT_DIRECT_FILE_POLICY};original.resetTrace();let nativeTicks=0
  class Captures extends Map{set(name,value){original.trace.push({kind:'store',path:name,text:value.text,bytes:value.byteLength});return super.set(name,value)}}
  host.captureCache=new Captures(nativeCache);original.resetTrace()
  const providerError=new Error('fixture capture provider failure'),unavailable={status:'unavailable',diagnostic:{stage:'capture',code:'capture-unavailable',args:{reason:'io'}}}
  host.captureSource=(_root,selected,_hooks,_identity,cap)=>{original.trace.push({kind:'capture',path:selected.relativePath,cap});return fixture.providerFault?Effect.die(providerError):Effect.succeed(fixture.unavailable?unavailable:{status:'captured',capture:stable.get(selected.relativePath)})}
  host.observeCaptureDiagnostic=(name,value)=>{original.trace.push({kind:'diagnostic',path:name,value});if(fixture.observerThrow)throw providerError}
  const nativeEffect=original.resolveRustModuleContext(fixture.path,stable.get(fixture.path),host,limits,()=>{const expired=nativeTicks++>=(fixture.expireAt??Infinity);original.trace.push({kind:'deadline',expired});return expired})
  let expected
  if(fixture.providerFault){const exit=await Effect.runPromiseExit(nativeEffect);assert.equal(exit._tag,'Failure');assert.ok(exit.cause.reasons.some(reason=>reason.defect===providerError),'native defect identity')}else expected=await Effect.runPromise(nativeEffect)
  const expectedTrace=original.trace.map(item=>({...item,...(item.kind==='status'?{path:path.relative(directory,item.path)}:{})})),actualTrace=[]
  const session=createServiceSession({invocation:1,root:directory,callerCache:actualCache,
   access:name=>{actualTrace.push({kind:'access',path:name});return Effect.runPromise(eligibleNamedPath(directory,name,contextDirectFilePolicy(host.policy)))},
   capture:(selected,cap)=>{actualTrace.push({kind:'capture',path:selected.relativePath,cap});if(fixture.providerFault)throw providerError;return fixture.unavailable?unavailable:{status:'captured',capture:stable.get(selected.relativePath)}},
   parseCargo:text=>{actualTrace.push({kind:'cargo',text});try{return tomlValue(parse(text))}catch{return undefined}},
   inspectRustModules:text=>{actualTrace.push({kind:'modules',text});return inspectRustModules(text)},
   diagnostic:(name,value)=>{actualTrace.push({kind:'diagnostic',path:name,value});if(fixture.observerThrow)throw providerError}})
  let request=0,ticks=0,steps=0;const perform=async (operation,selectedRequest)=>{
   const kind=label(operation);if(kind==='ReadFileStatus')actualTrace.push({kind:'status',path:operation.path})
   const result=await session.perform(selectedRequest??tag('Request',{invocation:1n,id:BigInt(++request),operation}))
   if(['InsertRootCaptureCache','StoreCaptureCache'].includes(kind)){const capture=actualCache.get(operation.path);actualTrace.push({kind:'store',path:operation.path,text:capture.text,bytes:capture.byteLength})}
   if(!fixture.providerFault)assert.notEqual(label(result.outcome),'ProviderRejected',fixture.name+' provider');return result.outcome
  }
  const limitTag={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',...Object.fromEntries(Object.entries(limits).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
  const input=tag('ResolverInput',{invocation:1n,root_path:fixture.path,root_capture:session.registerCapture(stable.get(fixture.path)),root_bytes:BigInt(stable.get(fixture.path).byteLength),root_name:'Root',root_source:fixture.source,branch:tag('TypeBranch'),caller_cache:session.callerCache,limits:limitTag})
  let action,environmentObservation
  if(environmentCheck){
   const initialRequest=37n,clock=tag('ClockToken',{invocation:1n,id:17n})
   const worldTag=bound.preparation_begin(input,clock,initialRequest,{$:'CapturedWorld',sequence:100n,captures:productValue([...actualCache])})
   let progress=worldTag,completions=0,cancellationChecks=0
   while(label(progress)==='PreparationReady'||label(progress)==='PreparationWaiting'){
    assert.ok(++steps<20000,'environment evaluation bound does not count as completion')
    if(label(progress)==='PreparationReady'){progress=bound.preparation_advance(progress);continue}
    const waiting=progress,exchange=waiting.exchange,request=exchange.request,kind=label(request.operation)
    assert.equal(request.invocation,1n);assert.equal(request.id,initialRequest+BigInt(completions))
    assert.deepEqual(bound.preparation_advance(waiting),waiting,'waiting never invokes twice')
    const foreign={$:'Environment.Completion',lease:{$:'WholeObservation.ProviderLease',invocation:2n,id:exchange.lease.id},world:exchange.state.world,outcome:tag('RootCacheInserted'),effects:list([])}
    assert.deepEqual(bound.preparation_complete(waiting,foreign),waiting,'foreign completion preserves waiting and world')
    const cancelled=bound.preparation_cancel(waiting)
    assert.equal(label(cancelled),'PreparationFailed');assert.equal(label(cancelled.failure),'InvocationCancelled')
    assert.deepEqual(cancelled.world.world,exchange.state.world)
    assert.deepEqual(unlist(cancelled.world.effects).slice(0,-1),unlist(exchange.state.effects))
    assert.equal(label(unlist(cancelled.world.effects).at(-1)),'CancelledInvocation')
    assert.deepEqual(bound.preparation_complete(cancelled,foreign),cancelled,'cancelled local invocation cannot resume')
    cancellationChecks++
    const traceBefore=actualTrace.length
    let outcome
    if(kind==='ReadClock'){
     assert.deepEqual(request.operation.clock,clock)
     const expired=ticks++>=(fixture.expireAt??Infinity);actualTrace.push({kind:'deadline',expired});outcome=tag('ClockRead',{bits:binary64(expired?1:0)})
    }else outcome=await perform(request.operation,request)
    const completion={$:'Environment.Completion',lease:exchange.lease,world:{$:exchange.state.world.$,sequence:exchange.state.world.sequence,captures:productValue([...actualCache])},outcome,effects:list(actualTrace.slice(traceBefore).map(value=>({$:'WholeObservation.ProviderEffect',value:observationValue(value)})))}
    progress=bound.preparation_complete(waiting,completion);completions++
    assert.deepEqual(bound.preparation_complete(progress,completion),progress,'consumed progress ignores repeated completion')
   }
   assert.equal(label(progress),fixture.providerFault?'PreparationFailed':'PreparationFinished',fixture.name+' environment terminal')
   if(fixture.providerFault){assert.equal(label(progress.failure),'ForeignProviderFailure');assert.equal(session.exception(progress.failure.exception),providerError)}
   assert.equal(progress.state.next_request,initialRequest+BigInt(completions));assert.deepEqual(progress.state.clock,clock)
   assert.deepEqual(fromProductValue(progress.world.world.captures),[...actualCache])
   const effects=unlist(progress.world.effects);assert.equal(effects.length,completions*2+actualTrace.length)
   const headers=effects.filter(value=>label(value)!=='ProviderEffect')
   for(let i=0;i<headers.length;i+=2){assert.equal(label(headers[i]),'Invoked');assert.equal(label(headers[i+1]),'Responded');assert.equal(headers[i].request.id,headers[i+1].reply.id);assert.equal(headers[i].request.id,initialRequest+BigInt(i/2))}
   assert.deepEqual(effects.filter(value=>label(value)==='ProviderEffect').map(value=>value.value),actualTrace.map(observationValue),'published nested provider effects')
   assert.equal(progress.world.world.sequence,100n+BigInt(completions))
   environmentObservation={completions,cancellationChecks,nextRequest:Number(progress.state.next_request),publishedEffects:effects.length}
   action={state:progress.preparation,technicalFailure:progress.failure}
  }else{
  let search=spec.begin(input);while(label(search)==='SearchRequest')search=spec.search_reply(search.state,await perform(search.operation));assert.equal(label(search),'SearchFinished')
  action=spec.next_iteration(search.preparation)
  while(label(action)!=='PreparationFinished'){
   assert.ok(++steps<20000,'evaluation bound does not count as completion')
   switch(label(action)){
    case 'ReadDeadline':{const expired=ticks++>=(fixture.expireAt??Infinity);actualTrace.push({kind:'deadline',expired});action=spec.deadline(expired,action.state);break}
    case 'ResolvePath':action=bound.resolved(action.state,action.path);break
    case 'CheckAccess':{const result=await perform(tag('AccessPath',{path:action.path}));action=spec.checked_path(action.state,label(result.outcome)==='AccessAllowed');break}
    case 'RecheckAccess':action=spec.authorized(action.state,(await perform(tag('AccessPath',{path:action.path}))).outcome);break
    case 'CaptureAuthorized':{let capture=spec.capture_start(action.state,search.cache,action.selection,action.path);while(label(capture)==='CaptureRequest')capture=spec.capture_reply(capture.state,await perform(capture.operation));assert.equal(label(capture),'CaptureFinished');action=capture.action;break}
    case 'InspectTask':{let taskStep=bound.begin_task(input,action.state,action.task,action.capture,action.bytes);while(['ContinueTask','TaskRequest'].includes(label(taskStep))){assert.ok(++steps<20000);taskStep=label(taskStep)==='ContinueTask'?bound.advance(taskStep.state):bound.reply(taskStep.state,await perform(taskStep.operation))}assert.equal(label(taskStep),'TaskFinished');action=taskStep.action;break}
    default:throw new Error(label(action))
   }
  }
  }
  for(const query of globalThis.__hapslandReferencePathQueries){const key=query.kind==='join'?JSON.stringify(unlist(query.args[0])):query.kind==='relative'?JSON.stringify(query.args):query.args[0];assert.ok(tables[query.kind].has(key),fixture.name+' missing primitive fact '+query.kind+' '+key)}
  if(fixture.providerFault){assert.deepEqual(actualTrace,expectedTrace,fixture.name+' published failure prefix');assert.deepEqual([...actualCache],[...host.captureCache]);session.close();cases.push({name:fixture.name,steps,effects:actualTrace.length,...environmentObservation,technicalFailure:'ForeignProviderFailure',originalExceptionIdentityPreserved:true});console.log(JSON.stringify(cases.at(-1)));continue}
  const state=action.state,observation=expected.observation
  assert.deepEqual(actualTrace,expectedTrace,fixture.name+' ordered physical effects')
  assert.deepEqual(normalize(state.graph),normalize(observation.state),fixture.name+' bounded graph')
  const commands={NoCommand:'none',ResolveEdge:'resolveEdge',CheckPath:'checkPath',ReadSource:'readSource',UnitComplete:'unitComplete',UnitIncomplete:'unitIncomplete',SkipImport:'skipImport'};assert.equal(commands[label(state.command)],observation.command.kind);for(const key of ['edge','target'])if(key in observation.command)assert.equal(Number(state.command[key]),observation.command[key]);if(observation.command.reason)assert.equal(label(state.command.reason),observation.command.reason)
  assert.equal(state.invalid,observation.invalid);assert.equal(Number(state.next_edge),observation.nextEdge);assert.equal(Number(state.next_target),observation.nextTarget)
  assert.deepEqual(unlist(state.tasks).map(item=>[Number(item.id),task(item.task)]),observation.tasks);assert.deepEqual(unlist(state.targets).map(item=>[item.path,Number(item.id)]),observation.targets)
  assert.deepEqual(label(state.active)==='None'?undefined:task(state.active.value),observation.active);assert.deepEqual(unlist(state.dependencies),observation.accumulatedDependencies);assert.deepEqual(unlist(state.roles).map(role),observation.roles)
  const actualRole=spec.role(state);assert.deepEqual(label(actualRole)==='None'?undefined:role(actualRole.value),expected.options);assert.deepEqual(unlist(spec.sorted_dependencies(state)),expected.dependencies)
  const remaining=spec.remaining(limitTag,state,input.root_bytes);for(const[key,value]of Object.entries(expected.remaining))assert.equal(Number(remaining[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key]),value)
  assert.deepEqual([...actualCache],observation.captures);session.close()
  cases.push({name:fixture.name,steps,effects:actualTrace.length,pathQueries:globalThis.__hapslandReferencePathQueries.length,...(environmentObservation??{}),roles:observation.roles.length,dependencies:expected.dependencies.length,invalid:state.invalid});console.log(JSON.stringify(cases.at(-1)))
 }
 assert.deepEqual(Object.fromEntries(inputs.map(name=>[name,hash(readFileSync(path.isAbsolute(name)?name:path.join(folder,name)))])),sources,'frozen sources')
 const record={environmentCheck,at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',sources,cases,utf16SortIncludesSupplementaryLoneSurrogatesNulAndDuplicates:true,limitations:['caller cache present in all cases; fresh invocation cache covered only by search tests',environmentCheck?'provider defect and unavailable capture checked on fixture providers; arbitrary reply/token protocol and global cancellation/late cleanup unqualified':'provider rejection, unavailable capture, cancellation and arbitrary protocol replies excluded','expired callback is preparation input; Binary64 clock boundary not qualified','source hashes cover declared owners/entry dependencies and lockfile, not entire installed dependency closure'],environmentScope:environmentCheck?'Unified Bend preparation selects all operations and threads Environment world/cache snapshots, waiting continuations, matching/foreign completions, request chronology and local cancellation. Nested provider effects bind actual ordered physical observations; every provider suspends. Global lease consumption/late cleanup and immediate responder mode remain unqualified. Fixture Binary64 encodes existing Boolean expiry input only.':undefined,scope:'Independent full needs-binding Rust preparation on physical fixtures versus actual native owner, ordered physical/provider effects, bounded graph, semantic state, roles, UTF-16 dependency sort, remaining caps and final cache. Mechanical path tables have no query script and all actually evaluated arguments including eager branches are checked. No whole resolver/adapter/protocol/cancellation/universal proof or candidate performance qualification.'}
 writeFileSync(path.join(folder,(environmentCheck?'preparation-specification':'rust-task-specification')+'-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,at:record.at}))
}finally{for(const file of generatedWrappers)rmSync(file,{force:true});delete globalThis.__hapslandReferencePathQueries;rmSync(temporary,{recursive:true,force:true})}
