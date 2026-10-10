import * as Effect from 'effect/Effect'
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
export function createResidentOwnerTransaction({owner,transaction,onActions=()=>Effect.void}){
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
 const nativeCommit=(operation,credential,onCommitted,pendingRestore)=>finish(transaction.commitAllEffect((draft,records)=>{
  if(credential&&!owner.provider_live(owner.assembled(convert(draft.canonical,true),draft.resolverCustody),credential.invocation,credential.generation,credential.lease,credential.request))throw new Error('Revoked resident provider permit')
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
  const result=publication(draft,owner.resident_reconcile(convert(canonical,true),draft.resolverCustody))
  const joined=[...actions,...result.actions]
  const bendList=joined.reduceRight((tail,head)=>({$:'Con',head,tail}),{$:'Nil'})
  return [{...result,actions:joined,raw:{...result.raw,actions:bendList},value,restoredPending:pendingRestore&&value?.revision?{pendingOwnerIdentity:pendingRestore.owner,revision:value.revision}:undefined,claimedKeys:credential&&nextRecords.reuse?[...nextRecords.reuse.pending.keys()].filter(key=>!records.reuse.pending.has(key)):[],transferredUnits:credential&&nextRecords.dispatch?[...nextRecords.dispatch.entries].filter(([id])=>!records.dispatch.entries.has(id)).map(([,entry])=>entry.value):[]},nextRecords]
 }),onCommitted)
 const native=operation=>nativeCommit(operation)
 const nativeScoped=(credential,operation,onCommitted)=>nativeCommit(operation,credential,onCommitted)
 const nativeRestorePending=(credential,pendingOwner,operation,onCommitted)=>nativeCommit(operation,credential,onCommitted,pendingOwner)
 const ownerStep=result=>result.raw.$==='Refused'?{$:'Rejected',refusal:result.raw.refusal}:{$:'Advanced',actions:result.raw.actions,outputs:result.raw.outputs}
 const methods={
  launch:(scope,input_handle)=>({$:'LaunchEvent',scope,input_handle}),
  launch_preparation:(scope,input_handle)=>({$:'LaunchPreparationEvent',scope,input_handle}),
  terminal_preparation:(invocation,generation,result_handle)=>({$:'TerminalPreparationEvent',invocation,generation,result_handle}),
  terminal_preparation_failed:(invocation,generation,result_handle)=>({$:'TerminalPreparationFailedEvent',invocation,generation,result_handle}),
  launch_nested:(parent,input_handle)=>({$:'LaunchNestedEvent',parent,input_handle}),
  install:(invocation,generation,handle,request)=>({$:'InstallEvent',invocation,generation,handle,request}),
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
 return {read:transaction.read,event,native,nativeScoped,nativeRestorePending,control,ownerStep,canonical:input=>event({$:'CanonicalEvent',event:convert(encodeCanonicalEvent(input),true)})}
}
