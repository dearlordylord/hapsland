import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createDispatcher} from './runtime-observation/transport.mjs'
import {createServiceSession,createServiceRegistry,binary64,fromBinary64,productValue,fromProductValue,list,unlist} from './service-session.mjs'
import {sourceFacts,tomlValue} from './frontend-codec.mjs'
import {inspectSourceFrontend,parseCargoSyntax,inspectRustModuleSyntax} from './frontends.mjs'
import {inspectTypeScript} from '../../../dist/direct-event/languages/typescript.js'
import {inspectRust,inspectRustModules} from '../../../dist/direct-event/languages/rust.js'
import {bendAdapter} from '../../../dist/direct-event/languages/bend/adapter.js'
import {parse} from 'smol-toml'
const folder=import.meta.dirname,temporary=mkdtempSync('/tmp/hapsland-whole-resolver-services-')
const tagged=(name,fields={})=>({$:'Types.'+name,...fields})
try {
 assert.equal(execFileSync('bend',['version'],{encoding:'utf8',timeout:5000}).trim(),'bend 2.0.36')
 const program=join(temporary,'services.js');execFileSync('bend',[join(folder,'Runtime.bend'),'-o',program],{timeout:5000})
 const source=readFileSync(program,'utf8'),footer='\ncli(process.argv.slice(1));\nio_exit($main$, null);'
 assert.ok(source.endsWith(footer));assert.ok(source.includes('function $call_service$(_request_0) {'));assert.deepEqual([...source.matchAll(/io_eff\("([^\"]+)\",/g)].map(m=>m[1]),['perform'])
 const embedded=join(temporary,'embedded.mjs');writeFileSync(embedded,source.slice(0,-footer.length)+"\nexport const start=request=>run_loop($call_service$(request)(value=>({$:'Emit',value})));\nif(Object.keys($0eff).length!==1||!Object.hasOwn($0eff,'perform'))throw new Error('unexpected effect');\nexport const handlers=Object.freeze({perform:$0eff.perform});\n")
 const {start,handlers}=await import(pathToFileURL(embedded)),invoke=createDispatcher(start,handlers)
 globalThis.__hapslandWholeResolverServices=createServiceRegistry()
 let nextInvocation=1,total=0
 const make=options=>{const session=createServiceSession({invocation:nextInvocation++,root:folder,...options});globalThis.__hapslandWholeResolverServices.register(session);let id=0;return{session,async request(name,fields={}){total++;const reply=await invoke([tagged('Request',{invocation:session.invocation,id:id++,operation:tagged(name,fields)})]);assert.equal(reply.$,'Types.Reply');assert.equal(reply.invocation,session.invocation);assert.equal(reply.id,id-1);return reply.outcome},close(){globalThis.__hapslandWholeResolverServices.remove(session);session.close()}}}
 const numbers=[0,-0,4999.999999999999,5000,5000.000000000001,-5000,NaN,Infinity,-Infinity,Number.MAX_VALUE,Number.MIN_VALUE]
 for(const elapsed of numbers){let calls=0;const api=make({now:()=>{calls++;return calls===1?0:elapsed}});const clock=(await api.request('StartClock')).clock,bits=(await api.request('ReadClock',{clock})).bits;assert.ok(Object.is(fromBinary64(bits),elapsed));assert.equal(calls,2);api.close()}
 const api=make();assert.equal((await api.request('PathBasename',{path:'src/foo.rs',suffix:{$:'Some',value:'.rs'}})).name,'foo');assert.equal((await api.request('PathJoin',{parts:list(['src','..','root.ts'])})).path,'root.ts');assert.equal((await api.request('ReadPathSeparator')).separator,'/');assert.equal((await api.request('ReadFileStatus',{path:'Types.bend'})).status.$,'Types.ExistingFile');assert.equal((await api.request('ReadFileStatus',{path:'.'})).status.$,'Types.ExistingOther');assert.equal((await api.request('ReadFileStatus',{path:'missing'})).status.$,'Types.FileAbsent')
 const joinedPathCases=[['src/parent.bend/child/root.bend','../'],['src/root.ts','./a'],['/root.ts','../a'],['src/root.ts','../../a'],['src/root.ts','/absolute/a'],['src/root.ts',''],['root.bend','./a.bend/..'],['src/root.ts','../x/../a.JS'],['src/root.ts','./a.mjs'],['src/root.ts','./a.cjs'],['src/root.ts','./a.json'],['src/root.ts','./😀'],['src/root.ts','./\u0000'],['C:\\src\\root.ts','..\\a.rs']]
 for(const [from,leaf]of joinedPathCases){
  const directory=(await api.request('PathDirname',{path:from})).path
  const joined=(await api.request('PathJoin',{parts:list([directory,leaf])})).path
  const normalized=(await api.request('PathNormalize',{path:joined})).path
  const separator=(await api.request('ReadPathSeparator')).separator
  const absolute=(await api.request('PathIsAbsolute',{path:normalized})).absolute
  const extension=(await api.request('PathExtension',{path:normalized})).extension
  const leaf_extension=(await api.request('PathExtension',{path:leaf})).extension
  assert.deepEqual(await api.request('JoinedPathFacts',{from,leaf}),tagged('JoinedPathFactsResult',{separator,normalized,absolute,extension,leaf_extension}),'batch projection onto individual actual foreign path operations')
 }
 const value={root:{artifact:{id:'😀',kind:'interface',name:'Root',source:'α',sourceHash:'abc'},references:[]},sourceDependencies:['Cargo.toml']};const encoded=productValue(value);assert.deepEqual(fromProductValue(encoded),value);assert.equal((await api.request('EncodeProduct',{value:encoded})).bytes,Buffer.byteLength(JSON.stringify(value),'utf8'));assert.equal((await api.request('EncodeSourceText',{text:'😀α'})).bytes,6)
 const borrowed=new Map([['root.ts',{text:'interface Root {}',byteLength:17}]]),a=make({callerCache:borrowed}),b=make({callerCache:borrowed}),cacheA=a.session.callerCache.value,cacheB=b.session.callerCache.value
 const capA=(await a.request('LookupCaptureCache',{cache:cacheA,path:'root.ts'})).outcome.capture,capB=(await b.request('LookupCaptureCache',{cache:cacheB,path:'root.ts'})).outcome.capture;assert.notEqual(capA.invocation,capB.invocation)
 const bad=await b.request('StoreCaptureCache',{cache:cacheB,path:'bad.ts',capture:capA});assert.equal(bad.$,'Types.ProviderRejected');assert.ok(b.session.exception(bad.exception) instanceof Error);assert.equal(borrowed.has('bad.ts'),false)
 assert.equal((await a.request('LookupCaptureCache',{cache:cacheA,path:'absent'})).outcome.$,'Types.CacheAbsent');assert.equal(a.session.callerCache.$,'Some');assert.equal(api.session.callerCache.$,'None')
 const privateCache=(await api.request('CreateInvocationCache')).cache;assert.equal(unlist((await api.request('SnapshotCaptureCache',{cache:privateCache})).entries).length,0)
 const events=[],rootCapture={text:'interface Root {}',byteLength:17}
 const io=make({callerCache:new Map(),access:async p=>{events.push('access:'+p);return{relativePath:p}},capture:async(selected,cap,{signal})=>{events.push('capture:'+selected.relativePath+':'+cap);return{status:'available',capture:rootCapture}},frontend:inspectSourceFrontend,parseCargo:parseCargoSyntax,inspectRustModules:inspectRustModuleSyntax,diagnostic:()=>{events.push('diagnostic');throw new Error('optional')}})
 const selection=(await io.request('AccessPath',{path:'root.ts'})).outcome.selection,captured=(await io.request('CaptureSource',{selection,source_cap:100})).outcome.capture
 await io.request('StoreCaptureCache',{cache:io.session.callerCache.value,path:'root.ts',capture:captured});assert.equal((await io.request('InspectSource',{path:'root.ts',capture:captured,context:tagged('TypeScriptContext',{branch:tagged('TypeBranch')})})).outcome.facts.$,'Types.SourceFacts')
 await io.request('ObserveDiagnostic',{path:'root.ts',diagnostic:tagged('CaptureDiagnostic',{value:productValue({stage:'capture',code:'capture-budget-limit',args:{used:64}})})});assert.deepEqual(events,['access:root.ts','capture:root.ts:100','diagnostic'])
 for(const [p,text,inspect]of [['root.rs','pub struct Root { value: String }',inspectRust],['root.bend','type Root is Data:\n  Root{value: Nat}',bendAdapter.inspect]])assert.equal(sourceFacts(inspect(p,text)).$,'Types.SourceFacts')
 assert.equal(tomlValue(parse('[package]\nname="root"\nedition="2021"\nautobins=false\n[[bin]]\npath="src/main.rs"')).$,'Types.TomlRecord')
 const manifest=io.session.registerCapture({text:'[package]\nname="root"\nedition="2021"',byteLength:35});assert.equal((await io.request('ParseCargo',{capture:manifest})).outcome.$,'Types.CargoInspected')
 const callable=io.session.registerCapture({text:'export function Root(value: string): string { return value }',byteLength:58});const callableFacts=(await io.request('InspectSource',{path:'root.ts',capture:callable,context:tagged('TypeScriptContext',{branch:tagged('FunctionBranch')})})).outcome.facts;assert.ok(unlist(callableFacts.declarations).some(d=>d.key==='function:Root'&&d.artifact.kind.$==='Types.FunctionArtifact'));
 const module=io.session.registerCapture({text:'mod child;',byteLength:10});assert.deepEqual(unlist((await io.request('InspectRustModules',{capture:module})).outcome.names),['child'])
 const thrown=new Error('clock provider');const failure=make({now:()=>{throw thrown}});const exception=(await failure.request('StartClock')).exception;assert.equal(failure.session.exception(exception),thrown)
 for(const entry of [api,a,b,io,failure])entry.close();assert.equal(globalThis.__hapslandWholeResolverServices.size,0);assert.equal(borrowed.size,1)
 const registry=createServiceRegistry(),first=createServiceSession({invocation:123,root:folder}),duplicate=createServiceSession({invocation:123,root:folder});registry.register(first);assert.throws(()=>registry.register(duplicate),/duplicate/);registry.remove(first);first.close();duplicate.close();const failedSession=createServiceSession({invocation:124,root:folder});await assert.rejects(registry.run(failedSession,()=>Promise.reject(new Error('failed invocation'))),/failed invocation/);assert.equal(registry.size,0)
 const activeSession=createServiceSession({invocation:126,root:folder});let release;const activeRun=registry.run(activeSession,()=>new Promise(resolve=>{release=resolve}));await assert.rejects(registry.run(activeSession,()=>Promise.resolve()),/duplicate/);assert.equal(registry.get(126),activeSession);assert.equal((await activeSession.perform(tagged('Request',{invocation:126,id:0,operation:tagged('ReadPathSeparator')}))).outcome.separator,'/');release();await activeRun;assert.equal(registry.size,0);await assert.rejects(activeSession.perform(tagged('Request',{invocation:126,id:1,operation:tagged('ReadPathSeparator')})),/invalid request owner/)
 let done;const lateSession=createServiceSession({invocation:125,root:folder,access:()=>new Promise(resolve=>{done=resolve})}),late=lateSession.perform(tagged('Request',{invocation:125,id:1,operation:tagged('AccessPath',{path:'x'})}));lateSession.close();done({relativePath:'x'});await assert.rejects(late,/closed service session/)
 const ignoresPromise=make({diagnostic:()=>new Promise(()=>{})});await ignoresPromise.request('ObserveDiagnostic',{path:'x',diagnostic:tagged('CaptureDiagnostic',{value:productValue({stage:'capture'})})});ignoresPromise.close()
 const actual=inspectTypeScript('root.ts','interface Root {}');const declaration=actual.declarations.get('Root');for(const ref of [{kind:'unknown',name:'X'},{kind:'named',name:'X',expectedKind:'unknown'}])assert.throws(()=>sourceFacts({...actual,declarations:new Map([['Root',{...declaration,references:[ref]}]])}),/invalid/)
 assert.equal(tomlValue(9223372036854775807n).decimal,'9223372036854775807')
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',requests:total,joinedPathFactProjectionCases:joinedPathCases.length,clockNumbers:numbers.length,clockProviderCallsPreserved:true,binary64Exact:true,cacheInvocationRebinding:true,foreignCaptureOwnership:true,callerCachePreservedOnClose:true,actualTSRustBendFrontends:true,actualTypeScriptFunctionFrontend:true,actualCargoParser:true,pathStatusAndEncoding:true,providerExceptionIdentity:true,optionalDiagnosticFailureIgnored:true,diagnosticPromiseIgnored:true,lateCloseNoRegistration:true,registryFinallyCleanup:true,duplicateRunPreservesActiveOwner:true,malformedFrontendRejected:true,arbitraryBigIntAsDecimal:true,scope:'typed service/foreign IO boundary only; no whole resolver transition or adoption claim'};writeFileSync(join(folder,'service-session-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{rmSync(temporary,{recursive:true,force:true})}
