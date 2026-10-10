import * as Effect from 'effect/Effect'
import {ResidentProviderPermit,ResidentResourceReceipt} from './resident-provider-permit.mjs'
import {withinWork} from '../../../packages/resident-runtime/src/resident/work-ownership/cancellation.ts'
import {ResidentAdapterError} from '../../../packages/resident-runtime/src/resident/adapter-error.ts'
// Exact-capability IO binding for the independent Bend advice tail. No host flow
// loop, source completion, policy branch or arbitrary transaction callback.
export function createAdviceTailProvider(invocation,bridge,capability,unit,context){
 const advice=1n,errors=new Map(),publications=new Map()
 let revoked=false,closed=false,finished=false,accepted=false,cleanupDischarged=false,primaryFailure
 const run=effect=>Effect.runPromise(Effect.uninterruptible(effect).pipe(Effect.provideService(ResidentProviderPermit,undefined),Effect.provideService(ResidentResourceReceipt,undefined)))
 return {
  input:{invocation,adviceTail:{advice}},invocation:Number(invocation),
  error:token=>errors.get(token),
  revoke(){revoked=true},close(){closed=true},
  async finish(){
   if(finished)return
   finished=true
   if(accepted||cleanupDischarged)return
   try{await run(bridge.adviceCleanup(capability));cleanupDischarged=true}
   catch(error){throw new AggregateError(primaryFailure===undefined?[error]:[primaryFailure,error],'Advice tail cleanup remains incomplete',{cause:primaryFailure??error})}
  },
  async perform(request,options={}){
   if(request.invocation!==invocation||request.command.advice!==advice)throw new Error('Wrong advice tail capability')
   const command=request.command
   let response={$:'Ack'}
   try{
    if(closed||(revoked&&command.$!=='AdviceRemove'))throw new Error('Advice tail requires cleanup')
    switch(command.$){
     case 'AdvicePendingBarrier':await run(withinWork(context.deps.residentReviewControls.afterAdvicePending(capability.id).pipe(Effect.mapError(()=>new ResidentAdapterError({operation:'pending advice barrier'}))),context.deps.residentLifetimeController.signal));break
     case 'AdviceCheckActive':{
      const value=await run(context.deps.residentJobActive(unit));response={$:'Active',value};if(!value)accepted=true;break
     }
     case 'AdvicePublish':{
      const published=await run(bridge.adviceTailPublish(options.ownerLease,capability,publication=>options.afterCommit?.(command,publication)))
      const handle=BigInt(publications.size+1);publications.set(handle,published);response={$:'Published',publication:handle};break
     }
     case 'AdviceRecordPublished':
      if(!publications.has(command.publication))throw new Error('Unknown advice publication')
      await run(context.deps.residentRecordJoinedOutcomes(publications.get(command.publication),capability.id));accepted=true;break
     case 'AdviceRemove':{
      const result=await run(bridge.adviceTailRemove(options.ownerLease,capability,publication=>{if(publication.adviceOwnership?.presentAfter===false)cleanupDischarged=true;options.afterCommit?.(command,publication)}))
      if(!result.absent)throw new Error('Exact advice cleanup refused')
      cleanupDischarged=true;break
     }
     default:throw new Error('Unknown advice tail operation')
    }
   }catch(error){primaryFailure??=error;const token=BigInt(errors.size+1);errors.set(token,error);response={$:'Failed',token}}
   return {$:'Reply',invocation:request.invocation,id:request.id,response}
  }
 }
}
