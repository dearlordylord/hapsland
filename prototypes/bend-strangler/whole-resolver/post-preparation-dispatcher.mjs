// Mechanical ABI projection; Bend owns the entire post-preparation progression.
export function createPostPreparationMachine(core) {
 const pump=initial=>{
  let step=initial
  for(let count=0;count<10000;count++){
   if(step.$!=='Internal')return step
   step=core.advance(step.state)
  }
  throw new Error('Post-preparation internal dispatch did not settle')
 }
 return {
  initial:input=>pump(core.initial(input.invocation,input.postPreparation.roundBound,input.postPreparation.outcomes)),
  resume:(step,event)=>{
   if(event.$!=='Types.ServiceReply')throw new Error('Invalid post-preparation reply envelope')
   return pump(core.resume(step,event.reply))
  },
  view:step=>{
   if(step.$==='Await')return {$:'Types.AwaitService',request:step.request}
   if(step.$==='Finished')return {$:'PostPreparationFinished'}
   if(step.$==='Stopped')return {$:'PostPreparationStopped',reason:step.reason}
   throw new Error('Unsettled post-preparation projection')
  },
  accepted:projection=>projection.$==='PostPreparationFinished'?{continued:true}:{continued:false,reason:projection.reason},
  disposeInvocation(){},
  get retainedHandles(){return 0}
 }
}

// The same module implements the independent post-insert continuation.
export function createAdviceTailMachine(core){
 const permissions={AdvicePendingBarrier:'TailBarrier',AdviceCheckActive:'TailActive',AdvicePublish:'TailPublish',AdviceRecordPublished:'TailRecord',AdviceCheckExpired:'TailRemove',AdviceRemove:'TailRemove'}
 return {
  permission:request=>{const permission=permissions[request.command.$];if(!permission)throw new Error('Unknown closed advice command');return {$:permission}},
  initial:input=>input.adviceTail.failure?core.advice_initial_cleanup(input.invocation,input.adviceTail.advice,input.adviceTail.failure):core.advice_initial(input.invocation,input.adviceTail.advice),
  resume:(step,event)=>{
   if(event.$!=='Types.ServiceReply')throw new Error('Invalid advice tail reply envelope')
   return core.advice_resume(step,event.reply)
  },
  view:step=>{
   if(step.$==='AdviceAwait')return {$:'Types.AwaitService',request:step.request}
   if(step.$==='AdviceFinished')return {$:'AdviceTailFinished'}
   if(step.$==='AdviceStopped'||step.$==='AdviceCleanupPending')return {$:'AdviceTailStopped',reason:step.reason,cleanupPending:step.$==='AdviceCleanupPending'}
   throw new Error('Unsettled advice tail projection')
  },
  accepted:projection=>projection.$==='AdviceTailFinished'?{adviceRetained:true}:{adviceRetained:false,reason:projection.reason,cleanupPending:projection.cleanupPending},
  disposeInvocation(){},get retainedHandles(){return 0}
 }
}
