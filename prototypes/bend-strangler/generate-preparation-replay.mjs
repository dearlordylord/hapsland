import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {createDispatcher} from './whole-resolver-runtime-probe/transport.mjs'
import {createServiceSession,createServiceRegistry,fromProductValue,unlist} from './whole-resolver/service-session.mjs'
import {inspectSourceFrontend,parseCargoSyntax,inspectRustModuleSyntax} from './whole-resolver/frontends.mjs'
import {createMachineDriver,pureReply} from './whole-resolver/consumer.mjs'
import {GRAPH_LIMIT_CEILINGS} from '@hapsland/canonical-policy/canonical/graph-limits'
import {decodeImportGraphStep,projectImportGraph} from '@hapsland/canonical-policy/canonical/graph-adapter'
const root=resolve(import.meta.dirname,'../..'),folder=join(import.meta.dirname,'whole-resolver'),temp=mkdtempSync(join(tmpdir(),'hapsland-preparation-replay-'))
const tagged=(name,fields={})=>({$:'Types.'+name,...fields})
const clean=value=>JSON.parse(JSON.stringify(value,(_key,item)=>typeof item==='bigint'?Number(item):typeof item==='string'?item.replaceAll(temp,'$FIXTURE'):item))
try {
 assert.equal(execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim(),'bend 2.0.36')
 const machinePath=join(temp,'machine.mjs');execFileSync('bend',[join(folder,'Machine.bend'),'-o',machinePath],{timeout:15000})
 const compiled=readFileSync(machinePath,'utf8'),match=compiled.match(/function ([^\s(]*ImportGraph\$058step\$)\(/);assert.ok(match)
 const stepName=match[1],original=stepName+'observedOriginal'
 let instrumented=compiled.replace('function '+stepName+'(', ()=> 'function '+original+'(')+`\nfunction ${stepName}(state,event){const result=${original}(state,event);globalThis.__hapslandPreparationGraph?.(state,event,result);return result;}\n`
 // Observe real compiled calls. Wrappers preserve arguments, return values and order.
 for(const [pattern,kind,stage] of [
 [/function ([^\s(]*local\$045graph\$045draft\$047core\$058step\$)\(/,'local','ExpandDeclarations'],
 [/function (\$Core\$058review_unit\$)\(/,'product','BuildReviewUnit'],
 [/function (\$dispatch_action\$)\(/,'continuation','DispatchContinuation']]){
 const found=instrumented.match(pattern);assert.ok(found,stage)
 const name=found[1],saved=name+'observedOriginal'
 instrumented=instrumented.replace('function '+name+'(',()=> 'function '+saved+'(')
 instrumented+=`\nfunction ${name}(...args){globalThis.__hapslandPreparationCall?.('${kind}','${stage}','enter',args,null);const result=${saved}(...args);globalThis.__hapslandPreparationCall?.('${kind}','${stage}','exit',args,result);return result;}\n`
 }
 writeFileSync(machinePath,instrumented)
 const {default:machine}=await import(pathToFileURL(machinePath))
 const runtimePath=join(temp,'runtime.js');execFileSync('bend',[join(folder,'Runtime.bend'),'-o',runtimePath],{timeout:15000})
 const source=readFileSync(runtimePath,'utf8'),footer='\ncli(process.argv.slice(1));\nio_exit($main$, null);';assert.ok(source.endsWith(footer))
 const embedded=join(temp,'embedded.mjs');writeFileSync(embedded,source.slice(0,-footer.length)+"\nexport const start=request=>run_loop($call_service$(request)(value=>({$:'Emit',value})));\nexport const handlers=Object.freeze({perform:$0eff.perform});\n")
 const {start,handlers}=await import(pathToFileURL(embedded)),registry=createServiceRegistry();globalThis.__hapslandWholeResolverServices=registry
 const padded=(name,imports,fields,size)=>imports+`export interface ${name} { ${fields}; payload: '${'x'.repeat(size)}' }`
 const branchFiles={
 'A.ts':padded('Root',"import type { B } from './B.ts'; import type { C } from './C.ts'; import type { X } from './X.ts';",'b:B;c:C;x:X',4600),
 'B.ts':padded('B',"import type { D } from './D.ts'; import type { E } from './E.ts';",'d:D;e:E',4800),
 'C.ts':padded('C',"import type { F } from './F.ts'; import type { G } from './G.ts';",'f:F;g:G',4800),
 ...Object.fromEntries([['D',3800],['E',1800],['F',500],['G',1800],['X',0]].map(([name,size])=>[name+'.ts',padded(name,'','value:boolean',size)]))}
 const definitions=[
 {title:'C path gate',denied:'C.ts',files:{'A.ts':"import type { B } from './B.ts'; export interface Root { b:B; local:Local } interface Local { ready:boolean }",'B.ts':"import type { C } from './C.ts'; export interface B { c:C }",'C.ts':'export interface C { ready:boolean }'}},
 {title:'Branching tree budget',denied:'X.ts',files:branchFiles}]
 const normalize=value=>JSON.parse(JSON.stringify(clean(value),(_key,item)=>typeof item==='string'&&item.startsWith('../../../packages/agent-flow-bend/ImportGraph.')?item.split('/').at(-1):item))
 // The adapter's bounded envelope is used only to decode the observed raw graph;
 // its remaining field is not an observed Machine budget and is never displayed.
 const envelope=graph=>({$:'ImportGraph.Bounded',graph:normalize(graph),remaining:0})
 const eventInput=event=>{
 const e=clean(event),kind=e.$.split('.').at(-1)
 if(kind==='Root'||kind==='Captured')return {kind:kind==='Root'?'root':'captured',...(kind==='Root'?{target:e.target}:{}),sourceBytes:e.source_bytes,treeBytes:kind==='Root'?e.tree_bytes:e.node_bytes,localWork:e.local_work,edges:unlist(e.edges)}
 if(kind==='Resolved')return {kind:'resolved',target:e.target,result:({Found:'found',NotFound:'missing',Many:'ambiguous',Unhandled:'unsupported'})[e.result.$.split('.').at(-1)]}
 if(kind==='PathChecked')return {kind:'pathChecked',allowed:e.allowed}
 return {kind:({Next:'next',CaptureFailed:'captureFailed',DeadlineReached:'deadlineReached'})[kind]}
 }
 const scenarios=[]
 for(const [index,definition] of definitions.entries()){
 const {files}=definition,fixtureRoot=join(temp,'files'+index);mkdirSync(fixtureRoot);for(const [path,text] of Object.entries(files))writeFileSync(join(fixtureRoot,path),text)
 const captures=[],frames=[],history=[],targetNames={1:'A.ts'};let latestFrame=null
 const record=(kind,stage,trace,graph=null)=>frames.push(clean({kind,stage,trace,request:null,reply:null,frame:latestFrame,graph:graph??(latestFrame?projectImportGraph(envelope(latestFrame.graph)):null),historyLength:history.length,captures:[...captures]}))
 globalThis.__hapslandPreparationCall=(kind,stage,phase,args,result)=>{
 if(kind==='continuation'){const action=args[0],state=phase==='enter'?action.state:(result.state??result.step?.state);if(state?.frame?.$==='Some')latestFrame=state.frame.value;record(kind,action.$.split('.').at(-1),{phase,input:phase==='enter'?args:null,output:phase==='exit'?result:null});return}
 record(kind,stage,{phase,input:phase==='enter'?args:null,output:phase==='exit'?result:null})
 }
 globalThis.__hapslandPreparationGraph=(before,event,result)=>{
 const decoded=decodeImportGraphStep({$:'ImportGraph.BoundedStep',state:envelope(result.state),command:normalize(result.command)})
 history.push(clean({unit:0,event:eventInput(event),command:decoded.command,state:projectImportGraph(decoded.state)}))
 record('graph','ImportGraph.'+eventInput(event).kind,{event:eventInput(event),before:projectImportGraph(decodeImportGraphStep({$:'ImportGraph.BoundedStep',state:envelope(before),command:normalize(result.command)}).state),after:projectImportGraph(decoded.state),command:decoded.command},projectImportGraph(decoded.state))
 }
 const capture=path=>({text:files[path],byteLength:Buffer.byteLength(files[path])})
 const session=createServiceSession({invocation:index+1,root:fixtureRoot,now:()=>0,
 access:path=>path===definition.denied||!Object.hasOwn(files,path)?undefined:{relativePath:path,absolutePath:join(fixtureRoot,path)},
 capture:selected=>{captures.push(selected.relativePath);return {status:'captured',capture:capture(selected.relativePath)}},frontend:inspectSourceFrontend,parseCargo:parseCargoSyntax,inspectRustModules:inspectRustModuleSyntax})
 const c=GRAPH_LIMIT_CEILINGS,limits={$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,...Object.fromEntries(Object.entries(c).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
 const input=tagged('ResolverInput',{invocation:BigInt(index+1),root_path:'A.ts',root_capture:pureReply(session.registerCapture(capture('A.ts'))),root_bytes:BigInt(capture('A.ts').byteLength),root_name:'Root',root_source:files['A.ts'],branch:tagged('TypeBranch'),caller_cache:pureReply(session.callerCache),limits})
 const drive=createMachineDriver({machine,foreign:createDispatcher(start,handlers),registry,
 observeTransition:(step,reply)=>{const frame=step.state.frame.$==='Some'?step.state.frame.value:null
 if(step.request.operation.$==='Types.AccessPath'&&frame&&'target' in frame.command)targetNames[Number(frame.command.target)]=step.request.operation.path
 latestFrame=frame
 frames.push(clean({kind:'service',trace:null,stage:step.state.stage.$.split('.').at(-1),request:step.request,reply,frame,graph:frame?projectImportGraph(envelope(frame.graph)):null,historyLength:history.length,captures:[...captures]}))}})
 const outcome=await drive(session,input);assert.ok(!outcome.failure);assert.equal(outcome.result.$,'Types.ReviewUnitResult');assert.ok(!captures.includes(definition.denied));assert.equal(registry.size,0)
 frames.push(clean({kind:'finished',trace:null,stage:'FinishedResolver',request:null,reply:null,frame:outcome.finalFrame.value,graph:projectImportGraph(envelope(outcome.finalFrame.value.graph)),historyLength:history.length,captures:[...captures]}))
 if(index===1){assert.ok(history.some(step=>step.command.kind==='skipImport'&&step.command.reason==='TreeLimit'));assert.ok(captures.includes('F.ts'))}
 scenarios.push(clean({title:definition.title,files,frames,history,targetNames,result:fromProductValue(outcome.result.value)}))
 }
 delete globalThis.__hapslandPreparationGraph
 delete globalThis.__hapslandPreparationCall
 const sources=['Machine.bend','Loop.bend','Runtime.bend','Core.bend','Types.bend','Root.bend','Read.bend','Attach.bend'].map(file=>{const text=readFileSync(join(folder,file),'utf8');return {file:'prototypes/bend-strangler/whole-resolver/'+file,sha256:createHash('sha256').update(text).digest('hex'),text}})
 const local=readFileSync(join(import.meta.dirname,'local-graph-draft/core.bend'),'utf8');sources.push({file:'prototypes/bend-strangler/local-graph-draft/core.bend',sha256:createHash('sha256').update(local).digest('hex'),text:local})
 const graphSource=readFileSync(join(root,'packages/agent-flow-bend/ImportGraph.bend'),'utf8');sources.push({file:'packages/agent-flow-bend/ImportGraph.bend',sha256:createHash('sha256').update(graphSource).digest('hex'),text:graphSource})
 const result=clean({kind:'executed-preparation',compiler:'bend 2.0.36',scenarios,sources})
 const output=join(root,'packages/agent-flow-viz/src/preparation-resolver.generated.json')
 if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(readFileSync(output,'utf8')),result)
 else writeFileSync(output,JSON.stringify(result,null,2)+'\n')
 console.log(`Preparation resolver: ${scenarios.length} full resolver scenarios with observed ImportGraph transitions; registry closed`)
} finally {rmSync(temp,{recursive:true,force:true})}
