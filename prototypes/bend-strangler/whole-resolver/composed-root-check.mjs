import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,lstat,rm} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {resolveGraphUnit} from '../../../packages/source-analysis/dist/direct-event/graph-resolver.js'
import {eligibleNamedPath,DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {captureStable} from '../../../packages/native-observation/dist/direct-event/capture.js'
import {createServiceRegistry} from './service-session.mjs'
import {createBendResolver,pureReply} from './consumer.mjs'
import {createArtifactMachine} from './artifact-dispatcher.mjs'
const temp=await mkdtemp('/tmp/hapsland-composed-root-')
try{
 let machine
 if(process.env.HAPSLAND_SPLIT_ARTIFACTS){
  const artifacts={}
  for(const [key,name] of [['composition','ArtifactComposition'],['parent','GenericArtifact'],['python','PythonArtifact']]){
   const emitted=join(temp,name+'.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,name+'.bend'),'-o',emitted],{timeout:5000});artifacts[key]=(await import(pathToFileURL(emitted))).default
  }
  const split=createArtifactMachine(artifacts)
  const shadowPath=join(temp,'shadow.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'ComposedMachine.bend'),'-o',shadowPath],{timeout:5000});const shadow=(await import(pathToFileURL(shadowPath))).default
  const observation=step=>step.$==='Types.AwaitService'?{kind:step.$,request:step.request}:step
  const compare=pair=>{assert.deepEqual(observation(split.view(pair.split)),observation(shadow.view(pair.shadow)),'reachable split/monolithic observation');return pair}
  machine={initial:input=>compare({split:split.initial(input),shadow:shadow.initial(input)}),resume:(state,event)=>compare({split:split.resume(state.split,event),shadow:shadow.resume(state.shadow,event)}),view:state=>split.view(state.split),dispose:split.dispose,get retainedHandles(){return split.retainedHandles}}
 }else{
  const emitted=join(temp,'machine.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'ComposedMachine.bend'),'-o',emitted],{timeout:5000});machine=(await import(pathToFileURL(emitted))).default
 }
 const registry=createServiceRegistry(),operations=[];let activeState,fences=0,terminalSuffixes=0
 const t=(name,fields={})=>({$:'Types.'+name,...fields})
 const guarded={...machine,view(state){activeState=state;const projection=machine.view(state)
  if(projection.$!=='Types.AwaitService'){
   assert.equal(machine.view(machine.resume(state,t('CancelInvocation',{invocation:0n}))).failure.$,'Types.ReplyAfterTerminal')
   assert.equal(machine.view(machine.resume(state,t('ServiceReply',{reply:t('Reply',{invocation:0n,id:0n,outcome:t('ClockRead',{bits:t('Binary64',{high:0,low:0})})})}))).failure.$,'Types.ReplyAfterTerminal')
  }
  if(projection.$!=='Types.AwaitService')terminalSuffixes+=2
  return projection}}
 const resolver=createBendResolver({machine:guarded,registry,foreign:async([request],options)=>{
  operations.push(request.operation.$)
  const reply=pureReply(await registry.get(Number(request.invocation)).perform(request,options))
  const cancelled=machine.resume(activeState,t('CancelInvocation',{invocation:request.invocation}))
  assert.equal(machine.view(cancelled).failure.$,'Types.InvocationCancelled')
  assert.equal(machine.view(machine.resume(cancelled,t('CancelInvocation',{invocation:request.invocation}))).failure.$,'Types.ReplyAfterTerminal')
  assert.equal(machine.view(machine.resume(cancelled,t('ServiceReply',{reply}))).failure.$,'Types.ReplyAfterTerminal')
  assert.equal(machine.view(machine.resume(activeState,t('ServiceReply',{reply:{...reply,id:reply.id+1n}}))).failure.$,'Types.WrongCorrelation')
  assert.equal(machine.view(machine.resume(activeState,t('ServiceReply',{reply:{...reply,invocation:reply.invocation+1n}}))).failure.$,'Types.WrongInvocation')
  fences+=5;return reply
 }})
 let cases=0
 for(const [index,fixture] of [
  {branch:'type',text:'class Root:\n value: str\n'},
  {branch:'type',text:'class Leaf:\n id: str\nclass Root:\n leaf: Leaf\n'},
  {branch:'function',text:'def Root():\n return 1\n'},
  {branch:'type',text:'class Root:\n value: str\n',limits:{files:0}},
  {branch:'type',text:'class Root:\n value: str\n',limits:{readBytes:0}},
  {branch:'type',text:'class Root:\n value: str\n',cache:true},
  {branch:'type',text:'from leaf import Foo\nclass Root:\n value: Foo\n',files:{'leaf.py':'class Foo:\n id: str\n'}},
  {branch:'type',text:'from pkg import Foo\nclass Root:\n value: Foo\n',files:{'pkg/__init__.py':'from .leaf import Foo\n','pkg/leaf.py':'class Foo:\n id: str\n'}},
  {branch:'type',text:'from pkg import Foo\nclass Root:\n value: Foo\n',files:{'pkg/__init__.py':'from .leaf import Bar as Foo\n','pkg/leaf.py':'class Bar:\n id: str\n'}},
  {branch:'type',text:'from absent import Foo\nclass Root:\n value: Foo\n'},
  ...[{files:1},{files:2},{files:3},{work:1},{work:3},{work:8},{sourceBytes:16},{readBytes:80,sourceBytes:80}].map(limits=>({branch:'type',text:'from pkg import Foo\nclass Root:\n value: Foo\n',files:{'pkg/__init__.py':'from .leaf import Foo\n','pkg/leaf.py':'class Foo:\n id: str\n'},limits}))
 ].entries()){
  const root=join(temp,String(index));await mkdir(root);execFileSync('git',['init','-q',root],{timeout:5000});await writeFile(join(root,'root.py'),fixture.text)
  for(const [path,text] of Object.entries(fixture.files??{})){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text)}
  const a=await lstat(root),b=await lstat(join(root,'.git'));const rootIdentity={rootDevice:String(a.dev),rootInode:String(a.ino),gitDirectory:join(root,'.git'),gitDevice:String(b.dev),gitInode:String(b.ino)}
  const selection=await Effect.runPromise(eligibleNamedPath(root,'root.py',DEFAULT_DIRECT_FILE_POLICY,rootIdentity));const captured=await Effect.runPromise(captureStable(root,selection,{},rootIdentity));assert.equal(captured.status,'captured')
  const context={root,rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:fixture.branch,limits:{...GRAPH_LIMIT_CEILINGS,...fixture.limits},now:()=>0}
  const expected=await Effect.runPromise(resolveGraphUnit('root.py',captured.capture,'Root',{...context,...(fixture.cache?{captureCache:new Map()}: {})}))
  const actual=await resolver('root.py',captured.capture,'Root',{...context,...(fixture.cache?{captureCache:new Map()}: {})})
  assert.deepEqual(actual,expected,'full root ReviewUnit '+index);cases++
 }
 assert.equal(registry.size,0)
 machine.dispose?.();if(machine.retainedHandles!==undefined)assert.equal(machine.retainedHandles,0)
 console.log(JSON.stringify({passed:true,cases,requests:operations.length,fences,terminalSuffixes,splitArtifacts:!!process.env.HAPSLAND_SPLIT_ARTIFACTS,scope:'actual resolveGraphUnit Python root/module/reexport consumer, composed preparation/cache/import/inspect and complete product; capture census/terminal revalidation and per-Await cancellation/wrong identity refusal; finite qualification, accepted terminal/provider lease lifetime and Canonical acceptance remain open'}))
}finally{await rm(temp,{recursive:true,force:true})}
