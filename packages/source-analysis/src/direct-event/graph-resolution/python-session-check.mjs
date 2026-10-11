import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,appendFile,readFile,lstat,rm} from 'node:fs/promises'
import {join,dirname,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {pythonAdapter} from '../../../dist/direct-event/languages/python.js'
import {captureStable} from '../../../../native-observation/dist/direct-event/capture.js'
import {eligibleNamedPath,contextDirectFilePolicy,selectedByDirectFilePolicy,DEFAULT_DIRECT_FILE_POLICY} from '../../../../native-observation/dist/direct-event/selection.js'
import {createServiceSession,unlist} from './service-session.mjs'
import {inspectSourceFrontend,parsePythonSyntax,parseCargoSyntax} from './frontends.mjs'
import {sourceFacts} from './frontend-codec.mjs'
const t=(name,fields={})=>({$:'Types.'+name,...fields}),s=(name,fields={})=>({$:'python-module/Session.'+name,...fields}),p=(name,fields={})=>({$:'python-module/PreparationMachine.'+name,...fields})
const temp=await mkdtemp('/tmp/hapsland-python-persistent-session-')
const limits={version:1,files:8,sourceBytes:2048,treeBytes:100000,readBytes:20000,depth:4,work:80,outgoingEdges:40}
const remaining={files:7,readBytes:19000,work:80}
const bounded=(child,budget)=>s('Remaining',{files:child.difference(BigInt(Math.max(0,budget.files)),BigInt(Math.max(0,-budget.files))),read_bytes:child.difference(BigInt(Math.max(0,budget.readBytes)),BigInt(Math.max(0,-budget.readBytes))),work:child.difference(BigInt(Math.max(0,budget.work)),BigInt(Math.max(0,-budget.work)))})
try{
 const emitted=join(temp,'child.mjs');execFileSync('taskset',['-c','10','bend',join(import.meta.dirname,'PythonModule.bend'),'-o',emitted],{timeout:5000});const {default:child}=await import(pathToFileURL(emitted))
 const fixtures=[
  {name:'persistent-transfer',files:{'pkg/__init__.py':'class Foo:\n id: str\n'},calls:[['pkg','Foo'],['pkg','Foo']]},
  {name:'persistent-reexport',files:{'pkg/__init__.py':'from .leaf import Foo','pkg/leaf.py':'class Foo:\n id: str\n'},calls:[['pkg','Foo'],['pkg','Foo']]},
  {name:'declared-root',files:{'pyproject.toml':'tool.setuptools.package-dir={""="lib"}','lib/pkg/__init__.py':'from .leaf import Foo','lib/pkg/leaf.py':''},calls:[['pkg','Foo'],['pkg','Foo']]},
  {name:'missing-membership-becomes-present',files:{'pkg/__init__.py':'from .leaf import Foo'},calls:[['pkg','Foo']],mutate:['pkg/leaf.py','class Foo:\n id: str\n']},
  {name:'authority-changed',files:{'pkg/__init__.py':'from .leaf import Foo','pkg/leaf.py':''},calls:[['pkg','Foo']],mutate:['pkg/__init__.py','class Changed:\n id: int\n']},
  {name:'conflicting-root-metadata',files:{'setup.cfg':'[metadata]'},calls:[['pkg','Foo'],['pkg','Foo']]},
  {name:'unstable-capture-reservation',unstableCapture:true,files:{'pkg/__init__.py':'from .leaf import Foo','pkg/leaf.py':''},calls:[['pkg','Foo'],['pkg','Foo']]},
  {name:'expired-terminal',files:{'foo.py':''},calls:[['foo','Foo']],expiredTerminal:true},
  {name:'terminal-work-refusal',files:{'foo.py':''},calls:[['foo','Foo']],terminalBudget:{files:7,readBytes:19000,work:0}}
 ]
 let requests=0,resolutions=0,inspections=0
 for(const [index,fixture] of fixtures.entries()){
  const root=join(temp,String(index));await mkdir(root);execFileSync('git',['init','-q',root],{timeout:5000})
  await writeFile(join(root,'root.py'),'from pkg import Foo\nclass Root:\n value: Foo\n')
  for(const [path,text] of Object.entries(fixture.files)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text)}
  const rootStat=await lstat(root),gitStat=await lstat(join(root,'.git')),rootIdentity={rootDevice:String(rootStat.dev),rootInode:String(rootStat.ino),gitDirectory:join(root,'.git'),gitDevice:String(gitStat.dev),gitInode:String(gitStat.ino)}
  const policy=DEFAULT_DIRECT_FILE_POLICY,contextPolicy=contextDirectFilePolicy(policy)
  const selected=await Effect.runPromise(eligibleNamedPath(root,'root.py',policy,rootIdentity));assert.ok(selected)
  const rootResult=await Effect.runPromise(captureStable(root,selected,{},rootIdentity,limits.sourceBytes));assert.equal(rootResult.status,'captured');const rootCapture=rootResult.capture
  const traces={native:[],candidate:[]},caches={native:new Map(),candidate:new Map()};let elapsed=0,started=false
  const hooks=lane=>({sourceRead:path=>traces[lane].push(['source-read',path]),...(fixture.unstableCapture?{betweenReads:()=>Effect.promise(()=>appendFile(join(root,'pkg/__init__.py'),'\n# changed between reads\n'))}:{})})
  const nativeHost={root,rootIdentity,policy,captureCache:caches.native,captureHooks:hooks('native'),captureSource:(...args)=>Effect.gen(function*(){traces.native.push(['capture',args[1].relativePath]);return yield* captureStable(...args)})}
  const native=await Effect.runPromise(pythonAdapter.prepareGraph('root.py',rootCapture,nativeHost,limits,()=>{traces.native.push(['clock']);return elapsed>=5000}));assert.ok(native)
  const io=createServiceSession({invocation:index+1,root,callerCache:caches.candidate,now:()=>{if(started)traces.candidate.push(['clock']);return elapsed},access:(path,{signal}={})=>Effect.runPromise(eligibleNamedPath(root,path,contextPolicy,rootIdentity),{signal}),capture:(selection,cap,{signal}={})=>{traces.candidate.push(['capture',selection.relativePath]);return Effect.runPromise(captureStable(root,selection,hooks('candidate'),rootIdentity,cap),{signal})},frontend:inspectSourceFrontend,parsePythonSyntax,parseCargo:parseCargoSyntax,selectContextPath:path=>selectedByDirectFilePolicy(path,contextPolicy)})
  try{
   const clock=(await io.perform(t('Request',{invocation:index+1,id:0,operation:t('StartClock')}))).outcome.clock;started=true
   const rootToken=io.registerCapture(rootCapture)
   async function drive(step,resume){while(step.$.endsWith('.Await')){requests++;step=resume(step,await io.perform(step.request))}assert.ok(step.$.endsWith('.Returned'),step.$);return step}
   const preparation=await drive(child.prepare_session(p('Input',{root:'root.py',capture:rootToken,root_bytes:BigInt(rootCapture.byteLength),files:BigInt(limits.files),read_bytes:BigInt(limits.readBytes),work:BigInt(limits.work),source_cap:BigInt(limits.sourceBytes),depth:BigInt(limits.depth),clock,invocation:BigInt(index+1),caller_cache:io.callerCache}),1n),child.resume_preparation)
   assert.equal(preparation.prepared.$,'Some',fixture.name);let state=preparation.prepared.value.session,next=preparation.next,cache=preparation.prepared.value.cache
   function compare(){const used=child.session_usage(state);assert.deepEqual({files:Number(used.files),readBytes:Number(used.read_bytes),work:Number(used.work)},native.session.authorityUsage(),fixture.name+' authorityUsage');assert.deepEqual(unlist(state.dependencies),native.dependencies,fixture.name+' dependencies');assert.deepEqual([...caches.candidate].map(([path,c])=>[path,c.contentHash,c.byteLength]),[...caches.native].map(([path,c])=>[path,c.contentHash,c.byteLength]),fixture.name+' actual capture cache');assert.deepEqual(traces.candidate,traces.native,fixture.name+' physical capture/clock trace')}
   compare()
   for(const branch of ['type','function']){const expected=native.session.inspect('root.py',rootCapture.text,branch);const actual=await drive(child.inspect_session(t(branch==='type'?'TypeBranch':'FunctionBranch'),'root.py','root.py',rootToken,BigInt(index+1),next),child.resume_inspect);next=actual.next;assert.deepEqual(actual.facts.$==='None'?undefined:actual.facts.value,expected===undefined?undefined:sourceFacts(expected),fixture.name+' root inspect '+branch);inspections++;compare()}
   for(const [module,member] of fixture.calls){const expected=await Effect.runPromise(native.session.resolveImport('root.py',module,member,remaining));const actual=await drive(child.resolve_import(state,bounded(child,remaining),'root.py',module,member,'root.py',clock,cache,sep,BigInt(index+1),next),child.resume_import);state=actual.session;next=actual.next_request;assert.deepEqual(actual.resolution.$==='None'?undefined:{path:actual.resolution.value.path,name:actual.resolution.value.name},expected,fixture.name+' resolution');resolutions++;compare()}
   if(fixture.mutate){await writeFile(join(root,fixture.mutate[0]),fixture.mutate[1])}if(fixture.expiredTerminal)elapsed=5000
   const terminal=fixture.terminalBudget??remaining,expected=await Effect.runPromise(native.session.validateAuthority(terminal));const actual=await drive(child.revalidate(child.session_remaining(state,bounded(child,terminal)),clock,sep,BigInt(index+1),next),child.resume_revalidation);state=actual.session;assert.equal(actual.valid,expected,fixture.name+' terminal validation');compare()
  }finally{await io.close()}
 }
 console.log(JSON.stringify({status:'PASS',cases:fixtures.length,requests,resolutions,inspections,scope:'actual native persistent Python GraphSession versus Bend preparation/inspect/resolveImport/usage/revalidation; actual eligibleNamedPath/captureStable/cache/physical mutation; not resolver/Canonical acceptance'}))
}finally{await rm(temp,{recursive:true,force:true})}
