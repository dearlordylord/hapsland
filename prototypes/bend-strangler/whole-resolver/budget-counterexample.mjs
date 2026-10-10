import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import {resolveGraphUnit} from '../../../packages/source-analysis/dist/direct-event/graph-resolver.js'
import {DEFAULT_DIRECT_FILE_POLICY} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
const root=mkdtempSync('/tmp/hapsland-whole-budget-'),original=new URL('../../../packages/source-analysis/dist/direct-event/graph-resolver.js',import.meta.url),probe=join(dirname(original.pathname),'whole-resolver-budget-probe.mjs')
try{
 execFileSync('git',['init','-q',root])
 const sources=new Map([['root.ts',"import type { A } from './a'; import type { B } from './b'; export interface Root { a: A; b: B }"],['a.ts','interface X {} interface Y {} interface Z {} export interface A { x: X; y: Y; z: Z }'],['b.ts','interface W {} export interface B { w: W }']])
 for(const [path,source]of sources)writeFileSync(join(root,path),source)
 const capture=path=>({text:sources.get(path),byteLength:Buffer.byteLength(sources.get(path))}),reads=[]
 const cache=new Map();const context={root,captureCache:cache,policy:DEFAULT_DIRECT_FILE_POLICY,limits:{...GRAPH_LIMIT_CEILINGS,work:5,outgoingEdges:2},now:()=>0,captureSource:(_root,selected)=>{reads.push(selected.relativePath);return Effect.succeed({status:'captured',capture:capture(selected.relativePath)})}}
 const errorShape=error=>({name:error.name,message:error.message,cause:error.cause?{name:error.cause.name,message:error.cause.message}:null});let baselineError;try{await Effect.runPromise(resolveGraphUnit('root.ts',capture('root.ts'),'Root',context))}catch(error){baselineError=error};assert.ok(baselineError instanceof TypeError);assert.equal(baselineError.message,'invalid Bend boundary value');const baselineReads=[...reads],baselineCacheKeys=[...cache.keys()];reads.length=0;cache.clear()
 const source=readFileSync(original,'utf8'),needle='frame.budget.graphWork = projectImportGraph(frame.state).work - frame.budget.work;';assert.equal(source.split(needle).length-1,2)
 writeFileSync(probe,source.replaceAll(needle,needle+' globalThis.__hapslandBudgetProbe.push({localWork:frame.budget.work,graphWork:frame.budget.graphWork,graphSpent:projectImportGraph(frame.state).work});'))
 globalThis.__hapslandBudgetProbe=[]
 const {resolveGraphUnit:instrumented}=await import(pathToFileURL(probe));let observedError;try{await Effect.runPromise(instrumented('root.ts',capture('root.ts'),'Root',context))}catch(error){observedError=error};assert.ok(observedError);assert.deepEqual(errorShape(observedError),errorShape(baselineError));assert.deepEqual(reads,baselineReads);assert.deepEqual([...cache.keys()],baselineCacheKeys)
 const trace=globalThis.__hapslandBudgetProbe;assert.ok(trace.some(x=>x.graphWork<0));assert.deepEqual(trace.map(x=>x.graphWork),[1,-1]);assert.deepEqual(baselineCacheKeys,['a.ts','b.ts'])
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',trace,reads,cacheKeys:baselineCacheKeys,error:errorShape(baselineError),firstRejected:true,secondChildTechnicalError:true,instrumentedEqualsUnmodifiedConsumer:true,scope:'actual native graph resolver and parsers with physical Git/path fixture and deterministic supplied captures; negative-budget native TypeError preserved as baseline; no native stable-capture or Bend composition parity claim'};writeFileSync(join(import.meta.dirname,'budget-counterexample-'+record.runtime+'.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record))
}finally{delete globalThis.__hapslandBudgetProbe;rmSync(probe,{force:true});rmSync(root,{recursive:true,force:true})}
