import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync,readlinkSync} from 'node:fs'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Cause from 'effect/Cause'
import {resolveGraphUnit} from '../../../dist/direct-event/graph-resolver.js'
import {captureStable} from '../../../../native-observation/dist/direct-event/capture.js'
import {discoverPhysicalWorkingTreeRoot} from '../../../../native-observation/dist/repository/root.js'
import {eligibleNamedPath,DEFAULT_DIRECT_FILE_POLICY} from '../../../../native-observation/dist/direct-event/selection.js'
import {createDispatcher} from './runtime-observation/transport.mjs'
import {createServiceRegistry} from './service-session.mjs'
import {createBendEffectResolver} from './consumer.mjs'

console.error('phase:imports-ready')
assert.equal(process.platform,'linux','descriptor observations are Linux qualification only')
const temporary=mkdtempSync('/tmp/hapsland-stable-cancellation-')
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const bounded=(promise,label)=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error(label+' deadline')),5000)
 promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})
})
const turn=()=>new Promise(resolve=>setImmediate(resolve))
function rootDescriptors(root){
 return readdirSync('/proc/self/fd').flatMap(fd=>{
  try{const target=readlinkSync('/proc/self/fd/'+fd);return target===root||target.startsWith(root+'/')?[{fd,target}]:[]}catch{return []}
 })
}
try{
 const root=join(temporary,'repository');execFileSync('git',['init','-q',root])
 writeFileSync(join(root,'root.py'),'class Root:\n    value: str')
 writeFileSync(join(root,'a.ts'),'export interface A {}')
 console.error('phase:repository-created')
 const {rootIdentity}=await Effect.runPromise(discoverPhysicalWorkingTreeRoot(root))
 const selected=await Effect.runPromise(eligibleNamedPath(root,'root.py',DEFAULT_DIRECT_FILE_POLICY,rootIdentity))
 assert.ok(selected)
 console.error('phase:root-selected')
 const captured=await Effect.runPromise(captureStable(root,selected,{},rootIdentity));assert.equal(captured.status,'captured')
 console.error('phase:root-captured')
 const artifactPath=process.env.HAPSLAND_WHOLE_RUNTIME_ARTIFACT
 assert.ok(artifactPath,'use a separately prepared pinned artifact, with compilation outside this physical check')
 const artifact=readFileSync(artifactPath),artifactHash=createHash('sha256').update(artifact).digest('hex')
 assert.equal(artifactHash,process.env.HAPSLAND_WHOLE_RUNTIME_SHA256)
 const source=artifact.toString();assert.ok(!source.includes('cli(process.argv.slice(1))'))
 assert.deepEqual([...source.matchAll(/io_eff\("([^\"]+)\",/g)].map(match=>match[1]),['perform'])
 const runtimePath=join(temporary,'runtime.mjs')
 writeFileSync(runtimePath,source+'\nexport const handlers=Object.freeze({perform:$0eff.perform});\n')
 const {default:program,handlers}=await import(pathToFileURL(runtimePath))
 const registry=createServiceRegistry();globalThis.__hapslandWholeResolverServices=registry
 const bend=createBendEffectResolver({registry,resolveIO:createDispatcher(input=>program.resolve(input)(value=>({$:'Emit',value})),handlers)})
 console.error('phase:runtime-loaded')
 const observations=[]
 for(const [point,throwAt,limits] of [['start',0,undefined],['preparation',1,undefined],['root',2,undefined],['preparation-before-empty-budget',1,{files:0}]]){
  const pair=[],defect=new Error('injected '+point+' clock defect',{cause:new Error('underlying clock defect')})
  for(const mode of ['native','bend-io']){
   const events=[],cache=new Map();let tick=0
   const context={root,rootIdentity,policy:DEFAULT_DIRECT_FILE_POLICY,branch:'type',captureCache:cache,limits,
    now:()=>{const current=tick++;events.push(['clock',current]);if(current===throwAt)throw defect;return 0},
    captureSource:()=>{throw new Error('clock failure must precede capture')}}
   const candidate=mode==='native'?resolveGraphUnit:bend
   console.error('phase:resolve '+point+' '+mode)
   const exit=await bounded(Effect.runPromiseExit(candidate('root.py',captured.capture,'Root',context)),mode+' '+point+' clock failure')
   assert.ok(Exit.isFailure(exit));assert.equal(Cause.squash(exit.cause),defect)
   assert.equal(Cause.squash(exit.cause).cause,defect.cause)
   assert.deepEqual(exit.cause.reasons.map(reason=>({kind:reason._tag,defect:reason.defect})),[{kind:'Die',defect}])
   assert.deepEqual(events,Array.from({length:throwAt+1},(_,index)=>['clock',index]))
   assert.equal(registry.size,0);assert.deepEqual([...cache],[]);assert.deepEqual(rootDescriptors(root),[])
   pair.push({mode,point,events,originalErrorIdentity:true,originalUnderlyingCauseIdentity:true,causeKind:'Die',registryEmpty:true})
  }
  assert.deepEqual(pair[1].events,pair[0].events);observations.push(...pair)
 }
 const record={at:new Date().toISOString(),runtime:typeof Bun==='undefined'?'node':'bun',artifactHash,observations,
  scope:'Actual complete Python native and Bend Effect resolver: start/preparation/root clock defects, including preparation before zero-file admission; exact clock prefix and original error/cause identity; empty cache/registry and no repository descriptors. No whole proof or performance claim.'}
 writeFileSync(join(import.meta.dirname,'python-clock-failure-'+record.runtime+'-evidence.json'),JSON.stringify(record,null,2)+'\n')
 console.log(JSON.stringify(record))
}finally{delete globalThis.__hapslandWholeResolverServices;rmSync(temporary,{recursive:true,force:true})}
