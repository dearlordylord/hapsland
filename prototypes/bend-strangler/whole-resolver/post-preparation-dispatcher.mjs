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
