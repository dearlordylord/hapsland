import * as Effect from 'effect/Effect'
import {residentAdvice} from '../../../packages/resident-runtime/src/resident/state/resident/advice.ts'
import {encodeCanonicalEvent} from '@hapsland/canonical-policy/canonical/adapter'
import {projectTrustedCanonical} from '@hapsland/canonical-policy/canonical/canonical-boundary'
import {freezeCanonicalData} from '@hapsland/canonical-policy/canonical/immutable'

// Intermediate checked-artifact ABI conversion. Only the module prefix and Nat
// representation differ; no admission, continuation or child policy lives here.
const prefix='../../../packages/agent-flow-bend/'
const convert=(value,toOwner)=>{
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value)||value<0)throw new TypeError('Inexact Canonical Nat')
  return toOwner?BigInt(value):value
 }
 if(typeof value==='bigint'){
  if(toOwner)return value
  const number=Number(value)
  if(!Number.isSafeInteger(number)||BigInt(number)!==value||number<0)throw new TypeError('Inexact published Canonical Nat')
  return number
 }
 if(Array.isArray(value))return value.map(item=>convert(item,toOwner))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[
  key,key==='$'?(toOwner&&item.includes('.')&&!item.startsWith(prefix)?prefix+item:!toOwner&&item.startsWith(prefix)?item.slice(prefix.length):item):convert(item,toOwner)
 ]))
 return value
}
const list=value=>{
 const out=[]
 while(value.$==='Con'){out.push(value.head);value=value.tail}
 if(value.$!=='Nil')throw new TypeError('Malformed owner command list')
 return out
}
export function createResidentOwnerTransaction({owner,transaction,onActions=()=>Effect.void,validateAdviceInput}){
 const adviceReceipts=new Map()
 const publication=(draft,raw)=>{
  if(raw.$==='Refused')return {refusal:raw.refusal,actions:[],outputs:[],raw}
  if(raw.$!=='Published')throw new TypeError('Malformed resident owner publication')
  const canonical=convert(raw.canonical,false)
  projectTrustedCanonical(canonical)
  draft.canonical=canonical
  draft.resolverCustody=freezeCanonicalData(raw.custody)
  return {actions:list(raw.actions),outputs:convert(list(raw.outputs),false),raw}
 }
 const finish=(effect,onCommitted)=>Effect.uninterruptible(effect.pipe(Effect.flatMap(result=>Effect.sync(()=>onCommitted?.(result)).pipe(Effect.ensuring(onActions(result.actions)),Effect.as(result)))))
 const committedEvent=input=>transaction.commitAllEffect((draft,records)=>[
  publication(draft,owner.resident_step(convert(draft.canonical,true),draft.resolverCustody,input)),records
 ])
 const event=input=>finish(committedEvent(input))
 // Existing native capacity operations run once. Their resulting state and child
 // invalidation are published by the same actual resident commitAllEffect.
 const nativeCommit=(operation,credential,onCommitted,pendingRestore,adviceTail,adviceBirth,cleanupAdvice)=>finish(transaction.commitAllEffect((draft,records)=>{
  if(adviceBirth&&(!validateAdviceInput||validateAdviceInput(credential.invocation,adviceBirth.inputHandle)!==true))throw new Error('Advice input is not owned by its origin')
  if(credential&&!owner.provider_live(owner.assembled(convert(draft.canonical,true),draft.resolverCustody),credential.invocation,credential.generation,credential.lease,credential.request))throw new Error('Revoked resident provider permit')
  const child=credential?owner.find(credential.invocation,draft.resolverCustody.children):undefined
  if(child?.$==='Some'&&child.value.scope.$==='SourceScope'&&['SourceObservation','SourceStartObservation'].includes(child.value.scope.permission.$))throw new Error('Source observation completion requires its closed operation')
  if(child?.$==='Some'&&child.value.scope.$==='AfterSourceScope')throw new Error('After source continuation forbids native mutations')
  const tailScope=child?.$==='Some'&&child.value.scope.$==='AdviceTailScope'?child.value.scope:undefined
  if(tailScope){
   if(!adviceTail||!owner.advice_provider_allowed(owner.assembled(convert(draft.canonical,true),draft.resolverCustody),credential.invocation,credential.generation,credential.lease,credential.request,adviceTail.permission))throw new Error('Advice tail requires a closed capability operation')
   const capability=adviceTail.capability
   if(adviceReceipts.get(credential.invocation)?.capability!==capability)throw new Error('Advice capability differs from issued tail receipt')
   if(tailScope.partition!==BigInt(draft.partitionIds.get(capability.partition)??0)||tailScope.lifetime!==adviceReceipts.get(credential.invocation)?.scope.lifetime||tailScope.round!==BigInt(capability.canonicalRound)||tailScope.operation!==BigInt(capability.canonicalOperationId))throw new Error('Advice capability differs from issued tail scope')
  }else if(adviceTail)throw new Error('Closed advice operation requires tail authority')
  if(pendingRestore&&records.reuse.pending.get(pendingRestore.key)!==pendingRestore.owner)throw new Error('Pending revision owner changed before commit')
  // Observe every assignment, including reset -> recreation in one callback.
  // This prototype interception is replaced by closed production capacity calls.
  let canonical=draft.canonical
  const actions=[]
  Object.defineProperty(draft,'canonical',{configurable:true,enumerable:true,
   get:()=>canonical,
   set:next=>{
    const raw=owner.resident_reconcile(convert(next,true),draft.resolverCustody)
    if(raw.$!=='Published')throw new TypeError('Malformed native reconciliation')
    projectTrustedCanonical(next)
    canonical=next;draft.resolverCustody=freezeCanonicalData(raw.custody)
    actions.push(...list(raw.actions))
   }
  })
  let value,nextRecords
  try{[value,nextRecords]=operation(draft,records)}
  finally{Object.defineProperty(draft,'canonical',{configurable:true,enumerable:true,writable:true,value:canonical})}
  const reconciled=publication(draft,owner.resident_reconcile(convert(canonical,true),draft.resolverCustody))
  let result=reconciled,adviceReceipt
  if(adviceBirth){
   if(value?.reservation!==adviceBirth.initial.reservation||value?.revision!==adviceBirth.initial.revision)throw new Error('Advice insertion changed resource identity')
   result=publication(draft,owner.resident_step(convert(draft.canonical,true),draft.resolverCustody,{$:'HandoffAdviceEvent',...credential,operation:BigInt(value.canonicalOperationId),input_handle:adviceBirth.inputHandle}))
   if(result.refusal)throw new Error('Atomic advice handoff refused: '+result.refusal.$)
   const launch=result.actions.find(action=>action.$==='LaunchAdviceTail')
   if(!launch)throw new Error('Advice handoff did not issue a child')
   const child=owner.find(launch.invocation,draft.resolverCustody.children)
   if(child.$!=='Some'||child.value.scope.$!=='AdviceTailScope')throw new Error('Advice handoff issued invalid custody')
   adviceReceipt=Object.freeze({invocation:launch.invocation,origin:credential.invocation,inputHandle:adviceBirth.inputHandle,capability:value,scope:freezeCanonicalData(child.value.scope)})
  }
  const ownershipBinding=adviceTail??cleanupAdvice
  const joined=[...actions,...reconciled.actions,...(adviceBirth?result.actions:[])]
  const bendList=joined.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
  return [{...result,adviceReceipt,adviceOwnership:ownershipBinding?Object.freeze({capability:ownershipBinding.capability,presentBefore:records.advice.entries.get(ownershipBinding.capability.id)?.capability===ownershipBinding.capability,presentAfter:nextRecords.advice.entries.get(ownershipBinding.capability.id)?.capability===ownershipBinding.capability,removed:value===true,findings:value===true?records.advice.entries.get(ownershipBinding.capability.id)?.content.findings:undefined,retirement:ownershipBinding.retirement}):undefined,actions:joined,raw:{...result.raw,actions:bendList},value,restoredPending:pendingRestore&&value?.revision?{pendingOwnerIdentity:pendingRestore.owner,revision:value.revision}:undefined,claimedKeys:credential&&nextRecords.reuse?[...nextRecords.reuse.pending.keys()].filter(key=>!records.reuse.pending.has(key)):[],transferredUnits:credential&&nextRecords.dispatch?[...nextRecords.dispatch.entries].filter(([id])=>!records.dispatch.entries.has(id)).map(([,entry])=>entry.value):[]},nextRecords]
 }),publication=>{if(publication.adviceReceipt)adviceReceipts.set(publication.adviceReceipt.invocation,publication.adviceReceipt);onCommitted?.(publication)})
 const startSourceObservation=(credential,onCommitted)=>finish(transaction.commitAllEffect((draft,records)=>{
  const raw=owner.resident_step(convert(draft.canonical,true),draft.resolverCustody,{$:'StartSourceObservationEvent',...credential})
  return [publication(draft,raw),records]
 }),result=>{if(!result.refusal)onCommitted?.(result)})
 const completeSourceObservation=(credential,onCommitted)=>finish(transaction.commitAllEffect((draft,records)=>{
  const raw=owner.resident_step(convert(draft.canonical,true),draft.resolverCustody,{$:'CompleteSourceObservationEvent',...credential})
  if(raw.$==='Refused')throw new Error('Source observation completion refused: '+raw.refusal.$)
  return [publication(draft,raw),records]
 }),onCommitted)
 const native=(operation,onCommitted)=>nativeCommit(operation,undefined,onCommitted)
 const nativeScoped=(credential,operation,onCommitted)=>nativeCommit(operation,credential,onCommitted)
 const nativeRestorePending=(credential,pendingOwner,operation,onCommitted)=>nativeCommit(operation,credential,onCommitted,pendingOwner)
 // Closed effect bindings: callers cannot supply a native transaction callback.
 const adviceTailBinding=(credential,capability,permission,onCommitted,retirement)=>residentAdvice({...transaction,
  commitAllEffect:operation=>nativeCommit(operation,credential,onCommitted,undefined,{capability,permission,retirement}).pipe(Effect.map(result=>result.value))
 })
 const adviceInsertAndHandoff=(credential,initial,inputHandle,onCommitted)=>{
  if(!credential||typeof inputHandle!=='bigint'||inputHandle<1n)throw new Error('Advice birth requires provider credential and opaque input handle')
  return residentAdvice({...transaction,commitAllEffect:operation=>nativeCommit(operation,credential,onCommitted,undefined,undefined,{initial,inputHandle}).pipe(Effect.map(result=>result.value))}).insert(initial)
 }
 const adviceTailPublish=(credential,capability,onCommitted)=>adviceTailBinding(credential,capability,{$:'TailPublish'},onCommitted).publish(capability)
 const retirementReason=retirement=>{if(retirement.$==='ExpiredRetirement')return 'expired';if(retirement.$==='RetentionFailureRetirement')return 'stale';throw new Error('Invalid advice retirement') }
 const adviceTailRemove=(credential,capability,onCommitted,retirement={$:'RetentionFailureRetirement'})=>{
  let ownership
  return adviceTailBinding(credential,capability,{$:'TailRemove'},publication=>{ownership=publication.adviceOwnership;onCommitted?.(publication)},retirement).remove(capability,retirementReason(retirement)).pipe(Effect.map(removed=>({removed,absent:ownership?.presentAfter===false})))
 }
 // A registry finalizer can remove only its exact capability after the lease ends.
 // Native advice.remove confirms absence without touching a replacement identity.
 const adviceCleanup=(capability,onCommitted,retirement={$:'RetentionFailureRetirement'})=>residentAdvice({...transaction,
  commitAllEffect:operation=>nativeCommit(operation,undefined,onCommitted,undefined,undefined,undefined,{capability,retirement}).pipe(Effect.map(result=>result.value))
 }).remove(capability,retirementReason(retirement))
 const ownerStep=result=>result.raw.$==='Refused'?{$:'Rejected',refusal:result.raw.refusal}:{$:'Advanced',actions:result.raw.actions,outputs:result.raw.outputs}
 const methods={
  launch:(scope,input_handle)=>({$:'LaunchEvent',scope,input_handle}),
  launch_source:(scope,input_handle)=>({$:'LaunchSourceEvent',scope,input_handle}),
  launch_source_preparation:(parent,scope,input_handle)=>({$:'LaunchSourcePreparationEvent',parent,scope,input_handle}),
  install_source:(invocation,generation,handle,request,permission)=>({$:'InstallSourceEvent',invocation,generation,handle,request,permission}),
  launch_preparation:(scope,input_handle)=>({$:'LaunchPreparationEvent',scope,input_handle}),
  terminal_preparation:(invocation,generation,result_handle)=>({$:'TerminalPreparationEvent',invocation,generation,result_handle}),
  terminal_source_failed:(invocation,generation,result_handle)=>({$:'TerminalSourceFailedEvent',invocation,generation,result_handle}),
  terminal_preparation_failed:(invocation,generation,result_handle)=>({$:'TerminalPreparationFailedEvent',invocation,generation,result_handle}),
  launch_nested:(parent,input_handle)=>({$:'LaunchNestedEvent',parent,input_handle}),
  install:(invocation,generation,handle,request)=>({$:'InstallEvent',invocation,generation,handle,request}),
  install_advice:(invocation,generation,handle,request,permission)=>({$:'InstallAdviceEvent',invocation,generation,handle,request,permission}),
  provider_start:invocation=>({$:'ProviderStartEvent',invocation}),
  provider_completed:(invocation,lease,request,reply_handle)=>({$:'ProviderCompletedEvent',invocation,lease,request,reply_handle}),
  cancel:invocation=>({$:'CancelEvent',invocation}),
  terminal:(invocation,generation,result_handle)=>({$:'TerminalEvent',invocation,generation,result_handle}),
  canonical_event:event=>({$:'CanonicalEvent',event})
 }
 // Synchronous driver calls are serialized through the actual Ref transaction.
 // readState assembles a transient call snapshot; the driver stores no C.State.
 const control={
  readState(){const snapshot=Effect.runSync(transaction.read);return owner.assembled(convert(snapshot.canonical,true),snapshot.resolverCustody)},
  invoke(method,args){if(!Object.hasOwn(methods,method))throw new Error('Unknown resident owner entry');return ownerStep(Effect.runSync(committedEvent(methods[method](...args))))}
 }
 return {read:transaction.read,event,startSourceObservation,completeSourceObservation,native,nativeScoped,nativeRestorePending,adviceInsertAndHandoff,get adviceReceipts(){return [...adviceReceipts.values()]},adviceTailPublish,adviceTailRemove,adviceCleanup,control,ownerStep,canonical:input=>event({$:'CanonicalEvent',event:convert(encodeCanonicalEvent(input),true)})}
}
