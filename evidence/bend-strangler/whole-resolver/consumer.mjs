import * as Effect from 'effect/Effect'
import {createServiceSession,fromProductValue} from './service-session.mjs'
import {inspectSourceFrontend,parseCargoSyntax,inspectRustModuleSyntax} from './frontends.mjs'
import {eligibleNamedPath,DEFAULT_DIRECT_FILE_POLICY,contextDirectFilePolicy} from '../../../packages/native-observation/dist/direct-event/selection.js'
import {captureStable} from '../../../packages/native-observation/dist/direct-event/capture.js'
import {GRAPH_LIMIT_CEILINGS} from '../../../packages/canonical-policy/dist/canonical/graph-limits.js'
import {readNat} from '../../../packages/canonical-policy/dist/canonical/boundary-schema.js'

const tagged=(name,fields={})=>({$:'Types.'+name,...fields})
// Only the emitted Nat ABI is converted here; graph decisions remain in Bend.
export function pureReply(value){
 if(Array.isArray(value))return value.map(pureReply)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['invocation','id','bytes'].includes(key)&&typeof item==='number'?BigInt(item):pureReply(item)]))
 return value
}

export function createMachineDriver({machine,foreign,registry,observeTransition,observeFinished,trace=false}){
 return (session,input)=>registry.run(session,async()=>{
  let state=machine.initial(input)
  const operations=trace?[]:undefined
  for(;;){
   if(state.$!=='Loop.ServiceStep')throw new Error('unsettled Bend continuation')
   const step=state.step
   if(step.$==='Types.FinishedResolver'){
    observeFinished?.(step)
    return {result:step.result,finalFrame:step.final_frame,trace:operations}
   }
   if(step.$==='Types.FailedResolver'){
    if(step.failure.$==='Types.ForeignProviderFailure')throw session.exception(step.failure.exception)
    if(step.failure.$==='Types.NegativeGraphWork')readNat(-Number(step.failure.magnitude))
    return {failure:step.failure,trace:operations}
   }
   if(step.$!=='Types.AwaitService')throw new Error('invalid Bend service step')
   operations?.push(step.request.operation.$)
   const reply=pureReply(await foreign([step.request]))
   observeTransition?.(step,reply)
   state=machine.resume(state,tagged('ServiceReply',{reply}))
  }
 })
}

export function createIODriver({resolve,registry}){
 return (session,input,options)=>registry.run(session,async()=>{
  const state=await resolve([input],options)
  if(state.$==='Types.RuntimeFinished')return {result:state.result}
  if(state.$==='Types.RuntimeFailed'){
   if(state.failure.$==='Types.ForeignProviderFailure')throw session.exception(state.failure.exception)
   if(state.failure.$==='Types.NegativeGraphWork')readNat(-Number(state.failure.magnitude))
   return {failure:state.failure}
  }
  if(state.$!=='Loop.ServiceStep')throw new Error('unsettled Bend IO continuation')
  const step=state.step
  if(step.$==='Types.FinishedResolver')return {result:step.result,finalFrame:step.final_frame}
  if(step.$!=='Types.FailedResolver')throw new Error('Bend IO returned before terminal')
  if(step.failure.$==='Types.ForeignProviderFailure')throw session.exception(step.failure.exception)
  if(step.failure.$==='Types.NegativeGraphWork')readNat(-Number(step.failure.magnitude))
  return {failure:step.failure}
 })
}

export function createBendResolver({machine,foreign,registry,resolveIO,observeProduct}){
 const drive=resolveIO?createIODriver({resolve:resolveIO,registry}):createMachineDriver({machine,foreign,registry})
 let invocation=0
 return async (path,capture,name,context)=>{
  const limits={...GRAPH_LIMIT_CEILINGS,...context.limits}
  const session=createServiceSession({
   invocation:++invocation,root:context.root,now:context.now,callerCache:context.captureCache,
   access:file=>Effect.runPromise(eligibleNamedPath(context.root,file,contextDirectFilePolicy(context.policy??DEFAULT_DIRECT_FILE_POLICY),context.rootIdentity)),
   capture:(selected,sourceCap)=>Effect.runPromise((context.captureSource??captureStable)(context.root,selected,context.captureHooks,context.rootIdentity,sourceCap)),
   frontend:inspectSourceFrontend,parseCargo:parseCargoSyntax,inspectRustModules:inspectRustModuleSyntax,
   diagnostic:context.observeCaptureDiagnostic
  })
  const input=tagged('ResolverInput',{
   invocation:BigInt(session.invocation),root_path:path,root_capture:pureReply(session.registerCapture(capture)),
   root_bytes:BigInt(capture.byteLength),root_name:name,root_source:capture.text,
   branch:tagged(context.branch==='function'?'FunctionBranch':'TypeBranch'),caller_cache:pureReply(session.callerCache),
   limits:{$:'../../../packages/agent-flow-bend/ImportGraph.Limits',version:1n,...Object.fromEntries(Object.entries(limits).map(([key,value])=>[({sourceBytes:'source_bytes',treeBytes:'tree_bytes',readBytes:'read_bytes',outgoingEdges:'outgoing_edges'})[key]??key,BigInt(value)]))}
  })
  const outcome=await drive(session,input)
  if(outcome.failure)throw new Error('Bend resolver technical failure: '+outcome.failure.$)
  if(outcome.result.$==='Types.NoReviewUnit')return undefined
  observeProduct?.(outcome.result.value)
  return fromProductValue(outcome.result.value)
 }
}
